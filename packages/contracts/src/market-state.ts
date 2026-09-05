import { z } from 'zod'
import { calendarDateSchema } from './common.js'

export const marketStateValues = ['risk_on', 'neutral', 'defensive', 'risk_off', 'unknown'] as const
export const marketStateSchema = z.enum(marketStateValues)

export const marketStateSnapshotQuerySchema = z.object({}).strict()
export const marketStateHistoryQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(120),
}).strict()

const finiteNullableNumber = z.number().finite().nullable()
const nonnegativeNullableInteger = z.number().int().nonnegative().nullable()

export const marketStateSnapshotSchema = z.object({
  universeKey: z.string().trim().min(1).max(32),
  date: calendarDateSchema,
  latestPriceDate: calendarDateSchema,
  coveragePct: finiteNullableNumber,
  isStale: z.boolean(),
  marketState: marketStateSchema,
  score: finiteNullableNumber,
  up4: nonnegativeNullableInteger,
  down4: nonnegativeNullableInteger,
  up4Pct: finiteNullableNumber,
  down4Pct: finiteNullableNumber,
  ratio10d: finiteNullableNumber,
  above40dPct: finiteNullableNumber,
  suggestedExposure: z.string().trim().min(1).max(32),
  message: z.string(),
}).strict()

export const marketStateHistoryItemSchema = z.object({
  date: calendarDateSchema,
  up4: nonnegativeNullableInteger,
  down4: nonnegativeNullableInteger,
  up4Pct: finiteNullableNumber,
  down4Pct: finiteNullableNumber,
  ratio10d: finiteNullableNumber,
  above40dPct: finiteNullableNumber,
  marketState: marketStateSchema,
}).strict()

export const marketStateHistoryResponseSchema = z.array(marketStateHistoryItemSchema).max(365)

export type MarketState = z.infer<typeof marketStateSchema>
export type MarketStateSnapshot = z.infer<typeof marketStateSnapshotSchema>
export type MarketStateHistoryItem = z.infer<typeof marketStateHistoryItemSchema>
