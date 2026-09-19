import { describe, expect, it } from 'vitest'
import {
  buildUsEquityClosedDateSet,
  buildUsEquityClosedDateSetForDates,
  getUsEquityCalendarYear,
  isUsEquityCalendarYearSupported,
  isUsEquityWeekend,
  US_EQUITY_CALENDAR_SOURCE_URLS,
  US_EQUITY_CALENDAR_VERIFIED_AT,
  US_EQUITY_FULL_CLOSURE_DATES,
  US_EQUITY_HALF_DAY_DATES,
} from '@diary/domain/us-equity-calendar'

describe('curated US equity calendar', () => {
  it('records the verified source metadata and exact annual full-closure sets', () => {
    expect(US_EQUITY_CALENDAR_VERIFIED_AT).toBe('2026-09-20')
    expect(US_EQUITY_CALENDAR_SOURCE_URLS).toHaveLength(3)
    expect(US_EQUITY_FULL_CLOSURE_DATES[2025]).toEqual([
      '2025-01-01', '2025-01-09', '2025-01-20', '2025-02-17', '2025-04-18', '2025-05-26',
      '2025-06-19', '2025-07-04', '2025-09-01', '2025-11-27', '2025-12-25',
    ])
    expect(US_EQUITY_FULL_CLOSURE_DATES[2026]).toEqual([
      '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19',
      '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
    ])
    expect(US_EQUITY_FULL_CLOSURE_DATES[2027]).toEqual([
      '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18',
      '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
    ])
    expect(US_EQUITY_FULL_CLOSURE_DATES[2028]).toEqual([
      '2028-01-17', '2028-02-21', '2028-04-14', '2028-05-29', '2028-06-19', '2028-07-04',
      '2028-09-04', '2028-11-23', '2028-12-25',
    ])
    expect(US_EQUITY_FULL_CLOSURE_DATES[2028]).not.toContain('2028-01-01')
  })

  it('keeps early-close sessions eligible and leaves the 2027 year-end trading day open', () => {
    expect(US_EQUITY_HALF_DAY_DATES).toEqual({
      2025: ['2025-07-03', '2025-11-28', '2025-12-24'],
      2026: ['2026-11-27', '2026-12-24'],
      2027: ['2027-11-26'],
      2028: ['2028-07-03', '2028-11-24'],
    })
    expect(buildUsEquityClosedDateSet(2025)).not.toBeNull()
    expect(buildUsEquityClosedDateSet(2025)!).not.toContain('2025-07-03')
    expect(buildUsEquityClosedDateSet(2026)!).not.toContain('2026-11-27')
    expect(buildUsEquityClosedDateSet(2027)!).not.toContain('2027-12-31')
    expect(buildUsEquityClosedDateSet(2028)!).not.toContain('2028-11-24')
  })

  it('computes weekends from the UTC civil date without timezone shifting', () => {
    expect(isUsEquityWeekend('2026-04-03')).toBe(false)
    expect(isUsEquityWeekend('2026-04-04')).toBe(true)
    expect(isUsEquityWeekend('2026-04-05')).toBe(true)
    expect(isUsEquityWeekend('not-a-date')).toBe(false)
    const closed = buildUsEquityClosedDateSet(2026)!
    expect(closed.has('2026-04-03')).toBe(true)
    expect(closed.has('2026-04-04')).toBe(true)
    expect(closed.has('2026-04-05')).toBe(true)
    expect(closed.size).toBe(114)
    expect(buildUsEquityClosedDateSet(2025)!.size).toBe(115)
    expect(buildUsEquityClosedDateSet(2027)!.size).toBe(114)
    expect(buildUsEquityClosedDateSet(2028)!.size).toBe(115)
  })

  it('marks Good Friday closed while Columbus Day and Veterans Day remain eligible', () => {
    const closed = buildUsEquityClosedDateSet(2026)!
    expect(closed).toContain('2026-04-03')
    expect(closed).not.toContain('2026-10-12')
    expect(closed).not.toContain('2026-11-11')
  })

  it('returns unavailable for unknown years and for ranges that touch one', () => {
    expect(isUsEquityCalendarYearSupported(2024)).toBe(false)
    expect(getUsEquityCalendarYear(2024)).toBeNull()
    expect(buildUsEquityClosedDateSet(2024)).toBeNull()
    expect(buildUsEquityClosedDateSetForDates(['2026-04-03', '2026-04-06'])).toEqual(expect.any(Set))
    expect(buildUsEquityClosedDateSetForDates(['2024-12-31', '2025-01-01'])).toBeNull()
  })
})
