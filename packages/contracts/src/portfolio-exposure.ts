import { z } from 'zod'
import { calendarDateSchema, utcInstantSchema } from './common.js'
const percentage = z.number().finite().nonnegative()
export const betaBucketSchema = z.enum(['core_index', 'high_beta', 'mega_cap', 'single_stock', 'defensive', 'cash_proxy', 'unknown'])
export const portfolioExposureSchema = z.object({
  highBetaPct: percentage, coreIndexPct: percentage, megaCapPct: percentage, singleStockPct: percentage,
  defensivePct: percentage, cashProxyPct: percentage, unknownPct: percentage,
  largestTheme: betaBucketSchema.nullable(), concentrationWarning: z.boolean(), totalValue: z.number().finite().nonnegative(), skippedCount: z.number().int().nonnegative(),
}).strict()
export const suggestedAllocationSchema = z.object({ highBetaTargetPct: percentage, coreIndexTargetPct: percentage, cashTargetPct: percentage }).strict()
export const betaAllocationSchema = suggestedAllocationSchema.extend({
  suggestedMode: z.enum(['aggressive', 'balanced', 'defensive', 'capital_preservation', 'unknown']), suggestedBetaLevel: z.number().finite().nullable(), explanation: z.string(), warnings: z.array(z.string()),
}).strict()
export const exposureGapSchema = z.object({ bucket: z.enum(['highBeta', 'coreIndex', 'cash']), currentPct: percentage, targetPct: percentage, gapPct: z.number().finite(), status: z.enum(['underweight', 'balanced', 'overweight']) }).strict()
export const portfolioExposureResponseSchema = z.object({
  exposure: portfolioExposureSchema, gaps: z.array(exposureGapSchema).max(3), suggestedAllocation: suggestedAllocationSchema, betaAllocation: betaAllocationSchema,
  marketState: z.enum(['risk_on', 'neutral', 'defensive', 'risk_off', 'unknown']), lastUpdated: utcInstantSchema.nullable(),
  marketStateAsOfDate: calendarDateSchema.nullable(), summaryAsOfDate: calendarDateSchema.nullable(),
}).strict()
export type PortfolioExposureResponse = z.infer<typeof portfolioExposureResponseSchema>
