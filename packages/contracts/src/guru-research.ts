import { z } from 'zod'
import { calendarDateSchema, serializedIdSchema, utcInstantSchema } from './common.js'
import { guruPublicProfileSchema, guruPeriodSummarySchema } from './gurus.js'

const actionSchema = z.enum(['NEW', 'STRONG_ADD', 'ADD', 'UNCHANGED', 'REDUCE', 'STRONG_REDUCE', 'EXIT'])
const decimalSchema = z.string().regex(/^-?\d+(?:\.\d{1,8})?$/)
const thresholdSchema = z.string().regex(/^(?:0|\d+)(?:\.\d{1,8})?$/)
const sourceSchema = z.object({ accession: z.string(), sourceUrl: z.string().url() }).strict()

export const guruResearchQuerySchema = z.object({
  period: calendarDateSchema.optional(),
  search: z.string().trim().max(200).optional(),
  sector: z.string().trim().max(120).optional(),
  securityType: z.string().trim().max(80).optional(),
  quantityType: z.enum(['SH', 'PRN']).optional(),
  action: actionSchema.optional(),
  newOnly: z.enum(['true', 'false']).optional(),
  increasedOnly: z.enum(['true', 'false']).optional(),
  reducedOnly: z.enum(['true', 'false']).optional(),
  sort: z.enum(['rank', 'weight', 'value', 'change']).default('rank'),
}).strict().superRefine((value, context) => {
  const active = [value.newOnly, value.increasedOnly, value.reducedOnly].filter(item => item === 'true')
  if (active.length > 1) context.addIssue({ code: 'custom', message: 'Position action filters are mutually exclusive' })
})

export const guruResearchHoldingSchema = z.object({
  positionKey: z.string(),
  securityId: serializedIdSchema.nullable(),
  ticker: z.string().nullable(),
  company: z.string(),
  sector: z.string().nullable(),
  industry: z.string().nullable(),
  securityType: z.string().nullable(),
  quantityType: z.enum(['SH', 'PRN']),
  putCall: z.enum(['PUT', 'CALL']).nullable(),
  action: actionSchema,
  quantity: decimalSchema.nullable(),
  reportedValueUsd: decimalSchema.nullable(),
  weightPercent: decimalSchema.nullable(),
  rank: z.number().int().positive().nullable(),
  previousQuantity: decimalSchema.nullable(),
  quantityChange: decimalSchema,
  quantityChangePercent: decimalSchema.nullable(),
  previousWeightPercent: decimalSchema.nullable(),
  weightChangePercentagePoints: decimalSchema.nullable(),
  previousRank: z.number().int().positive().nullable(),
  rankChange: z.number().int().nullable(),
  sources: sourceSchema.array(),
}).strict()

export const guruResearchQuarterSchema = guruPeriodSummarySchema.extend({
  mappingCoveragePercent: decimalSchema.nullable(),
  accession: z.string().nullable(),
  form: z.enum(['13F-HR', '13F-HR/A']).nullable(),
  sourceUrl: z.string().url().nullable(),
}).strict()

export const guruPortfolioResponseSchema = z.object({ data: z.object({
  profile: guruPublicProfileSchema,
  quarter: guruResearchQuarterSchema,
  periods: guruResearchQuarterSchema.array(),
  holdings: guruResearchHoldingSchema.array(),
}).strict() }).strict()

export const guruChangesResponseSchema = z.object({ data: z.object({
  profile: guruPublicProfileSchema,
  quarter: guruResearchQuarterSchema,
  periods: guruResearchQuarterSchema.array(),
  newPositions: guruResearchHoldingSchema.array(),
  increasedPositions: guruResearchHoldingSchema.array(),
  reducedPositions: guruResearchHoldingSchema.array(),
  exitedPositions: guruResearchHoldingSchema.array(),
  largestWeightChanges: guruResearchHoldingSchema.array(),
  largestRankChanges: guruResearchHoldingSchema.array(),
}).strict() }).strict()

export const guruHistoryResponseSchema = z.object({ data: z.object({
  profile: guruPublicProfileSchema,
  periods: guruResearchQuarterSchema.array(),
}).strict() }).strict()

export const guruPositionHistoryQuerySchema = z.object({ positionKey: z.string().min(1).max(256) }).strict()
export const guruPositionHistoryResponseSchema = z.object({ data: z.object({
  profile: guruPublicProfileSchema,
  positionKey: z.string(),
  ticker: z.string().nullable(),
  company: z.string(),
  history: z.object({
    periodEnd: calendarDateSchema,
    action: actionSchema,
    quantity: decimalSchema.nullable(),
    reportedValueUsd: decimalSchema.nullable(),
    weightPercent: decimalSchema.nullable(),
    rank: z.number().int().positive().nullable(),
    source: sourceSchema.array(),
  }).strict().array(),
}).strict() }).strict()

export const guruFilingsResponseSchema = z.object({ data: z.object({
  profile: guruPublicProfileSchema,
  filings: z.object({
    accession: z.string(),
    periodEnd: calendarDateSchema.nullable(),
    form: z.enum(['13F-HR', '13F-HR/A']),
    filingDate: calendarDateSchema,
    filedAt: utcInstantSchema.nullable(),
    status: z.enum(['PENDING', 'DOWNLOADED', 'PARSED', 'PARTIAL', 'READY', 'ERROR', 'SUPERSEDED']),
    amendmentNumber: z.number().int().positive().nullable(),
    amendmentType: z.string().nullable(),
    parserVersion: z.string().nullable(),
    mappingCoveragePercent: decimalSchema.nullable(),
    sourceUrl: z.string().url(),
    documents: z.object({ basename: z.string(), documentType: z.string().nullable(), description: z.string().nullable(), sourceUrl: z.string().url() }).strict().array(),
    effectiveOperations: z.object({ operation: z.enum(['ORIGINAL', 'RESTATEMENT', 'ADD_NEW_HOLDINGS']), parserVersion: z.string() }).strict().array(),
  }).strict().array(),
}).strict() }).strict()

export const guruActivityQuerySchema = z.object({
  guru: z.string().trim().max(80).optional(),
  symbol: z.string().trim().max(32).optional(),
  sector: z.string().trim().max(120).optional(),
  period: calendarDateSchema.optional(),
  action: actionSchema.optional(),
  minWeight: thresholdSchema.optional(),
  minChangePercent: thresholdSchema.optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
}).strict()

export const guruActivityResponseSchema = z.object({
  data: z.object({
    items: z.object({
      guru: guruPublicProfileSchema,
      periodEnd: calendarDateSchema,
      ticker: z.string().nullable(),
      company: z.string(),
      sector: z.string().nullable(),
      action: actionSchema,
      quantityChangePercent: decimalSchema.nullable(),
      currentWeightPercent: decimalSchema.nullable(),
      previousWeightPercent: decimalSchema.nullable(),
      source: sourceSchema.array(),
    }).strict().array(),
    pagination: z.object({ page: z.number().int().positive(), limit: z.number().int().positive(), total: z.number().int().nonnegative(), totalPages: z.number().int().nonnegative() }).strict(),
  }).strict(),
}).strict()

export type GuruResearchQuery = z.infer<typeof guruResearchQuerySchema>
export type GuruActivityQuery = z.infer<typeof guruActivityQuerySchema>
