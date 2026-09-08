import { type ErrorCode } from '@diary/contracts'
import { reviewBucketCountsSchema, reviewGroupsResponseSchema, reviewQueueQuerySchema, type ReviewGroups } from '@diary/contracts/review-queue'
import type { Database } from '@diary/db'
import { listDiaryStocks } from './diary-stocks.js'
import { sql } from 'drizzle-orm'
import type { Hono } from 'hono'
import type { z } from 'zod'
import type { AppEnv } from './app.js'

export function registerReviewQueueRoute(app: Hono<AppEnv>, dependencies: {
  db: Database; now: () => Date
  fail: (status: number, code: ErrorCode, message: string) => never
  validationError: (error: z.ZodError) => never
}) {
  const { db, now, fail, validationError } = dependencies
  app.get('/api/reviews', async c => {
    c.header('Cache-Control', 'no-store')
    const user = c.get('user'); if (!user) return fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    const parsed = reviewQueueQuerySchema.safeParse(c.req.query()); if (!parsed.success) return validationError(parsed.error)
    const { page, limit, target } = parsed.data, userId = BigInt(user.id), timestamp = now().toISOString()
    // One SQL snapshot. Local midnight boundaries are calculated before converting
    // to UTC, so DST days naturally span 23/25 hours rather than a fixed duration.
    // The optional target filter narrows entries before ranking, so positions,
    // page slices and counts all describe the same selection.
    const targetPredicate = target === undefined ? sql`true` : sql`target_order = ${target === 'diary' ? 0 : 1}`
    const result = await db.execute(sql`
      with context as (
        select date_trunc('day', ${timestamp}::timestamptz at time zone timezone) at time zone timezone as start,
          (date_trunc('day', ${timestamp}::timestamptz at time zone timezone) + interval '1 day') at time zone timezone as finish
        from users where id = ${userId}
      ), diary_candidates as (
        select d.* from diaries d where d.user_id = ${userId} and d.review_status <> 'reviewed'
        union all
        (select d.* from diaries d where d.user_id = ${userId} and d.review_status = 'reviewed' order by d.reviewed_at desc nulls last, d.id desc limit 50)
      ), thesis_candidates as (
        select t.*, s.symbol from investment_theses t join stocks s on s.id = t.stock_id
        where t.user_id = ${userId} and t.status = 'ACTIVE'
        order by t.review_due_at asc nulls first, t.updated_at desc, t.id desc limit 100
      ), entries as (
        select case when d.review_status = 'reviewed' then 'completed'
          when d.review_due_at is null and d.review_status = 'pending' then 'unscheduled'
          when d.review_due_at < x.start then 'overdue'
          when d.review_due_at < x.finish then 'today'
          when d.review_due_at >= x.finish then 'upcoming' end as bucket,
          coalesce(d.review_due_at, d.reviewed_at, d.date::timestamp at time zone 'UTC') as sort_time,
          0 as target_order, d.id as numeric_id,
          jsonb_build_object('targetType','diary','id',d.id::text,'title',d.title,'date',d.date::text,
            'thesis',d.thesis,'risk',d.risk,'reviewDueAt',d.review_due_at,'reviewStatus',d.review_status,
            'reviewedAt',d.reviewed_at,'reviewOutcome',d.review_outcome) as item
        from diary_candidates d cross join context x
        union all
        select case when coalesce(r.reviewed_at,t.last_reviewed_at) is not null and
            (t.review_due_at is null or coalesce(r.reviewed_at,t.last_reviewed_at) >= t.review_due_at) then 'completed'
          when t.review_due_at is null then 'unscheduled'
          when t.review_due_at < x.start then 'overdue'
          when t.review_due_at < x.finish then 'today' else 'upcoming' end as bucket,
          coalesce(t.review_due_at,r.reviewed_at,t.last_reviewed_at,${timestamp}::timestamptz) as sort_time,
          1 as target_order,t.id as numeric_id,
          jsonb_build_object('targetType','thesis','id','thesis:'||t.id::text,'thesisId',t.id::text,
            'title',t.symbol||' Investment Thesis','date',coalesce(r.reviewed_at,t.review_due_at,${timestamp}::timestamptz),
            'thesis',t.summary,'risk',null,'reviewDueAt',t.review_due_at,
            'reviewStatus',case when coalesce(r.reviewed_at,t.last_reviewed_at) is not null and
              (t.review_due_at is null or coalesce(r.reviewed_at,t.last_reviewed_at) >= t.review_due_at) then 'reviewed'
              when t.review_due_at is not null then 'pending' else 'none' end,
            'reviewedAt',coalesce(r.reviewed_at,t.last_reviewed_at),'reviewOutcome',r.outcome,
            'symbol',t.symbol,'thesisStatus',t.status,'latestReviewOutcome',t.latest_review_outcome,'portfolioDecision',r.portfolio_decision) as item
        from thesis_candidates t cross join context x left join lateral (
          select reviewed_at,outcome,portfolio_decision from thesis_reviews
          where thesis_id=t.id and user_id=${userId} order by reviewed_at desc,id desc limit 1
        ) r on true
      ), ranked as (
        select bucket,item,row_number() over(partition by bucket order by sort_time asc,target_order asc,numeric_id asc) as position
        from entries where bucket is not null and ${targetPredicate}
      ), bucket_counts as (
        select bucket,count(*)::int as total from entries where bucket is not null and ${targetPredicate} group by bucket
      ) select coalesce((select jsonb_object_agg(bucket,total) from bucket_counts),'{}'::jsonb) as counts,
        page_items.bucket as bucket, page_items.item as item
      from bucket_counts left join lateral (
        select ranked.bucket,ranked.position,ranked.item from ranked
        where ranked.bucket = bucket_counts.bucket and ranked.position > ${(page - 1) * limit} and ranked.position <= ${page * limit}
        order by ranked.position
      ) page_items on true order by page_items.position nulls last
    `)
    const counts = { overdue: 0, today: 0, upcoming: 0, unscheduled: 0, completed: 0 }
    for (const row of result.rows) {
      if (row.counts) for (const [bucket, total] of Object.entries(row.counts as Record<string, unknown>)) {
        if (!Object.hasOwn(counts, bucket)) throw new Error('Invalid review bucket')
        counts[bucket as keyof typeof counts] = Number(total)
      }
    }
    const groups: ReviewGroups = { counts: reviewBucketCountsSchema.parse(counts), unscheduled: [], overdue: [], today: [], upcoming: [], completed: [] }
    // Stock chips are resolved only for the page slice: one batched query for
    // the visible diary rows, never per candidate row.
    const rows = result.rows.filter(row => row.bucket && row.item)
    const diaryIds = rows.filter(row => (row.item as { targetType?: string }).targetType === 'diary')
      .map(row => BigInt((row.item as { id: string }).id))
    const symbolsByDiary = new Map<bigint, string[]>()
    for (const stock of await listDiaryStocks(db, userId, diaryIds)) {
      const symbols = symbolsByDiary.get(stock.diaryId) ?? []
      if (symbols.length < 3) symbols.push(stock.symbol)
      symbolsByDiary.set(stock.diaryId, symbols)
    }
    for (const row of rows) {
      const group = groups[String(row.bucket) as Exclude<keyof ReviewGroups, 'counts'>]
      if (!group) throw new Error('Invalid review bucket')
      const item = row.item as Record<string, unknown>
      for (const field of ['reviewDueAt', 'reviewedAt', ...(item.targetType === 'thesis' ? ['date'] : [])]) {
        if (typeof item[field] === 'string') item[field] = new Date(item[field]).toISOString()
      }
      if (item.targetType === 'diary') item.stockSymbols = symbolsByDiary.get(BigInt(String(item.id))) ?? []
      // Runtime response validation is the authority for both target types.
      group.push(reviewGroupsResponseSchema.shape.overdue.element.parse(item))
    }
    return c.json(reviewGroupsResponseSchema.parse(groups))
  })
}
