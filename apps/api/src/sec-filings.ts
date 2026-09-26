import type { Context, Hono } from 'hono'
import { z } from 'zod'
import {
  secApiResponseSchema,
  secBatchQuerySchema,
  secCompanySearchQuerySchema,
  secCompanySearchResultSchema,
  secFilingDetailSchema,
  secFilingListQuerySchema,
  secFilingPageSchema,
  secPackageIncludeSchema,
  type SecProviderErrorCode,
} from '@diary/contracts/sec-filings'
import type { ErrorCode } from '@diary/contracts'
import type { AppEnv } from './app.js'
import { SecProviderError } from './sec-edgar/errors.js'
import { buildBatchPackage, buildSingleFilingPackage } from './sec-edgar/package.js'
import { acquireSecResourceSlot, createSecLifetime, createTempWorkspace, stageDocument, streamStagedFile } from './sec-edgar/download.js'
import { canonicalizeCik, parseAccession } from './sec-edgar/validation.js'
import type { SecEdgarService } from './sec-edgar/service.js'
import { RATE_LIMIT_POLICIES } from './rate-limit/policies.js'
import type { RateLimitPolicy } from './rate-limit/types.js'

type SecRouteDependencies = {
  service: SecEdgarService
  consume: (context: Context<AppEnv>, policy: RateLimitPolicy, scope: string, identity: string) => Promise<void>
  clientIp: (context: Context<AppEnv>) => string
  fail: (status: number, code: ErrorCode, message: string, details?: { field?: string; message?: string; value?: unknown }[] | null) => never
  validationError: (error: z.ZodError) => never
}

function queryValues(context: Context<AppEnv>, key: string): string[] {
  const url = new URL(context.req.url)
  return url.searchParams.getAll(key)
}

export function registerSecFilingRoutes(app: Hono<AppEnv>, dependencies: SecRouteDependencies) {
  const { service, consume, clientIp, fail, validationError } = dependencies
  const policies = {
    metadata: RATE_LIMIT_POLICIES.secMetadataIp,
    download: RATE_LIMIT_POLICIES.secDownloadIp,
    package: RATE_LIMIT_POLICIES.secPackageIp,
    batch: RATE_LIMIT_POLICIES.secBatchIp,
  }
  const limit = async (context: Context<AppEnv>, kind: keyof typeof policies) => {
    context.header('Cache-Control', 'no-store')
    await consume(context, policies[kind], 'ip', clientIp(context))
  }
  const parse = <T>(schema: z.ZodType<T>, input: unknown): T => {
    const result = schema.safeParse(input)
    if (!result.success) return validationError(result.error)
    return result.data
  }
  const handle = (error: unknown): never => {
    // `parse` delegates to the app's validationError, which throws its
    // structured ApiError. Preserve that status/code for the app boundary.
    if (error && typeof error === 'object' && 'statusCode' in error && 'code' in error && typeof (error as { statusCode?: unknown }).statusCode === 'number') throw error
    if (error instanceof SecProviderError) {
      const details = error.retryAfterSeconds === undefined ? null : [{ message: `Retry after ${error.retryAfterSeconds} seconds` }]
      return fail(error.statusCode, error.code as ErrorCode, error.message, details)
    }
    if (error instanceof z.ZodError) return validationError(error)
    return fail(502, 'SYS_EXTERNAL_SERVICE_ERROR', 'SEC filings are temporarily unavailable')
  }
  const responseMeta = (result: { stale: boolean; cacheStatus: 'miss' | 'hit' | 'stale'; fetchedAt: string }) => ({ stale: result.stale, cacheStatus: result.cacheStatus, fetchedAt: result.fetchedAt })

  app.get('/api/tools/sec-filings/companies', async context => {
    await limit(context, 'metadata')
    try {
      const query = parse(secCompanySearchQuerySchema, context.req.query())
      const result = await service.searchCompanies(query.q, query.limit, context.req.raw.signal)
      return context.json(secApiResponseSchema(secCompanySearchResultSchema.array().max(20)).parse({ data: result.value, meta: responseMeta(result) }))
    } catch (error) { return handle(error) }
  })

  app.get('/api/tools/sec-filings/companies/:cik/filings', async context => {
    await limit(context, 'metadata')
    try {
      const query = parse(secFilingListQuerySchema, context.req.query())
      const forms = query.forms ? query.forms.split(',').map(value => value.trim().toUpperCase()).filter(Boolean) : []
      if (forms.length > 20) return fail(400, 'SEC_VALIDATION_ERROR', 'Too many form filters')
      const result = await service.listFilings(context.req.param('cik'), { ...query, forms }, context.req.raw.signal)
      return context.json(secApiResponseSchema(secFilingPageSchema).parse({ data: result.value, meta: responseMeta(result) }))
    } catch (error) { return handle(error) }
  })

  app.get('/api/tools/sec-filings/companies/:cik/filings/:accession', async context => {
    await limit(context, 'metadata')
    try {
      const result = await service.getFilingDetail(context.req.param('cik'), context.req.param('accession'), context.req.raw.signal)
      return context.json(secApiResponseSchema(secFilingDetailSchema).parse({ data: result.value, meta: responseMeta(result) }))
    } catch (error) { return handle(error) }
  })

  app.get('/api/tools/sec-filings/companies/:cik/filings/:accession/documents/:basename', async context => {
    await limit(context, 'download')
    const lifetime = createSecLifetime(context.req.raw.signal)
    let lease: Awaited<ReturnType<typeof acquireSecResourceSlot>>
    try { lease = await acquireSecResourceSlot(lifetime.signal) } catch (error) { lifetime.dispose(); return handle(error) }
    let workspace: Awaited<ReturnType<typeof createTempWorkspace>> | undefined
    try {
      workspace = await createTempWorkspace()
      const opened = await service.openDocument(context.req.param('cik'), context.req.param('accession'), context.req.param('basename'), lifetime.signal)
      const staged = await stageDocument(workspace.directory, 0, opened.document, opened.response, { signal: lifetime.signal })
      context.header('Content-Type', opened.response.headers.get('content-type') || 'application/octet-stream')
      context.header('Content-Disposition', `attachment; filename="${staged.name.replace(/^001-/, '')}"`)
      context.header('X-Content-Type-Options', 'nosniff')
      context.header('Content-Length', String(staged.size))
      return context.body(streamStagedFile({ path: staged.path, size: staged.size, cleanup: async () => { lifetime.dispose(); await workspace!.cleanup() } }, { signal: lifetime.signal, onClosed: lease.release }))
    } catch (error) {
      lifetime.dispose()
      try { await workspace?.cleanup() } catch { /* preserve the primary provider error */ } finally { lease.release() }
      return handle(error)
    }
  })

  app.get('/api/tools/sec-filings/companies/:cik/filings/:accession/package', async context => {
    await limit(context, 'package')
    const lifetime = createSecLifetime(context.req.raw.signal)
    let lease: Awaited<ReturnType<typeof acquireSecResourceSlot>>
    try { lease = await acquireSecResourceSlot(lifetime.signal) } catch (error) { lifetime.dispose(); return handle(error) }
    let result: Awaited<ReturnType<typeof buildSingleFilingPackage>> | undefined
    try {
      const includes = queryValues(context, 'include').map(value => parse(secPackageIncludeSchema, value))
      result = await buildSingleFilingPackage(service, context.req.param('cik'), context.req.param('accession'), includes, { signal: lifetime.signal, onClosed: () => { lifetime.dispose(); lease.release() } })
      context.header('Content-Type', result.contentType)
      context.header('Content-Disposition', `attachment; filename="${result.filename}"`)
      context.header('X-Content-Type-Options', 'nosniff')
      context.header('Content-Length', String(result.size))
      return context.body(result.body)
    } catch (error) {
      lifetime.dispose()
      try { await result?.cleanup() } catch { /* preserve the primary provider error */ } finally { lease.release() }
      return handle(error)
    }
  })

  app.get('/api/tools/sec-filings/batch', async context => {
    await limit(context, 'batch')
    const lifetime = createSecLifetime(context.req.raw.signal)
    let lease: Awaited<ReturnType<typeof acquireSecResourceSlot>>
    try { lease = await acquireSecResourceSlot(lifetime.signal) } catch (error) { lifetime.dispose(); return handle(error) }
    let result: Awaited<ReturnType<typeof buildBatchPackage>> | undefined
    try {
      const raw = context.req.query()
      const accessions = queryValues(context, 'accessions')
      const input = parse(secBatchQuerySchema, { ...raw, accessions: accessions.length > 1 ? accessions : accessions[0] ?? raw.accessions })
      result = await buildBatchPackage(service, canonicalizeCik(input.cik), input.accessions.map(accession => parseAccession(accession).accession), input.mode, { signal: lifetime.signal, onClosed: () => { lifetime.dispose(); lease.release() } })
      context.header('Content-Type', result.contentType)
      context.header('Content-Disposition', `attachment; filename="${result.filename}"`)
      context.header('X-Content-Type-Options', 'nosniff')
      context.header('Content-Length', String(result.size))
      return context.body(result.body)
    } catch (error) {
      lifetime.dispose()
      try { await result?.cleanup() } catch { /* preserve the primary provider error */ } finally { lease.release() }
      return handle(error)
    }
  })
}

export type { SecProviderErrorCode }
