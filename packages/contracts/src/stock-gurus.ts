import { z } from 'zod'
import { calendarDateSchema, utcInstantSchema } from './common.js'
import { guruPublicProfileSchema } from './gurus.js'

const decimalSchema = z.string().regex(/^-?\d+(?:\.\d{1,8})?$/)
const actionSchema = z.enum(['NEW', 'STRONG_ADD', 'ADD', 'UNCHANGED', 'REDUCE', 'STRONG_REDUCE', 'EXIT'])
const sourceSchema = z.object({
  accession: z.string().nullable(),
  form: z.enum(['13F-HR', '13F-HR/A']).nullable(),
  filedAt: utcInstantSchema.nullable(),
  sourceUrl: z.string().url().nullable(),
}).strict()

export const stockGuruHistoryPointSchema = z.object({
  periodEnd: calendarDateSchema,
  status: z.enum(['READY', 'PENDING', 'UNAVAILABLE']),
  activeGuruCount: z.number().int().nonnegative().nullable(),
  readyGuruCount: z.number().int().nonnegative().nullable(),
  quarterCoveragePercent: decimalSchema.nullable(),
  mappingCoveragePercent: decimalSchema.nullable(),
  holderCount: z.number().int().nonnegative().nullable(),
  weightBreadthPercent: decimalSchema.nullable(),
  averagePortfolioWeightPercent: decimalSchema.nullable(),
  netBuyerCount: z.number().int().nullable(),
  classification: z.enum(['ACCUMULATION', 'NEUTRAL', 'DISTRIBUTION']).nullable(),
}).strict()

export const stockGuruHolderSchema = z.object({
  profile: guruPublicProfileSchema,
  action: actionSchema.nullable(),
  quantity: decimalSchema.nullable(),
  quantityChangePercent: decimalSchema.nullable(),
  weightPercent: decimalSchema.nullable(),
  previousWeightPercent: decimalSchema.nullable(),
  source: sourceSchema,
}).strict()

export const stockGuruSummarySchema = z.object({
  symbol: z.string(),
  mappingStatus: z.enum(['MATCHED', 'AMBIGUOUS', 'UNRESOLVED']),
  securityId: z.string().nullable(),
  company: z.string().nullable(),
  sector: z.string().nullable(),
  industry: z.string().nullable(),
  periodEnd: calendarDateSchema.nullable(),
  dataStatus: z.enum(['READY', 'PENDING', 'UNAVAILABLE']),
  calculatedAt: utcInstantSchema.nullable(),
  contextHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  activeGuruCount: z.number().int().nonnegative().nullable(),
  readyGuruCount: z.number().int().nonnegative().nullable(),
  quarterCoveragePercent: decimalSchema.nullable(),
  mappingCoveragePercent: decimalSchema.nullable(),
  currentHolderCount: z.number().int().nonnegative().nullable(),
  averagePortfolioWeightPercent: decimalSchema.nullable(),
  weightBreadthPercent: decimalSchema.nullable(),
  newBuyerCount: z.number().int().nonnegative().nullable(),
  addCount: z.number().int().nonnegative().nullable(),
  reduceCount: z.number().int().nonnegative().nullable(),
  exitCount: z.number().int().nonnegative().nullable(),
  netBuyerCount: z.number().int().nullable(),
  classification: z.enum(['ACCUMULATION', 'NEUTRAL', 'DISTRIBUTION']).nullable(),
  source: z.literal('SEC Form 13F'),
}).strict()

export const stockGuruResearchResponseSchema = z.object({ data: z.object({
  summary: stockGuruSummarySchema,
  currentHolders: stockGuruHolderSchema.array(),
  latestMoves: stockGuruHolderSchema.array(),
  history: stockGuruHistoryPointSchema.array(),
}).strict() }).strict()

export const stockGuruResearchQuerySchema = z.object({ period: calendarDateSchema.optional() }).strict()

export type StockGuruHistoryPoint = z.infer<typeof stockGuruHistoryPointSchema>
export type StockGuruHolder = z.infer<typeof stockGuruHolderSchema>
export type StockGuruSummary = z.infer<typeof stockGuruSummarySchema>
export type StockGuruResearchQuery = z.infer<typeof stockGuruResearchQuerySchema>
