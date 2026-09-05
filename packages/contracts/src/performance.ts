import { z } from 'zod'
import { calendarDateSchema, serializedIdSchema, utcInstantSchema } from './common.js'
const finite = z.number().finite(), count = z.number().int().nonnegative()
const trade = z.object({ id: serializedIdSchema, symbol: z.string(), sellDate: utcInstantSchema, sellQuantity: finite, sellPrice: finite, avgCostBasis: finite, realizedPnL: finite, realizedPnLPct: finite, strategy: z.string().nullable(), emotion: z.string().nullable() }).strict()
const breakdown = z.object({ name: z.string(), tradeCount: count, realizedPnL: finite, winRate: finite }).strict()
export const performanceQuerySchema = z.object({
  period: z.string().optional().transform(value => value === 'quarter' || value === 'year' ? value : 'month'),
  symbol: z.string().trim().toUpperCase().max(32).optional(),
}).strict()
export const performanceResponseSchema = z.object({
  summary: z.object({ totalClosedTrades: count, totalRealizedPnL: finite, winRate: finite, wins: count, losses: count, maxDrawdownPct: finite, sharpe: finite.nullable() }).strict(),
  periodStats: z.array(z.object({ period: z.string(), realizedPnL: finite, tradeCount: count, winCount: count, winRate: finite }).strict()),
  equityCurve: z.array(z.object({ date: calendarDateSchema, cumPnL: finite }).strict()),
  topWins: z.array(trade).max(5), topLosses: z.array(trade).max(5),
  symbolBreakdown: z.array(z.object({ symbol: z.string(), tradeCount: count, realizedPnL: finite, winRate: finite }).strict()),
  strategyBreakdown: z.array(breakdown), emotionBreakdown: z.array(breakdown), bestStrategy: breakdown.nullable(), worstStrategy: breakdown.nullable(),
}).strict()
export type PerformanceResponse = z.infer<typeof performanceResponseSchema>
