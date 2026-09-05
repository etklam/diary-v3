import { describe, expect, it } from 'vitest'
import {
  buildDailyActivitySet,
  buildHeatmapWeeks,
  buildHolidaySet,
  calculateMonthCoverage,
  calendarMonthKeys,
  dateKeyInTimezone,
  resolveCountryCodeFromTimezone,
} from '@diary/domain/calendar'

describe('calendar civil-date helpers', () => {
  it('preserves the frozen timezone-to-country mapping and null fallback', () => {
    expect(resolveCountryCodeFromTimezone('Asia/Taipei')).toBe('TW')
    expect(resolveCountryCodeFromTimezone('America/Los_Angeles')).toBe('US')
    expect(resolveCountryCodeFromTimezone('Europe/London')).toBe('GB')
    expect(resolveCountryCodeFromTimezone('UTC')).toBeNull()
    expect(resolveCountryCodeFromTimezone('Antarctica/Casey')).toBeNull()
  })

  it('derives date keys from an instant in positive and negative UTC zones', () => {
    const instant = '2026-03-01T23:00:00.000Z'
    expect(dateKeyInTimezone(instant, 'Asia/Taipei')).toBe('2026-03-02')
    expect(dateKeyInTimezone(instant, 'America/New_York')).toBe('2026-03-01')
    expect(() => dateKeyInTimezone('not-a-date', 'Asia/Taipei')).toThrow('Invalid date input')
  })

  it('builds leap-month keys and coverage excluding holidays', () => {
    expect(calendarMonthKeys(2024, 1)).toHaveLength(29)
    expect(calendarMonthKeys(2024, 1).at(-1)).toBe('2024-02-29')
    const result = calculateMonthCoverage({
      year: 2026,
      month: 2,
      activeDays: buildDailyActivitySet([{ date: '2026-03-01' }, { date: '2026-03-03' }]),
      excludedDays: buildHolidaySet([{ date: '2026-03-02' }, { date: '2026-03-04' }]),
    })
    expect(result).toEqual({ activeCount: 2, eligibleDays: 29, coverage: '7%' })
  })

  it('builds exactly 371 civil days into Sunday-first complete weeks', () => {
    const weeks = buildHeatmapWeeks({
      endDate: '2026-03-08',
      activeDays: new Set(['2025-03-03', '2026-03-08']),
      excludedDays: new Set(['2026-03-08']),
      excludeHolidays: true,
    })
    const cells = weeks.flat().filter(cell => cell !== null)
    expect(cells).toHaveLength(371)
    expect(cells[0]).toEqual({ dateKey: '2025-03-03', level: 1, excluded: false })
    expect(cells.at(-1)).toEqual({ dateKey: '2026-03-08', level: 1, excluded: true })
    expect(weeks.every(week => week.length === 7)).toBe(true)
    expect(weeks[0]!.slice(0, 1)).toEqual([null]) // 2025-03-03 was Monday.
  })
})
