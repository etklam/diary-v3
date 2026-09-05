import { zonedPartsToUtc } from './zoned-time.js'

/** 固定的 user-local 觸發時間（時、分）。使用者只輸入日期，時間統一鎖 09:00。 */
const TRIGGER_HOUR = 9
const TRIGGER_MINUTE = 0

export interface RecurringAlertConfig {
  /** 起始日（任意 UTC instant，只取其 user-local 日曆日） */
  startDate: Date
  /** IANA timezone，決定日曆日與觸發 instant */
  timezone: string
  mode: 'WEEK' | 'MONTH'
  message: string
  diaryId: bigint
}

/**
 * User-local 日曆日的 (year, month, day)。month 為 1-based。
 * 星期由 Date.UTC(...).getUTCDay() 推導，時區無關且不受 runtime TZ 影響。
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
 * 取得 startDate 在指定 timezone 下的 user-local 日曆日。
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
 * 把 user-local 日曆日 + 固定 09:00 觸發時間 materialize 成 UTC instant。
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
 * 計算序列結束日（含）——皆在 user-local 日曆空間，時區無關的星期推導。
 * WEEK: 該週週五。MONTH: 該月最後一天。
 */
function calculateEndDay(start: CalendarDay, mode: 'WEEK' | 'MONTH'): CalendarDay {
  if (mode === 'WEEK') {
    const dayOfWeek = weekdayOf(start)
    const daysUntilFriday = dayOfWeek <= 5 ? 5 - dayOfWeek : 5 + (7 - dayOfWeek)
    return addCalendarDays(start, daysUntilFriday)
  }
  // MONTH: 該月最後一天 = 下個月第 0 天
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
 * 全程在 user-local 日曆空間計算：星期用時區無關的 Date.UTC(...).getUTCDay()
 * 推導，每個日期用固定的 09:00 user-local 觸發時間 materialize 成 UTC instant。
 * 不再依賴 runtime-local 的 setHours/getDay/setDate，故不受 server TZ 影響。
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
