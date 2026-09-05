import { describe, expect, it } from 'vitest'
import {
  assignRotationRanks,
  calculateDistanceFromHigh,
  calculateMaScore,
  calculateMaStatus,
  calculatePercentile,
  calculateRotationScore,
} from '../../packages/domain/src/market-rotation/calculations'

describe('calculateMaStatus', () => {
  it('applies canonical MA status rules for every complete MA combination', () => {
    expect(calculateMaStatus({ above10d: true, above20d: true, above50d: true })).toBe('bullish_stack')
    expect(calculateMaStatus({ above10d: false, above20d: true, above50d: true })).toBe('healthy_pullback')
    expect(calculateMaStatus({ above10d: true, above20d: false, above50d: true })).toBe('short_term_weakness')
    expect(calculateMaStatus({ above10d: false, above20d: false, above50d: true })).toBe('short_term_weakness')
    expect(calculateMaStatus({ above10d: true, above20d: true, above50d: false })).toBe('recovering')
    expect(calculateMaStatus({ above10d: true, above20d: false, above50d: false })).toBe('recovering')
    expect(calculateMaStatus({ above10d: false, above20d: true, above50d: false })).toBe('recovering')
    expect(calculateMaStatus({ above10d: false, above20d: false, above50d: false })).toBe('breakdown')
  })

  it('returns unknown when any MA input is missing', () => {
    expect(calculateMaStatus({ above10d: null, above20d: true, above50d: true })).toBe('unknown')
    expect(calculateMaStatus({ above10d: true, above20d: null, above50d: true })).toBe('unknown')
    expect(calculateMaStatus({ above10d: true, above20d: true, above50d: null })).toBe('unknown')
  })
})

describe('calculatePercentile', () => {
  it('calculates percentile rank within a scope', () => {
    const values = [10, 20, 30, 40, 50]
    expect(calculatePercentile(values, 50)).toBe(80)
    expect(calculatePercentile(values, 10)).toBe(0)
    expect(calculatePercentile(values, 30)).toBe(40)
  })

  it('returns null for empty array', () => {
    expect(calculatePercentile([], 50)).toBeNull()
  })

  it('handles single element array', () => {
    expect(calculatePercentile([42], 42)).toBe(0)
  })

  it('returns 0 when value is the minimum', () => {
    expect(calculatePercentile([5, 10, 15], 5)).toBe(0)
  })

  it('returns highest percentile when value is the maximum', () => {
    expect(calculatePercentile([5, 10, 15], 15)).toBeCloseTo(66.67, 1)
  })
})

describe('market rotation calculations', () => {
  it('calculates V1 MA score from 10d, 20d, and 50d only', () => {
    expect(calculateMaScore({ above10d: true, above20d: true, above50d: true, above200d: false })).toBe(100)
    expect(calculateMaScore({ above10d: true, above20d: false, above50d: true, above200d: true })).toBe(70)
    expect(calculateMaScore({ above10d: false, above20d: false, above50d: false, above200d: true })).toBe(0)
  })

  it('scores distance from high and requires at least 60 trading days of history', () => {
    expect(calculateDistanceFromHigh({ close: 100, rollingHigh: 100, tradingDayCount: 252 })).toEqual({
      percentFromHigh: 0,
      distanceFromHighScore: 100,
    })
    expect(calculateDistanceFromHigh({ close: 95, rollingHigh: 100, tradingDayCount: 252 }).distanceFromHighScore).toBe(75)
    expect(calculateDistanceFromHigh({ close: 90, rollingHigh: 100, tradingDayCount: 252 }).distanceFromHighScore).toBe(50)
    expect(calculateDistanceFromHigh({ close: 80, rollingHigh: 100, tradingDayCount: 252 }).distanceFromHighScore).toBe(0)
    expect(calculateDistanceFromHigh({ close: 99, rollingHigh: 100, tradingDayCount: 59 })).toEqual({
      percentFromHigh: null,
      distanceFromHighScore: null,
    })
  })

  it('returns unknown rotation score when any percentile component is missing', () => {
    expect(calculateRotationScore({
      rsiPercentile: 80,
      twoWeekPerformancePercentile: 70,
      maScorePercentile: 60,
      distanceFromHighScorePercentile: 50,
    })).toBe(67)

    expect(calculateRotationScore({
      rsiPercentile: 80,
      twoWeekPerformancePercentile: null,
      maScorePercentile: 60,
      distanceFromHighScorePercentile: 50,
    })).toBeNull()
  })

  // --- calculateDistanceFromHigh boundary tests ---

  it('calculateDistanceFromHigh returns value when tradingDayCount is exactly 60', () => {
    const result = calculateDistanceFromHigh({ close: 95, rollingHigh: 100, tradingDayCount: 60 })
    expect(result.percentFromHigh).toBe(-5)
    expect(result.distanceFromHighScore).toBe(75)
  })

  it('calculateDistanceFromHigh returns null when tradingDayCount is 59 (below minimum)', () => {
    expect(calculateDistanceFromHigh({ close: 95, rollingHigh: 100, tradingDayCount: 59 })).toEqual({
      percentFromHigh: null,
      distanceFromHighScore: null,
    })
  })

  it('calculateDistanceFromHigh returns positive percentFromHigh when close exceeds rollingHigh', () => {
    const result = calculateDistanceFromHigh({ close: 105, rollingHigh: 100, tradingDayCount: 252 })
    expect(result.percentFromHigh).toBeGreaterThan(0)
    expect(result.distanceFromHighScore).toBe(100) // clamped to max
  })

  it('calculateDistanceFromHigh returns null when rollingHigh is zero (division by zero guard)', () => {
    expect(calculateDistanceFromHigh({ close: 100, rollingHigh: 0, tradingDayCount: 252 })).toEqual({
      percentFromHigh: null,
      distanceFromHighScore: null,
    })
  })

  it('calculateDistanceFromHigh returns null when rollingHigh is negative (division by zero guard)', () => {
    expect(calculateDistanceFromHigh({ close: 100, rollingHigh: -10, tradingDayCount: 252 })).toEqual({
      percentFromHigh: null,
      distanceFromHighScore: null,
    })
  })
})

describe('assignRotationRanks', () => {
  it('ranks 3 rows with distinct scores — highest gets rank 1', () => {
    const rows = [
      { symbol: 'SPY', rotationScore: 67 },
      { symbol: 'QQQ', rotationScore: 80 },
      { symbol: 'IWM', rotationScore: 45 },
    ]
    const result = assignRotationRanks(rows)
    expect(result).toEqual([
      { symbol: 'SPY', rotationScore: 67, rotationRank: 2 },
      { symbol: 'QQQ', rotationScore: 80, rotationRank: 1 },
      { symbol: 'IWM', rotationScore: 45, rotationRank: 3 },
    ])
  })

  it('gives null rank to rows with null score and does not affect other rankings', () => {
    const rows = [
      { symbol: 'SPY', rotationScore: 90 },
      { symbol: 'QQQ', rotationScore: null },
      { symbol: 'IWM', rotationScore: 60 },
    ]
    const result = assignRotationRanks(rows)
    expect(result).toEqual([
      { symbol: 'SPY', rotationScore: 90, rotationRank: 1 },
      { symbol: 'QQQ', rotationScore: null, rotationRank: null },
      { symbol: 'IWM', rotationScore: 60, rotationRank: 2 },
    ])
  })

  it('ties break by symbol ascending', () => {
    const rows = [
      { symbol: 'XLU', rotationScore: 75 },
      { symbol: 'XLK', rotationScore: 75 },
      { symbol: 'XLF', rotationScore: 75 },
    ]
    const result = assignRotationRanks(rows)
    expect(result).toEqual([
      { symbol: 'XLU', rotationScore: 75, rotationRank: 3 },
      { symbol: 'XLK', rotationScore: 75, rotationRank: 2 },
      { symbol: 'XLF', rotationScore: 75, rotationRank: 1 },
    ])
  })

  it('returns empty array for empty input', () => {
    expect(assignRotationRanks([])).toEqual([])
  })

  it('returns all null ranks when all scores are null', () => {
    const rows = [
      { symbol: 'SPY', rotationScore: null },
      { symbol: 'QQQ', rotationScore: null },
    ]
    const result = assignRotationRanks(rows)
    expect(result).toEqual([
      { symbol: 'SPY', rotationScore: null, rotationRank: null },
      { symbol: 'QQQ', rotationScore: null, rotationRank: null },
    ])
  })

  it('gives rank 1 to a single row with score', () => {
    const rows = [{ symbol: 'SPY', rotationScore: 50 }]
    const result = assignRotationRanks(rows)
    expect(result).toEqual([
      { symbol: 'SPY', rotationScore: 50, rotationRank: 1 },
    ])
  })

  it('does not mutate the input array', () => {
    const rows = [
      { symbol: 'SPY', rotationScore: 90 },
      { symbol: 'QQQ', rotationScore: 60 },
    ]
    const frozen = JSON.parse(JSON.stringify(rows))
    assignRotationRanks(rows)
    expect(rows).toEqual(frozen)
  })
})
