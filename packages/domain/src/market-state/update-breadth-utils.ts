import {
  calcAboveMaPct,
  calcRatioNDaily,
  countMove4Pct,
  MARKET_BREADTH_MIN_COVERAGE_PCT,
} from './breadth.js'
import { determineRegime } from './regime.js'

export interface YahooChartQuote {
  date?: Date
  open?: number | null
  high?: number | null
  low?: number | null
  close?: number | null
  volume?: number | null
  adjclose?: number | null
}

export interface DailyPriceInput {
  symbol: string
  date: Date
  open: number
  high: number
  low: number
  close: number
  adjustedClose: number
  volume: bigint
}

export interface PricePoint {
  symbol: string
  date: Date
  adjustedClose: number
}

export interface BreadthHistoryPoint {
  date: Date
  up4Count: number
  down4Count: number
}

export interface BreadthDayResult {
  date: Date
  universeCount: number
  up4Count: number | null
  down4Count: number | null
  up4Pct: number | null
  down4Pct: number | null
  above40dCount: number | null
  above40dPct: number | null
  ratio5d: number | null
  ratio10d: number | null
  regime: string | null
  score: number | null
  coveragePct: number
  isStale: boolean
}

export function toDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

export function toDateKey(date: Date): string {
  return toDateOnly(date).toISOString().slice(0, 10)
}

export function isFinitePrice(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

export function parseDailyPrices(symbol: string, quotes: YahooChartQuote[]): DailyPriceInput[] {
  return quotes
    .filter((quote): quote is YahooChartQuote & {
      date: Date
      open: number
      high: number
      low: number
      close: number
    } => quote.date instanceof Date
      && Number.isFinite(quote.date.getTime())
      && isFinitePrice(quote.open)
      && isFinitePrice(quote.high)
      && isFinitePrice(quote.low)
      && isFinitePrice(quote.close))
    .map(quote => ({
      symbol,
      date: toDateOnly(quote.date),
      open: quote.open,
      high: quote.high,
      low: quote.low,
      close: quote.close,
      adjustedClose: isFinitePrice(quote.adjclose) ? quote.adjclose : quote.close,
      volume: typeof quote.volume === 'number' && Number.isFinite(quote.volume) && quote.volume > 0
        ? BigInt(Math.trunc(quote.volume))
        : 0n,
    }))
}

export function groupPricesBySymbol(prices: PricePoint[]): Map<string, PricePoint[]> {
  const grouped = new Map<string, PricePoint[]>()
  for (const price of prices) {
    const symbolPrices = grouped.get(price.symbol) ?? []
    symbolPrices.push(price)
    grouped.set(price.symbol, symbolPrices)
  }
  for (const symbolPrices of grouped.values()) symbolPrices.sort((a, b) => a.date.getTime() - b.date.getTime())
  return grouped
}

export function calculateBreadthRows(
  prices: PricePoint[],
  symbols: string[],
  datesToCalculate: Date[],
  existingBreadthHistory: BreadthHistoryPoint[],
): BreadthDayResult[] {
  const universeCount = symbols.length
  const targetDateKeys = new Set(datesToCalculate.map(toDateKey))
  const pricesBySymbol = groupPricesBySymbol(prices)
  const rows: BreadthDayResult[] = []
  let historyForRatio = existingBreadthHistory
    .map(item => ({ dateKey: toDateKey(item.date), up4Count: item.up4Count, down4Count: item.down4Count }))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
  const allDateKeys = Array.from(new Set(prices.map(price => toDateKey(price.date)))).sort()

  for (const dateKey of allDateKeys) {
    const moveInputs: Array<{ close: number; previousClose: number }> = []
    const maInputs: Array<{ close: number; sma: number }> = []
    let coveredCount = 0

    for (const symbol of symbols) {
      const symbolPrices = pricesBySymbol.get(symbol)
      if (!symbolPrices) continue
      const index = symbolPrices.findIndex(price => toDateKey(price.date) === dateKey)
      if (index < 0) continue
      const current = symbolPrices[index]
      if (!current) continue
      coveredCount += 1
      const previous = symbolPrices[index - 1]
      if (previous) moveInputs.push({ close: current.adjustedClose, previousClose: previous.adjustedClose })
      if (index >= 39) {
        const smaWindow = symbolPrices.slice(index - 39, index + 1)
        const sma = smaWindow.reduce((sum, price) => sum + price.adjustedClose, 0) / smaWindow.length
        maInputs.push({ close: current.adjustedClose, sma })
      }
    }

    const moves = moveInputs.length > 0 ? countMove4Pct(moveInputs) : null
    const above40dPct = maInputs.length > 0 ? calcAboveMaPct(maInputs, universeCount) : null
    const above40dCount = maInputs.length > 0 ? maInputs.filter(price => price.close > price.sma).length : null
    const up4Pct = moves && universeCount > 0 ? (moves.up4Count / universeCount) * 100 : null
    const down4Pct = moves && universeCount > 0 ? (moves.down4Count / universeCount) * 100 : null
    const currentHistoryItem = moves ? { dateKey, up4Count: moves.up4Count, down4Count: moves.down4Count } : null
    const currentRatioHistory = [...historyForRatio.filter(item => item.dateKey < dateKey), currentHistoryItem]
      .filter((item): item is { dateKey: string; up4Count: number; down4Count: number } => item !== null)
    const ratio5d = currentRatioHistory.length >= 5 ? calcRatioNDaily(currentRatioHistory, 5) : null
    const ratio10d = currentRatioHistory.length >= 10 ? calcRatioNDaily(currentRatioHistory, 10) : null
    // A market state is only meaningful when the 40-day series covers the
    // configured universe. Keep the partial percentage visible, but avoid
    // treating a one-symbol warmup as a risk-off market.
    const hasSufficientMaHistory = universeCount > 0 && maInputs.length / universeCount >= MARKET_BREADTH_MIN_COVERAGE_PCT / 100
    const regime = moves && above40dPct !== null && ratio10d !== null && hasSufficientMaHistory
      ? determineRegime({ up4Count: moves.up4Count, down4Count: moves.down4Count, universeCount, above40dPct, ratio10d })
      : null
    if (!targetDateKeys.has(dateKey)) continue

    if (currentHistoryItem) {
      historyForRatio = [...historyForRatio.filter(item => item.dateKey !== dateKey), currentHistoryItem]
        .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
    }
    const coveragePct = universeCount > 0 ? (coveredCount / universeCount) * 100 : 0
    rows.push({
      date: new Date(`${dateKey}T00:00:00.000Z`), universeCount,
      up4Count: moves?.up4Count ?? null, down4Count: moves?.down4Count ?? null,
      up4Pct: regime?.up4Pct ?? up4Pct, down4Pct: regime?.down4Pct ?? down4Pct,
      above40dCount, above40dPct, ratio5d, ratio10d, regime: regime?.regime ?? null, score: regime?.score ?? null,
      coveragePct, isStale: coveragePct < MARKET_BREADTH_MIN_COVERAGE_PCT,
    })
  }
  return rows
}
