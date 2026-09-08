import { z } from 'zod'
import { serializedIdSchema, calendarDateSchema, utcInstantSchema } from './common.js'
const REVIEW_STATUSES = ['none', 'pending', 'reviewed'] as const
const REVIEW_OUTCOMES = ['INTACT', 'PARTIAL', 'INVALIDATED', 'UNCLEAR'] as const
const diaryQueueItemSchema = z.object({
  targetType: z.literal('diary'),
  id: serializedIdSchema,
  title: z.string(),
  date: calendarDateSchema,
  thesis: z.string().nullable(),
  risk: z.string().nullable(),
  reviewDueAt: utcInstantSchema.nullable(),
  reviewStatus: z.enum(REVIEW_STATUSES),
  reviewedAt: utcInstantSchema.nullable(),
  reviewOutcome: z.enum(REVIEW_OUTCOMES).nullable(),
  // First linked company symbols for the page slice only, capped at three.
  stockSymbols: z.array(z.string()).max(3),
}).strict()

const thesisQueueItemSchema = z.object({
  targetType: z.literal('thesis'),
  id: z.string().regex(/^thesis:[1-9]\d*$/),
  thesisId: serializedIdSchema,
  title: z.string(),
  date: utcInstantSchema,
  thesis: z.string().nullable(),
  risk: z.null(),
  reviewDueAt: utcInstantSchema.nullable(),
  reviewStatus: z.enum(REVIEW_STATUSES),
  reviewedAt: utcInstantSchema.nullable(),
  reviewOutcome: z.string().nullable(),
  symbol: z.string().nullable(),
  thesisStatus: z.string().nullable(),
  latestReviewOutcome: z.string().nullable(),
  portfolioDecision: z.string().nullable(),
}).strict()

export const reviewQueueItemSchema = z.discriminatedUnion('targetType', [diaryQueueItemSchema, thesisQueueItemSchema])
// Absolute totals per bucket across every page, counted server-side in the
// account timezone. Navigation summary only — never a quality score.
export const reviewBucketCountsSchema = z.object({
  overdue: z.number().int().min(0),
  today: z.number().int().min(0),
  upcoming: z.number().int().min(0),
  unscheduled: z.number().int().min(0),
  completed: z.number().int().min(0),
}).strict()
export const reviewGroupsResponseSchema = z.object({
  counts: reviewBucketCountsSchema,
  unscheduled: z.array(reviewQueueItemSchema),
  overdue: z.array(reviewQueueItemSchema),
  today: z.array(reviewQueueItemSchema),
  upcoming: z.array(reviewQueueItemSchema),
  completed: z.array(reviewQueueItemSchema),
}).strict()

export type ReviewItem = z.infer<typeof reviewQueueItemSchema>
export type ReviewBucketCounts = z.infer<typeof reviewBucketCountsSchema>
export type ReviewGroups = z.infer<typeof reviewGroupsResponseSchema>

export const reviewQueueQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  // Optional focus filter; pagination and counts stay scoped to the selection.
  target: z.enum(['diary', 'thesis']).optional(),
}).strict()
