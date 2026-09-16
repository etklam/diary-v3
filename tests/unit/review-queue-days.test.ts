import { describe, expect, it } from 'vitest';
import { accountDayDiff, copy, dueLine } from '../../apps/web/app/routes/reviews';

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

describe('due line wording', () => {
  it('counts days while the due date is near', () => {
    expect(dueLine(0, copy.en, '')).toBe('Due today');
    expect(dueLine(-3, copy.en, '')).toBe('3 days overdue');
    expect(dueLine(7, copy.en, '')).toBe('Due in 7 days');
  });

  it('switches to the date itself once the count is noise', () => {
    expect(dueLine(-2446, copy.en, 'Jan 1, 2020')).toBe('Overdue since Jan 1, 2020');
    expect(dueLine(90, copy.en, 'Jun 1, 2026')).toBe('Due Jun 1, 2026');
    expect(dueLine(-2446, copy['zh-TW'], '2020年1月1日')).toBe('自 2020年1月1日 起逾期');
  });
});
