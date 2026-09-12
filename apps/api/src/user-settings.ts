import { userSettingsSchema, type UpdateUserSettings } from '@diary/contracts/settings';
import { users, type Database } from '@diary/db';
import { eq } from 'drizzle-orm';

function settings(row: typeof users.$inferSelect) {
  return userSettingsSchema.parse({
    name: row.name, expectedMonthlyTrades: row.expectedMonthlyTrades,
    expectedProfit: row.expectedProfit, expectedAvgHolding: row.expectedAvgHolding,
    timezone: row.timezone, locale: row.locale, defaultWorkspacePage: row.defaultWorkspacePage,
    excludeHolidaysInStats: row.excludeHolidaysInStats,
  });
}
export async function getUserSettings(db: Database, userId: bigint) {
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return row ? settings(row) : undefined;
}
export async function updateUserSettings(db: Database, userId: bigint, input: UpdateUserSettings, now = new Date()) {
  const [row] = await db.update(users).set({ ...input, updatedAt: now }).where(eq(users.id, userId)).returning();
  return row ? settings(row) : undefined;
}
