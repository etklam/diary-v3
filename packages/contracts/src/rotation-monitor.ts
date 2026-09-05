import { z } from 'zod'
import { calendarDateSchema } from './common.js'
import { stockSymbolSchema } from './watchlist.js'
const rankScopes = ['sectors', 'indexes', 'core'] as const
const groupTypes = ['sector', 'index', 'core', 'core_etf', 'mega_cap', 'single_stock'] as const

const marketStates = ['risk_on', 'neutral', 'defensive', 'risk_off', 'unknown'] as const
const maStatuses = [
  'bullish_stack',
  'healthy_pullback',
  'short_term_weakness',
  'recovering',
  'breakdown',
  'unknown',
] as const
const rotationSignals = [
  'turning_strong',
  'strong_but_extended',
  'losing_momentum',
  'breaking_down',
  'early_recovery',
  'neutral',
] as const
const signalStatuses = ['complete', 'insufficient_data'] as const
const breadthConditions = ['broad_participation', 'constructive', 'narrowing', 'weak_breadth', 'unknown'] as const
const breadthConfirmations = ['confirming', 'mixed', 'warning', 'unknown'] as const

export const marketStateSchema = z.enum(marketStates)
export const marketRotationMonitorQuerySchema = z.object({
  scope: z.enum(rankScopes).default('sectors'),
}).strict()
const finiteNullableNumber = z.number().finite().nullable()

export const marketRotationTrendPointSchema = z.object({
  date: calendarDateSchema,
  value: finiteNullableNumber,
}).strict()

export const marketRotationMonitorRowSchema = z.object({
  symbol: stockSymbolSchema,
  name: z.string(),
  groupType: z.enum(groupTypes),
  sectorName: z.string().nullable(),
  lastPrice: finiteNullableNumber,
  rsi14: finiteNullableNumber,
  above20d: z.boolean().nullable(),
  above50d: z.boolean().nullable(),
  maStatus: z.enum(maStatuses),
  percentFromHigh: finiteNullableNumber,
  rotationScore: finiteNullableNumber,
  rotationScoreDelta2W: finiteNullableNumber,
  rotationRank: z.number().int().positive().nullable(),
  rankDelta2W: z.number().int().nullable(),
  rsiDelta2W: finiteNullableNumber,
  twoWeekPerformancePct: finiteNullableNumber,
  twoWeekTrend: z.array(marketRotationTrendPointSchema).max(100),
  signal: z.enum(rotationSignals).nullable(),
  signalStatus: z.enum(signalStatuses),
}).strict()

const ratioMetricSchema = z.object({
  count: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  ratio: z.number().finite().min(0).max(1).nullable(),
}).strict()

const marketRotationSummarySchema = z.object({
  marketState: marketStateSchema,
  breadthCondition: z.enum(breadthConditions),
  breadthConfirmation: z.enum(breadthConfirmations),
  above20d: ratioMetricSchema,
  above50d: ratioMetricSchema,
  averageRsi: finiteNullableNumber,
}).strict()

const marketRotationDataQualitySchema = z.object({
  asOfDate: calendarDateSchema,
  comparisonDate: calendarDateSchema.nullable(),
  rankScope: z.enum(rankScopes),
  rowCount: z.number().int().nonnegative(),
  completeSignalCount: z.number().int().nonnegative(),
  coverageRatio: z.number().finite().nonnegative(),
  isQualified: z.boolean(),
  expectedSymbolCount: z.number().int().nonnegative(),
  actualSymbolCount: z.number().int().nonnegative(),
  scoreVersion: z.string().trim().min(1).max(32),
}).strict()

export const marketRotationMonitorResponseSchema = z.object({
  asOfDate: calendarDateSchema,
  comparisonDate: calendarDateSchema.nullable(),
  marketStateAsOfDate: calendarDateSchema.nullable(),
  summaryAsOfDate: calendarDateSchema.nullable(),
  rankScope: z.enum(rankScopes),
  marketState: marketStateSchema,
  breadthCondition: z.enum(breadthConditions),
  breadthConfirmation: z.enum(breadthConfirmations),
  summary: marketRotationSummarySchema,
  summaryCards: z.object({
    above20d: ratioMetricSchema,
    above50d: ratioMetricSchema,
    averageRsi: finiteNullableNumber,
    marketState: marketStateSchema,
  }).strict(),
  charts: z.object({
    topImproving: z.array(marketRotationMonitorRowSchema).max(200),
    bottomWeakening: z.array(marketRotationMonitorRowSchema).max(200),
  }).strict(),
  rows: z.array(marketRotationMonitorRowSchema).max(200),
  topImproving: z.array(marketRotationMonitorRowSchema).max(200),
  bottomWeakening: z.array(marketRotationMonitorRowSchema).max(200),
  dataQuality: marketRotationDataQualitySchema,
  currentMarketSummary: z.string(),
}).strict()

export type MarketRotationMonitorQuery = z.infer<typeof marketRotationMonitorQuerySchema>
export type MarketRotationTrendPoint = z.infer<typeof marketRotationTrendPointSchema>
export type MarketRotationMonitorRow = z.infer<typeof marketRotationMonitorRowSchema>
export type MarketRotationMonitorResponse = z.infer<typeof marketRotationMonitorResponseSchema>
