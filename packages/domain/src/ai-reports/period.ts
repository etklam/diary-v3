import { calendarDateInTimezone } from '../calendar-date.js'
import { zonedPartsToUtc } from '../zoned-time.js'

export type AiReportPeriodType = 'weekly' | 'monthly'
export type AiReportLocale = 'zh-TW' | 'zh-CN' | 'en'

export interface BuildReportPeriodInput {
  periodType: AiReportPeriodType
  periodStart: string
  timezone: string
  capturedAt: Date
}

export interface CanonicalReportPeriod {
  periodType: AiReportPeriodType
  periodStart: string
  periodEndExclusive: string
  isPartialPeriod: boolean
  timezone: string
  startInstant: string
  periodEndInstant: string
  effectiveEndInstant: string
  effectiveEndDateExclusive: string
}

export type ReportPeriodErrorCode =
  | 'AI_REPORT_INVALID_PERIOD'
  | 'AI_REPORT_FUTURE_PERIOD'
  | 'AI_REPORT_INVALID_TIMEZONE'

export class ReportPeriodError extends Error {
  constructor(readonly code: ReportPeriodErrorCode, message: string) {
    super(message)
    this.name = 'ReportPeriodError'
  }
}

function parseDate(value: string): { year: number; month: number; day: number } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ReportPeriodError('AI_REPORT_INVALID_PERIOD', 'periodStart must use YYYY-MM-DD')
  }
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year!, month! - 1, day!))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month! - 1 || date.getUTCDate() !== day) {
    throw new ReportPeriodError('AI_REPORT_INVALID_PERIOD', 'periodStart must be a valid calendar date')
  }
  return { year: year!, month: month!, day: day! }
}

function dateFromParts(parts: { year: number; month: number; day: number }): string {
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

function addDays(value: string, days: number): string {
  const parts = parseDate(value)
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days))
  return dateFromParts({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() })
}

function isMonday(value: string): boolean {
  const parts = parseDate(value)
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay() === 1
}

function canonicalTimezone(value: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ReportPeriodError('AI_REPORT_INVALID_TIMEZONE', 'timezone must be an IANA timezone')
  }
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone
  } catch {
    throw new ReportPeriodError('AI_REPORT_INVALID_TIMEZONE', 'timezone must be an IANA timezone')
  }
}

function localMidnight(value: string, timezone: string): Date {
  const parts = parseDate(value)
  const guess = zonedPartsToUtc({ ...parts, hour: 0, minute: 0, second: 0, millisecond: 0 }, timezone)

  // Most zones have a real local midnight, but a few historical transitions
  // jump at 00:00. The shared two-pass converter can then choose the instant
  // immediately before the target civil date (for example São Paulo in 2018).
  // Find the first instant whose local date is the requested date, preserving
  // the civil-day boundary even when 00:00 itself does not exist.
  const hour = 60 * 60 * 1_000
  let candidate: Date | null = null
  for (let offset = -48 * hour; offset <= 72 * hour; offset += hour) {
    const probe = new Date(guess.getTime() + offset)
    if (calendarDateInTimezone(probe, timezone) === value) {
      candidate = probe
      break
    }
  }
  if (!candidate) throw new ReportPeriodError('AI_REPORT_INVALID_PERIOD', `No local civil date exists for ${value}`)

  let low = new Date(candidate.getTime() - hour)
  while (calendarDateInTimezone(low, timezone) === value) low = new Date(low.getTime() - hour)
  let high = candidate
  while (high.getTime() - low.getTime() > 1) {
    const middle = new Date(Math.floor((high.getTime() + low.getTime()) / 2))
    if (calendarDateInTimezone(middle, timezone) === value) high = middle
    else low = middle
  }
  return high
}

/**
 * Canonicalise a report period in calendar space, then derive its UTC bounds.
 * Date-only diary rows use the local date bounds; timestamped transactions use
 * the instant bounds. A partial current period ends at the capture instant.
 */
export function canonicalizeReportPeriod(input: BuildReportPeriodInput): CanonicalReportPeriod {
  if (!(input.capturedAt instanceof Date) || Number.isNaN(input.capturedAt.getTime())) {
    throw new ReportPeriodError('AI_REPORT_INVALID_PERIOD', 'capturedAt must be a valid instant')
  }
  const timezone = canonicalTimezone(input.timezone)
  const startParts = parseDate(input.periodStart)
  const periodStart = dateFromParts(startParts)
  if (input.periodType !== 'weekly' && input.periodType !== 'monthly') {
    throw new ReportPeriodError('AI_REPORT_INVALID_PERIOD', 'Unsupported report period type')
  }
  const periodEndExclusive = input.periodType === 'weekly'
    ? addDays(periodStart, 7)
    : startParts.day === 1
      ? dateFromParts({ year: startParts.month === 12 ? startParts.year + 1 : startParts.year, month: startParts.month === 12 ? 1 : startParts.month + 1, day: 1 })
      : (() => { throw new ReportPeriodError('AI_REPORT_INVALID_PERIOD', 'monthly periodStart must be the first day of a month') })()

  if (input.periodType === 'weekly' && !isMonday(periodStart)) {
    throw new ReportPeriodError('AI_REPORT_INVALID_PERIOD', 'weekly periodStart must be a Monday')
  }
  const capturedDate = calendarDateInTimezone(input.capturedAt, timezone)
  if (periodStart > capturedDate) {
    throw new ReportPeriodError('AI_REPORT_FUTURE_PERIOD', 'Report periods cannot start in the future')
  }

  const startInstant = localMidnight(periodStart, timezone)
  const periodEndInstant = localMidnight(periodEndExclusive, timezone)
  const isPartialPeriod = input.capturedAt.getTime() < periodEndInstant.getTime()
  const effectiveEndInstant = isPartialPeriod ? input.capturedAt : periodEndInstant
  const effectiveEndDateExclusive = isPartialPeriod ? addDays(capturedDate, 1) : periodEndExclusive

  return {
    periodType: input.periodType,
    periodStart,
    periodEndExclusive,
    isPartialPeriod,
    timezone,
    startInstant: startInstant.toISOString(),
    periodEndInstant: periodEndInstant.toISOString(),
    effectiveEndInstant: effectiveEndInstant.toISOString(),
    effectiveEndDateExclusive,
  }
}

export function calendarDaysInReportPeriod(period: Pick<CanonicalReportPeriod, 'periodStart' | 'periodEndExclusive'>): number {
  const start = parseDate(period.periodStart)
  const end = parseDate(period.periodEndExclusive)
  return Math.round((Date.UTC(end.year, end.month - 1, end.day) - Date.UTC(start.year, start.month - 1, start.day)) / 86_400_000)
}
