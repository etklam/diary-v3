import { calendarDateInTimezone } from './calendar-date.js'

const TIMEZONE_COUNTRY_MAP: Readonly<Record<string, string>> = {
  'Asia/Taipei': 'TW',
  'Asia/Hong_Kong': 'HK',
  'Asia/Shanghai': 'CN',
  'Asia/Singapore': 'SG',
  'Asia/Tokyo': 'JP',
  'Asia/Seoul': 'KR',
  'America/New_York': 'US',
  'America/Chicago': 'US',
  'America/Los_Angeles': 'US',
  'America/Toronto': 'CA',
  'Europe/London': 'GB',
  'Europe/Paris': 'FR',
  'Europe/Berlin': 'DE',
  'Australia/Sydney': 'AU',
}

export interface CalendarActivityDay {
  date: string
}

export interface HeatmapCell {
  dateKey: string
  level: 0 | 1
  excluded: boolean
}

export function resolveCountryCodeFromTimezone(timezone: string): string | null {
  return TIMEZONE_COUNTRY_MAP[timezone] ?? null
}

export function dateKeyInTimezone(value: Date | string, timezone: string): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error('Invalid date input')
  return calendarDateInTimezone(date, timezone)
}

export function buildDailyActivitySet(days: readonly CalendarActivityDay[]): Set<string> {
  return new Set(days.map(day => day.date))
}

export function buildHolidaySet(holidays: readonly { date: string }[]): Set<string> {
  return new Set(holidays.map(holiday => holiday.date))
}

export function calendarMonthKeys(year: number, month: number) {
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}`
  return Array.from({ length: daysInMonth }, (_, index) => `${prefix}-${String(index + 1).padStart(2, '0')}`)
}

export function calculateMonthCoverage(input: {
  year: number
  /** Zero-based month, matching the frozen Calendar surface. */
  month: number
  activeDays: ReadonlySet<string>
  excludedDays: ReadonlySet<string>
}) {
  const eligible = calendarMonthKeys(input.year, input.month)
    .filter(date => !input.excludedDays.has(date))
  const activeCount = eligible.filter(date => input.activeDays.has(date)).length
  const eligibleDays = eligible.length
  return {
    activeCount,
    eligibleDays,
    coverage: eligibleDays === 0 ? '0%' : `${Math.round((activeCount / eligibleDays) * 100)}%`,
  }
}

function shiftCivilDate(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** Build the frozen 371-day, Sunday-first heatmap ending on the supplied civil date. */
export function buildHeatmapWeeks(input: {
  endDate: string
  activeDays: ReadonlySet<string>
  excludedDays: ReadonlySet<string>
  excludeHolidays: boolean
}): Array<Array<HeatmapCell | null>> {
  const days = Array.from({ length: 371 }, (_, index) => {
    const dateKey = shiftCivilDate(input.endDate, index - 370)
    return {
      dateKey,
      level: input.activeDays.has(dateKey) ? 1 as const : 0 as const,
      excluded: input.excludeHolidays && input.excludedDays.has(dateKey),
    }
  })
  const startWeekday = new Date(`${days[0]!.dateKey}T00:00:00.000Z`).getUTCDay()
  const padded: Array<HeatmapCell | null> = [...Array<null>(startWeekday).fill(null), ...days]
  const weeks: Array<Array<HeatmapCell | null>> = []
  for (let index = 0; index < padded.length; index += 7) weeks.push(padded.slice(index, index + 7))
  const last = weeks.at(-1)
  if (last && last.length < 7) last.push(...Array<null>(7 - last.length).fill(null))
  return weeks
}
