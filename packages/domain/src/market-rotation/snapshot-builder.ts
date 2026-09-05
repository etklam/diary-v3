/**
 * Snapshot builder — pure function that computes a single symbol's
 * daily snapshot data from historical close prices.
 *
 * No IO, no Prisma, no side effects.
 * Percentiles and ranks are computed at the batch/scope level, not here.
 */

import {
  calculateRsi,
  calculateEma,
  calculateSma,
  calculateRollingHigh,
  calculatePerformance,
} from './indicators.js'
import {
  calculateMaScore,
  calculateMaStatus,
  calculateDistanceFromHigh,
} from './calculations.js'

// ─── Types ─────────────────────────────────────────────────────

export interface DailyPrice {
  date: string // YYYY-MM-DD
  close: number
  adjustedClose: number
}

export interface SnapshotMeta {
  symbol: string
  rankScope: 'sectors' | 'indexes' | 'core'
  groupType:
    | 'sector'
    | 'index'
    | 'core'
    | 'core_etf'
    | 'mega_cap'
    | 'single_stock'
  sectorName: string | null
}

export interface SnapshotData {
  symbol: string
  rankScope: string
  groupType: string
  sectorName: string | null
  date: string
  lastPrice: number | null
  adjustedClose: number | null
  dailyChangePct: number | null
  weeklyChangePct: number | null
  rsi14: number | null
  ema10: number | null
  ema20: number | null
  sma50: number | null
  sma200: number | null
  above10d: boolean | null
  above20d: boolean | null
  above50d: boolean | null
  above200d: boolean | null
  maScore: number
  maStatus: string
  rolling252dHigh: number | null
  percentFromHigh: number | null
  distanceFromHighScore: number | null
}

// ─── Implementation ────────────────────────────────────────────

/**
 * Build a daily snapshot for a single symbol from its historical prices.
 *
 * @param meta    Symbol metadata (symbol, scope, group, sector).
 * @param prices  Historical daily prices, sorted ascending (oldest first).
 * @returns       SnapshotData with computed indicators, or null if prices is empty.
 */
export function buildSnapshot(
  meta: SnapshotMeta,
  prices: DailyPrice[],
): SnapshotData | null {
  if (prices.length === 0) return null

  const latest = prices[prices.length - 1]
  if (!latest) return null

  // Close prices for indicator calculations (traditional: use close, not adjustedClose)
  const closePrices = prices.map(p => p.close)

  // Last price: prefer adjustedClose, fallback to close
  const lastPrice = latest.adjustedClose || latest.close

  // Daily change: previous day → today
  let dailyChangePct: number | null = null
  if (prices.length >= 2) {
    const prev = prices[prices.length - 2]
    if (prev) {
      dailyChangePct = calculatePerformance(prev.close, latest.close)
    }
  }

  // Weekly change: 5 trading days ago → today
  let weeklyChangePct: number | null = null
  if (prices.length >= 6) {
    const fiveDaysAgo = prices[prices.length - 6]
    if (fiveDaysAgo) {
      weeklyChangePct = calculatePerformance(fiveDaysAgo.close, latest.close)
    }
  }

  // Indicators (all use close prices)
  const rsi14 = calculateRsi(closePrices, 14)
  const ema10 = calculateEma(closePrices, 10)
  const ema20 = calculateEma(closePrices, 20)
  const sma50 = calculateSma(closePrices, 50)
  const sma200 = calculateSma(closePrices, 200)

  // Above/below MA comparisons
  const currentClose = latest.close
  const above10d = ema10 != null ? currentClose > ema10 : null
  const above20d = ema20 != null ? currentClose > ema20 : null
  const above50d = sma50 != null ? currentClose > sma50 : null
  const above200d = sma200 != null ? currentClose > sma200 : null

  // MA score & status (only uses 10d, 20d, 50d)
  const maScore = calculateMaScore({
    above10d: above10d ?? false,
    above20d: above20d ?? false,
    above50d: above50d ?? false,
  })

  const maStatus = calculateMaStatus({
    above10d,
    above20d,
    above50d,
  })

  // Rolling high & distance from high
  const rolling252dHigh = calculateRollingHigh(closePrices, 252)

  const distanceResult = calculateDistanceFromHigh({
    close: currentClose,
    rollingHigh: rolling252dHigh ?? 0,
    tradingDayCount: prices.length,
  })

  return {
    symbol: meta.symbol,
    rankScope: meta.rankScope,
    groupType: meta.groupType,
    sectorName: meta.sectorName,
    date: latest.date,
    lastPrice,
    adjustedClose: latest.adjustedClose,
    dailyChangePct,
    weeklyChangePct,
    rsi14,
    ema10,
    ema20,
    sma50,
    sma200,
    above10d,
    above20d,
    above50d,
    above200d,
    maScore,
    maStatus,
    rolling252dHigh,
    percentFromHigh: distanceResult.percentFromHigh,
    distanceFromHighScore: distanceResult.distanceFromHighScore,
  }
}
