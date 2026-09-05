import type { PortfolioAggregations, PortfolioHolding } from '@diary/contracts/portfolio'
type HoldingViewInput = PortfolioHolding
type ConcentrationBasis = 'market_value' | 'cost_basis'
export const hasFiniteQuote = (holding: HoldingViewInput) => typeof holding.price === 'number' && Number.isFinite(holding.price) && holding.price >= 0
export function concentration(
  holdings: HoldingViewInput[],
  options: { basis: ConcentrationBasis },
): Map<string, number> {
  const shares = new Map<string, number>()

  if (options.basis === 'cost_basis') {
    const totalCostAll = holdings.reduce((sum, h) => sum + h.totalCost, 0)
    if (totalCostAll <= 0) return shares
    for (const holding of holdings) {
      shares.set(holding.symbol, (holding.totalCost / totalCostAll) * 100)
    }
    return shares
  }

  const pricedHoldings = holdings.filter(hasFiniteQuote)
  const pricedMarketValue = pricedHoldings.reduce(
    (sum, h) => sum + h.price! * h.quantity,
    0,
  )
  if (pricedMarketValue <= 0) return shares
  for (const holding of pricedHoldings) {
    shares.set(holding.symbol, ((holding.price! * holding.quantity) / pricedMarketValue) * 100)
  }
  return shares
}

export function computePortfolioAggregations(
  holdings: HoldingViewInput[],
  options: { now?: Date; staleAfterMs?: number } = {},
): PortfolioAggregations {
  const totalHoldings = holdings.length
  const totalCost = holdings.reduce((sum, h) => sum + h.totalCost, 0)
  const pricedHoldings = holdings.filter(hasFiniteQuote)
  const unpricedHoldings = holdings.filter(holding => !hasFiniteQuote(holding))
  const pricedPositionCount = pricedHoldings.length
  const unpricedPositionCount = unpricedHoldings.length
  const pricedCostBasis = pricedHoldings.reduce((sum, holding) => sum + holding.totalCost, 0)
  const unpricedCostBasis = unpricedHoldings.reduce((sum, holding) => sum + holding.totalCost, 0)
  const pricedMarketValue = pricedHoldings.reduce(
    (sum, holding) => sum + holding.price! * holding.quantity,
    0,
  )
  const currentMarketValue = pricedPositionCount > 0 ? pricedMarketValue : null
  const unrealizedAmount = currentMarketValue === null ? null : currentMarketValue - pricedCostBasis
  const unrealizedPct = unrealizedAmount !== null && pricedCostBasis > 0
    ? (unrealizedAmount / pricedCostBasis) * 100
    : null

  const dayChangeHoldings = pricedHoldings.filter(h => typeof h.dayChange === 'number' && Number.isFinite(h.dayChange))
  const totalDayChange = dayChangeHoldings.length > 0 ? dayChangeHoldings.reduce(
    (sum, h) => sum + (typeof h.dayChange === 'number' ? h.dayChange * h.quantity : 0),
    0
  ) : null
  const prevMarketValue = currentMarketValue !== null && totalDayChange !== null
    ? currentMarketValue - totalDayChange
    : null
  const totalDayChangePercent = prevMarketValue !== null && prevMarketValue > 0 && totalDayChange !== null
    ? (totalDayChange / prevMarketValue) * 100
    : null
  // Largest / top-3 concentration is explicitly market-value basis, computed by
  // the single concentration() formula over the priced subset.
  const marketValueShares = concentration(holdings, { basis: 'market_value' })
  const rankedShares = [...marketValueShares.entries()].sort((a, b) => b[1] - a[1])
  const largestPosition = rankedShares[0] ?? null
  const largestPositionPct = largestPosition ? largestPosition[1] : null
  const top3ConcentrationPct = rankedShares.length > 0
    ? rankedShares.slice(0, 3).reduce((sum, [, pct]) => sum + pct, 0)
    : null
  const activePositionCount = holdings.length
  // Display-tier risk flag (largest >= 25% or top-3 >= 60%). This is a distinct
  // concept from the attention engine's `position_concentration` alert
  // (portfolio-attention.ts): that one fires a single-position card at a
  // configurable threshold (default 25% market value). Shared formula, separate
  // semantics — do not merge the thresholds.
  const concentrationWarning = (largestPositionPct ?? 0) >= 25 || (top3ConcentrationPct ?? 0) >= 60
  const quoteCoveragePct = totalHoldings > 0 ? (pricedPositionCount / totalHoldings) * 100 : 0
  const quoteTimes = pricedHoldings
    .map(holding => holding.quoteAsOf ? Date.parse(holding.quoteAsOf) : Number.NaN)
    .filter(Number.isFinite)
  const valuationAsOf = quoteTimes.length > 0 ? new Date(Math.min(...quoteTimes)).toISOString() : null
  const nowMs = (options.now ?? new Date()).getTime()
  const staleAfterMs = options.staleAfterMs ?? 72 * 60 * 60 * 1000
  const staleQuoteCount = quoteTimes.filter(time => nowMs - time > staleAfterMs).length
  const valuationStatus = totalHoldings === 0
    ? 'empty'
    : pricedPositionCount === 0
      ? 'unavailable'
      : unpricedPositionCount > 0
        ? 'partial'
        : 'complete'

  return {
    totalHoldings,
    totalCost,
    currentMarketValue,
    unrealizedAmount,
    unrealizedPct,
    totalDayChange,
    totalDayChangePercent,
    largestPositionPct,
    top3ConcentrationPct,
    activePositionCount,
    concentrationWarning,
    largestPositionSymbol: largestPosition?.[0] ?? null,
    pricedPositionCount,
    unpricedPositionCount,
    pricedCostBasis,
    unpricedCostBasis,
    quoteCoveragePct,
    valuationAsOf,
    staleQuoteCount,
    valuationStatus,
    unsupportedMetrics: ['ytdReturn', 'realCashPercentage', 'sectorConcentration'],
  }
}
