/**
 * tests/lib/recurring-alerts.test.ts
 * Unit tests for recurring alert date calculation logic.
 *
 * The sequence is computed entirely in user-local calendar space with a fixed
 * 09:00 user-local trigger time. Assertions verify that each triggerAt UTC
 * instant maps back to a 09:00 wall-clock in the given timezone (via
 * Intl.DateTimeFormat, no runtime TZ dependency), plus the calendar day /
 * weekday. This keeps the tests valid under any server timezone.
 */
import { describe, it, expect } from 'vitest'
import {
  calculateRecurringAlertDates,
  generateRecurringAlertsData,
} from '../packages/domain/src/recurring-alerts'
import type { RecurringAlertConfig } from '../packages/domain/src/recurring-alerts'

const TZ = 'Asia/Taipei' // UTC+8, no DST — easy to assert against

/** Get the wall-clock parts of date in the given timezone (for timezone-independent assertions). */
function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const pick = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const hour = pick('hour')
  return {
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
    hour: hour === 24 ? 0 : hour,
    minute: pick('minute'),
  }
}

/** Weekday of date in the timezone (0=Sun..6=Sat), timezone-independent. */
function zonedWeekday(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone)
  return new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay()
}

function makeConfig(overrides: Partial<RecurringAlertConfig> = {}): RecurringAlertConfig {
  return {
    startDate: new Date('2025-06-02T09:30:00Z'), // Taipei: 2025-06-02 17:30 (Monday)
    timezone: TZ,
    mode: 'WEEK',
    message: "Review today's trades",
    diaryId: BigInt(1),
    ...overrides,
  }
}

describe('calculateRecurringAlertDates - WEEK mode', () => {
  it('should generate Mon-Fri for a week starting Monday', () => {
    const dates = calculateRecurringAlertDates(makeConfig({
      startDate: new Date('2025-06-02T00:00:00Z'), // Taipei Mon 2025-06-02 08:00
      mode: 'WEEK',
    }))

    expect(dates.length).toBe(5)
    // All should be weekdays
    dates.forEach((d) => {
      const wd = zonedWeekday(d, TZ)
      expect(wd).not.toBe(0)
      expect(wd).not.toBe(6)
    })
    expect(zonedWeekday(dates[0]!, TZ)).toBe(1) // Monday
    expect(zonedWeekday(dates[dates.length - 1]!, TZ)).toBe(5) // Friday
    // Trigger time is fixed at 09:00 user-local
    dates.forEach((d) => {
      const p = zonedParts(d, TZ)
      expect(p.hour).toBe(9)
      expect(p.minute).toBe(0)
    })
  })

  it('should generate Tue-Fri when starting Tuesday', () => {
    const dates = calculateRecurringAlertDates(makeConfig({
      startDate: new Date('2025-06-03T00:00:00Z'), // Taipei Tue 08:00
      mode: 'WEEK',
    }))
    expect(dates.length).toBe(4)
    expect(zonedWeekday(dates[0]!, TZ)).toBe(2) // Tuesday
    expect(zonedWeekday(dates[dates.length - 1]!, TZ)).toBe(5) // Friday
  })

  it('should generate only Friday when starting Friday', () => {
    const dates = calculateRecurringAlertDates(makeConfig({
      startDate: new Date('2025-06-06T00:00:00Z'), // Taipei Fri 08:00
      mode: 'WEEK',
    }))
    expect(dates.length).toBe(1)
    expect(zonedWeekday(dates[0]!, TZ)).toBe(5)
  })

  it('should skip weekends when start date is Saturday', () => {
    const dates = calculateRecurringAlertDates(makeConfig({
      startDate: new Date('2025-06-07T00:00:00Z'), // Taipei Sat 08:00
      mode: 'WEEK',
    }))
    // Sat(skip) Sun(skip) → Mon-Fri = 5
    expect(dates.length).toBe(5)
    expect(zonedWeekday(dates[0]!, TZ)).toBe(1) // Monday
    expect(zonedWeekday(dates[dates.length - 1]!, TZ)).toBe(5)
  })

  it('should skip weekends when start date is Sunday', () => {
    const dates = calculateRecurringAlertDates(makeConfig({
      startDate: new Date('2025-06-08T00:00:00Z'), // Taipei Sun 08:00
      mode: 'WEEK',
    }))
    expect(dates.length).toBe(5)
    expect(zonedWeekday(dates[0]!, TZ)).toBe(1) // Monday
  })
})

describe('calculateRecurringAlertDates - MONTH mode', () => {
  it('should stay within the month and skip weekends', () => {
    const dates = calculateRecurringAlertDates(makeConfig({
      startDate: new Date('2025-06-01T00:00:00Z'), // Taipei Sun 2025-06-01 08:00
      mode: 'MONTH',
    }))
    dates.forEach((d) => {
      const p = zonedParts(d, TZ)
      expect(p.month).toBe(6) // June
      expect(p.year).toBe(2025)
      const wd = zonedWeekday(d, TZ)
      expect(wd).not.toBe(0)
      expect(wd).not.toBe(6)
    })
  })

  it('should handle 31-day month (July 2025)', () => {
    const dates = calculateRecurringAlertDates(makeConfig({
      startDate: new Date('2025-07-01T00:00:00Z'), // Taipei Tue 08:00
      mode: 'MONTH',
    }))
    // July 2025: 31 days, weeks starting Monday → 23 weekdays
    expect(dates.length).toBe(23)
    dates.forEach((d) => expect(zonedParts(d, TZ).month).toBe(7))
  })

  it('should stop at end of month (start on last day)', () => {
    const dates = calculateRecurringAlertDates(makeConfig({
      startDate: new Date('2025-06-30T00:00:00Z'), // Taipei Mon 2025-06-30 08:00
      mode: 'MONTH',
    }))
    expect(dates.length).toBe(1)
    expect(zonedParts(dates[0]!, TZ).day).toBe(30)
    expect(zonedParts(dates[0]!, TZ).month).toBe(6)
  })

  it('should handle leap-year February (2028)', () => {
    const dates = calculateRecurringAlertDates(makeConfig({
      startDate: new Date('2028-02-01T00:00:00Z'), // Taipei Tue 08:00
      mode: 'MONTH',
    }))
    // Feb 2028: 29 days, 8 weekend days → 21 weekdays
    expect(dates.length).toBe(21)
    dates.forEach((d) => {
      expect(zonedParts(d, TZ).month).toBe(2)
      expect(zonedParts(d, TZ).year).toBe(2028)
    })
  })
})

describe('timezone independence (the core regression)', () => {
  it('materializes the same user-local 09:00 regardless of the startDate instant time', () => {
    // Two different UTC instants that both land on the same Taipei day (2025-06-02)
    const early = calculateRecurringAlertDates(makeConfig({
      startDate: new Date('2025-06-01T20:00:00Z'), // Taipei 06-02 04:00
      mode: 'WEEK',
    }))
    const late = calculateRecurringAlertDates(makeConfig({
      startDate: new Date('2025-06-02T10:00:00Z'), // Taipei 06-02 18:00
      mode: 'WEEK',
    }))
    // Both should produce the same first trigger UTC instant (Taipei 06-02 09:00 = 06-02 01:00Z)
    expect(early[0]!.toISOString()).toBe('2025-06-02T01:00:00.000Z')
    expect(late[0]!.toISOString()).toBe('2025-06-02T01:00:00.000Z')
    expect(early.length).toBe(late.length)
  })

  it('produces 09:00 wall-clock in a UTC-offset timezone (New York)', () => {
    const dates = calculateRecurringAlertDates(makeConfig({
      startDate: new Date('2025-06-02T12:00:00Z'), // NY 08:00 EDT, Monday
      timezone: 'America/New_York',
      mode: 'WEEK',
    }))
    dates.forEach((d) => {
      const p = zonedParts(d, 'America/New_York')
      expect(p.hour).toBe(9)
      expect(p.minute).toBe(0)
    })
  })
})

describe('generateRecurringAlertsData', () => {
  it('should generate correct Prisma data for WEEK mode', () => {
    const data = generateRecurringAlertsData(makeConfig({
      startDate: new Date('2025-06-02T00:00:00Z'), // Taipei Mon 08:00
      mode: 'WEEK',
      diaryId: BigInt(42),
    }))

    expect(data.length).toBe(5)
    expect(data[0]!.diaryId).toBe(BigInt(42))
    expect(data[0]!.message).toBe("Review today's trades")
    expect(data[0]!.recurringMode).toBe('WEEK')
    expect(data[0]!.instanceNumber).toBe(1)
    expect(data[0]!.parentId).toBe(BigInt(0))
    expect(data[1]!.parentId).toBeUndefined()
    expect(data[1]!.instanceNumber).toBe(2)
    expect(data[4]!.instanceNumber).toBe(5)
  })

  it('should mark only the first entry as parent (0n)', () => {
    const data = generateRecurringAlertsData(makeConfig({
      startDate: new Date('2025-06-01T00:00:00Z'),
      mode: 'MONTH',
      diaryId: BigInt(99),
    }))
    expect(data.length).toBeGreaterThan(0)
    expect(data[0]!.parentId).toBe(BigInt(0))
    data.slice(1).forEach((entry) => expect(entry.parentId).toBeUndefined())
    data.forEach((entry, i) => {
      expect(entry.diaryId).toBe(BigInt(99))
      expect(entry.recurringMode).toBe('MONTH')
      expect(entry.instanceNumber).toBe(i + 1)
    })
  })

  it('should produce valid Date objects for every triggerAt', () => {
    const data = generateRecurringAlertsData(makeConfig({ mode: 'WEEK' }))
    data.forEach((entry) => {
      expect(entry.triggerAt).toBeInstanceOf(Date)
      expect(Number.isNaN((entry.triggerAt as Date).getTime())).toBe(false)
    })
  })

  it('should preserve message across all entries', () => {
    const message = 'Custom alert message for testing'
    const data = generateRecurringAlertsData(makeConfig({ message, mode: 'WEEK' }))
    data.forEach((entry) => expect(entry.message).toBe(message))
  })
})

it('keeps 09:00 across the spring and fall DST transitions within a month', () => {
  for (const [start, before, after] of [['2026-03-06T12:00:00Z','2026-03-06T14:00:00.000Z','2026-03-09T13:00:00.000Z'],['2026-10-30T12:00:00Z','2026-10-30T13:00:00.000Z','2026-11-02T14:00:00.000Z']]) {
    const dates=calculateRecurringAlertDates({diaryId:1n,message:'Synthetic',startDate:new Date(start!),timezone:'America/New_York',mode:'MONTH'})
    expect(dates[0]!.toISOString()).toBe(before)
    if(start!.includes('03-')) expect(dates[1]!.toISOString()).toBe(after)
    else { const next=calculateRecurringAlertDates({diaryId:1n,message:'Synthetic',startDate:new Date('2026-11-01T12:00:00Z'),timezone:'America/New_York',mode:'WEEK'});expect(next[0]!.toISOString()).toBe(after) }
  }
})
