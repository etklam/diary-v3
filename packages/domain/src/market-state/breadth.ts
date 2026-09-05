export interface Move4PctPrice {
  close: number
  previousClose: number
}

export interface MovingAveragePrice {
  close: number
  sma: number
}

export interface BreadthHistoryItem {
  up4Count: number
  down4Count: number
}

/** Minimum configured-universe coverage for a breadth row to be fresh. */
export const MARKET_BREADTH_MIN_COVERAGE_PCT = 90

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function countMove4Pct(prices: Move4PctPrice[]): { up4Count: number; down4Count: number } {
  return prices.reduce(
    (counts, price) => {
      if (!isFiniteNumber(price.close) || !isFiniteNumber(price.previousClose) || price.previousClose <= 0) {
        return counts
      }

      const dailyReturn = price.close / price.previousClose - 1
      if (dailyReturn >= 0.04) counts.up4Count += 1
      if (dailyReturn <= -0.04) counts.down4Count += 1
      return counts
    },
    { up4Count: 0, down4Count: 0 },
  )
}

export function calcAboveMaPct(prices: MovingAveragePrice[], universeCount: number): number {
  if (universeCount <= 0 || prices.length === 0) return 0

  const aboveCount = prices.filter(price =>
    isFiniteNumber(price.close) && isFiniteNumber(price.sma) && price.close > price.sma,
  ).length

  return clamp((aboveCount / universeCount) * 100, 0, 100)
}

export function calcRatioNDaily(breadthHistory: BreadthHistoryItem[], days: number): number {
  if (days <= 0 || breadthHistory.length === 0) return 0

  const recentHistory = breadthHistory.slice(-days)
  const totals = recentHistory.reduce(
    (sum, item) => ({
      up4Count: sum.up4Count + Math.max(item.up4Count, 0),
      down4Count: sum.down4Count + Math.max(item.down4Count, 0),
    }),
    { up4Count: 0, down4Count: 0 },
  )

  return totals.up4Count / Math.max(totals.down4Count, 1)
}
