import type { Context, Hono } from 'hono'
import { z } from 'zod'
import {
  researchApproveRequestSchema,
  researchGenerateRequestSchema,
  researchGenerateResponseSchema,
  researchHandoffRequestSchema,
  researchImportArticleRevisionRequestSchema,
  researchHandoffResponseSchema,
  researchPrepareRequestSchema,
  researchProviderSettingsSchema,
  researchProviderUpdateSchema,
  researchRevisionRequestSchema,
  researchRevisionSchema,
  researchRunDetailSchema,
  researchRunListQuerySchema,
  researchRunListResponseSchema,
  researchRuntimeResponseSchema,
  researchRuntimeUpdateSchema,
  researchSettingsResponseSchema,
  type ErrorCode,
} from '@diary/contracts'
import type { Database } from '@diary/db'
import type { AppEnv } from '../app.js'
import {
  createResearchStudioService,
  ResearchServiceError,
  type ResearchEvidenceProvider,
  type ResearchLatestCompletedSession,
  type ResearchStudioService,
  type ResearchTransport,
} from './service.js'
import type { ResearchSourcePolicy } from './source-policy.js'

export interface ResearchRouteDependencies {
  db: Database
  now: () => Date
  fail: (status: number, code: ErrorCode, message: string) => never
  validationError: (error: z.ZodError) => never
  parseJson: <T>(context: Context<AppEnv>, schema: z.ZodType<T>) => Promise<T>
  transport?: ResearchTransport
  evidenceProvider?: ResearchEvidenceProvider
  latestCompletedSession?: ResearchLatestCompletedSession
  allowSyntheticEvidence?: boolean
  officialSourcePolicies?: readonly ResearchSourcePolicy[]
  service?: ResearchStudioService
}

function routeId(value: string | undefined, validationError: (error: z.ZodError) => never): bigint {
  const parsed = z.string().regex(/^[1-9]\d*$/).safeParse(value)
  if (!parsed.success) return validationError(parsed.error)
  return BigInt(parsed.data)
}

function statusFor(error: ResearchServiceError): number {
  if (error.statusCode !== 500) return error.statusCode
  if (error.code === 'RESEARCH_NOT_FOUND') return 404
  if (error.code === 'RESEARCH_DISABLED' || error.code === 'RESEARCH_GENERATION_DISABLED' || error.code === 'RESEARCH_PROVIDER_NOT_CONFIGURED') return 503
  if (error.code === 'RESEARCH_BUDGET_EXCEEDED') return 429
  if (error.code === 'RESEARCH_REVISION_CONFLICT' || error.code === 'RESEARCH_IDEMPOTENCY_CONFLICT' || error.code === 'RESEARCH_OUTCOME_UNKNOWN' || error.code === 'RESEARCH_ARTICLE_NOT_APPROVED' || error.code === 'RESEARCH_QA_FAILED' || error.code === 'RESEARCH_ARTICLE_FRESHNESS' || error.code === 'RESEARCH_ARTICLE_PROVENANCE') return 409
  return 500
}

export function registerResearchRoutes(app: Hono<AppEnv>, dependencies: ResearchRouteDependencies) {
  const service = dependencies.service ?? createResearchStudioService({
    db: dependencies.db,
    now: dependencies.now,
    transport: dependencies.transport,
    evidenceProvider: dependencies.evidenceProvider,
    latestCompletedSession: dependencies.latestCompletedSession,
    allowSyntheticEvidence: dependencies.allowSyntheticEvidence,
    officialSourcePolicies: dependencies.officialSourcePolicies,
  })
  const { fail, validationError, parseJson } = dependencies
  const admin = (context: Context<AppEnv>) => {
    context.header('Cache-Control', 'no-store')
    const user = context.get('user')
    if (!user) return fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    if (user.role !== 'ADMIN') return fail(403, 'AUTH_FORBIDDEN', 'Admin access required')
    return BigInt(user.id)
  }
  const invoke = async <T>(context: Context<AppEnv>, operation: () => Promise<T>) => {
    try { return await operation() }
    catch (error) {
      if (error instanceof ResearchServiceError) return fail(statusFor(error), error.code, error.message)
      throw error
    }
  }

  app.get('/api/admin/research/methods', async context => {
    admin(context)
    return context.json(await invoke(context, () => service.methods()))
  })

  app.get('/api/admin/research/instruments', async context => {
    admin(context)
    const raw = context.req.query('methodProfileId')
    const methodProfileId = raw === undefined ? undefined : routeId(raw, validationError)
    return context.json(await invoke(context, () => service.instruments(methodProfileId)))
  })

  app.get('/api/admin/research/settings', async context => {
    admin(context)
    return context.json(researchSettingsResponseSchema.parse(await invoke(context, () => service.settings())))
  })

  app.put('/api/admin/research/runtime', async context => {
    const actorId = admin(context)
    const input = await parseJson(context, researchRuntimeUpdateSchema)
    return context.json(researchRuntimeResponseSchema.parse(await invoke(context, () => service.updateRuntime(input, actorId))))
  })

  app.put('/api/admin/research/provider', async context => {
    const actorId = admin(context)
    const input = await parseJson(context, researchProviderUpdateSchema)
    return context.json(researchProviderSettingsSchema.parse(await invoke(context, () => service.updateProvider(input, actorId))))
  })

  app.get('/api/admin/research/runs', async context => {
    const actorId = admin(context)
    const parsed = researchRunListQuerySchema.safeParse(context.req.query())
    if (!parsed.success) return validationError(parsed.error)
    return context.json(researchRunListResponseSchema.parse(await invoke(context, () => service.list(actorId, parsed.data))))
  })

  app.post('/api/admin/research/runs', async context => {
    const actorId = admin(context)
    const input = await parseJson(context, researchPrepareRequestSchema)
    return context.json(researchRunDetailSchema.parse(await invoke(context, () => service.prepare(actorId, input))))
  })

  app.get('/api/admin/research/runs/:id', async context => {
    const actorId = admin(context)
    const id = routeId(context.req.param('id'), validationError)
    return context.json(researchRunDetailSchema.parse(await invoke(context, () => service.detail(actorId, id))))
  })

  app.post('/api/admin/research/runs/:id/generate', async context => {
    const actorId = admin(context)
    const id = routeId(context.req.param('id'), validationError)
    const input = await parseJson(context, researchGenerateRequestSchema)
    const result = await invoke(context, () => service.generate(actorId, id, input))
    return context.json(researchGenerateResponseSchema.parse(result), result.reused ? 200 : 202)
  })

  app.post('/api/admin/research/runs/:id/cancel', async context => {
    const actorId = admin(context)
    const id = routeId(context.req.param('id'), validationError)
    return context.json(researchRunDetailSchema.parse(await invoke(context, () => service.cancel(actorId, id))))
  })

  app.post('/api/admin/research/runs/:id/revisions', async context => {
    const actorId = admin(context)
    const id = routeId(context.req.param('id'), validationError)
    const input = await parseJson(context, researchRevisionRequestSchema)
    return context.json(researchRevisionSchema.parse(await invoke(context, () => service.createRevision(actorId, id, input))))
  })

  app.post('/api/admin/research/runs/:id/import-article-revision', async context => {
    const actorId = admin(context)
    const id = routeId(context.req.param('id'), validationError)
    const input = await parseJson(context, researchImportArticleRevisionRequestSchema)
    return context.json(researchRevisionSchema.parse(await invoke(context, () => service.importArticleRevision(actorId, id, input))))
  })

  app.post('/api/admin/research/runs/:id/approve', async context => {
    const actorId = admin(context)
    const id = routeId(context.req.param('id'), validationError)
    const input = await parseJson(context, researchApproveRequestSchema)
    return context.json(researchRunDetailSchema.parse(await invoke(context, () => service.approve(actorId, id, input))))
  })

  app.post('/api/admin/research/runs/:id/handoff', async context => {
    const actorId = admin(context)
    const id = routeId(context.req.param('id'), validationError)
    const input = await parseJson(context, researchHandoffRequestSchema)
    return context.json(researchHandoffResponseSchema.parse(await invoke(context, () => service.handoff(actorId, id, input))))
  })
}
