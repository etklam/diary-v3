import type { Context, Hono } from 'hono'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { users, type Database } from '@diary/db'
import type { ErrorCode } from '@diary/contracts'
import { sharedPromptActionSchema, sharedPromptAuditSchema, sharedPromptKeySchema, sharedPromptListSchema, sharedPromptPlaygroundResponseSchema, sharedPromptPlaygroundSchema, sharedPromptSaveSchema, sharedPromptVersionSchema } from '@diary/contracts/shared-prompts'
import type { AppEnv } from '../app.js'
import type { AiTransport } from '../ai-reports/outbound-policy.js'
import { admitAdminAttempt, currentProvider, estimateCost, mapProviderError, settleAdminAttempt } from '../ai-reports/admin-routes.js'
import { actOnSharedPrompt, listSharedPrompts, PromptRegistryError, readPromptAudit, saveSharedPrompt, selectedSharedPrompt, writePromptAudit } from './service.js'
import { renderPrompt, runRegisteredPromptTest } from './registry.js'

interface Dependencies {
  db: Database; now: () => Date; transport?: AiTransport
  fail: (status: number, code: ErrorCode, message: string) => never
  validationError: (error: z.ZodError) => never
  parseJson: <T>(context: Context<AppEnv>, schema: z.ZodType<T>) => Promise<T>
}
export function registerSharedPromptRoutes(app: Hono<AppEnv>, dependencies: Dependencies) {
  const { db, now, fail, validationError, parseJson, transport } = dependencies
  const admin = async (context: Context<AppEnv>) => {
    context.header('Cache-Control', 'no-store')
    const session = context.get('user')
    if (!session) return fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    const [actor] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, BigInt(session.id))).limit(1)
    if (!actor || actor.role !== 'ADMIN') return fail(403, 'AUTH_FORBIDDEN', 'Admin access required')
    return actor.id
  }
  const keyFor = (context: Context<AppEnv>) => { const key = sharedPromptKeySchema.safeParse(context.req.param('key')); if (!key.success) return validationError(key.error); return key.data }
  const safely = async (context: Context<AppEnv>, action: () => Promise<unknown>) => {
    try { return context.json(await action()) } catch (error) {
      if (error instanceof PromptRegistryError) return fail(error.code === 'missing' ? 404 : 409, error.code === 'missing' ? 'SYS_NOT_FOUND' : error.code === 'test-required' ? 'AI_CONFIG_CHANGED' : 'AI_ADMIN_REVISION_CONFLICT', error.code === 'test-required' ? 'Test this immutable version before activation' : error.code === 'invalid' ? 'Disable the active override before archiving it' : 'Reload the prompt registry and retry')
      if (error instanceof Error && error.message === 'AI_PROMPT_INVALID') return fail(400, 'SYS_VALIDATION_ERROR', 'Unknown variables or invalid prompt template')
      throw error
    }
  }
  app.get('/api/admin/ai/prompt-registry', async context => { await admin(context); return context.json(sharedPromptListSchema.parse(await listSharedPrompts(db))) })
  app.post('/api/admin/ai/prompt-registry/:key/versions', async context => {
    const actorUserId = await admin(context), key = keyFor(context), input = await parseJson(context, sharedPromptSaveSchema)
    return safely(context, async () => sharedPromptVersionSchema.parse(await saveSharedPrompt(db, { ...input, key, actorUserId, now: now() })))
  })
  app.post('/api/admin/ai/prompt-registry/:key/actions', async context => {
    const actorUserId = await admin(context), key = keyFor(context), input = await parseJson(context, sharedPromptActionSchema)
    return safely(context, () => actOnSharedPrompt(db, { ...input, key, actorUserId, now: now() }))
  })
  app.get('/api/admin/ai/prompt-registry/:key/audit', async context => { await admin(context); return context.json(sharedPromptAuditSchema.parse(await readPromptAudit(db, keyFor(context)))) })
  app.post('/api/admin/ai/prompt-registry/:key/playground', async context => {
    const actorUserId = await admin(context), key = keyFor(context), input = await parseJson(context, sharedPromptPlaygroundSchema)
    return safely(context, async () => {
      const selected = await selectedSharedPrompt(db, key, input.versionId)
      const rendered = renderPrompt(key, selected.template)
      const provider = await currentProvider(db)
      const preview = {
        key, systemVersion: selected.definition.systemVersion, source: selected.source, versionId: selected.version?.id.toString() ?? null,
        sampleInput: selected.definition.sampleInput, variables: rendered.variables, renderedPrompts: rendered.messages,
        outputSchema: selected.definition.outputSchema, validation: 'not-run' as const, output: null,
        provider: provider?.displayName ?? null, model: provider?.model ?? null,
        usage: { scope: 'test' as const, attemptId: null as string | null, inputTokens: null as number | null, outputTokens: null as number | null, latencyMs: null as number | null },
      }
      if (input.mode === 'preview') return sharedPromptPlaygroundResponseSchema.parse(preview)
      if (!provider) return fail(503, 'AI_NOT_CONFIGURED', 'Publish a provider before testing')
      const reservation = await admitAdminAttempt(db, provider, actorUserId, now())
      if (!reservation) return fail(429, 'AI_QUOTA_EXCEEDED', 'The global AI budget or concurrent-call limit is exhausted')
      try {
        const { result, analysis } = await runRegisteredPromptTest(key, provider, selected.template, transport)
        const settled = await settleAdminAttempt(db, { reservation, status: 'succeeded', finishedAt: now(), actualCostCents: result.usage ? estimateCost(provider, result.usage) : null, inputTokens: result.usage?.inputTokens ?? null, outputTokens: result.usage?.outputTokens ?? null, latencyMs: result.latencyMs, providerRequestId: result.requestId })
        if (!settled) return fail(409, 'AI_CONFIG_CHANGED', 'Test reservation expired; retry explicitly')
        await writePromptAudit(db, { key, actorUserId, action: 'test.passed', versionId: selected.version?.id ?? null, now: now(), summary: `Synthetic test passed; attempt ${reservation.id}` })
        return sharedPromptPlaygroundResponseSchema.parse({ ...preview, validation: 'passed', output: analysis, usage: { scope: 'test', attemptId: reservation.id.toString(), inputTokens: result.usage?.inputTokens ?? null, outputTokens: result.usage?.outputTokens ?? null, latencyMs: result.latencyMs } })
      } catch (error) {
        const mapped = mapProviderError(error)
        try { await settleAdminAttempt(db, { reservation, status: 'unknown', finishedAt: now(), actualCostCents: null, inputTokens: null, outputTokens: null, errorCode: mapped.code }) } catch { /* Keep the committed conservative budget reservation. */ }
        await writePromptAudit(db, { key, actorUserId, action: 'test.failed', versionId: selected.version?.id ?? null, now: now() })
        return fail(mapped.status, mapped.code, mapped.message)
      }
    })
  })
}
