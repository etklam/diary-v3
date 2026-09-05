import { describe, expect, it } from 'vitest'
import { seasonalityMonthInTimezone, seasonalityPeriodAverage, strongestSeasonalityMonths, weakestSeasonalityMonths } from '../../packages/domain/src/seasonality'

describe('seasonality domain', () => {
  it('uses monthly means and stable tie ordering', () => {
    expect(seasonalityPeriodAverage([11, 12, 1, 2, 3, 4])).toBeCloseTo(1.16, 2)
    expect(strongestSeasonalityMonths(3).map(month => month.month)).toEqual([11, 12, 4])
    expect(weakestSeasonalityMonths(3).map(month => month.month)).toEqual([9, 2, 8])
  })

  it('derives current and next month from the injected instant and timezone', () => {
    const now = new Date('2026-08-31T20:00:00Z')
    expect(seasonalityMonthInTimezone(now, 'Asia/Taipei')).toBe(9)
    expect(seasonalityMonthInTimezone(now, 'UTC')).toBe(8)
    expect(seasonalityMonthInTimezone(now, 'America/New_York')).toBe(8)
  })
})
