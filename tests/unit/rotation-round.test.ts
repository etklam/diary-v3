import { describe, expect, it } from 'vitest'
import { roundMetric } from '../../packages/domain/src/market-rotation/round'

describe('roundMetric', () => {
  it('rounds to 4 decimal places', () => {
    expect(roundMetric(110.123456789)).toBe(110.1235)
  })

  it('preserves integers', () => {
    expect(roundMetric(100)).toBe(100)
  })

  it('handles values that need no rounding', () => {
    expect(roundMetric(105.5)).toBe(105.5)
  })

  it('truncates long fractional values', () => {
    // 333.333333... → 333.3333
    expect(roundMetric(10 / 3 * 100)).toBe(333.3333)
  })
})
