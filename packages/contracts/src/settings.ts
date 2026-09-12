import { z } from 'zod';

export const localeSchema = z.enum(['zh-TW', 'zh-CN', 'en']);
export const defaultWorkspacePageSchema = z.enum(['diaries', 'timeline', 'calendar']);
export const timezoneSchema = z.string().trim().normalize('NFKC').min(1).max(50).refine(value => {
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; }
  catch { return false; }
}, 'Invalid timezone');

// Match numeric(15,2) rounding without converting an exact decimal string to a float.
const preferenceMoneySchema = z.union([z.string(), z.number().finite()]).transform((value, ctx) => {
  const input = String(value).trim();
  const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(input);
  const exponent = Number(match?.[4] ?? 0);
  if (!match || !(match[2] || match[3]) || input.length > 150 || Math.abs(exponent) > 100) {
    ctx.addIssue({ code: 'custom', message: 'Enter a finite decimal amount' }); return z.NEVER;
  }
  const digits = (match[2] ?? '') + (match[3] ?? '');
  const point = (match[2]?.length ?? 0) + exponent;
  const expanded = point < 0 ? '0'.repeat(-point) + digits : digits;
  const split = Math.max(0, point);
  const whole = (expanded.slice(0, split) + '0'.repeat(Math.max(0, split - expanded.length))) || '0';
  const fraction = expanded.slice(split).padEnd(3, '0');
  let cents = BigInt(whole) * 100n + BigInt(fraction.slice(0, 2));
  if (Number(fraction[2]) >= 5) cents++;
  if (cents > 999999999999999n) {
    ctx.addIssue({ code: 'custom', message: 'Amount exceeds numeric(15,2)' }); return z.NEVER;
  }
  return `${match[1] === '-' && cents !== 0n ? '-' : ''}${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
});

export const updateUserSettingsSchema = z.object({
  name: z.string().trim().normalize('NFKC').max(100).nullable().optional()
    .transform(value => value === '' ? null : value),
  expectedMonthlyTrades: z.coerce.number().int().min(0).max(2147483647).optional(),
  expectedProfit: preferenceMoneySchema.optional(),
  expectedAvgHolding: preferenceMoneySchema.optional(),
  timezone: timezoneSchema.optional(),
  locale: localeSchema.optional(),
  defaultWorkspacePage: defaultWorkspacePageSchema.optional(),
  excludeHolidaysInStats: z.boolean().optional(),
});
export const userSettingsSchema = z.object({
  name: z.string().nullable(),
  expectedMonthlyTrades: z.number().int().nonnegative(),
  expectedProfit: z.string(),
  expectedAvgHolding: z.string(),
  timezone: timezoneSchema,
  locale: localeSchema,
  defaultWorkspacePage: defaultWorkspacePageSchema,
  excludeHolidaysInStats: z.boolean(),
}).strict();
export const userSettingsResponseSchema = z.object({ success: z.literal(true), settings: userSettingsSchema }).strict();
export type UpdateUserSettings = z.output<typeof updateUserSettingsSchema>;
export type DefaultWorkspacePage = z.output<typeof defaultWorkspacePageSchema>;
