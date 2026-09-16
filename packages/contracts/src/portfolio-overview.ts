import { z } from 'zod'
import { portfolioAttentionResponseSchema } from './portfolio-attention.js'
import { portfolioValuationResponseSchema } from './portfolio.js'

export const portfolioOverviewErrorSchema = z.object({
  code: z.literal('SYS_INTERNAL_ERROR'),
  requestId: z.string().min(1),
}).strict()

export function portfolioOverviewSectionSchema<T extends z.ZodType>(data: T) {
  return z.discriminatedUnion('status', [
    z.object({ status: z.literal('ready'), data }).strict(),
    z.object({ status: z.literal('failed'), error: portfolioOverviewErrorSchema }).strict(),
  ])
}

export const portfolioOverviewResponseSchema = z.object({
  attention: portfolioOverviewSectionSchema(portfolioAttentionResponseSchema),
  valuation: portfolioOverviewSectionSchema(portfolioValuationResponseSchema),
}).strict()

export type PortfolioOverviewError = z.infer<typeof portfolioOverviewErrorSchema>
export type PortfolioOverviewSection<T> =
  | { status: 'ready'; data: T }
  | { status: 'failed'; error: PortfolioOverviewError }
export type PortfolioOverviewResponse = z.infer<typeof portfolioOverviewResponseSchema>
