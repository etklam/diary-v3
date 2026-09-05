import { z } from 'zod'
import { utcInstantSchema } from './common.js'
const stockSymbolSchema = z.string().trim().min(1).max(32)

export const PORTFOLIO_MAX_HOLDINGS = 1_000
export const PORTFOLIO_MAX_QUOTE_ERRORS = 1_000

/**
 * Portfolio overview is a read-only projection calculated from the
 * transaction ledger.  These values intentionally remain JSON numbers:
 * position-state arithmetic is a bounded display projection, while persisted
 * transaction/Trade Plan Decimal values use decimalStringSchema.
 */
export const portfolioHoldingSchema = z.object({
  symbol: stockSymbolSchema,
  quantity: z.number().finite().nonnegative(),
  avgCost: z.number().finite().nonnegative(),
  totalCost: z.number().finite().nonnegative(),
  price: z.number().finite().nonnegative().optional(),
  dayChange: z.number().finite().optional(),
  dayChangePercent: z.number().finite().optional(),
  quoteAsOf: utcInstantSchema.optional(),
}).strict()

export const portfolioHoldingsResponseSchema = z.array(portfolioHoldingSchema).max(PORTFOLIO_MAX_HOLDINGS)

const portfolioPercentageSchema = z.number().finite().min(0).max(100).nullable()
const portfolioNullableNumberSchema = z.number().finite().nullable()

export const portfolioAggregationsSchema = z.object({
  totalHoldings: z.number().int().nonnegative(),
  totalCost: z.number().finite().nonnegative(),
  currentMarketValue: portfolioNullableNumberSchema,
  unrealizedAmount: portfolioNullableNumberSchema,
  unrealizedPct: portfolioNullableNumberSchema,
  totalDayChange: portfolioNullableNumberSchema,
  totalDayChangePercent: portfolioNullableNumberSchema,
  largestPositionPct: portfolioPercentageSchema,
  top3ConcentrationPct: portfolioPercentageSchema,
  activePositionCount: z.number().int().nonnegative(),
  concentrationWarning: z.boolean(),
  largestPositionSymbol: stockSymbolSchema.nullable(),
  pricedPositionCount: z.number().int().nonnegative(),
  unpricedPositionCount: z.number().int().nonnegative(),
  pricedCostBasis: z.number().finite().nonnegative(),
  unpricedCostBasis: z.number().finite().nonnegative(),
  quoteCoveragePct: z.number().finite().min(0).max(100),
  valuationAsOf: utcInstantSchema.nullable(),
  staleQuoteCount: z.number().int().nonnegative(),
  valuationStatus: z.enum(['empty', 'complete', 'partial', 'unavailable']),
  unsupportedMetrics: z.tuple([
    z.literal('ytdReturn'),
    z.literal('realCashPercentage'),
    z.literal('sectorConcentration'),
  ]),
}).strict()

export const portfolioValuationResponseSchema = z.object({
  holdings: portfolioHoldingsResponseSchema,
  valuation: portfolioAggregationsSchema,
  quoteErrors: z.array(stockSymbolSchema).max(PORTFOLIO_MAX_QUOTE_ERRORS),
  marketState: z.string().trim().min(1).max(32).nullable(),
}).strict()

export type PortfolioHolding = z.infer<typeof portfolioHoldingSchema>
export type PortfolioHoldingsResponse = z.infer<typeof portfolioHoldingsResponseSchema>
export type PortfolioAggregations = z.infer<typeof portfolioAggregationsSchema>
export type PortfolioValuationResponse = z.infer<typeof portfolioValuationResponseSchema>

export function toPortfolioHoldingsResponse(value: unknown): PortfolioHoldingsResponse {
  return portfolioHoldingsResponseSchema.parse(value)
}

export function toPortfolioValuationResponse(value: unknown): PortfolioValuationResponse {
  return portfolioValuationResponseSchema.parse(value)
}

