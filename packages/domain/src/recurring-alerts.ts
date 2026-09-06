import { zonedPartsToUtc } from './zoned-time.js'

/** Fixed user-local trigger time (hour, minute). Users only pick a date; the time is always 09:00. */
const TRIGGER_HOUR = 9
const TRIGGER_MINUTE = 0

export interface RecurringAlertConfig {
  /** Start date (any UTC instant; only its user-local calendar day is used) */
  startDate: Date
  /** IANA timezone that determines the calendar day and the trigger instant */
  timezone: string
  mode: 'WEEK' | 'MONTH'
  message: string
  diaryId: bigint
}

/**
 * (year, month, day) of a user-local calendar day. month is 1-based.
 * Weekday is derived via Date.UTC(...).getUTCDay(), which is
 * timezone-independent and unaffected by the runtime TZ.
 */
interface CalendarDay {
  year: number
  month: number
  day: number
}

function ymdToUtcAnchor(d: CalendarDay): Date {
  return new Date(Date.UTC(d.year, d.month - 1, d.day))
}

function weekdayOf(d: CalendarDay): number {
  return ymdToUtcAnchor(d).getUTCDay()
}

function addCalendarDays(d: CalendarDay, delta: number): CalendarDay {
  const anchor = new Date(Date.UTC(d.year, d.month - 1, d.day + delta))
  return {
    year: anchor.getUTCFullYear(),
    month: anchor.getUTCMonth() + 1,
    day: anchor.getUTCDate(),
  }
}

function isWeekdayDay(d: CalendarDay): boolean {
  const wd = weekdayOf(d)
  return wd !== 0 && wd !== 6
}

/**
 * Get the user-local calendar day of startDate in the given timezone.
 */
function getStartCalendarDay(startDate: Date, timezone: string): CalendarDay {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(startDate)
  const pick = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return { year: pick('year'), month: pick('month'), day: pick('day') }
}

/**
 * Materialize a user-local calendar day plus the fixed 09:00 trigger time
 * into a UTC instant.
 */
function dayToTriggerUtc(d: CalendarDay, timezone: string): Date {
  return zonedPartsToUtc(
    {
      year: d.year,
      month: d.month,
      day: d.day,
      hour: TRIGGER_HOUR,
      minute: TRIGGER_MINUTE,
      second: 0,
      millisecond: 0,
    },
    timezone,
  )
}

/**
 * Compute the last day of the sequence (inclusive) — all in user-local
 * calendar space with timezone-independent weekday derivation.
 * WEEK: that week's Friday. MONTH: the last day of the month.
 */
function calculateEndDay(start: CalendarDay, mode: 'WEEK' | 'MONTH'): CalendarDay {
  if (mode === 'WEEK') {
    const dayOfWeek = weekdayOf(start)
    const daysUntilFriday = dayOfWeek <= 5 ? 5 - dayOfWeek : 5 + (7 - dayOfWeek)
    return addCalendarDays(start, daysUntilFriday)
  }
  // MONTH: last day of the month = day 0 of the next month
  const lastDayAnchor = new Date(Date.UTC(start.year, start.month, 0))
  return {
    year: lastDayAnchor.getUTCFullYear(),
    month: lastDayAnchor.getUTCMonth() + 1,
    day: lastDayAnchor.getUTCDate(),
  }
}

/**
 * Calculate all trigger dates for recurring alerts (skip weekends).
 *
 * Everything is computed in user-local calendar space: weekdays are derived
 * with the timezone-independent Date.UTC(...).getUTCDay(), and each date is
 * materialized into a UTC instant using the fixed 09:00 user-local trigger
 * time. No runtime-local setHours/getDay/setDate, so the server TZ is irrelevant.
 */
export function calculateRecurringAlertDates(config: RecurringAlertConfig): Date[] {
  const { startDate, timezone, mode } = config
  const startDay = getStartCalendarDay(startDate, timezone)
  const endDay = calculateEndDay(startDay, mode)
  const endAnchor = ymdToUtcAnchor(endDay).getTime()

  const dates: Date[] = []
  let current = startDay

  while (ymdToUtcAnchor(current).getTime() <= endAnchor) {
    if (isWeekdayDay(current)) {
      dates.push(dayToTriggerUtc(current, timezone))
    }
    current = addCalendarDays(current, 1)
  }

  return dates
}

/**
 * Generate platform-neutral data for batch creating alerts
 */
export function generateRecurringAlertsData(
  config: RecurringAlertConfig
): RecurringAlertRow[] {
  const dates = calculateRecurringAlertDates(config)

  return dates.map((date, index) => ({
    diaryId: config.diaryId,
    message: config.message,
    triggerAt: date,
    recurringMode: config.mode,
    instanceNumber: index + 1,
    // First alert is the parent, parentId will be updated later
    parentId: index === 0 ? BigInt(0) : undefined,
  }))
}

export interface RecurringAlertRow { diaryId: bigint; message: string; triggerAt: Date; recurringMode: 'WEEK' | 'MONTH'; instanceNumber: number; parentId?: bigint }
