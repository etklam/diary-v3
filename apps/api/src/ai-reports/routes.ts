import type { Context, Hono } from 'hono'
import type { z } from 'zod'
import {
  aiConsentSchema,
  aiConsentUpdateSchema,
  aiReportGenerateRequestSchema,
  aiReportListQuerySchema,
  aiReportMutationResponseSchema,
  aiReportCancelResponseSchema,
  aiReportPreviewRequestSchema,
  aiReportPreviewSchema,
  type ErrorCode,
} from '@diary/contracts'
import type { Database } from '@diary/db'
import type { AppEnv } from '../app.js'
import { AiReportService, AiReportServiceError } from './report-service.js'

interface AiRouteDependencies {
  db: Database
  now: () => Date
  fail: (status: number, code: ErrorCode, message: string) => never
  validationError: (error: z.ZodError) => never
  parseJson: <T>(context: Context<AppEnv>, schema: z.ZodType<T>) => Promise<T>
  service?: AiReportService
}

const contextErrorCodes = new Set<ErrorCode>([
  'AI_REPORT_NO_DATA',
  'AI_REPORT_CONTEXT_TOO_LARGE',
  'AI_REPORT_INVALID_PERIOD',
  'AI_REPORT_FUTURE_PERIOD',
  'AI_REPORT_INVALID_TIMEZONE',
])

function errorStatus(code: string, fallback: number): number {
  if (code === 'AI_ACCESS_DENIED') return 403
  if (code === 'AI_CONSENT_REQUIRED' || code === 'AI_CONFIG_CHANGED' || code === 'AI_PREVIEW_CHANGED' || code === 'AI_IDEMPOTENCY_CONFLICT' || code === 'AI_REPORT_ALREADY_RUNNING') return 409
  if (code === 'AI_QUOTA_EXCEEDED' || code === 'AI_PROVIDER_RATE_LIMITED') return 429
  if (code === 'AI_REPORT_CONTEXT_TOO_LARGE') return 413
  if (code === 'AI_REPORTS_DISABLED' || code === 'AI_NOT_CONFIGURED' || code === 'AI_WORKER_UNAVAILABLE') return 503
  if (code === 'SYS_NOT_FOUND' || code === 'AI_SOURCE_INVALIDATED') return 404
  return fallback
}

export function registerAiReportRoutes(app: Hono<AppEnv>, dependencies: AiRouteDependencies) {
  const service = dependencies.service ?? new AiReportService({ db: dependencies.db, now: dependencies.now })
  const { fail, validationError, parseJson } = dependencies

  const userId = (context: Context<AppEnv>) => {
    context.header('Cache-Control', 'no-store')
    const user = context.get('user')
    if (!user) return fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    return BigInt(user.id)
  }

  const invoke = async <T>(context: Context<AppEnv>, operation: () => Promise<T>): Promise<T> => {
    try {
      return await operation()
    } catch (error) {
      if (error instanceof AiReportServiceError) return fail(error.statusCode, error.code as ErrorCode, error.message)
      const coded = error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string' ? (error as { code: string }).code : ''
      const code = coded || (error instanceof Error ? error.message : '')
      if (contextErrorCodes.has(code as ErrorCode)) return fail(errorStatus(code, 400), code as ErrorCode, code)
      throw error
    }
  }

  app.get('/api/ai/capabilities', async context => {
    const id = userId(context)
    return context.json(await invoke(context, () => service.capabilities(id)))
  })

  app.get('/api/ai/consent', async context => {
    const id = userId(context)
    const value = await invoke(context, () => service.consent(id))
    return context.json(value ? aiConsentSchema.parse(value) : null)
  })

  app.put('/api/ai/consent', async context => {
    const id = userId(context)
    const input = await parseJson(context, aiConsentUpdateSchema)
    const value = await invoke(context, () => service.acceptConsent(id, input))
    return context.json(aiConsentSchema.parse(value))
  })

  app.delete('/api/ai/consent', async context => {
    const id = userId(context)
    const value = await invoke(context, () => service.revokeConsent(id))
    return context.json(value ? aiConsentSchema.parse(value) : null)
  })

  app.post('/api/ai/reports/preview', async context => {
    const id = userId(context)
    const input = await parseJson(context, aiReportPreviewRequestSchema)
    const value = await invoke(context, () => service.preview(id, input))
    return context.json(aiReportPreviewSchema.parse(value))
  })

  app.post('/api/ai/reports', async context => {
    const id = userId(context)
    const key = context.req.header('Idempotency-Key')
    if (!key) return fail(400, 'SYS_VALIDATION_ERROR', 'Idempotency-Key is required')
    const input = await parseJson(context, aiReportGenerateRequestSchema)
    const value = await invoke(context, () => service.generate(id, key, input))
    return context.json(aiReportMutationResponseSchema.parse(value), value.reused ? 200 : 202)
  })

  app.get('/api/ai/reports', async context => {
    const id = userId(context)
    const query = aiReportListQuerySchema.safeParse(context.req.query())
    if (!query.success) return validationError(query.error)
    return context.json(await invoke(context, () => service.list(id, query.data)))
  })

  app.get('/api/ai/reports/:id', async context => {
    const id = userId(context)
    const rawId = context.req.param('id')
    if (!/^\d+$/.test(rawId)) return fail(400, 'SYS_VALIDATION_ERROR', 'Invalid report id')
    return context.json(await invoke(context, () => service.detail(id, BigInt(rawId))))
  })

  app.post('/api/ai/reports/:id/regenerate', async context => {
    const id = userId(context)
    const rawId = context.req.param('id')
    if (!/^\d+$/.test(rawId)) return fail(400, 'SYS_VALIDATION_ERROR', 'Invalid report id')
    const key = context.req.header('Idempotency-Key')
    if (!key) return fail(400, 'SYS_VALIDATION_ERROR', 'Idempotency-Key is required')
    const input = await parseJson(context, aiReportGenerateRequestSchema)
    const value = await invoke(context, () => service.generate(id, key, { ...input, regenerateFromReportId: rawId }))
    return context.json(aiReportMutationResponseSchema.parse(value), value.reused ? 200 : 202)
  })

  app.post('/api/ai/reports/:id/cancel', async context => {
    const id = userId(context)
    const rawId = context.req.param('id')
    if (!/^\d+$/.test(rawId)) return fail(400, 'SYS_VALIDATION_ERROR', 'Invalid report id')
    return context.json(aiReportCancelResponseSchema.parse(await invoke(context, () => service.cancel(id, BigInt(rawId)))))
  })

  app.delete('/api/ai/reports/:id', async context => {
    const id = userId(context)
    const rawId = context.req.param('id')
    if (!/^\d+$/.test(rawId)) return fail(400, 'SYS_VALIDATION_ERROR', 'Invalid report id')
    return context.json(await invoke(context, () => service.delete(id, BigInt(rawId))))
  })
}
