/**
 * Technical indicator pure functions for Market Rotation Monitor.
 *
 * All functions are stateless — no Prisma, no IO, no side effects.
 * Input: price arrays or price pairs. Output: computed values or null.
 */

// ─── RSI (Wilder's smoothing) ────────────────────────────────────

/**
 * Calculate RSI using Wilder's smoothing method.
 *
 * @param prices  Close prices array (oldest first, latest last).
 * @param period  Lookback period (default 14).
 * @returns RSI value 0–100, or null if insufficient data.
 *          Requires at least `period + 1` data points.
 */
export function calculateRsi(prices: number[], period = 14): number | null {
  if (prices.length < period + 1) return null

  // Compute price changes
  const changes: number[] = []
  for (let i = 1; i < prices.length; i++) {
    const current = prices[i]
    const previous = prices[i - 1]
    if (current === undefined || previous === undefined) continue

    changes.push(current - previous)
  }

  // Initial average gain / loss from first `period` changes
  let avgGain = 0
  let avgLoss = 0
  for (let i = 0; i < period; i++) {
    const change = changes[i]
    if (change === undefined) continue

    if (change >= 0) {
      avgGain += change
    } else {
      avgLoss += Math.abs(change)
    }
  }
  avgGain /= period
  avgLoss /= period

  // Wilder's smoothing for the rest
  for (let i = period; i < changes.length; i++) {
    const change = changes[i]
    if (change === undefined) continue

    const gain = change >= 0 ? change : 0
    const loss = change < 0 ? Math.abs(change) : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
  }

  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return 100 - 100 / (1 + rs)
}

// ─── EMA (Exponential Moving Average) ────────────────────────────

/**
 * Calculate the latest EMA value.
 *
 * Seed: SMA of first `period` prices.
 * Recurrence: EMA = price * k + prevEMA * (1 - k),  k = 2 / (period + 1)
 *
 * @param prices  Prices array (oldest first).
 * @param period  EMA period.
 * @returns Latest EMA value, or null if insufficient data.
 */
export function calculateEma(prices: number[], period: number): number | null {
  if (prices.length < period) return null

  const k = 2 / (period + 1)

  // Seed with SMA of first `period` prices
  let ema = 0
  for (let i = 0; i < period; i++) {
    ema += prices[i] ?? 0
  }
  ema /= period

  // Iterate remaining prices
  for (let i = period; i < prices.length; i++) {
    const price = prices[i]
    if (price === undefined) continue

    ema = price * k + ema * (1 - k)
  }

  return ema
}

// ─── SMA (Simple Moving Average) ─────────────────────────────────

/**
 * Calculate SMA from the last `period` prices.
 *
 * @param prices  Prices array (oldest first).
 * @param period  Number of prices to average.
 * @returns Average of the last `period` prices, or null if insufficient data.
 */
export function calculateSma(prices: number[], period: number): number | null {
  if (prices.length < period) return null

  let sum = 0
  for (let i = prices.length - period; i < prices.length; i++) {
    sum += prices[i] ?? 0
  }
  return sum / period
}

// ─── Rolling High ────────────────────────────────────────────────

/**
 * Find the highest price in the last `lookback` prices.
 * If lookback exceeds array length, returns the max of the entire array.
 *
 * @param prices    Prices array (oldest first).
 * @param lookback  Number of prices to consider from the end.
 * @returns Highest value in the window, or null for empty input.
 */
export function calculateRollingHigh(prices: number[], lookback: number): number | null {
  if (prices.length === 0) return null

  const start = Math.max(0, prices.length - lookback)
  let max = prices[start]
  if (max === undefined) return null

  for (let i = start + 1; i < prices.length; i++) {
    const price = prices[i]
    if (price !== undefined && price > max) max = price
  }
  return max
}

// ─── Performance ─────────────────────────────────────────────────

/**
 * Calculate percentage change between two prices.
 *
 * @param oldPrice  Original price.
 * @param newPrice  New price.
 * @returns Percentage change (e.g. 10 for +10%).
 */
export function calculatePerformance(oldPrice: number, newPrice: number): number {
  return ((newPrice - oldPrice) / oldPrice) * 100
}
