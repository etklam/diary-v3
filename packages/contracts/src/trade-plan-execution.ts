import { z } from 'zod'
import { serializedIdSchema, utcInstantSchema } from './common.js'

const decimal = z.string().regex(/^\d+(?:\.\d+)?$/)
const signedDecimal = z.string().regex(/^-?\d+(?:\.\d+)?$/)
const nullableDecimal = decimal.nullable()

export const tradePlanExecutionBaselineSnapshotSchema = z.object({
  symbol: z.string().min(1).max(32),
  setupType: z.string().nullable(),
  entryPrice: nullableDecimal,
  entryZoneLow: nullableDecimal,
  entryZoneHigh: nullableDecimal,
  stopLoss: nullableDecimal,
  targetPrice: nullableDecimal,
  maxPositionSize: nullableDecimal,
  maxPositionSizeUnit: z.literal('unknown'),
  invalidationCondition: z.string().nullable(),
}).strict()

export const tradePlanExecutionBaselineSchema = z.object({
  id: serializedIdSchema,
  version: z.number().int().positive(),
  confirmedAt: utcInstantSchema,
  planUpdatedAt: utcInstantSchema,
  snapshot: tradePlanExecutionBaselineSnapshotSchema,
}).strict()

const tradePlanExecutionTransactionDataSchema = z.object({
  id: serializedIdSchema,
  diaryId: serializedIdSchema.nullable(),
  symbol: z.string(),
  type: z.enum(['BUY', 'SELL']),
  quantity: decimal,
  price: decimal,
  tradeDate: utcInstantSchema,
}).strict()

export const tradePlanExecutionTransactionSnapshotSchema = tradePlanExecutionTransactionDataSchema.extend({
  id: serializedIdSchema.nullable(),
}).strict()

export const tradePlanExecutionTransactionSchema = z.object({
  /** Stable relation id. A missing transaction remains removable by this key. */
  relationId: serializedIdSchema,
  /** The current transaction id, or null when the source transaction was deleted. */
  id: serializedIdSchema,
  transactionId: serializedIdSchema.nullable(),
  diaryId: serializedIdSchema.nullable(),
  symbol: z.string(),
  type: z.enum(['BUY', 'SELL']),
  quantity: decimal,
  price: decimal,
  tradeDate: utcInstantSchema,
  selectionStatus: z.enum(['current', 'changed', 'missing']),
  snapshot: tradePlanExecutionTransactionSnapshotSchema,
  current: tradePlanExecutionTransactionDataSchema.nullable(),
}).strict()

export const tradePlanExecutionComparisonSchema = z.object({
  baseline: tradePlanExecutionBaselineSchema.nullable(),
  // The comparison response stays bounded; older immutable versions use the paginated history endpoint.
  baselineHistory: z.array(tradePlanExecutionBaselineSchema).max(20),
  planSnapshot: tradePlanExecutionBaselineSnapshotSchema.nullable(),
  executionRevision: z.number().int().positive().nullable(),
  baselineStatus: z.enum(['unconfirmed', 'current', 'outdated']),
  comparisonTiming: z.enum(['pre_execution', 'retrospective', 'unknown']),
  selectedTransactions: z.array(tradePlanExecutionTransactionSchema).max(100),
  invalidatedSelectionCount: z.number().int().nonnegative(),
  deviationReason: z.string().nullable(),
  comparisonStatus: z.enum(['unconfirmed', 'ready', 'unavailable', 'outdated', 'conflict']),
  buyQuantity: nullableDecimal,
  averageExecutionPrice: nullableDecimal,
  entryPriceDelta: signedDecimal.nullable(),
  entryPriceDeltaPercent: signedDecimal.nullable(),
  entryZoneRelation: z.enum(['inside', 'below', 'above', 'unavailable']),
  maxPositionSizeUnit: z.literal('unknown'),
}).strict()

export const tradePlanExecutionUpdateSchema = z.object({
  transactionIds: z.array(serializedIdSchema).max(100),
  removeRelationIds: z.array(serializedIdSchema).max(100).optional(),
  deviationReason: z.string().trim().max(2_000).nullable().optional(),
  baselineVersion: z.number().int().positive(),
  expectedExecutionRevision: z.number().int().positive(),
}).strict().superRefine((value, context) => {
  const seen = new Set<string>()
  value.transactionIds.forEach((id, index) => {
    if (seen.has(id)) context.addIssue({ code: 'custom', path: ['transactionIds', index], message: 'Transaction id must not be duplicated' })
    seen.add(id)
  })
})

export const tradePlanExecutionBaselineCreateSchema = z.object({
  expectedPlanUpdatedAt: utcInstantSchema,
  /** Latest baseline version observed by the caller; null means no baseline existed. */
  expectedBaselineVersion: z.number().int().nonnegative().nullable(),
  /** Current execution revision observed by the caller; null means no execution existed. */
  expectedExecutionRevision: z.number().int().positive().nullable(),
}).strict()

export const tradePlanExecutionCandidateSchema = z.object({
  id: serializedIdSchema,
  diaryId: serializedIdSchema,
  symbol: z.string(),
  type: z.enum(['BUY', 'SELL']),
  quantity: decimal,
  price: decimal,
  tradeDate: utcInstantSchema,
  linkedPlanId: serializedIdSchema.nullable(),
}).strict()

export const tradePlanExecutionCandidatesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict()

export const tradePlanExecutionCandidatesResponseSchema = z.object({
  data: z.array(tradePlanExecutionCandidateSchema),
  pagination: z.object({
    page: z.number().int().min(1),
    limit: z.number().int().min(1).max(100),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }).strict(),
}).strict()

export const tradePlanExecutionBaselineHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict()

export const tradePlanExecutionBaselineHistoryResponseSchema = z.object({
  data: z.array(tradePlanExecutionBaselineSchema),
  pagination: z.object({
    page: z.number().int().min(1),
    limit: z.number().int().min(1).max(100),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }).strict(),
}).strict()

export type TradePlanExecutionBaselineSnapshot = z.infer<typeof tradePlanExecutionBaselineSnapshotSchema>
export type TradePlanExecutionBaseline = z.infer<typeof tradePlanExecutionBaselineSchema>
export type TradePlanExecutionTransaction = z.infer<typeof tradePlanExecutionTransactionSchema>
export type TradePlanExecutionComparison = z.infer<typeof tradePlanExecutionComparisonSchema>
export type TradePlanExecutionUpdate = z.infer<typeof tradePlanExecutionUpdateSchema>
export type TradePlanExecutionBaselineCreate = z.infer<typeof tradePlanExecutionBaselineCreateSchema>
export type TradePlanExecutionCandidate = z.infer<typeof tradePlanExecutionCandidateSchema>
export type TradePlanExecutionCandidatesQuery = z.output<typeof tradePlanExecutionCandidatesQuerySchema>
export type TradePlanExecutionBaselineHistoryQuery = z.output<typeof tradePlanExecutionBaselineHistoryQuerySchema>
