import { type ErrorCode } from '@diary/contracts'
import {
  ACTIVITY_GROUP_KINDS, ACTIVITY_KIND_RANK, activityEventSchema, activityTimelineQuerySchema,
  activityTimelineResponseSchema,
  type ActivityEvent, type ActivityEventKind, type ActivityTimelineQuery,
} from '@diary/contracts/activity-timeline'
import type { Database } from '@diary/db'
import { diaryExcerpt } from '@diary/domain'
import { sql } from 'drizzle-orm'
import type { Hono } from 'hono'
import type { z } from 'zod'
import type { AppEnv } from './app.js'
import { listDiaryStocks } from './diary-stocks.js'

/**
 * Merged account activity, newest first. Four branches contribute events and
 * each resolves its own calendar date in the account timezone, so a trade
 * booked after midnight local time lands on the day it happened rather than on
 * the day its diary was written.
 *
 * Private reflection text never leaves this function: the review branches
 * select an outcome and a timestamp and nothing else, matching the boundary
 * the diary-only feed already enforces.
 */
export async function listActivityTimeline(db: Database, userId: bigint, query: ActivityTimelineQuery) {
  const kinds = query.group ? ACTIVITY_GROUP_KINDS[query.group] : null
  const includes = (kind: ActivityEventKind) => (kinds === null || kinds.includes(kind) ? sql`true` : sql`false`)
  // Each branch filters on its own resolved local date, so the range means the
  // same thing for a diary, a trade and a review.
  const range = (expression: ReturnType<typeof sql>) => sql`${expression} between
    coalesce(${query.dateFrom ?? null}::date, '-infinity'::date)
    and coalesce(${query.dateTo ?? null}::date, 'infinity'::date)`
  const localDate = (column: ReturnType<typeof sql>) => sql`(${column} at time zone x.timezone)::date`
  // Inlined as literals so Postgres never has to infer a parameter type for a
  // bare select-list constant; the values stay owned by the shared contract.
  const rank = (kind: ActivityEventKind) => sql.raw(String(ACTIVITY_KIND_RANK[kind]))

  const result = await db.transaction(async tx => {
    const rows = await tx.execute(sql`
      with context as (
        select timezone from users where id = ${userId}
      ), events as (
        select d.date as event_date, ${rank('DIARY')} as kind_rank, d.id as source_id,
          jsonb_build_object(
            'kind','DIARY','id','DIARY:'||d.id::text,'diaryId',d.id::text,'date',d.date::text,
            'occurredAt',null,'title',d.title,
            -- Content is read to build the bounded excerpt and is replaced by it below.
            'excerpt',case when d.summary_excerpt is not null and d.summary_excerpt_content_hash is not null
              then d.summary_excerpt else null end,
            'contentForExcerpt',case when d.summary_excerpt is null or d.summary_excerpt_content_hash is null
              then d.content else null end,
            'tags',to_jsonb(d.tags[1:3]),'createdVia',d.created_via,
            'reviewStatus',d.review_status,'reviewOutcome',d.review_outcome,
            'transactionCount',(select count(*)::int from transactions t
              where t.diary_id = d.id and t.user_id = ${userId}),
            'alertCount',(select count(*)::int from alerts a
              where a.diary_id = d.id and a.is_dismissed = false)
          ) as item
        from diaries d cross join context x
        where ${includes('DIARY')} and d.user_id = ${userId} and ${range(sql`d.date`)}

        union all

        select ${localDate(sql`t.trade_date`)} as event_date, ${rank('TRADE')} as kind_rank,
          t.id as source_id,
          jsonb_build_object(
            'kind','TRADE','id','TRADE:'||t.id::text,'tradeId',t.id::text,
            'diaryId',t.diary_id::text,'diaryTitle',d.title,'diaryDate',d.date::text,
            'date',${localDate(sql`t.trade_date`)}::text,
            'occurredAt',t.trade_date,'symbol',t.symbol,'type',t.type,
            'quantity',t.quantity::text,'price',t.price::text,
            'strategy',t.strategy,'emotion',t.emotion,'notesForExcerpt',t.notes
          ) as item
        from transactions t cross join context x
          join diaries d on d.id = t.diary_id and d.user_id = t.user_id
        where ${includes('TRADE')} and t.user_id = ${userId} and ${range(localDate(sql`t.trade_date`))}

        union all

        select ${localDate(sql`d.reviewed_at`)} as event_date, ${rank('REVIEW')} as kind_rank,
          d.id as source_id,
          jsonb_build_object(
            'kind','REVIEW','id','REVIEW:'||d.id::text,'diaryId',d.id::text,
            'date',${localDate(sql`d.reviewed_at`)}::text,'occurredAt',d.reviewed_at,
            'title',d.title,'diaryDate',d.date::text,'outcome',d.review_outcome
          ) as item
        from diaries d cross join context x
        where ${includes('REVIEW')} and d.user_id = ${userId} and d.reviewed_at is not null
          and ${range(localDate(sql`d.reviewed_at`))}

        union all

        select ${localDate(sql`r.reviewed_at`)} as event_date, ${rank('THESIS_REVIEW')} as kind_rank,
          r.id as source_id,
          jsonb_build_object(
            'kind','THESIS_REVIEW','id','THESIS_REVIEW:'||r.id::text,'thesisId',r.thesis_id::text,
            'date',${localDate(sql`r.reviewed_at`)}::text,'occurredAt',r.reviewed_at,
            'symbol',s.symbol,'outcome',r.outcome,'portfolioDecision',r.portfolio_decision,
            'invalidationTriggered',r.invalidation_triggered
          ) as item
        from thesis_reviews r cross join context x
          join investment_theses th on th.id = r.thesis_id and th.user_id = r.user_id
          join stocks s on s.id = th.stock_id
        where ${includes('THESIS_REVIEW')} and r.user_id = ${userId}
          and ${range(localDate(sql`r.reviewed_at`))}
      ), total as (
        select count(*)::int as count from events
      )
      select total.count as total, page_items.item as item
      from total left join lateral (
        select item, event_date, kind_rank, source_id from events
        order by event_date desc, kind_rank asc, source_id desc
        limit ${query.limit} offset ${(query.page - 1) * query.limit}
      ) page_items on true
      order by page_items.event_date desc, page_items.kind_rank asc, page_items.source_id desc
    `)
    return rows.rows as Array<{ total: number; item: Record<string, unknown> | null }>
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' })

  const total = Number(result[0]?.total ?? 0)
  const items = result.map(row => row.item).filter((item): item is Record<string, unknown> => item !== null)

  // Company chips are resolved for the page slice only: one batched query over
  // the visible diary and review rows, never one query per candidate event.
  const diaryIds = items
    .filter(item => item.kind === 'DIARY' || item.kind === 'REVIEW')
    .map(item => BigInt(String(item.diaryId)))
  const symbolsByDiary = new Map<bigint, string[]>()
  for (const stock of await listDiaryStocks(db, userId, diaryIds)) {
    const symbols = symbolsByDiary.get(stock.diaryId) ?? []
    if (symbols.length < 10) symbols.push(stock.symbol)
    symbolsByDiary.set(stock.diaryId, symbols)
  }

  const data: ActivityEvent[] = items.map(item => {
    if (typeof item.occurredAt === 'string') item.occurredAt = new Date(item.occurredAt).toISOString()
    if (item.kind === 'DIARY') {
      const content = item.contentForExcerpt
      delete item.contentForExcerpt
      item.excerpt = content === null || content === undefined
        ? item.excerpt ?? ''
        : diaryExcerpt(String(content), 240)
      item.stockSymbols = symbolsByDiary.get(BigInt(String(item.diaryId))) ?? []
    }
    if (item.kind === 'REVIEW') item.stockSymbols = symbolsByDiary.get(BigInt(String(item.diaryId))) ?? []
    if (item.kind === 'TRADE') {
      const notes = item.notesForExcerpt
      delete item.notesForExcerpt
      // Trade notes are the author's own writing, bounded the same way a diary
      // excerpt is so one long note cannot dominate the feed.
      item.notesExcerpt = typeof notes === 'string' && notes.trim() !== '' ? diaryExcerpt(notes, 240) : null
    }
    // Runtime response validation is the authority for every event kind.
    return activityEventSchema.parse(item)
  })

  return {
    data,
    pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
  }
}

export function registerActivityTimelineRoute(app: Hono<AppEnv>, dependencies: {
  db: Database
  fail: (status: number, code: ErrorCode, message: string) => never
  validationError: (error: z.ZodError) => never
}) {
  const { db, fail, validationError } = dependencies
  app.get('/api/timeline', async c => {
    const user = c.get('user')
    if (!user) return fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    const parsed = activityTimelineQuerySchema.safeParse(c.req.query())
    if (!parsed.success) return validationError(parsed.error)
    return c.json(activityTimelineResponseSchema.parse(await listActivityTimeline(db, BigInt(user.id), parsed.data)))
  })
}
