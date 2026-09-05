import { z } from 'zod'
import { serializedIdSchema, utcInstantSchema } from './common.js'
import { stockSymbolSchema } from './watchlist.js'

export const PORTFOLIO_ATTENTION_REASONS = [
  'invalidated_thesis_while_held',
  'overdue_thesis_review',
  'overdue_diary_review',
  'position_concentration',
  'missing_thesis',
] as const

export const portfolioAttentionReasonSchema = z.enum(PORTFOLIO_ATTENTION_REASONS)
export const portfolioAttentionTargetKindSchema = z.enum(['stock', 'diary'])

const portfolioAttentionEvidenceSchema = z.object({
  concentrationPct: z.number().finite().nullable().optional(),
  reviewDueAt: utcInstantSchema.nullable().optional(),
  latestOutcome: z.string().trim().min(1).max(64).nullable().optional(),
  title: z.string().max(280).optional(),
}).strict()

const stockAttentionItemSchema = z.object({
  id: z.string().trim().min(1).max(256),
  reason: portfolioAttentionReasonSchema,
  targetKind: z.literal('stock'),
  targetId: stockSymbolSchema,
  symbol: stockSymbolSchema,
  priority: z.number().int().nonnegative(),
  action: z.string().trim().min(1).max(1_024),
  evidence: portfolioAttentionEvidenceSchema,
  asOf: utcInstantSchema,
}).strict()

const diaryAttentionItemSchema = z.object({
  id: z.string().trim().min(1).max(256),
  reason: portfolioAttentionReasonSchema,
  targetKind: z.literal('diary'),
  targetId: serializedIdSchema,
  symbol: stockSymbolSchema.nullable(),
  priority: z.number().int().nonnegative(),
  action: z.string().trim().min(1).max(1_024),
  evidence: portfolioAttentionEvidenceSchema,
  asOf: utcInstantSchema,
}).strict()

export const portfolioAttentionItemSchema = z.discriminatedUnion('targetKind', [
  stockAttentionItemSchema,
  diaryAttentionItemSchema,
])

export const portfolioAttentionQuerySchema = z.object({}).strict()

export const portfolioAttentionResponseSchema = z.object({
  items: z.array(portfolioAttentionItemSchema).max(50),
  asOf: utcInstantSchema,
  coverage: z.object({
    valuationStatus: z.enum(['empty', 'complete', 'partial', 'unavailable']),
    complete: z.boolean(),
    priced: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }).strict(),
}).strict()

export type PortfolioAttentionReason = z.infer<typeof portfolioAttentionReasonSchema>
export type PortfolioAttentionItem = z.infer<typeof portfolioAttentionItemSchema>
export type PortfolioAttentionQuery = z.infer<typeof portfolioAttentionQuerySchema>
export type PortfolioAttentionResponse = z.infer<typeof portfolioAttentionResponseSchema>

export const portfolioAttentionListResponseSchema = portfolioAttentionResponseSchema

export function toPortfolioAttentionResponse(value: unknown): PortfolioAttentionResponse {
  return portfolioAttentionResponseSchema.parse(value)
}
