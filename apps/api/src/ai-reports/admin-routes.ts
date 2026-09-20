import type { Context, Hono } from 'hono'
import { z } from 'zod'
import { and, desc, eq, isNotNull, isNull, lt, or } from 'drizzle-orm'
import {
  aiAdminAuditEvents,
  aiReportAttempts,
  aiPromptVersions,
  aiProviderConfigVersions,
  aiReports,
  aiRuntimeState,
  aiUsageBuckets,
  users,
  type Database,
} from '@diary/db'
import {
  aiAdminAuditQuerySchema,
  aiAdminAuditResponseSchema,
  aiAdminSettingsResponseSchema,
  aiAdminUsageQuerySchema,
  aiAdminUsageResponseSchema,
  aiAdminRuntimeStateSchema,
  aiAdminRuntimeUpdateSchema,
  aiAccessListQuerySchema,
  aiAccessListResponseSchema,
  aiAccessUpdateSchema,
  aiPromptDraftSchema,
  aiPromptTypeSchema,
  aiPromptVersionSchema,
  aiProviderDraftSchema,
  aiProviderPublishSchema,
  aiProviderSettingsSchema,
  aiProviderTestSchema,
} from '@diary/contracts/admin-ai'
import { aiAnalysisSchema, aiReportTypeSchema } from '@diary/contracts/ai-reports'
import { serializedIdSchema, type ErrorCode } from '@diary/contracts'
import type { AppEnv } from '../app.js'
import { listAiModels, generateAiAnalysis } from './deepseek-provider.js'
import { AiProviderError, type AiTransport } from './outbound-policy.js'
import { buildAiMessages } from './prompt-renderer.js'
import { decryptAiSecret } from './secrets.js'
import { validateAiAnalysis } from './output-validator.js'
import {
  listPromptVersions,
  markPromptTest,
  markProviderTest,
  publishPrompt,
  publishProvider,
  readAiSettings,
  restoreDefaultPrompt,
  saveProviderDraft,
  serializeProvider,
  updateGenerationEnabled,
  updatePromptDraft,
} from './settings.js'
import { countActiveCallSlots, lockAiGlobal, reapExpiredCallSlots, lockAiOwner } from './job-store.js'
import { consumeGlobalAiBudget, releaseGlobalAiBudget, reserveGlobalAiBudget, settleGlobalAiBudget } from './budget.js'
import { recordUserQuotaUsage, releaseUserQuota } from './quota.js'
import { listAiAccess, updateAiAccess } from './access.js'

type ReportType = 'weekly' | 'monthly'

const syntheticContext = (reportType: ReportType) => ({
  period: {
    periodType: reportType,
    periodStart: reportType === 'monthly' ? '2026-01-01' : '2026-01-05',
    periodEndExclusive: reportType === 'monthly' ? '2026-02-01' : '2026-01-12',
    isPartialPeriod: false,
  },
  timezone: 'UTC',
  locale: 'en',
  coverage: {
    diaries: { count: 0, available: true },
    transactions: { count: 0, available: false },
    holdings: { count: 0, available: false },
    disciplines: { count: 0, available: false },
    notes: ['Synthetic capability fixture; no user content.'],
  },
  metrics: [],
  sources: [],
  diaries: [],
  transactions: [],
  disciplines: [],
})

interface AdminDependencies {
  db: Database
  now: () => Date
  fail: (status: number, code: ErrorCode, message: string) => never
  validationError: (error: z.ZodError) => never
  parseJson: <T>(context: Context<AppEnv>, schema: z.ZodType<T>) => Promise<T>
  transport?: AiTransport
}

function mapProviderError(error: unknown): { status: number; code: ErrorCode; message: string } {
  if (error instanceof Error && error.message === 'AI_ADMIN_REVISION_CONFLICT') return { status: 409, code: 'AI_ADMIN_REVISION_CONFLICT', message: 'The settings changed; reload and retry the synthetic test' }
  if (error instanceof z.ZodError) return { status: 502, code: 'AI_OUTPUT_INVALID', message: 'The provider returned an invalid response' }
  if (error instanceof AiProviderError) {
    if (error.code === 'AI_PROVIDER_RATE_LIMITED') return { status: 429, code: 'AI_PROVIDER_RATE_LIMITED', message: 'The AI provider is rate limited' }
    if (error.code === 'AI_OUTPUT_INVALID') return { status: 502, code: 'AI_OUTPUT_INVALID', message: 'The provider returned an invalid response' }
    if (error.code === 'AI_NOT_CONFIGURED') return { status: 503, code: 'AI_NOT_CONFIGURED', message: 'AI provider configuration is incomplete' }
    if (error.code === 'AI_REPORT_CONTEXT_TOO_LARGE') return { status: 413, code: 'AI_REPORT_CONTEXT_TOO_LARGE', message: 'The synthetic test payload is too large' }
    if (error.code === 'AI_UNSAFE_ENDPOINT') return { status: 400, code: 'SYS_VALIDATION_ERROR', message: 'The provider endpoint is not allowed' }
  }
  return { status: 502, code: 'SYS_EXTERNAL_SERVICE_ERROR', message: 'The AI provider could not be reached' }
}

function mapSettingsError(error: unknown): { status: number; code: ErrorCode; message: string } {
  if (error instanceof AiProviderError) return mapProviderError(error)
  if (error instanceof Error) {
    if (error.message === 'AI_ADMIN_REVISION_CONFLICT') return { status: 409, code: 'AI_ADMIN_REVISION_CONFLICT', message: 'The settings changed; reload and try again' }
    if (error.message === 'AI_PROVIDER_TEST_REQUIRED' || error.message === 'AI_PROMPT_TEST_REQUIRED') return { status: 409, code: 'AI_CONFIG_CHANGED', message: 'A successful synthetic test is required before publishing' }
    if (error.message === 'AI_PROVIDER_RESERVATION_REQUIRED') return { status: 400, code: 'SYS_VALIDATION_ERROR', message: 'A positive conservative reservation cost is required' }
    if (error.message === 'AI_PROVIDER_RESERVATION_TOO_LOW') return { status: 400, code: 'SYS_VALIDATION_ERROR', message: 'The reservation must cover the configured token bound at the declared prices' }
    if (error.message === 'AI_PROVIDER_BUDGET_TOO_LOW') return { status: 400, code: 'SYS_VALIDATION_ERROR', message: 'The monthly budget must cover one conservative provider reservation' }
    if (error.message === 'AI_PRICING_CURRENCY_CONFLICT') return { status: 409, code: 'AI_CONFIG_CHANGED', message: 'Pricing currency cannot change after current-month usage has started' }
    if (error.message === 'AI_NOT_CONFIGURED') return { status: 503, code: 'AI_NOT_CONFIGURED', message: 'AI provider configuration is incomplete' }
    if (error.message === 'AI_PROMPT_INVALID') return { status: 400, code: 'SYS_VALIDATION_ERROR', message: 'Prompt template is invalid' }
  }
  return { status: 500, code: 'SYS_INTERNAL_ERROR', message: 'Unable to update AI settings' }
}

function parseRouteId(value: string | undefined, validationError: AdminDependencies['validationError']): bigint {
  const parsed = serializedIdSchema.safeParse(value)
  if (!parsed.success) return validationError(parsed.error)
  return BigInt(parsed.data)
}

function parseCursor(value: string | undefined, validationError: AdminDependencies['validationError']): bigint | undefined {
  if (value === undefined) return undefined
  const parsed = serializedIdSchema.safeParse(value)
  if (!parsed.success) return validationError(parsed.error)
  return BigInt(parsed.data)
}

function providerToConfig(row: typeof aiProviderConfigVersions.$inferSelect) {
  if (!row.encryptedApiKey) throw new AiProviderError('AI_NOT_CONFIGURED')
  return {
    baseUrl: row.baseUrl,
    apiKey: decryptAiSecret(row.encryptedApiKey, 'provider-api-key'),
    model: row.model,
    timeoutMs: row.timeoutMs,
    maxOutputTokens: row.maxOutputTokens,
    thinking: row.thinking,
  }
}

function estimateCost(row: typeof aiProviderConfigVersions.$inferSelect, usage: { inputTokens?: number | null; outputTokens?: number | null } | null): number | null {
  if (!usage || usage.inputTokens === null || usage.inputTokens === undefined || usage.outputTokens === null || usage.outputTokens === undefined) return null
  if (row.inputPricePerMillionCents === null || row.outputPricePerMillionCents === null) return null
  const input = Math.ceil(usage.inputTokens * row.inputPricePerMillionCents / 1_000_000)
  const output = Math.ceil(usage.outputTokens * row.outputPricePerMillionCents / 1_000_000)
  return input + output
}

interface AdminAttemptReservation {
  id: bigint
  month: string
  reservationCostCents: number
}

function monthFor(value: Date): string {
  return `${value.toISOString().slice(0, 7)}-01`
}

/** Admit a manual test before opening a provider connection. */
async function admitAdminAttempt(
  db: Database,
  provider: typeof aiProviderConfigVersions.$inferSelect,
  actorUserId: bigint,
  admittedAt: Date,
): Promise<AdminAttemptReservation | null> {
  const reservation = { month: monthFor(admittedAt), reservationCostCents: provider.reservationCostCents }
  return db.transaction(async tx => {
    await lockAiGlobal(tx)
    await reapExpiredCallSlots(tx, admittedAt)
    // Keep a crashed manual attempt conservative for the maximum supported
    // provider timeout. A new draft must never reap a slower call admitted by
    // an older configuration.
    const staleBefore = new Date(admittedAt.getTime() - 305_000)
    const stale = await tx.select({
      id: aiReportAttempts.id,
      reservationBucketMonth: aiReportAttempts.reservationBucketMonth,
      reservationCostCents: aiReportAttempts.reservationCostCents,
    }).from(aiReportAttempts).where(and(
      isNull(aiReportAttempts.reportId),
      eq(aiReportAttempts.status, 'dispatched'),
      lt(aiReportAttempts.dispatchedAt, staleBefore),
    )).for('update')
    for (const row of stale) {
      const [expired] = await tx.update(aiReportAttempts).set({ status: 'unknown', errorCode: 'AI_PROVIDER_OUTCOME_UNKNOWN', finishedAt: admittedAt, slotReleasedAt: admittedAt })
        .where(and(eq(aiReportAttempts.id, row.id), eq(aiReportAttempts.status, 'dispatched'))).returning({ id: aiReportAttempts.id })
      if (expired && row.reservationCostCents > 0) {
        await settleGlobalAiBudget(tx, { month: row.reservationBucketMonth, reservationCostCents: row.reservationCostCents, actualCostCents: null, inputTokens: null, outputTokens: null })
      }
    }
    if (await countActiveCallSlots(tx) >= 2) return null
    const admitted = await reserveGlobalAiBudget(tx, { ...reservation, monthlyBudgetCents: provider.monthlyBudgetCents })
    if (!admitted) return null
    const [attempt] = await tx.insert(aiReportAttempts).values({
      reportId: null,
      userId: actorUserId,
      status: 'dispatched',
      providerConfigVersionId: provider.id,
      model: provider.model,
      pricingVersion: provider.pricingVersion,
      pricingCurrency: provider.pricingCurrency,
      reservationBucketMonth: reservation.month,
      reservationCostCents: reservation.reservationCostCents,
      slotExpiresAt: new Date(admittedAt.getTime() + provider.timeoutMs + 5_000),
      estimatedCostCents: provider.reservationCostCents,
      reservedAt: admittedAt,
      dispatchedAt: admittedAt,
    }).returning({ id: aiReportAttempts.id })
    if (!attempt) throw new Error('AI_ATTEMPT_NOT_RECORDED')
    // Consume the conservative bound before the outbound call. If the
    // process crashes after this commit, the bound is still accounted for.
    await consumeGlobalAiBudget(tx, reservation)
    return { id: attempt.id, ...reservation }
  })
}

async function settleAdminAttempt(
  db: Database,
  input: {
    reservation: AdminAttemptReservation
    status: 'succeeded' | 'failed' | 'unknown'
    finishedAt: Date
    actualCostCents: number | null
    inputTokens: number | null
    outputTokens: number | null
    providerRequestId?: string | null
    latencyMs?: number | null
    errorCode?: string | null
  },
): Promise<boolean> {
  return db.transaction(async tx => {
    await lockAiGlobal(tx)
    const update: Partial<typeof aiReportAttempts.$inferInsert> = {
      status: input.status,
      providerRequestId: input.providerRequestId ?? null,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      estimatedCostCents: input.actualCostCents ?? undefined,
      latencyMs: input.latencyMs ?? null,
      errorCode: input.errorCode ?? null,
      finishedAt: input.finishedAt,
      slotReleasedAt: input.finishedAt,
    }
    const [attempt] = await tx.update(aiReportAttempts).set(update).where(and(eq(aiReportAttempts.id, input.reservation.id), eq(aiReportAttempts.status, 'dispatched'))).returning({ id: aiReportAttempts.id })
    if (!attempt) return false
    await settleGlobalAiBudget(tx, {
      month: input.reservation.month,
      reservationCostCents: input.reservation.reservationCostCents,
      actualCostCents: input.actualCostCents,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
    })
    return true
  })
}

async function cancelOwnerJobsInTransaction(tx: Pick<Database, 'select' | 'update' | 'execute'>, userId: bigint, now: Date) {
  const rows = await tx.select({ id: aiReports.id, createdAt: aiReports.createdAt, dispatchedAt: aiReports.dispatchedAt, reservationBucketMonth: aiReports.reservationBucketMonth, reservationCostCents: aiReports.reservationCostCents })
    .from(aiReports).where(and(eq(aiReports.userId, userId), or(eq(aiReports.status, 'queued'), eq(aiReports.status, 'running')), isNull(aiReports.deletedAt))).for('update')
  for (const row of rows) {
    await tx.update(aiReports).set({ status: 'cancelled', errorCode: 'AI_ACCESS_DENIED', finishedAt: now, leaseToken: null, workerId: null, leaseExpiresAt: null, heartbeatAt: null, updatedAt: now })
      .where(and(eq(aiReports.id, row.id), or(eq(aiReports.status, 'queued'), eq(aiReports.status, 'running'))))
    if (!row.dispatchedAt) {
      await releaseUserQuota(tx, { userId, bucketMonth: `${row.createdAt.toISOString().slice(0, 7)}-01`, reservationCostCents: 0 })
      if (row.reservationCostCents > 0) await releaseGlobalAiBudget(tx, { month: row.reservationBucketMonth, reservationCostCents: row.reservationCostCents })
    } else {
      const [attempt] = await tx.update(aiReportAttempts).set({ status: 'cancelled', errorCode: 'AI_ACCESS_DENIED', finishedAt: now })
        .where(and(eq(aiReportAttempts.reportId, row.id), eq(aiReportAttempts.status, 'dispatched'))).returning({ id: aiReportAttempts.id })
      if (attempt) {
        if (row.reservationCostCents > 0) await settleGlobalAiBudget(tx, { month: row.reservationBucketMonth, reservationCostCents: row.reservationCostCents, actualCostCents: null, inputTokens: null, outputTokens: null })
        await recordUserQuotaUsage(tx, { userId, bucketMonth: `${row.createdAt.toISOString().slice(0, 7)}-01`, reservationCostCents: 0 }, { unknown: true })
      }
    }
  }
}

async function currentProvider(db: Database) {
  const [runtime] = await db.select({ id: aiRuntimeState.activeProviderConfigId }).from(aiRuntimeState).where(eq(aiRuntimeState.singleton, 'default')).limit(1)
  if (!runtime?.id) return null
  const [row] = await db.select().from(aiProviderConfigVersions).where(eq(aiProviderConfigVersions.id, runtime.id)).limit(1)
  return row ?? null
}

async function runSyntheticTest(
  provider: typeof aiProviderConfigVersions.$inferSelect,
  template: string,
  reportType: ReportType,
  transport: AiTransport | undefined,
) {
  const config = providerToConfig(provider)
  const context = syntheticContext(reportType)
  const result = await generateAiAnalysis({
    ...config,
    messages: buildAiMessages({
      template,
      locale: 'en',
      periodLabel: 'Synthetic capability test',
      periodStart: context.period.periodStart,
      periodEnd: context.period.periodEndExclusive,
      context,
    }),
  }, transport)
  return { result, analysis: validateAiAnalysis(result.analysis, context) }
}

export function registerAiAdminRoutes(app: Hono<AppEnv>, dependencies: AdminDependencies) {
  const { db, now, fail, validationError, parseJson, transport } = dependencies

  const requireAdmin = async (context: Context<AppEnv>) => {
    context.header('Cache-Control', 'no-store')
    const session = context.get('user')
    if (!session) return fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    const [current] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, BigInt(session.id))).limit(1)
    if (!current) return fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    if (current.role !== 'ADMIN') return fail(403, 'AUTH_FORBIDDEN', 'Admin access required')
    return current.id
  }

  const safely = async <T>(context: Context<AppEnv>, operation: () => Promise<T>, serialize: (value: T) => unknown) => {
    try { return context.json(serialize(await operation())) }
    catch (error) { const mapped = mapSettingsError(error); return fail(mapped.status, mapped.code, mapped.message) }
  }

  app.get('/api/admin/ai/settings', async context => {
    await requireAdmin(context)
    return safely(context, () => readAiSettings(db, now()), value => aiAdminSettingsResponseSchema.parse(value))
  })

  app.put('/api/admin/ai/runtime', async context => {
    const actorUserId = await requireAdmin(context)
    const input = await parseJson(context, aiAdminRuntimeUpdateSchema)
    return safely(context, async () => {
      const runtime = await updateGenerationEnabled(db, { enabled: input.generationEnabled, actorUserId, now: now() })
      const current = now()
      return {
        generationEnabled: runtime.generationEnabled,
        workerAvailable: Boolean(runtime.workerHeartbeatAt && current.getTime() - runtime.workerHeartbeatAt.getTime() <= 60_000),
        workerHeartbeatAt: runtime.workerHeartbeatAt?.toISOString() ?? null,
      }
    }, value => aiAdminRuntimeStateSchema.parse(value))
  })

  app.put('/api/admin/ai/settings/draft', async context => {
    const actorUserId = await requireAdmin(context)
    const input = await parseJson(context, aiProviderDraftSchema)
    return safely(context, () => saveProviderDraft(db, { ...input, actorUserId, now: now() }), value => aiProviderSettingsSchema.parse(serializeProvider(value as typeof aiProviderConfigVersions.$inferSelect)))
  })

  app.post('/api/admin/ai/settings/test', async context => {
    const actorUserId = await requireAdmin(context)
    const input = await parseJson(context, aiProviderTestSchema)
    const draft = await db.select().from(aiProviderConfigVersions).where(and(eq(aiProviderConfigVersions.revision, input.expectedRevision), eq(aiProviderConfigVersions.status, 'draft'))).limit(1)
    const provider = draft[0]
    if (!provider) return fail(409, 'AI_ADMIN_REVISION_CONFLICT', 'Provider draft not found')
    const admittedAt = now()
    const reservation = await admitAdminAttempt(db, provider, actorUserId, admittedAt)
    if (!reservation) return fail(429, 'AI_QUOTA_EXCEEDED', 'The global AI budget is exhausted')
    try {
      const { result } = await runSyntheticTest(provider, 'Return an empty JSON report for this synthetic capability test.', 'weekly', transport)
      const settled = await settleAdminAttempt(db, {
        reservation,
        status: 'succeeded',
        finishedAt: now(),
        actualCostCents: result.usage ? estimateCost(provider, result.usage) : null,
        inputTokens: result.usage?.inputTokens ?? null,
        outputTokens: result.usage?.outputTokens ?? null,
        providerRequestId: result.requestId,
        latencyMs: result.latencyMs,
      })
      if (!settled) throw new Error('AI_ATTEMPT_ALREADY_SETTLED')
      const updated = await markProviderTest(db, { revision: input.expectedRevision, passed: true, actorUserId, now: now() })
      return context.json(aiProviderSettingsSchema.parse(serializeProvider(updated)))
    } catch (error) {
      const mapped = mapProviderError(error)
      try {
        await settleAdminAttempt(db, {
          reservation,
          status: 'unknown',
          finishedAt: now(),
          actualCostCents: null,
          inputTokens: null,
          outputTokens: null,
          errorCode: mapped.code,
        })
      } catch { /* the committed reservation remains conservative if settlement is unavailable */ }
      try { await markProviderTest(db, { revision: input.expectedRevision, passed: false, actorUserId, now: now() }) } catch { /* preserve the provider failure */ }
      return fail(mapped.status, mapped.code, mapped.message)
    }
  })

  app.post('/api/admin/ai/settings/publish', async context => {
    const actorUserId = await requireAdmin(context)
    const input = await parseJson(context, aiProviderPublishSchema)
    return safely(context, () => publishProvider(db, { expectedRevision: input.expectedRevision, actorUserId, now: now() }), value => aiProviderSettingsSchema.parse(serializeProvider(value as typeof aiProviderConfigVersions.$inferSelect)))
  })

  app.post('/api/admin/ai/models/refresh', async context => {
    await requireAdmin(context)
    return safely(context, async () => {
      const provider = await currentProvider(db)
      if (!provider) throw new AiProviderError('AI_NOT_CONFIGURED')
      const config = providerToConfig(provider)
      return listAiModels(config, transport)
    }, value => ({ data: value }))
  })

  app.get('/api/admin/ai/prompts', async context => {
    await requireAdmin(context)
    const type = context.req.query('type')
    const parsedType = type === undefined ? undefined : aiPromptTypeSchema.safeParse(type)
    if (parsedType && !parsedType.success) return validationError(parsedType.error)
    return context.json(z.object({ data: z.array(aiPromptVersionSchema) }).parse({ data: await listPromptVersions(db, parsedType?.data) }))
  })

  app.post('/api/admin/ai/prompts/:type/draft', async context => {
    const actorUserId = await requireAdmin(context)
    const type = aiReportTypeSchema.safeParse(context.req.param('type'))
    if (!type.success) return validationError(type.error)
    const input = await parseJson(context, aiPromptDraftSchema)
    return safely(context, () => updatePromptDraft(db, { reportType: type.data, template: input.template, expectedRevision: input.expectedRevision, actorUserId, now: now() }), value => aiPromptVersionSchema.parse({
      ...(value as typeof aiPromptVersions.$inferSelect),
      id: (value as typeof aiPromptVersions.$inferSelect).id.toString(),
      createdBy: (value as typeof aiPromptVersions.$inferSelect).createdBy?.toString() ?? null,
      createdAt: (value as typeof aiPromptVersions.$inferSelect).createdAt.toISOString(),
      publishedAt: (value as typeof aiPromptVersions.$inferSelect).publishedAt?.toISOString() ?? null,
    }))
  })

  app.post('/api/admin/ai/prompts/:type/test', async context => {
    const actorUserId = await requireAdmin(context)
    const type = aiReportTypeSchema.safeParse(context.req.param('type'))
    if (!type.success) return validationError(type.error)
    const input = await parseJson(context, aiProviderTestSchema)
    const [prompt] = await db.select().from(aiPromptVersions).where(and(eq(aiPromptVersions.reportType, type.data), eq(aiPromptVersions.revision, input.expectedRevision), eq(aiPromptVersions.status, 'draft'))).limit(1)
    if (!prompt) return fail(409, 'AI_ADMIN_REVISION_CONFLICT', 'Prompt draft not found')
    const provider = await currentProvider(db)
    if (!provider) return fail(503, 'AI_NOT_CONFIGURED', 'A published provider is required for prompt testing')
    const admittedAt = now()
    const reservation = await admitAdminAttempt(db, provider, actorUserId, admittedAt)
    if (!reservation) return fail(429, 'AI_QUOTA_EXCEEDED', 'The global AI budget is exhausted')
    try {
      const { result, analysis } = await runSyntheticTest(provider, prompt.template, type.data, transport)
      const settled = await settleAdminAttempt(db, {
        reservation,
        status: 'succeeded',
        finishedAt: now(),
        actualCostCents: result.usage ? estimateCost(provider, result.usage) : null,
        inputTokens: result.usage?.inputTokens ?? null,
        outputTokens: result.usage?.outputTokens ?? null,
        providerRequestId: result.requestId,
        latencyMs: result.latencyMs,
      })
      if (!settled) throw new Error('AI_ATTEMPT_ALREADY_SETTLED')
      await markPromptTest(db, { reportType: type.data, revision: input.expectedRevision, passed: true, actorUserId, now: now() })
      return context.json({ analysis: aiAnalysisSchema.parse(analysis) })
    } catch (error) {
      const mapped = mapProviderError(error)
      try {
        await settleAdminAttempt(db, {
          reservation,
          status: 'unknown',
          finishedAt: now(),
          actualCostCents: null,
          inputTokens: null,
          outputTokens: null,
          errorCode: mapped.code,
        })
      } catch { /* the committed reservation remains conservative if settlement is unavailable */ }
      try { await markPromptTest(db, { reportType: type.data, revision: input.expectedRevision, passed: false, actorUserId, now: now() }) } catch { /* preserve the provider failure */ }
      return fail(mapped.status, mapped.code, mapped.message)
    }
  })

  app.post('/api/admin/ai/prompts/:type/publish', async context => {
    const actorUserId = await requireAdmin(context)
    const type = aiReportTypeSchema.safeParse(context.req.param('type'))
    if (!type.success) return validationError(type.error)
    const input = await parseJson(context, aiProviderPublishSchema)
    return safely(context, () => publishPrompt(db, { reportType: type.data, revision: input.expectedRevision, actorUserId, now: now() }), value => aiPromptVersionSchema.parse({
      ...(value as typeof aiPromptVersions.$inferSelect),
      id: (value as typeof aiPromptVersions.$inferSelect).id.toString(),
      createdBy: (value as typeof aiPromptVersions.$inferSelect).createdBy?.toString() ?? null,
      createdAt: (value as typeof aiPromptVersions.$inferSelect).createdAt.toISOString(),
      publishedAt: (value as typeof aiPromptVersions.$inferSelect).publishedAt?.toISOString() ?? null,
    }))
  })

  app.post('/api/admin/ai/prompts/:type/restore-default', async context => {
    const actorUserId = await requireAdmin(context)
    const type = aiReportTypeSchema.safeParse(context.req.param('type'))
    if (!type.success) return validationError(type.error)
    const input = await parseJson(context, aiProviderPublishSchema)
    return safely(context, () => restoreDefaultPrompt(db, { reportType: type.data, expectedRevision: input.expectedRevision, actorUserId, now: now() }), value => aiPromptVersionSchema.parse({
      ...(value as typeof aiPromptVersions.$inferSelect),
      id: (value as typeof aiPromptVersions.$inferSelect).id.toString(),
      createdBy: (value as typeof aiPromptVersions.$inferSelect).createdBy?.toString() ?? null,
      createdAt: (value as typeof aiPromptVersions.$inferSelect).createdAt.toISOString(),
      publishedAt: (value as typeof aiPromptVersions.$inferSelect).publishedAt?.toISOString() ?? null,
    }))
  })

  app.get('/api/admin/ai/access', async context => {
    await requireAdmin(context)
    const parsed = aiAccessListQuerySchema.safeParse(context.req.query())
    if (!parsed.success) return validationError(parsed.error)
    const cursor = parseCursor(parsed.data.cursor, validationError)
    const result = await listAiAccess(db, { ...parsed.data, cursor: cursor?.toString() })
    return context.json(aiAccessListResponseSchema.parse({
      data: result.rows.map(row => ({ userId: row.user.id.toString(), email: row.user.email, name: row.user.name, enabled: row.access?.enabled ?? false, monthlyQuota: row.access?.monthlyQuota ?? 10, grantedAt: row.access?.grantedAt?.toISOString() ?? null, revokedAt: row.access?.revokedAt?.toISOString() ?? null })),
      nextCursor: result.nextCursor,
    }))
  })

  app.put('/api/admin/ai/access/:userId', async context => {
    const actorUserId = await requireAdmin(context)
    const userId = parseRouteId(context.req.param('userId'), validationError)
    const input = await parseJson(context, aiAccessUpdateSchema)
    const [target] = await db.select({ id: users.id, email: users.email, name: users.name }).from(users).where(eq(users.id, userId)).limit(1)
    if (!target) return fail(404, 'USER_NOT_FOUND', 'User not found')
    const changedAt = now()
    const row = await db.transaction(async tx => {
      await lockAiGlobal(tx)
      await lockAiOwner(tx, userId)
      const updated = await updateAiAccess(tx, { userId, enabled: input.enabled, monthlyQuota: input.monthlyQuota, actorUserId, now: changedAt })
      if (!input.enabled) await cancelOwnerJobsInTransaction(tx, userId, changedAt)
      await tx.insert(aiAdminAuditEvents).values({
        actorUserId,
        action: input.enabled ? 'access.grant' : 'access.revoke',
        targetType: 'user',
        targetId: userId.toString(),
        summary: input.enabled ? `AI access granted with monthly quota ${input.monthlyQuota}` : 'AI access revoked and pending work cancelled',
        createdAt: changedAt,
      })
      return updated
    })
    return context.json({ userId: userId.toString(), email: target.email, name: target.name, enabled: row!.enabled, monthlyQuota: row!.monthlyQuota, grantedAt: row!.grantedAt?.toISOString() ?? null, revokedAt: row!.revokedAt?.toISOString() ?? null })
  })

  app.get('/api/admin/ai/usage', async context => {
    await requireAdmin(context)
    const parsed = aiAdminUsageQuerySchema.safeParse(context.req.query())
    if (!parsed.success) return validationError(parsed.error)
    const month = parsed.data.month ? `${parsed.data.month.slice(0, 7)}-01` : `${now().toISOString().slice(0, 7)}-01`
    const userId = parsed.data.userId ? parseRouteId(parsed.data.userId, validationError) : undefined
    const rows = await db.select().from(aiUsageBuckets).where(and(eq(aiUsageBuckets.bucketMonth, month), parsed.data.userId ? eq(aiUsageBuckets.userId, userId!) : undefined)).orderBy(desc(aiUsageBuckets.userId)).limit(parsed.data.limit)
    const attemptCurrencies = await db.select({ userId: aiReportAttempts.userId, pricingCurrency: aiReportAttempts.pricingCurrency })
      .from(aiReportAttempts).where(and(eq(aiReportAttempts.reservationBucketMonth, month), isNotNull(aiReportAttempts.pricingCurrency), userId ? eq(aiReportAttempts.userId, userId) : undefined))
    const currencyFor = (rowUserId: bigint | null) => {
      const distinct = [...new Set(attemptCurrencies.filter(attempt => rowUserId === null || attempt.userId === rowUserId).map(attempt => attempt.pricingCurrency).filter((value): value is string => value !== null))]
      return distinct.length === 1 ? distinct[0] : null
    }
    return context.json(aiAdminUsageResponseSchema.parse({ data: rows.map(row => ({ userId: row.userId?.toString() ?? null, month: row.bucketMonth, pricingCurrency: currencyFor(row.userId), reserved: row.reserved, reservedCostCents: row.reservedCostCents, consumed: row.consumed, released: row.released, unknown: row.unknown, inputTokens: row.inputTokens, outputTokens: row.outputTokens, estimatedCostCents: row.estimatedCostCents })) }))
  })

  app.get('/api/admin/ai/audit', async context => {
    await requireAdmin(context)
    const parsed = aiAdminAuditQuerySchema.safeParse(context.req.query())
    if (!parsed.success) return validationError(parsed.error)
    const cursor = parseCursor(parsed.data.cursor, validationError)
    const rows = await db.select().from(aiAdminAuditEvents).where(cursor ? lt(aiAdminAuditEvents.id, cursor) : undefined).orderBy(desc(aiAdminAuditEvents.id)).limit(parsed.data.limit + 1)
    const page = rows.slice(0, parsed.data.limit)
    return context.json(aiAdminAuditResponseSchema.parse({ data: page.map(row => ({ id: row.id.toString(), actorUserId: row.actorUserId?.toString() ?? null, action: row.action, targetType: row.targetType, targetId: row.targetId, summary: row.summary, createdAt: row.createdAt.toISOString() })), nextCursor: rows.length > parsed.data.limit ? page.at(-1)?.id.toString() ?? null : null }))
  })
}
