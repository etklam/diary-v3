import { alerts, diaries, transactions, type Database } from '@diary/db'
import { and, asc, eq, gte, lte, sql } from 'drizzle-orm'

export async function diaryActivity(db: Database, userId: bigint, dateFrom: string, dateTo: string) {
  const rows = await db.select({
    date: diaries.date,
    diaryId: diaries.id,
    transactionCount: sql<number>`count(${transactions.id})::integer`,
    // A correlated aggregate keeps multiple alerts from multiplying trades.
    alertCount: sql<number>`(select count(*)::integer from ${alerts}
      where ${alerts.diaryId} = ${diaries.id} and ${alerts.isDismissed} = false)`,
  }).from(diaries).leftJoin(transactions, and(
    eq(transactions.diaryId, diaries.id), eq(transactions.userId, diaries.userId),
  )).where(and(eq(diaries.userId, userId), gte(diaries.date, dateFrom), lte(diaries.date, dateTo)))
    .groupBy(diaries.id, diaries.date).orderBy(asc(diaries.date), asc(diaries.id))
  return {
    data: rows.map(row => ({
      date: row.date, diaryId: row.diaryId.toString(), transactionCount: row.transactionCount,
      alertCount: row.alertCount,
    })),
    dateFrom, dateTo,
  }
}
