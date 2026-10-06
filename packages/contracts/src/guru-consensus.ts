import { z } from 'zod'
import { calendarDateSchema, serializedIdSchema } from './common.js'

const decimalSchema = z.string().regex(/^-?\d+(?:\.\d{1,8})?$/)
const percentageSchema = decimalSchema.nullable()

export const guruConsensusPeriodSchema = z.object({
  periodEnd: calendarDateSchema,
  activeManagerCount: z.number().int().nonnegative(),
  readyManagerCount: z.number().int().nonnegative(),
  partialManagerCount: z.number().int().nonnegative(),
  errorManagerCount: z.number().int().nonnegative(),
  supersededManagerCount: z.number().int().nonnegative(),
  pendingManagerCount: z.number().int().nonnegative(),
  noFilingManagerCount: z.number().int().nonnegative(),
  comparableManagerCount: z.number().int().nonnegative(),
  previousReadyManagerCount: z.number().int().nonnegative(),
  sourceRowCount: z.number().int().nonnegative(),
  mappedRowCount: z.number().int().nonnegative(),
  mappingCoveragePercent: percentageSchema,
  quarterCoveragePercent: percentageSchema,
  source: z.literal('SEC Form 13F'),
}).strict()

export const guruStockConsensusSchema = z.object({
  securityId: serializedIdSchema,
  ticker: z.string().nullable(),
  company: z.string(),
  sector: z.string().nullable(),
  industry: z.string().nullable(),
  currentHolderCount: z.number().int().nonnegative(),
  comparableCurrentHolderCount: z.number().int().nonnegative(),
  previousHolderCount: z.number().int().nonnegative(),
  holderCountChange: z.number().int(),
  newBuyerCount: z.number().int().nonnegative(),
  addCount: z.number().int().nonnegative(),
  unchangedCount: z.number().int().nonnegative(),
  reduceCount: z.number().int().nonnegative(),
  exitCount: z.number().int().nonnegative(),
  netBuyerCount: z.number().int(),
  actionManagerCount: z.number().int().nonnegative(),
  quantityChangeSampleCount: z.number().int().nonnegative(),
  averageQuantityChangePercent: percentageSchema,
  medianQuantityChangePercent: percentageSchema,
  aggregateWeightPercent: decimalSchema,
  averagePortfolioWeightPercent: percentageSchema,
  weightBreadthPercent: decimalSchema,
  classification: z.enum(['ACCUMULATION', 'NEUTRAL', 'DISTRIBUTION']).nullable(),
  quarterTrend: z.enum(['RISING', 'STABLE', 'FALLING', 'UNAVAILABLE']),
}).strict()

export const guruSectorConsensusSchema = z.object({
  dimension: z.enum(['SECTOR', 'INDUSTRY', 'THEME']),
  dimensionKey: z.string(),
  name: z.string(),
  currentHolderCount: z.number().int().nonnegative(),
  buyerCount: z.number().int().nonnegative(),
  sellerCount: z.number().int().nonnegative(),
  newPositionCount: z.number().int().nonnegative(),
  exitCount: z.number().int().nonnegative(),
  addCount: z.number().int().nonnegative(),
  reduceCount: z.number().int().nonnegative(),
  allocationManagerCount: z.number().int().nonnegative(),
  aggregateWeightPercent: decimalSchema,
  comparableCurrentAggregateWeightPercent: decimalSchema,
  previousAggregateWeightPercent: percentageSchema,
  aggregateWeightChangePoints: percentageSchema,
  holderBreadthPercent: decimalSchema,
  allocationCoveragePercent: decimalSchema,
  direction: z.enum(['INCREASING', 'STABLE', 'REDUCING']).nullable(),
}).strict()

const paginationSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
}).strict()

const pageQuery = {
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  period: calendarDateSchema.optional(),
  search: z.string().trim().max(120).optional(),
  sector: z.string().trim().max(120).optional(),
}

export const guruConsensusQuerySchema = z.object({
  ...pageQuery,
  classification: z.enum(['ACCUMULATION', 'NEUTRAL', 'DISTRIBUTION']).optional(),
  sort: z.enum(['net-buyers', 'most-held', 'most-added', 'most-reduced', 'largest-weight', 'rising', 'falling']).default('net-buyers'),
}).strict()

export const guruStockRankingSchema = z.enum([
  'most-held', 'most-added', 'most-reduced', 'most-new', 'most-exited',
  'largest-weight', 'fastest-rising', 'fastest-falling',
])

export const guruStocksQuerySchema = z.object({
  ...pageQuery,
  ranking: guruStockRankingSchema.default('most-held'),
}).strict()

export const guruStocksExportQuerySchema = guruStocksQuerySchema.omit({ page: true, limit: true })

export const guruSectorsQuerySchema = z.object({
  period: calendarDateSchema.optional(),
  dimension: z.enum(['SECTOR', 'INDUSTRY', 'THEME']).default('SECTOR'),
  search: z.string().trim().max(120).optional(),
  direction: z.enum(['INCREASING', 'STABLE', 'REDUCING']).optional(),
  sort: z.enum(['direction', 'buyers', 'weight-change', 'aggregate-weight', 'holders']).default('direction'),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict()

export const guruConsensusResponseSchema = z.object({ data: z.object({
  period: guruConsensusPeriodSchema,
  periods: guruConsensusPeriodSchema.array(),
  items: guruStockConsensusSchema.array(),
  pagination: paginationSchema,
}).strict() }).strict()

export const guruStocksResponseSchema = z.object({ data: z.object({
  period: guruConsensusPeriodSchema,
  periods: guruConsensusPeriodSchema.array(),
  ranking: guruStockRankingSchema,
  items: guruStockConsensusSchema.array(),
  pagination: paginationSchema,
}).strict() }).strict()

export const guruSectorsResponseSchema = z.object({ data: z.object({
  period: guruConsensusPeriodSchema,
  periods: guruConsensusPeriodSchema.array(),
  dimension: z.enum(['SECTOR', 'INDUSTRY', 'THEME']),
  items: guruSectorConsensusSchema.array(),
  pagination: paginationSchema,
}).strict() }).strict()

export type GuruConsensusQuery = z.infer<typeof guruConsensusQuerySchema>
export type GuruStocksQuery = z.infer<typeof guruStocksQuerySchema>
export type GuruStocksExportQuery = z.infer<typeof guruStocksExportQuerySchema>
export type GuruSectorsQuery = z.infer<typeof guruSectorsQuerySchema>
