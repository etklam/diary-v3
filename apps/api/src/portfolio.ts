import { portfolioValuationResponseSchema, type PortfolioHolding } from '@diary/contracts/portfolio'
import { computePortfolioAggregations } from '@diary/domain/portfolio'
import type { Database } from '@diary/db'
import { getHoldings } from './ledger.js'
import type { createMarketData } from './market-data/index.js'

export async function batchQuotePrices(market: ReturnType<typeof createMarketData>, inputs: string[]) {
  const unique = new Map<string, string>()
  for (const input of inputs) {
    const symbol = input.trim()
    if (symbol && !unique.has(symbol.toUpperCase())) unique.set(symbol.toUpperCase(), symbol)
  }
  const results = await Promise.all([...unique.values()].map(async symbol => {
    try { return [symbol, (await market.quote(symbol)).data] as const }
    catch { return null }
  }))
  return Object.fromEntries(results.filter(result => result !== null))
}

export async function valuePortfolio(db: Database, userId: bigint, market: ReturnType<typeof createMarketData>, now: Date) {
  // The public portfolio contract intentionally uses numeric display projections;
  // the authoritative ledger and transaction APIs retain exact decimal strings.
  const holdings: PortfolioHolding[] = (await getHoldings(db, userId)).map(row => ({
    symbol: row.symbol, quantity: Number(row.quantity), avgCost: Number(row.avgCost), totalCost: Number(row.totalCost),
  }))
  const quoteErrors: string[] = []
  const marketStates = new Map<string, string>()
  let index = 0
  await Promise.all(Array.from({ length: Math.min(3, holdings.length) }, async () => {
    while (index < holdings.length) {
      const holding = holdings[index++]!
      try {
        const { data: quote } = await market.quote(holding.symbol)
        if (quote.regularMarketPrice < 0) { quoteErrors.push(holding.symbol); continue }
        holding.price = quote.regularMarketPrice
        if (quote.change !== null) holding.dayChange = quote.change
        if (quote.changePercent !== null) holding.dayChangePercent = quote.changePercent
        if (quote.lastUpdateTime !== null) holding.quoteAsOf = quote.lastUpdateTime
        if (quote.marketState) marketStates.set(holding.symbol, quote.marketState)
      } catch { quoteErrors.push(holding.symbol) }
    }
  }))
  return portfolioValuationResponseSchema.parse({
    holdings, valuation: computePortfolioAggregations(holdings, { now }),
    quoteErrors: holdings.filter(row => quoteErrors.includes(row.symbol)).map(row => row.symbol),
    marketState: holdings.map(row => marketStates.get(row.symbol)).find(Boolean) ?? null,
  })
}
