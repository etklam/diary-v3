import { z } from 'zod'
import { calendarDateSchema, serializedIdSchema, utcInstantSchema } from './common.js'

export const reviewOutcomeSchema = z.enum(['INTACT', 'PARTIAL', 'INVALIDATED', 'UNCLEAR'])
const reflection = z.string().max(10_000).nullable().optional()
export const structuredReviewInputSchema = z.object({
  reviewOutcome: reviewOutcomeSchema,
  reviewSummary: reflection,
  reviewLearning: reflection,
  reviewAdjustment: reflection,
}).strict().refine(value => [value.reviewSummary, value.reviewLearning, value.reviewAdjustment].some(text => Boolean(text?.trim())), {
  path: ['reviewSummary'], message: 'At least one meaningful reflection is required',
})
const decimal = z.string().regex(/^-?\d+(?:\.\d+)?$/)
const reviewTransactionSchema = z.object({
  id: serializedIdSchema, symbol: z.string(), type: z.enum(['BUY', 'SELL']),
  quantity: decimal, price: decimal, tradeDate: utcInstantSchema,
  notes: z.string().nullable(), strategy: z.string().nullable(), emotion: z.string().nullable(),
}).strict()
const reviewTradePlanSchema = z.object({
  id: serializedIdSchema, symbol: z.string(), setupType: z.string().nullable(),
  entryPrice: decimal.nullable(), entryZoneLow: decimal.nullable(), entryZoneHigh: decimal.nullable(),
  stopLoss: decimal.nullable(), targetPrice: decimal.nullable(), maxPositionSize: decimal.nullable(),
  invalidationCondition: z.string().nullable(), notes: z.string().nullable(),
  status: z.enum(['draft', 'active', 'closed', 'cancelled']),
}).strict()
export const diaryReviewResponseSchema = z.object({
  id: serializedIdSchema, title: z.string(), date: calendarDateSchema, content: z.string().nullable(), tags: z.array(z.string()),
  thesis: z.string().nullable(), risk: z.string().nullable(), execution: z.string().nullable(),
  reviewDueAt: utcInstantSchema.nullable(), reviewStatus: z.enum(['none', 'pending', 'reviewed']),
  reviewedAt: utcInstantSchema.nullable(), reviewOutcome: reviewOutcomeSchema.nullable(),
  reviewSummary: z.string().nullable(), reviewLearning: z.string().nullable(), reviewAdjustment: z.string().nullable(),
  transactions: z.array(reviewTransactionSchema), tradePlans: z.array(reviewTradePlanSchema),
}).strict()
export type StructuredReviewInput = z.infer<typeof structuredReviewInputSchema>
