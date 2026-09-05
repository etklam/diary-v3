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
import { canonicalizeCik, parseAccession } from './sec-edgar/validation.js'
import type { SecEdgarService } from './sec-edgar/service.js'

type SecRouteDependencies = {
  service: SecEdgarService
  consume: (key: string, points: number, timestamp: number) => void
  clientIp: (context: Context<AppEnv>) => string
  now: () => Date
  fail: (status: number, code: ErrorCode, message: string, details?: { field?: string; message?: string; value?: unknown }[] | null) => never
  validationError: (error: z.ZodError) => never
}

function queryValues(context: Context<AppEnv>, key: string): string[] {
  const url = new URL(context.req.url)
  return url.searchParams.getAll(key)
}

export function registerSecFilingRoutes(app: Hono<AppEnv>, dependencies: SecRouteDependencies) {
  const { service, consume, clientIp, now, fail, validationError } = dependencies
  const limit = (context: Context<AppEnv>, points: number, kind: 'metadata' | 'download' | 'package' | 'batch') => {
    context.header('Cache-Control', 'no-store')
    consume(`sec:${kind}:ip:${clientIp(context)}`, points, now().getTime())
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
    limit(context, 60, 'metadata')
    try {
      const query = parse(secCompanySearchQuerySchema, context.req.query())
      const result = await service.searchCompanies(query.q, query.limit)
      return context.json(secApiResponseSchema(secCompanySearchResultSchema.array().max(20)).parse({ data: result.value, meta: responseMeta(result) }))
    } catch (error) { return handle(error) }
  })

  app.get('/api/tools/sec-filings/companies/:cik/filings', async context => {
    limit(context, 60, 'metadata')
    try {
      const query = parse(secFilingListQuerySchema, context.req.query())
      const forms = query.forms ? query.forms.split(',').map(value => value.trim().toUpperCase()).filter(Boolean) : []
      if (forms.length > 20) return fail(400, 'SEC_VALIDATION_ERROR', 'Too many form filters')
      const result = await service.listFilings(context.req.param('cik'), { ...query, forms })
      return context.json(secApiResponseSchema(secFilingPageSchema).parse({ data: result.value, meta: responseMeta(result) }))
    } catch (error) { return handle(error) }
  })

  app.get('/api/tools/sec-filings/companies/:cik/filings/:accession', async context => {
    limit(context, 60, 'metadata')
    try {
      const result = await service.getFilingDetail(context.req.param('cik'), context.req.param('accession'))
      return context.json(secApiResponseSchema(secFilingDetailSchema).parse({ data: result.value, meta: responseMeta(result) }))
    } catch (error) { return handle(error) }
  })

  app.get('/api/tools/sec-filings/companies/:cik/filings/:accession/documents/:basename', async context => {
    limit(context, 30, 'download')
    try {
      const opened = await service.openDocument(context.req.param('cik'), context.req.param('accession'), context.req.param('basename'))
      const body = await (await import('./sec-edgar/download.js')).readResponseBytes(opened.response, (await import('./sec-edgar/download.js')).SEC_LIMITS.documentBytes)
      context.header('Content-Type', opened.response.headers.get('content-type') || 'application/octet-stream')
      context.header('Content-Disposition', `attachment; filename="${(await import('./sec-edgar/download.js')).safeDownloadName(opened.document.basename)}"`)
      context.header('X-Content-Type-Options', 'nosniff')
      context.header('Content-Length', String(body.byteLength))
      return context.body(body as unknown as ArrayBuffer)
    } catch (error) { return handle(error) }
  })

  app.get('/api/tools/sec-filings/companies/:cik/filings/:accession/package', async context => {
    limit(context, 10, 'package')
    try {
      const includes = queryValues(context, 'include').map(value => parse(secPackageIncludeSchema, value))
      const result = await buildSingleFilingPackage(service, context.req.param('cik'), context.req.param('accession'), includes)
      context.header('Content-Type', result.contentType)
      context.header('Content-Disposition', `attachment; filename="${result.filename}"`)
      context.header('X-Content-Type-Options', 'nosniff')
      context.header('Content-Length', String(result.body.byteLength))
      return context.body(result.body as unknown as ArrayBuffer)
    } catch (error) { return handle(error) }
  })

  app.get('/api/tools/sec-filings/batch', async context => {
    limit(context, 5, 'batch')
    try {
      const raw = context.req.query()
      const accessions = queryValues(context, 'accessions')
      const input = parse(secBatchQuerySchema, { ...raw, accessions: accessions.length > 1 ? accessions : accessions[0] ?? raw.accessions })
      const result = await buildBatchPackage(service, canonicalizeCik(input.cik), input.accessions.map(accession => parseAccession(accession).accession), input.mode)
      context.header('Content-Type', result.contentType)
      context.header('Content-Disposition', `attachment; filename="${result.filename}"`)
      context.header('X-Content-Type-Options', 'nosniff')
      context.header('Content-Length', String(result.body.byteLength))
      return context.body(result.body as unknown as ArrayBuffer)
    } catch (error) { return handle(error) }
  })
}

export type { SecProviderErrorCode }
