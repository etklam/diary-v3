import type { YahooUpstream } from './index.js'

/** Deterministic provider used only by isolated deployment exercises. */
export function createFixtureUpstream(): YahooUpstream {
  return {
    summary: async symbol => ({ summaryDetail: { currency: 'USD', totalAssets: 1_000_000_000 }, defaultKeyStatistics: {}, fundProfile: {}, symbol }),
    quote: async symbol => ({
      symbol,
      regularMarketPrice: 100,
      regularMarketPreviousClose: 99,
      currency: 'USD',
      marketState: 'CLOSED',
      regularMarketTime: new Date('2026-09-04T20:00:00Z'),
    }),
    chart: async (symbol, options) => {
      const end = new Date(options.period2)
      if (options.interval === '5m') {
        return { quotes: [{ date: new Date(end.getTime() - 300_000), open: 99, high: 101, low: 98, close: 100, volume: 1000 }] }
      }
      if (options.interval === '1mo') {
        const quotes = []
        for (let index = 59; index >= 0; index -= 1) {
          const date = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - index, 1))
          const close: number = 90 + (59 - index) * 0.25
          quotes.push({ date, open: close - 1, high: close + 1, low: close - 2, close, adjclose: close, volume: 100_000 })
        }
        return { quotes }
      }
      const quotes = []
      const cursor = new Date(end)
      while (quotes.length < 320) {
        const weekday = cursor.getUTCDay()
        if (weekday !== 0 && weekday !== 6) {
          const close: number = 80 + quotes.length * 0.1
          quotes.unshift({ date: new Date(cursor), open: close - 1, high: close + 1, low: close - 2, close, adjclose: close, volume: 100_000 + quotes.length })
        }
        cursor.setUTCDate(cursor.getUTCDate() - 1)
      }
      return { quotes }
    },
  }
}
