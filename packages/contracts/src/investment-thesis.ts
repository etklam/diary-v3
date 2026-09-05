import { z } from 'zod'
import { serializedIdSchema, utcInstantSchema } from './common.js'
import { stockSymbolSchema } from './watchlist.js'

export const INVESTMENT_THESIS_STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const
export const THESIS_REVIEW_OUTCOMES = ['INTACT', 'PARTIAL', 'INVALIDATED', 'UNCLEAR'] as const
export const THESIS_PORTFOLIO_DECISIONS = ['HOLD', 'ADD', 'REDUCE', 'EXIT', 'CONTINUE_WATCHING'] as const
export const INVESTMENT_THESIS_HEALTH = ['draft', 'healthy', 'needs_review', 'invalidated', 'archived'] as const

export const investmentThesisStatusSchema = z.enum(INVESTMENT_THESIS_STATUSES)
export const thesisReviewOutcomeSchema = z.enum(THESIS_REVIEW_OUTCOMES)
export const thesisPortfolioDecisionSchema = z.enum(THESIS_PORTFOLIO_DECISIONS)
export const investmentThesisHealthSchema = z.enum(INVESTMENT_THESIS_HEALTH)

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional()

export const investmentThesisDraftSchema = z.object({
  summary: optionalText(10_000),
  whyIOwnIt: optionalText(20_000),
  growthDrivers: optionalText(20_000),
  risks: optionalText(20_000),
  invalidationConditions: optionalText(20_000),
  expectedHoldingPeriod: optionalText(255),
  reviewDueAt: utcInstantSchema.nullable().optional(),
}).strict()

/**
 * PUT /api/stocks/:symbol/thesis. This is a full-replacement payload: omitted
 * draft fields are cleared by the application service. Keeping the fields
 * optional preserves the existing Web form while making the accepted wire
 * shape explicit and reject-unknown by default.
 */
export const saveInvestmentThesisRequestSchema = investmentThesisDraftSchema.extend({
  status: investmentThesisStatusSchema.optional(),
}).strict().superRefine((value, context) => {
  if (value.status !== 'ACTIVE') return
  if (!value.summary?.trim()) {
    context.addIssue({ code: 'custom', path: ['summary'], message: 'Summary is required to activate a Thesis' })
  }
  if (!value.whyIOwnIt?.trim()) {
    context.addIssue({ code: 'custom', path: ['whyIOwnIt'], message: 'Why I own it is required to activate a Thesis' })
  }
})

export const completeThesisReviewRequestSchema = z.object({
  outcome: thesisReviewOutcomeSchema,
  portfolioDecision: thesisPortfolioDecisionSchema,
  whatImproved: optionalText(20_000),
  whatDeteriorated: optionalText(20_000),
  whatChanged: optionalText(20_000),
  invalidationTriggered: z.boolean().optional(),
}).strict().superRefine((value, context) => {
  if ([value.whatImproved, value.whatDeteriorated, value.whatChanged].some(text => Boolean(text?.trim()))) return
  context.addIssue({ code: 'custom', path: ['whatChanged'], message: 'At least one meaningful reflection is required' })
})

const thesisSnapshotSchema = z.object({
  status: investmentThesisStatusSchema,
  summary: z.string().nullable(),
  whyIOwnIt: z.string().nullable(),
  growthDrivers: z.string().nullable(),
  risks: z.string().nullable(),
  invalidationConditions: z.string().nullable(),
  expectedHoldingPeriod: z.string().nullable(),
  reviewDueAt: utcInstantSchema.nullable(),
}).strict()

export const currentInvestmentThesisSchema = z.object({
  id: serializedIdSchema,
  userId: serializedIdSchema,
  stockId: serializedIdSchema,
  symbol: stockSymbolSchema,
  status: investmentThesisStatusSchema,
  health: investmentThesisHealthSchema,
  summary: z.string().nullable(),
  whyIOwnIt: z.string().nullable(),
  growthDrivers: z.string().nullable(),
  risks: z.string().nullable(),
  invalidationConditions: z.string().nullable(),
  expectedHoldingPeriod: z.string().nullable(),
  reviewDueAt: utcInstantSchema.nullable(),
  lastReviewedAt: utcInstantSchema.nullable(),
  latestReviewOutcome: thesisReviewOutcomeSchema.nullable(),
  activatedAt: utcInstantSchema.nullable(),
  archivedAt: utcInstantSchema.nullable(),
  createdAt: utcInstantSchema,
  updatedAt: utcInstantSchema,
}).strict()

export const thesisReviewRecordSchema = z.object({
  id: serializedIdSchema,
  thesisId: serializedIdSchema,
  userId: serializedIdSchema,
  reviewedAt: utcInstantSchema,
  outcome: thesisReviewOutcomeSchema,
  portfolioDecision: thesisPortfolioDecisionSchema,
  whatImproved: z.string().nullable(),
  whatDeteriorated: z.string().nullable(),
  whatChanged: z.string().nullable(),
  invalidationTriggered: z.boolean(),
  snapshot: thesisSnapshotSchema,
  createdAt: utcInstantSchema,
}).strict()

/**
 * Review history is intentionally bounded in v1. The Company Hub and thesis
 * page both need recent context, not an unbounded export endpoint.
 */
export const THESIS_REVIEW_MAX_ITEMS = 100

export const investmentThesisResponseSchema = z.object({
  thesis: currentInvestmentThesisSchema.nullable(),
  reviews: z.array(thesisReviewRecordSchema).max(THESIS_REVIEW_MAX_ITEMS),
}).strict()

export const investmentThesisMutationResponseSchema = z.object({
  thesis: currentInvestmentThesisSchema,
}).strict()

export const thesisReviewResponseSchema = z.object({
  thesis: currentInvestmentThesisSchema,
  review: thesisReviewRecordSchema,
}).strict()

export const thesisReviewListParamsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(THESIS_REVIEW_MAX_ITEMS).default(20),
}).strict()

export type InvestmentThesisStatus = z.infer<typeof investmentThesisStatusSchema>
export type ThesisReviewOutcome = z.infer<typeof thesisReviewOutcomeSchema>
export type ThesisPortfolioDecision = z.infer<typeof thesisPortfolioDecisionSchema>
export type InvestmentThesisHealth = z.infer<typeof investmentThesisHealthSchema>
export type InvestmentThesisDraft = z.infer<typeof investmentThesisDraftSchema>
export type SaveInvestmentThesisRequest = z.infer<typeof saveInvestmentThesisRequestSchema>
export type CompleteThesisReviewInput = z.infer<typeof completeThesisReviewRequestSchema>
export type CurrentInvestmentThesis = z.infer<typeof currentInvestmentThesisSchema>
export type ThesisReviewRecord = z.infer<typeof thesisReviewRecordSchema>
export type InvestmentThesisResponse = z.infer<typeof investmentThesisResponseSchema>
export type InvestmentThesisMutationResponse = z.infer<typeof investmentThesisMutationResponseSchema>
export type ThesisReviewResponse = z.infer<typeof thesisReviewResponseSchema>
