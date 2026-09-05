import { describe, expect, it } from 'vitest'
import {
  calculateEma,
  calculatePerformance,
  calculateRollingHigh,
  calculateRsi,
  calculateSma,
} from '../../packages/domain/src/market-rotation/indicators'

// ─── calculateRsi ────────────────────────────────────────────────

describe('calculateRsi', () => {
  it('returns null for empty array', () => {
    expect(calculateRsi([])).toBeNull()
  })

  it('returns null when fewer than 15 data points', () => {
    const prices = [44, 44.34, 44.09, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84]
    expect(calculateRsi(prices, 14)).toBeNull()
  })

  it('returns null when exactly 14 data points (need 14 changes + 1)', () => {
    const prices = Array.from({ length: 14 }, (_, i) => 100 + i)
    expect(calculateRsi(prices, 14)).toBeNull()
  })

  it('calculates RSI with known price series', () => {
    // 16 prices → 15 changes → initial avg(14) + 1 Wilder smoothing step
    // Wilder's smoothing: RSI ≈ 68.80
    const prices = [
      44, 44.34, 44.09, 43.61, 44.33, 44.83, 45.10, 45.42,
      45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.00,
    ]
    const result = calculateRsi(prices, 14)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(68.80, 1)
  })

  it('returns 100 when all changes are gains (always up)', () => {
    // 15 data points, all strictly increasing
    const prices = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
    expect(calculateRsi(prices, 14)).toBe(100)
  })

  it('returns 0 when all changes are losses (always down)', () => {
    // 15 data points, all strictly decreasing
    const prices = [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]
    expect(calculateRsi(prices, 14)).toBe(0)
  })

  it('uses default period of 14', () => {
    const prices = [
      44, 44.34, 44.09, 43.61, 44.33, 44.83, 45.10, 45.42,
      45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.00,
    ]
    // Should behave identically to calculateRsi(prices, 14)
    const withDefault = calculateRsi(prices)
    const withExplicit = calculateRsi(prices, 14)
    expect(withDefault).toBeCloseTo(withExplicit!, 10)
  })

  it('returns null when prices length equals period (not period + 1)', () => {
    expect(calculateRsi([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14], 14)).toBeNull()
  })

  it('works with period shorter than 14', () => {
    // period=3, need 4 data points
    const prices = [10, 12, 11, 14]
    const result = calculateRsi(prices, 3)
    expect(result).not.toBeNull()
    // Changes: +2, -1, +3 => avg gain = 5/3, avg loss = 1/3
    // RS = (5/3) / (1/3) = 5, RSI = 100 - 100/(1+5) = 83.33...
    expect(result!).toBeCloseTo(83.33, 1)
  })
})

// ─── calculateEma ────────────────────────────────────────────────

describe('calculateEma', () => {
  it('returns null for empty array', () => {
    expect(calculateEma([], 3)).toBeNull()
  })

  it('returns null when fewer data points than period', () => {
    expect(calculateEma([1, 2], 3)).toBeNull()
  })

  it('returns the single value for one data point with period 1', () => {
    expect(calculateEma([42], 1)).toBe(42)
  })

  it('calculates EMA with 3 data points', () => {
    // period=3, multiplier = 2/(3+1) = 0.5
    // SMA seed = (10+20+30)/3 = 20
    // EMA = 20 (that's the only EMA value we get for exactly 3 points)
    const result = calculateEma([10, 20, 30], 3)
    expect(result).toBe(20)
  })

  it('calculates EMA with 4 data points', () => {
    // period=3, multiplier = 0.5
    // SMA seed = (10+20+30)/3 = 20
    // prices[3] = 40, EMA = 40 * 0.5 + 20 * 0.5 = 30
    const result = calculateEma([10, 20, 30, 40], 3)
    expect(result).toBe(30)
  })

  it('calculates EMA with 5 data points', () => {
    // period=3, multiplier = 0.5
    // SMA seed = (10+20+30)/3 = 20
    // EMA[3] = 40 * 0.5 + 20 * 0.5 = 30
    // EMA[4] = 50 * 0.5 + 30 * 0.5 = 40
    const result = calculateEma([10, 20, 30, 40, 50], 3)
    expect(result).toBe(40)
  })

  it('returns SMA when prices length exactly equals period', () => {
    const result = calculateEma([10, 20, 30], 3)
    expect(result).toBe(20) // SMA of 10+20+30 / 3
  })
})

// ─── calculateSma ────────────────────────────────────────────────

describe('calculateSma', () => {
  it('calculates SMA from the last N prices', () => {
    // [1,2,3,4,5] SMA(3) = (3+4+5)/3 = 4
    expect(calculateSma([1, 2, 3, 4, 5], 3)).toBe(4)
  })

  it('returns null for empty array', () => {
    expect(calculateSma([], 3)).toBeNull()
  })

  it('returns null when fewer prices than period', () => {
    expect(calculateSma([1, 2], 3)).toBeNull()
  })

  it('returns the value when single element matches period', () => {
    expect(calculateSma([42], 1)).toBe(42)
  })

  it('calculates SMA when array length equals period', () => {
    expect(calculateSma([10, 20, 30], 3)).toBe(20)
  })

  it('handles decimal values correctly', () => {
    expect(calculateSma([1.5, 2.5, 3.0], 3)).toBeCloseTo(2.333, 2)
  })
})

// ─── calculateRollingHigh ────────────────────────────────────────

describe('calculateRollingHigh', () => {
  it('returns the highest value in the lookback window', () => {
    expect(calculateRollingHigh([10, 20, 30, 25, 15], 3)).toBe(30)
  })

  it('returns the max of the full array when lookback exceeds length', () => {
    expect(calculateRollingHigh([10, 20, 30], 10)).toBe(30)
  })

  it('returns null for empty array', () => {
    expect(calculateRollingHigh([], 5)).toBeNull()
  })

  it('returns single value for lookback of 1', () => {
    expect(calculateRollingHigh([10, 20, 30], 1)).toBe(30)
  })

  it('returns max of full array when lookback equals length', () => {
    expect(calculateRollingHigh([5, 10, 15], 3)).toBe(15)
  })

  it('handles negative values', () => {
    expect(calculateRollingHigh([-5, -10, -3, -8], 3)).toBe(-3)
  })
})

// ─── calculatePerformance ────────────────────────────────────────

describe('calculatePerformance', () => {
  it('calculates positive performance', () => {
    expect(calculatePerformance(100, 110)).toBe(10)
  })

  it('calculates negative performance', () => {
    expect(calculatePerformance(100, 90)).toBe(-10)
  })

  it('calculates performance with non-round numbers', () => {
    expect(calculatePerformance(50, 55)).toBe(10)
  })

  it('returns 0 when prices are equal', () => {
    expect(calculatePerformance(100, 100)).toBe(0)
  })

  it('calculates large percentage gains', () => {
    expect(calculatePerformance(100, 200)).toBe(100)
  })
})
