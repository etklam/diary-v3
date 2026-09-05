import { describe, expect, it } from 'vitest'
import { alignRelativeRatioHistory, calculateRelativeRatio, generateRelativePricePoints, parseRelativeTargetPrices, splitRelativeRatioSegments } from '../../packages/domain/src/relative-value'

describe('relative value domain', () => {
  it('calculates ratio and rejects invalid or zero prices', () => {
    expect(calculateRelativeRatio(100, 25)).toBe(4)
    expect(() => calculateRelativeRatio(100, 0)).toThrow()
    expect(() => calculateRelativeRatio(Number.NaN, 25)).toThrow()
  })

  it('rejects numeric prefixes and bounds generated points', () => {
    expect(() => parseRelativeTargetPrices('100, 20foo, -3, 25\n.5')).toThrow()
    expect(parseRelativeTargetPrices('100, 25\n.5')).toEqual([0.5, 25, 100])
    expect(generateRelativePricePoints(100, 2, 10, 'both')).toEqual([80, 90, 110, 120])
    expect(generateRelativePricePoints(100, 51, 10, 'up')).toEqual([])
  })

  it('joins historical closes by exact timestamps and excludes invalid denominators', () => {
    const points = alignRelativeRatioHistory(
      [{ timestamp: 1, close: 100 }, { timestamp: 2, close: 110 }, { timestamp: 3, close: 0 }],
      [{ timestamp: 1, close: 25 }, { timestamp: 3, close: 30 }],
    )
    expect(points).toEqual([
      { timestamp: 1, ratio: 4, primaryClose: 100, relativeClose: 25 },
      { timestamp: 2, ratio: null, primaryClose: 110, relativeClose: null },
      { timestamp: 3, ratio: null, primaryClose: null, relativeClose: 30 },
    ])
    expect(splitRelativeRatioSegments([...points, { timestamp: 4, ratio: Number.NaN, primaryClose: null, relativeClose: null }, { timestamp: 5, ratio: 5, primaryClose: 100, relativeClose: 20 }]).map(segment => segment.length)).toEqual([1, 1])
  })
})
