import { describe, expect, it } from 'vitest';
import { updateUserSettingsSchema } from '@diary/contracts/settings';
import { calendarDateInTimezone } from '@diary/domain';

describe('user preference validation and date semantics', () => {
  it('rounds exact decimal strings as PostgreSQL numeric while accepting legacy numeric inputs', () => {
    for (const [value, expected] of [
      ['9999999999999.99', '9999999999999.99'], ['1.005', '1.01'], ['-1.005', '-1.01'],
      ['1e3', '1000.00'], ['5e-3', '0.01'], ['.001', '0.00'], [1200, '1200.00'],
    ] as const) {
      expect(updateUserSettingsSchema.parse({ expectedProfit: value }).expectedProfit).toBe(expected);
    }
  });
  it('preserves zero, normalizes names, clears blank names and strips unknown fields', () => {
    expect(updateUserSettingsSchema.parse({ name: ' Ａ ', expectedMonthlyTrades: 0, role: 'ADMIN' }))
      .toEqual({ name: 'A', expectedMonthlyTrades: 0 });
    expect(updateUserSettingsSchema.parse({ name: ' ' }).name).toBeNull();
  });
  it('rejects unsupported settings instead of producing database errors or coercing booleans', () => {
    for (const input of [
      { expectedProfit: '9999999999999.995' }, { expectedProfit: '' }, { expectedProfit: Infinity },
      { expectedMonthlyTrades: 2147483648 }, { expectedMonthlyTrades: -1 },
      { timezone: 'not-a-timezone' }, { locale: 'fr' }, { excludeHolidaysInStats: 'false' },
    ]) expect(updateUserSettingsSchema.safeParse(input).success).toBe(false);
  });
  it('uses the explicit timezone at date boundaries and both DST transitions', () => {
    const date = (instant: string, zone: string) => calendarDateInTimezone(new Date(instant), zone);
    expect(date('2026-09-05T00:30:00Z', 'America/Los_Angeles')).toBe('2026-09-04');
    expect(date('2026-09-05T00:30:00Z', 'Asia/Taipei')).toBe('2026-09-05');
    expect(date('2026-03-08T06:59:59Z', 'America/New_York')).toBe('2026-03-08');
    expect(date('2026-03-08T07:00:00Z', 'America/New_York')).toBe('2026-03-08');
    expect(date('2026-11-01T05:30:00Z', 'America/New_York')).toBe('2026-11-01');
    expect(date('2026-11-01T06:30:00Z', 'America/New_York')).toBe('2026-11-01');
  });
});
