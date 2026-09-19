/**
 * Curated US equity market closure data, verified on 2026-09-20 against:
 * - https://ir.theice.com/press/news-details/2024/NYSE-Group-Announces-2025-2026-and-2027-Holiday-and-Early-Closings-Calendar/default.aspx
 * - https://www.nyse.com/trade/hours-calendars
 * - https://ir.theice.com/press/news-details/2024/The-New-York-Stock-Exchange-Will-Close-Markets-on-January-9-to-Honor-the-Passing-of-Former-President-Jimmy-Carter-on-National-Day-of-Mourning/default.aspx
 *
 * Full closures are kept separate from computed weekends and early-close days.
 * The supported range is intentionally explicit; unknown years are unavailable.
 */

export const US_EQUITY_CALENDAR_VERIFIED_AT = '2026-09-20' as const

export const US_EQUITY_CALENDAR_SOURCE_URLS = [
  'https://ir.theice.com/press/news-details/2024/NYSE-Group-Announces-2025-2026-and-2027-Holiday-and-Early-Closings-Calendar/default.aspx',
  'https://www.nyse.com/trade/hours-calendars',
  'https://ir.theice.com/press/news-details/2024/The-New-York-Stock-Exchange-Will-Close-Markets-on-January-9-to-Honor-the-Passing-of-Former-President-Jimmy-Carter-on-National-Day-of-Mourning/default.aspx',
] as const

export const US_EQUITY_CALENDAR_YEARS = [2025, 2026, 2027, 2028] as const

export const US_EQUITY_FULL_CLOSURE_DATES: Readonly<Record<number, readonly string[]>> = {
  2025: [
    '2025-01-01', '2025-01-09', '2025-01-20', '2025-02-17', '2025-04-18', '2025-05-26',
    '2025-06-19', '2025-07-04', '2025-09-01', '2025-11-27', '2025-12-25',
  ],
  2026: [
    '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19',
    '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
  ],
  2027: [
    '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18',
    '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
  ],
  2028: [
    '2028-01-17', '2028-02-21', '2028-04-14', '2028-05-29', '2028-06-19', '2028-07-04',
    '2028-09-04', '2028-11-23', '2028-12-25',
  ],
}

export const US_EQUITY_HALF_DAY_DATES: Readonly<Record<number, readonly string[]>> = {
  2025: ['2025-07-03', '2025-11-28', '2025-12-24'],
  2026: ['2026-11-27', '2026-12-24'],
  2027: ['2027-11-26'],
  2028: ['2028-07-03', '2028-11-24'],
}

export interface UsEquityCalendarYear {
  year: number
  fullClosureDates: readonly string[]
  halfDayDates: readonly string[]
}

function isSupportedYear(year: number): year is (typeof US_EQUITY_CALENDAR_YEARS)[number] {
  return (US_EQUITY_CALENDAR_YEARS as readonly number[]).includes(year)
}

export function isUsEquityCalendarYearSupported(year: number): boolean {
  return isSupportedYear(year)
}

export function getUsEquityCalendarYear(year: number): UsEquityCalendarYear | null {
  const fullClosureDates = US_EQUITY_FULL_CLOSURE_DATES[year]
  const halfDayDates = US_EQUITY_HALF_DAY_DATES[year]
  if (!isSupportedYear(year) || !fullClosureDates || !halfDayDates) return null
  return { year, fullClosureDates, halfDayDates }
}

/** Return true when a valid YYYY-MM-DD key falls on Saturday or Sunday in UTC. */
export function isUsEquityWeekend(dateKey: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false
  const date = new Date(`${dateKey}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateKey) return false
  const weekday = date.getUTCDay()
  return weekday === 0 || weekday === 6
}

function daysInYear(year: number): number {
  return new Date(Date.UTC(year, 1, 29)).getUTCMonth() === 1 ? 366 : 365
}

function dateKeyForDayOfYear(year: number, dayOfYear: number): string {
  return new Date(Date.UTC(year, 0, dayOfYear)).toISOString().slice(0, 10)
}

/**
 * Build the dates excluded when the Calendar preference is enabled.
 * Full closures come from the curated dataset; weekends are computed by UTC
 * civil date. Early-close dates intentionally remain eligible.
 */
export function buildUsEquityClosedDateSet(year: number): Set<string> | null {
  const calendar = getUsEquityCalendarYear(year)
  if (!calendar) return null

  const closed = new Set(calendar.fullClosureDates)
  for (let dayOfYear = 1; dayOfYear <= daysInYear(year); dayOfYear += 1) {
    const dateKey = dateKeyForDayOfYear(year, dayOfYear)
    if (isUsEquityWeekend(dateKey)) closed.add(dateKey)
  }
  return closed
}

/**
 * Return excluded dates for a civil-date range. A range is unavailable when
 * any year it touches falls outside the curated dataset, preventing partial
 * exclusion from being presented as complete coverage.
 */
export function buildUsEquityClosedDateSetForDates(dates: readonly string[]): Set<string> | null {
  const years = new Set(dates.map(dateKey => Number(dateKey.slice(0, 4))))
  const byYear = new Map<number, Set<string>>()
  for (const year of years) {
    const closed = buildUsEquityClosedDateSet(year)
    if (!closed) return null
    byYear.set(year, closed)
  }
  return new Set(dates.filter(dateKey => byYear.get(Number(dateKey.slice(0, 4)))?.has(dateKey)))
}
