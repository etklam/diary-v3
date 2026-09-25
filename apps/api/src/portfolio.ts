import { portfolioValuationResponseSchema, type PortfolioHolding } from '@diary/contracts/portfolio'
import { computePortfolioAggregations, hasFiniteQuote } from '@diary/domain/portfolio'
import type { Database } from '@diary/db'
import { getHoldings } from './ledger.js'
import type { createMarketData } from './market-data/index.js'

export async function batchQuotePrices(market: ReturnType<typeof createMarketData>, inputs: string[], signal?: AbortSignal) {
  const unique = new Map<string, string>()
  for (const input of inputs) {
    const symbol = input.trim()
    if (symbol && !unique.has(symbol.toUpperCase())) unique.set(symbol.toUpperCase(), symbol)
  }
  const results = await Promise.all([...unique.values()].map(async symbol => {
    try { return [symbol, (await market.quote(symbol, false, signal)).data] as const }
    catch { return null }
  }))
  return Object.fromEntries(results.filter(result => result !== null))
}

export async function valuePortfolio(db: Database, userId: bigint, market: ReturnType<typeof createMarketData>, now: Date, signal?: AbortSignal) {
  return valuePortfolioFromHoldings(await getHoldings(db, userId), market, now, signal)
}

export async function valuePortfolioFromHoldings(
  ledgerHoldings: Awaited<ReturnType<typeof getHoldings>>,
  market: ReturnType<typeof createMarketData>,
  now: Date,
  signal?: AbortSignal,
) {
  // The public portfolio contract intentionally uses numeric display projections;
  // the authoritative ledger and transaction APIs retain exact decimal strings.
  const holdings: PortfolioHolding[] = ledgerHoldings.map(row => ({
    symbol: row.symbol, quantity: Number(row.quantity), avgCost: Number(row.avgCost), totalCost: Number(row.totalCost),
  }))
  const quoteErrors: string[] = []
  const marketStates = new Map<string, string>()
  let index = 0
  await Promise.all(Array.from({ length: Math.min(3, holdings.length) }, async () => {
    while (index < holdings.length) {
      const holding = holdings[index++]!
      try {
        const read = await market.quote(holding.symbol, false, signal)
        const { data: quote } = read
        if (quote.regularMarketPrice < 0) { quoteErrors.push(holding.symbol); continue }
        holding.price = quote.regularMarketPrice
        if (quote.change !== null) holding.dayChange = quote.change
        if (quote.changePercent !== null) holding.dayChangePercent = quote.changePercent
        if (quote.lastUpdateTime !== null) holding.quoteAsOf = quote.lastUpdateTime
        holding.source = read.source
        holding.fetchedAt = read.fetchedAt
        if (quote.marketState) marketStates.set(holding.symbol, quote.marketState)
      } catch { quoteErrors.push(holding.symbol) }
    }
  }))
  const valuation = computePortfolioAggregations(holdings, { now })
  const pricedHoldings = holdings.filter(hasFiniteQuote)
  const staleFallbackPositionCount = pricedHoldings.filter(holding => holding.source === 'stale').length
  const unknownQuoteTimeCount = pricedHoldings.filter(holding => !holding.quoteAsOf).length
  // Keep price coverage and exchange-time coverage distinct. A value with no
  // exchange timestamp cannot claim complete valuation coverage.
  if (valuation.valuationStatus === 'complete' && unknownQuoteTimeCount > 0) valuation.valuationStatus = 'partial'
  return portfolioValuationResponseSchema.parse({
    holdings,
    valuation: { ...valuation, staleFallbackPositionCount, unknownQuoteTimeCount },
    quoteErrors: holdings.filter(row => quoteErrors.includes(row.symbol)).map(row => row.symbol),
    marketState: holdings.map(row => marketStates.get(row.symbol)).find(Boolean) ?? null,
  })
}
