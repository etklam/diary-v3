import { describe, expect, it } from 'vitest';
import { accountDayDiff } from '../../apps/web/app/routes/reviews';

describe('account-local day difference for queue items', () => {
  const now = new Date('2026-05-01T12:00:00Z'); // 20:00 in Asia/Taipei on 2026-05-01

  it('counts days in the account timezone, not UTC days', () => {
    // 23:59 Taipei on May 1 is still today; 00:01 on May 2 is tomorrow.
    expect(accountDayDiff('2026-05-01T15:59:00Z', now, 'Asia/Taipei')).toBe(0);
    expect(accountDayDiff('2026-05-01T16:01:00Z', now, 'Asia/Taipei')).toBe(1);
    // 2026-04-30T23:59:59Z is April 30 on UTC days but May 1 in Taipei.
    expect(accountDayDiff('2026-04-30T23:59:59Z', now, 'Asia/Taipei')).toBe(0);
    expect(accountDayDiff('2026-04-30T23:59:59Z', now, 'UTC')).toBe(-1);
    // Yesterday in Taipei reads as one day overdue.
    expect(accountDayDiff('2026-04-30T15:59:00Z', now, 'Asia/Taipei')).toBe(-1);
  });
});
