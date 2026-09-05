import { z } from 'zod'
import { calendarDateSchema, serializedIdSchema, utcInstantSchema } from './common.js'
import { currentInvestmentThesisSchema, thesisReviewRecordSchema } from './investment-thesis.js'
import { stockSymbolSchema } from './watchlist.js'
import { stockTimelineSourceTypeSchema } from './stock-timeline-source.js'

export const companyHoldingStateSchema = z.enum(['held', 'closed', 'research_only', 'untracked'])

export const companyHubPositionSchema = z.object({
  state: companyHoldingStateSchema,
  quantity: z.number().finite().nonnegative(),
  averageCost: z.number().finite().nonnegative().nullable(),
  totalCost: z.number().finite().nonnegative(),
  price: z.number().finite().nonnegative().nullable(),
  marketValue: z.number().finite().nonnegative().nullable(),
  concentrationPct: z.number().finite().nonnegative().nullable(),
  concentrationBasis: z.enum(['cost_basis', 'unavailable']),
  quoteStatus: z.enum(['priced', 'missing']),
}).strict()

export const companyHubDiarySchema = z.object({
  id: serializedIdSchema,
  title: z.string(),
  date: calendarDateSchema,
  transactionCount: z.number().int().nonnegative(),
  relation: z.enum(['explicit_context', 'transaction']),
}).strict()

export const companyHubNoteSchema = z.object({
  id: serializedIdSchema,
  title: z.string(),
  content: z.string(),
  date: utcInstantSchema,
  createdVia: z.enum(['USER', 'AGENT']),
  createdByLabel: z.string().nullable(),
  source: z.enum(['owner', 'partner']),
  sourceName: z.string().nullable(),
}).strict()

export const companyHubEvidenceSchema = z.object({
  id: serializedIdSchema,
  summary: z.string(),
  sourceType: stockTimelineSourceTypeSchema,
  sourceTitle: z.string().nullable(),
  sourceUrl: z.string().url().nullable(),
  occurredAt: utcInstantSchema,
  createdByLabel: z.string().nullable(),
}).strict()

export const companyHubResponseSchema = z.object({
  company: z.object({
    id: serializedIdSchema.nullable(),
    symbol: stockSymbolSchema,
    name: z.string().nullable(),
    currency: z.string().nullable(),
    watchStatus: z.enum(['WATCHING', 'ARCHIVED']).nullable(),
  }).strict(),
  position: companyHubPositionSchema,
  thesis: currentInvestmentThesisSchema.nullable(),
  latestReview: thesisReviewRecordSchema.nullable(),
  reviews: z.array(thesisReviewRecordSchema).max(100),
  notes: z.array(companyHubNoteSchema).max(10),
  evidence: z.array(companyHubEvidenceSchema).max(10),
  relatedDiaries: z.array(companyHubDiarySchema).max(10),
}).strict()

export type CompanyHoldingState = z.infer<typeof companyHoldingStateSchema>
export type CompanyHubPosition = z.infer<typeof companyHubPositionSchema>
export type CompanyHubDiary = z.infer<typeof companyHubDiarySchema>
export type CompanyHubResponse = z.infer<typeof companyHubResponseSchema>
