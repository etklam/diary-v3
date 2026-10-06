import { z } from 'zod'
import { calendarDateSchema, utcInstantSchema } from './common.js'
import { guruPublicProfileSchema } from './gurus.js'

const decimalSchema = z.string().regex(/^-?\d+(?:\.\d{1,8})?$/)
const actionSchema = z.enum(['NEW', 'STRONG_ADD', 'ADD', 'UNCHANGED', 'REDUCE', 'STRONG_REDUCE', 'EXIT'])
const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

export const guruComparisonQuerySchema = z.object({
  slugs: z.string().trim().min(1).max(400).superRefine((value, context) => {
    const slugs = value.split(',').map(slug => slug.trim())
    if (slugs.length < 2 || slugs.length > 5 || slugs.some(slug => !slugSchema.safeParse(slug).success)) {
      context.addIssue({ code: 'custom', message: 'Select two to five valid Guru slugs.' })
    }
    if (new Set(slugs).size !== slugs.length) context.addIssue({ code: 'custom', message: 'Guru selections must be unique.' })
  }),
  period: calendarDateSchema.optional(),
}).strict()

export const guruComparisonManagerStatusSchema = z.enum(['READY', 'PARTIAL', 'ERROR', 'SUPERSEDED', 'PENDING', 'NO_FILING'])

export const guruComparisonManagerSchema = z.object({
  profile: guruPublicProfileSchema,
  status: guruComparisonManagerStatusSchema,
  reportedValueUsd: decimalSchema.nullable(),
  holdingCount: z.number().int().nonnegative().nullable(),
  topTenConcentrationPercent: decimalSchema.nullable(),
  turnoverPercent: decimalSchema.nullable(),
  sectorAllocation: z.array(z.object({ name: z.string(), weightPercent: decimalSchema }).strict()),
  actionCounts: z.object({ new: z.number().int().nonnegative(), add: z.number().int().nonnegative(), reduce: z.number().int().nonnegative(), exit: z.number().int().nonnegative() }).strict(),
  source: z.object({
    form: z.enum(['13F-HR', '13F-HR/A']).nullable(),
    accession: z.string().nullable(),
    filedAt: utcInstantSchema.nullable(),
    sourceUrl: z.string().url().nullable(),
  }).strict(),
}).strict()

export const guruComparisonMemberSchema = z.object({
  guruSlug: slugSchema,
  guruName: z.string(),
  action: actionSchema.nullable(),
  currentQuantity: decimalSchema.nullable(),
  previousQuantity: decimalSchema.nullable(),
  reportedValueUsd: decimalSchema.nullable(),
  weightPercent: decimalSchema.nullable(),
  previousWeightPercent: decimalSchema.nullable(),
  currentRank: z.number().int().positive().nullable(),
}).strict()

export const guruComparisonPositionSchema = z.object({
  positionKey: z.string(),
  securityId: z.string(),
  ticker: z.string().nullable(),
  company: z.string(),
  securityType: z.string().nullable(),
  quantityType: z.enum(['SH', 'PRN']),
  putCall: z.enum(['PUT', 'CALL']).nullable(),
  heldByCount: z.number().int().nonnegative(),
  readyGuruCount: z.number().int().nonnegative(),
  selectedGuruCount: z.number().int().positive(),
  commonOrUnique: z.enum(['COMMON', 'UNIQUE']),
  members: guruComparisonMemberSchema.array(),
}).strict()

export const guruComparisonMoveSchema = z.object({
  positionKey: z.string(),
  securityId: z.string().nullable(),
  ticker: z.string().nullable(),
  company: z.string(),
  quantityType: z.enum(['SH', 'PRN']),
  putCall: z.enum(['PUT', 'CALL']).nullable(),
  members: guruComparisonMemberSchema.array().min(1),
}).strict()

export const guruComparisonOpposingActionSchema = z.object({
  positionKey: z.string(),
  securityId: z.string(),
  ticker: z.string().nullable(),
  company: z.string(),
  members: guruComparisonMemberSchema.array().min(2),
}).strict()

export const guruComparisonResponseSchema = z.object({ data: z.object({
  periodEnd: calendarDateSchema.nullable(),
  source: z.literal('SEC Form 13F'),
  selectedGuruCount: z.number().int().min(2).max(5),
  readyGuruCount: z.number().int().nonnegative(),
  managers: guruComparisonManagerSchema.array().min(2).max(5),
  positions: guruComparisonPositionSchema.array(),
  commonHoldings: guruComparisonPositionSchema.array(),
  uniqueHoldings: guruComparisonPositionSchema.array(),
  quarterMoves: guruComparisonMoveSchema.array(),
  opposingActions: guruComparisonOpposingActionSchema.array(),
  periods: calendarDateSchema.array(),
}).strict() }).strict()

export type GuruComparisonQuery = z.infer<typeof guruComparisonQuerySchema>
export type GuruComparisonManager = z.infer<typeof guruComparisonManagerSchema>
export type GuruComparisonPosition = z.infer<typeof guruComparisonPositionSchema>
export type GuruComparisonMove = z.infer<typeof guruComparisonMoveSchema>
