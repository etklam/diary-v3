import { diaryActivityResponseSchema, type DiaryActivityDay } from '@diary/contracts/diary-activity'
import { type Database } from '@diary/db'
import { sql } from 'drizzle-orm'

/**
 * Per-day activity for the Calendar grid, in the account timezone. Diaries,
 * trades and completed reviews each contribute on their own date, so a trade
 * booked on a day without a diary still marks that day — the Calendar sends
 * those days to the merged timeline instead of to a diary.
 *
 * A day holds at most one diary (`diaries_user_date_key`), so `diaryId` stays
 * single-valued and is null exactly when the day's activity is trades and
 * reviews only.
 */
export async function diaryActivity(db: Database, userId: bigint, dateFrom: string, dateTo: string) {
  const result = await db.execute(sql`
    with context as (
      select timezone from users where id = ${userId}
    ), days as (
      select d.date as day, d.id as diary_id, 0 as transaction_count, 0 as review_count,
        (select count(*)::int from alerts a where a.diary_id = d.id and a.is_dismissed = false) as alert_count
      from diaries d
      where d.user_id = ${userId} and d.date between ${dateFrom}::date and ${dateTo}::date

      union all

      select (t.trade_date at time zone x.timezone)::date as day, null::bigint as diary_id,
        1 as transaction_count, 0 as review_count, 0 as alert_count
      from transactions t cross join context x
      where t.user_id = ${userId}
        and (t.trade_date at time zone x.timezone)::date between ${dateFrom}::date and ${dateTo}::date

      union all

      select (d.reviewed_at at time zone x.timezone)::date as day, null::bigint as diary_id,
        0 as transaction_count, 1 as review_count, 0 as alert_count
      from diaries d cross join context x
      where d.user_id = ${userId} and d.reviewed_at is not null
        and (d.reviewed_at at time zone x.timezone)::date between ${dateFrom}::date and ${dateTo}::date

      union all

      select (r.reviewed_at at time zone x.timezone)::date as day, null::bigint as diary_id,
        0 as transaction_count, 1 as review_count, 0 as alert_count
      from thesis_reviews r cross join context x
      where r.user_id = ${userId}
        and (r.reviewed_at at time zone x.timezone)::date between ${dateFrom}::date and ${dateTo}::date
    )
    select day::text as date, max(diary_id)::text as diary_id,
      sum(transaction_count)::int as transaction_count,
      sum(review_count)::int as review_count,
      sum(alert_count)::int as alert_count
    from days group by day order by day asc
  `)
  const data: DiaryActivityDay[] = (result.rows as Array<{
    date: string; diary_id: string | null
    transaction_count: number; review_count: number; alert_count: number
  }>).map(row => ({
    date: row.date,
    diaryId: row.diary_id,
    transactionCount: Number(row.transaction_count),
    reviewCount: Number(row.review_count),
    alertCount: Number(row.alert_count),
  }))
  return diaryActivityResponseSchema.parse({ data, dateFrom, dateTo })
}
