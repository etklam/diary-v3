import { z } from 'zod'
import { calendarDateSchema, serializedIdSchema, utcInstantSchema } from './common.js'
import { canonicalDecimal } from './ledger.js'

/**
 * Account-level merged reading feed. The Diary library and Calendar stay
 * diary-anchored; this feed is the one place where a trade or a completed
 * review holds its own position in time, because each carries its own
 * timestamp independent of the diary it belongs to:
 *
 *   DIARY          diaries.date          (author-chosen calendar date)
 *   TRADE          transactions.trade_date
 *   REVIEW         diaries.reviewed_at
 *   THESIS_REVIEW  thesis_reviews.reviewed_at
 *
 * Every private reflection field stays out of the payload by construction, the
 * same boundary projectTimelineEntry established for the diary-only feed: a
 * review contributes its outcome and its position, never its text.
 */
export const ACTIVITY_EVENT_KINDS = ['DIARY', 'TRADE', 'REVIEW', 'THESIS_REVIEW'] as const
export type ActivityEventKind = typeof ACTIVITY_EVENT_KINDS[number]
export const activityEventKindSchema = z.enum(ACTIVITY_EVENT_KINDS)

/** Reading filter the timeline offers; `review` spans both review kinds. */
export const ACTIVITY_EVENT_GROUPS = ['diary', 'trade', 'review'] as const
export type ActivityEventGroup = typeof ACTIVITY_EVENT_GROUPS[number]
export const activityEventGroupSchema = z.enum(ACTIVITY_EVENT_GROUPS)
export const ACTIVITY_GROUP_KINDS: Record<ActivityEventGroup, readonly ActivityEventKind[]> = {
  diary: ['DIARY'],
  trade: ['TRADE'],
  review: ['REVIEW', 'THESIS_REVIEW'],
}

/**
 * Within one calendar date the feed reads in the order the work happens: the
 * diary that frames the day, the trades it produced, then the reviews that
 * closed earlier judgments. Server ordering and client regrouping share this
 * rank so a page boundary can never reshuffle a day.
 */
export const ACTIVITY_KIND_RANK: Record<ActivityEventKind, number> = {
  DIARY: 1, TRADE: 2, REVIEW: 3, THESIS_REVIEW: 4,
}

const REVIEW_OUTCOMES = ['INTACT', 'PARTIAL', 'INVALIDATED', 'UNCLEAR'] as const
const PORTFOLIO_DECISIONS = ['HOLD', 'ADD', 'REDUCE', 'EXIT', 'CONTINUE_WATCHING'] as const
const DECIMAL_STRING = /^\d+(?:\.\d+)?$/

/** `<KIND>:<source row id>`; unique across kinds so page merges can deduplicate. */
function eventId(kind: ActivityEventKind) {
  return z.string().regex(new RegExp(`^${kind}:[1-9]\\d*$`), `Event id must be ${kind}:<id>`)
}

const diaryEventSchema = z.object({
  kind: z.literal('DIARY'),
  id: eventId('DIARY'),
  diaryId: serializedIdSchema,
  date: calendarDateSchema,
  // A diary carries an author-chosen date and no time of day.
  occurredAt: z.null(),
  title: z.string(),
  excerpt: z.string().max(241),
  tags: z.array(z.string()).max(3),
  stockSymbols: z.array(z.string()).max(10),
  createdVia: z.enum(['WEB', 'API_KEY', 'TELEGRAM_BOT']),
  reviewStatus: z.enum(['none', 'pending', 'reviewed']),
  reviewOutcome: z.enum(REVIEW_OUTCOMES).nullable(),
  transactionCount: z.number().int().nonnegative(),
  alertCount: z.number().int().nonnegative(),
}).strict()

const tradeEventSchema = z.object({
  kind: z.literal('TRADE'),
  id: eventId('TRADE'),
  tradeId: serializedIdSchema,
  // Every trade belongs to a diary, but its trade date can fall on another day.
  diaryId: serializedIdSchema,
  diaryTitle: z.string(),
  diaryDate: calendarDateSchema,
  date: calendarDateSchema,
  occurredAt: utcInstantSchema,
  symbol: z.string(),
  type: z.enum(['BUY', 'SELL']),
  // Canonicalized exactly as the ledger response does, so the same trade reads
  // identically here and on the diary it belongs to.
  quantity: z.string().regex(DECIMAL_STRING).transform(canonicalDecimal),
  price: z.string().regex(DECIMAL_STRING).transform(canonicalDecimal),
  strategy: z.string().nullable(),
  emotion: z.string().nullable(),
  notesExcerpt: z.string().max(241).nullable(),
}).strict()

const reviewEventSchema = z.object({
  kind: z.literal('REVIEW'),
  id: eventId('REVIEW'),
  diaryId: serializedIdSchema,
  date: calendarDateSchema,
  occurredAt: utcInstantSchema,
  title: z.string(),
  // The day the reviewed judgment was originally written.
  diaryDate: calendarDateSchema,
  outcome: z.enum(REVIEW_OUTCOMES).nullable(),
  stockSymbols: z.array(z.string()).max(10),
}).strict()

const thesisReviewEventSchema = z.object({
  kind: z.literal('THESIS_REVIEW'),
  id: eventId('THESIS_REVIEW'),
  thesisId: serializedIdSchema,
  date: calendarDateSchema,
  occurredAt: utcInstantSchema,
  symbol: z.string(),
  outcome: z.enum(REVIEW_OUTCOMES),
  portfolioDecision: z.enum(PORTFOLIO_DECISIONS),
  invalidationTriggered: z.boolean(),
}).strict()

export const activityEventSchema = z.discriminatedUnion('kind', [
  diaryEventSchema, tradeEventSchema, reviewEventSchema, thesisReviewEventSchema,
])

export const activityTimelineQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  dateFrom: calendarDateSchema.optional(),
  dateTo: calendarDateSchema.optional(),
  group: activityEventGroupSchema.optional(),
}).strict().refine(query => !query.dateFrom || !query.dateTo || query.dateFrom <= query.dateTo, {
  path: ['dateTo'], message: 'dateTo must be on or after dateFrom',
})

export const activityTimelineResponseSchema = z.object({
  data: z.array(activityEventSchema),
  pagination: z.object({
    page: z.number().int().min(1),
    limit: z.number().int().min(1).max(100),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }).strict(),
}).strict()

export type ActivityEvent = z.infer<typeof activityEventSchema>
export type DiaryActivityEvent = z.infer<typeof diaryEventSchema>
export type TradeActivityEvent = z.infer<typeof tradeEventSchema>
export type ReviewActivityEvent = z.infer<typeof reviewEventSchema>
export type ThesisReviewActivityEvent = z.infer<typeof thesisReviewEventSchema>
export type ActivityTimelineQuery = z.infer<typeof activityTimelineQuerySchema>
export type ActivityTimelineResponse = z.infer<typeof activityTimelineResponseSchema>
