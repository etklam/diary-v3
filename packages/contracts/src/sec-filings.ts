import { z } from 'zod'
import { calendarDateSchema, utcInstantSchema } from './common.js'

export const secCacheStatusSchema = z.enum(['miss', 'hit', 'stale'])
export const secCacheMetaSchema = z.object({
  stale: z.boolean(),
  cacheStatus: secCacheStatusSchema,
  fetchedAt: utcInstantSchema,
}).strict()

export const secCompanySchema = z.object({
  cik: z.string().regex(/^\d{10}$/),
  name: z.string().trim().min(1),
  tickers: z.array(z.string().trim().min(1)).max(100),
  exchanges: z.array(z.string().trim().min(1)).max(100),
}).strict()

export const secCompanySearchResultSchema = secCompanySchema.extend({
  matchedBy: z.enum(['cik', 'ticker', 'name']),
}).strict()

export const secAmendmentFilterSchema = z.enum(['include', 'exclude', 'only'])
export const secFilingFiltersSchema = z.object({
  forms: z.array(z.string().trim().min(1).max(20)).max(20),
  filedFrom: calendarDateSchema.optional(),
  filedTo: calendarDateSchema.optional(),
  periodFrom: calendarDateSchema.optional(),
  periodTo: calendarDateSchema.optional(),
  amendments: secAmendmentFilterSchema,
  cursor: z.string().max(1000).optional(),
  limit: z.number().int().min(1).max(100),
}).strict()

export const secFilingSummarySchema = z.object({
  cik: z.string().regex(/^\d{10}$/),
  accession: z.string().regex(/^\d{10}-\d{2}-\d{6}$/),
  filingDate: calendarDateSchema,
  reportDate: calendarDateSchema.nullable(),
  // SEC submissions use both ISO timestamps and legacy space-separated UTC
  // strings; preserve the provider value instead of rejecting a valid row.
  acceptanceDateTime: z.string().nullable(),
  form: z.string().trim().min(1).max(20),
  isAmendment: z.boolean(),
  primaryDocument: z.string().trim().min(1).max(255),
  primaryDocumentDescription: z.string().nullable(),
  fileNumber: z.string().nullable(),
  filmNumber: z.string().nullable(),
  items: z.string().nullable(),
  size: z.number().int().nonnegative().nullable(),
}).strict()

export const secFilingPageSchema = z.object({
  company: secCompanySchema,
  filings: z.array(secFilingSummarySchema).max(100),
  nextCursor: z.string().nullable(),
}).strict()

export const secDocumentClassSchema = z.enum(['primary', 'complete-submission', 'xbrl', 'exhibit', 'pdf', 'other'])
export const secFilingDocumentSchema = z.object({
  basename: z.string().trim().min(1).max(255),
  description: z.string().nullable(),
  type: z.string().nullable(),
  sequence: z.number().int().nonnegative().nullable(),
  size: z.number().int().nonnegative(),
  classification: secDocumentClassSchema,
  isPrimary: z.boolean(),
  isPdf: z.boolean(),
  isXbrl: z.boolean(),
  isExhibit: z.boolean(),
}).strict()

export const secFilingDetailSchema = z.object({
  company: secCompanySchema,
  filing: secFilingSummarySchema,
  documents: z.array(secFilingDocumentSchema).max(200),
  hasPdf: z.boolean(),
}).strict()

export const secBatchModeSchema = z.enum(['primary', 'complete'])
export const secApiResponseSchema = <T extends z.ZodType>(data: T) => z.object({
  data,
  meta: secCacheMetaSchema,
}).strict()

export const secCompanySearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(20).default(10),
}).strict()

export const secFilingListQuerySchema = z.object({
  forms: z.string().max(200).optional(),
  filedFrom: calendarDateSchema.optional(),
  filedTo: calendarDateSchema.optional(),
  periodFrom: calendarDateSchema.optional(),
  periodTo: calendarDateSchema.optional(),
  amendments: secAmendmentFilterSchema.default('include'),
  cursor: z.string().max(1000).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict().superRefine((value, context) => {
  if (value.filedFrom && value.filedTo && value.filedFrom > value.filedTo) context.addIssue({ code: 'custom', path: ['filedFrom'], message: 'filedFrom must be before filedTo' })
  if (value.periodFrom && value.periodTo && value.periodFrom > value.periodTo) context.addIssue({ code: 'custom', path: ['periodFrom'], message: 'periodFrom must be before periodTo' })
})

export const secBatchQuerySchema = z.object({
  cik: z.string().min(1),
  accessions: z.union([z.string(), z.array(z.string())]).transform(value => Array.isArray(value) ? value : [value]),
  mode: secBatchModeSchema,
}).strict().superRefine((value, context) => {
  if (value.accessions.length < 1 || value.accessions.length > 10 || new Set(value.accessions).size !== value.accessions.length) {
    context.addIssue({ code: 'custom', path: ['accessions'], message: 'accessions must contain 1 to 10 unique values' })
  }
})

export const secPackageIncludeSchema = z.enum(['all', 'primary', 'complete', 'xbrl', 'exhibits', 'pdf'])

export type SecCacheStatus = z.infer<typeof secCacheStatusSchema>
export type SecCacheMeta = z.infer<typeof secCacheMetaSchema>
export type SecCompany = z.infer<typeof secCompanySchema>
export type SecCompanySearchResult = z.infer<typeof secCompanySearchResultSchema>
export type SecAmendmentFilter = z.infer<typeof secAmendmentFilterSchema>
export type SecFilingFilters = z.infer<typeof secFilingFiltersSchema>
export type SecFilingSummary = z.infer<typeof secFilingSummarySchema>
export type SecFilingPage = z.infer<typeof secFilingPageSchema>
export type SecDocumentClass = z.infer<typeof secDocumentClassSchema>
export type SecFilingDocument = z.infer<typeof secFilingDocumentSchema>
export type SecFilingDetail = z.infer<typeof secFilingDetailSchema>
export type SecBatchMode = z.infer<typeof secBatchModeSchema>

export type SecProviderErrorCode =
  | 'SEC_CONFIG_MISSING'
  | 'SEC_VALIDATION_ERROR'
  | 'SEC_COMPANY_NOT_FOUND'
  | 'SEC_FILING_NOT_FOUND'
  | 'SEC_DOCUMENT_NOT_FOUND'
  | 'SEC_UPSTREAM_RATE_LIMITED'
  | 'SEC_UPSTREAM_UNAVAILABLE'
  | 'SEC_UPSTREAM_INVALID_RESPONSE'
  | 'SEC_QUEUE_FULL'
  | 'SEC_UNSAFE_REDIRECT'
  | 'SEC_FILE_TOO_LARGE'
  | 'SEC_PACKAGE_LIMIT_EXCEEDED'
  | 'SEC_RATE_LIMITED'
