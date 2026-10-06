import { z } from 'zod'
import { calendarDateSchema, serializedIdSchema, utcInstantSchema } from './common.js'

const decimalSchema = z.string().regex(/^-?\d+(?:\.\d+)?$/)
const thresholdSchema = z.string().regex(/^\d+(?:\.\d{1,8})?$/).refine(value => Number(value) <= 1000, 'Threshold must be 1000 or lower')

export const guruNotificationEventTypeSchema = z.enum([
  'NEW_FILING', 'NEW_POSITION', 'EXITED_POSITION', 'STRONG_ADD', 'STRONG_REDUCE', 'NEW_STOCK_HOLDER', 'CONSENSUS_CHANGE',
])

export const guruNotificationPreferencesSchema = z.object({
  newFiling: z.boolean(),
  newPosition: z.boolean(),
  exitedPosition: z.boolean(),
  strongAdd: z.boolean(),
  strongReduce: z.boolean(),
  newStockHolder: z.boolean(),
  consensusChange: z.boolean(),
  minWeightPercent: decimalSchema.nullable(),
  minQuantityChangePercent: decimalSchema.nullable(),
}).strict()

export const guruNotificationPreferencesUpdateSchema = z.object({
  newFiling: z.boolean(),
  newPosition: z.boolean(),
  exitedPosition: z.boolean(),
  strongAdd: z.boolean(),
  strongReduce: z.boolean(),
  newStockHolder: z.boolean(),
  consensusChange: z.boolean(),
  minWeightPercent: thresholdSchema.nullable().default(null),
  minQuantityChangePercent: thresholdSchema.nullable().default(null),
}).strict()

export const guruWatchedStockSchema = z.object({
  securityId: serializedIdSchema,
  symbol: z.string().nullable(),
  company: z.string(),
}).strict()

export const guruNotificationPreferencesResponseSchema = z.object({
  data: z.object({
    preferences: guruNotificationPreferencesSchema,
    followedGurus: z.array(z.object({ slug: z.string(), name: z.string() }).strict()),
    watchedStocks: z.array(guruWatchedStockSchema),
  }).strict(),
}).strict()

export const guruNotificationDetailSchema = z.object({
  action: z.string().nullable(),
  quantityChangePercent: decimalSchema.nullable(),
  weightPercent: decimalSchema.nullable(),
  holderCount: z.number().int().nonnegative().nullable(),
  previousHolderCount: z.number().int().nonnegative().nullable(),
  classification: z.enum(['ACCUMULATION', 'NEUTRAL', 'DISTRIBUTION']).nullable(),
  previousClassification: z.enum(['ACCUMULATION', 'NEUTRAL', 'DISTRIBUTION']).nullable(),
  accession: z.string().nullable(),
  sourceUrl: z.string().url().nullable(),
}).strict()

export const guruNotificationSchema = z.object({
  id: serializedIdSchema,
  eventType: guruNotificationEventTypeSchema,
  guru: z.object({ slug: z.string(), name: z.string() }).strict().nullable(),
  symbol: z.string().nullable(),
  company: z.string().nullable(),
  periodEnd: calendarDateSchema.nullable(),
  detail: guruNotificationDetailSchema,
  createdAt: utcInstantSchema,
  readAt: utcInstantSchema.nullable(),
}).strict()

export const guruNotificationListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  unreadOnly: z.enum(['true', 'false']).optional(),
}).strict()

export const guruNotificationListResponseSchema = z.object({
  data: z.array(guruNotificationSchema),
  unreadCount: z.number().int().nonnegative(),
}).strict()

export const guruNotificationReadRequestSchema = z.object({
  ids: z.array(serializedIdSchema).max(100).optional(),
}).strict()

export const guruNotificationReadResponseSchema = z.object({
  data: z.object({ updated: z.number().int().nonnegative(), unreadCount: z.number().int().nonnegative() }).strict(),
}).strict()

export const guruStockWatchResponseSchema = z.object({
  data: z.object({ watching: z.boolean(), symbol: z.string(), securityId: serializedIdSchema }).strict(),
}).strict()

/** Structured decision-time context. It carries prepared figures only, never AI prose. */
export const guruDecisionContextSchema = z.object({
  contextVersion: z.string().min(1).max(40),
  source: z.literal('prepared-institutional-analytics'),
  symbol: z.string(),
  company: z.string(),
  periodEnd: calendarDateSchema,
  consensus: z.object({
    holderCount: z.number().int().nonnegative(),
    previousHolderCount: z.number().int().nonnegative(),
    newBuyerCount: z.number().int().nonnegative(),
    addCount: z.number().int().nonnegative(),
    reduceCount: z.number().int().nonnegative(),
    exitCount: z.number().int().nonnegative(),
    netBuyerCount: z.number().int(),
    averagePortfolioWeightPercent: decimalSchema.nullable(),
    aggregateWeightPercent: decimalSchema,
    classification: z.enum(['ACCUMULATION', 'NEUTRAL', 'DISTRIBUTION']).nullable(),
    quarterTrend: z.enum(['RISING', 'STABLE', 'FALLING', 'UNAVAILABLE']),
    eligibleManagerCount: z.number().int().nonnegative(),
    readyManagerCount: z.number().int().nonnegative(),
  }).strict().nullable(),
  holders: z.array(z.object({
    guruSlug: z.string(),
    guruName: z.string(),
    action: z.string().nullable(),
    weightPercent: decimalSchema.nullable(),
    quantity: decimalSchema.nullable(),
    rank: z.number().int().positive().nullable(),
  }).strict()),
  sectors: z.array(z.object({
    dimension: z.enum(['SECTOR', 'INDUSTRY', 'THEME']),
    name: z.string(),
    direction: z.enum(['INCREASING', 'STABLE', 'REDUCING']).nullable(),
    aggregateWeightPercent: decimalSchema,
    aggregateWeightChangePoints: decimalSchema.nullable(),
  }).strict()),
}).strict()

export const diaryGuruSnapshotSchema = z.object({
  id: serializedIdSchema,
  diaryId: serializedIdSchema,
  symbol: z.string(),
  periodEnd: calendarDateSchema,
  holderCount: z.number().int().nonnegative(),
  contextVersion: z.string().min(1).max(40),
  consensusVersion: z.string().max(40).nullable(),
  capturedAt: utcInstantSchema,
  context: guruDecisionContextSchema,
}).strict()

export const diaryGuruSnapshotCreateRequestSchema = z.object({
  symbol: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9.-]{0,14}$/),
  periodEnd: calendarDateSchema.optional(),
}).strict()

export const diaryGuruSnapshotResponseSchema = z.object({ data: diaryGuruSnapshotSchema, reused: z.boolean() }).strict()
export const diaryGuruSnapshotListResponseSchema = z.object({ data: z.array(diaryGuruSnapshotSchema) }).strict()

export type GuruNotificationEventType = z.infer<typeof guruNotificationEventTypeSchema>
export type GuruNotificationPreferences = z.infer<typeof guruNotificationPreferencesSchema>
export type GuruNotification = z.infer<typeof guruNotificationSchema>
export type GuruDecisionContext = z.infer<typeof guruDecisionContextSchema>
export type DiaryGuruSnapshot = z.infer<typeof diaryGuruSnapshotSchema>
