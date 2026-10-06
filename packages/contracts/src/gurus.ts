import { z } from 'zod'
import { calendarDateSchema, utcInstantSchema } from './common.js'

const decimalSchema = z.string().regex(/^-?\d+(?:\.\d+)?$/)
const actionSchema = z.enum(['NEW', 'STRONG_ADD', 'ADD', 'UNCHANGED', 'REDUCE', 'STRONG_REDUCE', 'EXIT'])
const analyticsStateSchema = z.enum(['PENDING', 'READY', 'PARTIAL', 'ERROR'])

export const guruPublicProfileSchema = z.object({
  name: z.string().min(1),
  managerName: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().nullable(),
  investmentPhilosophy: z.string().nullable(),
  styleTags: z.array(z.string()),
  managerType: z.string().nullable(),
  website: z.string().url().nullable(),
  country: z.string().regex(/^[A-Z]{2}$/).nullable(),
  imageUrl: z.string().url().nullable(),
  featured: z.boolean(),
}).strict()

export const guruActionCountsSchema = z.object({
  new: z.number().int().nonnegative(),
  add: z.number().int().nonnegative(),
  reduce: z.number().int().nonnegative(),
  exit: z.number().int().nonnegative(),
}).strict()

export const guruPositionSummarySchema = z.object({
  positionKey: z.string(),
  securityId: z.string().nullable(),
  ticker: z.string().nullable(),
  company: z.string(),
  quantityType: z.enum(['SH', 'PRN']),
  putCall: z.enum(['PUT', 'CALL']).nullable(),
  quantity: decimalSchema,
  reportedValueUsd: decimalSchema,
  weightPercent: decimalSchema,
  rank: z.number().int().positive(),
}).strict()

export const guruChangeSummarySchema = z.object({
  positionKey: z.string(),
  securityId: z.string().nullable(),
  ticker: z.string().nullable(),
  company: z.string(),
  action: actionSchema,
  previousQuantity: decimalSchema.nullable(),
  currentQuantity: decimalSchema.nullable(),
  quantityChange: decimalSchema,
  quantityChangePercent: decimalSchema.nullable(),
  previousWeightPercent: decimalSchema.nullable(),
  currentWeightPercent: decimalSchema.nullable(),
  previousRank: z.number().int().positive().nullable(),
  currentRank: z.number().int().positive().nullable(),
}).strict()

export const guruSectorAllocationSchema = z.object({
  name: z.string(),
  reportedValueUsd: decimalSchema,
  weightPercent: decimalSchema,
}).strict()

export const guruPeriodSummarySchema = z.object({
  periodEnd: calendarDateSchema.nullable(),
  filedAt: utcInstantSchema.nullable(),
  status: analyticsStateSchema,
  reportedValueUsd: decimalSchema.nullable(),
  holdingCount: z.number().int().nonnegative().nullable(),
  topFiveConcentrationPercent: decimalSchema.nullable(),
  topTenConcentrationPercent: decimalSchema.nullable(),
  hhi: decimalSchema.nullable(),
  turnoverPercent: decimalSchema.nullable(),
  turnoverBand: z.enum(['LOW', 'MODERATE', 'HIGH']).nullable(),
  actionCounts: guruActionCountsSchema,
  largestPosition: guruPositionSummarySchema.nullable(),
  topHoldings: guruPositionSummarySchema.array(),
  sectorAllocation: guruSectorAllocationSchema.array(),
}).strict()

export const guruDirectoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
  search: z.string().trim().max(200).optional(),
  style: z.string().trim().max(60).optional(),
  managerType: z.string().trim().max(80).optional(),
  sector: z.string().trim().max(100).optional(),
  featured: z.enum(['true', 'false']).optional(),
  sort: z.enum(['custom', 'concentration', 'turnover', 'activity', 'latest_filing', 'followers', 'az']).default('custom'),
}).strict()

export const guruDirectoryItemSchema = z.object({
  profile: guruPublicProfileSchema,
  cik: z.string().regex(/^\d{10}$/),
  directoryOrder: z.number().int(),
  followerCount: z.number().int().nonnegative(),
  followedByMe: z.boolean(),
  latest: guruPeriodSummarySchema,
}).strict()

export const guruDirectoryResponseSchema = z.object({
  data: guruDirectoryItemSchema.array(),
  pagination: z.object({ page: z.number().int().positive(), limit: z.number().int().positive(), total: z.number().int().nonnegative(), totalPages: z.number().int().nonnegative() }).strict(),
  facets: z.object({ styles: z.string().array(), managerTypes: z.string().array(), sectors: z.string().array() }).strict(),
}).strict()

export const guruOverviewResponseSchema = z.object({
  data: z.object({
    profile: guruPublicProfileSchema,
    cik: z.string().regex(/^\d{10}$/),
    followerCount: z.number().int().nonnegative(),
    followedByMe: z.boolean(),
    latest: guruPeriodSummarySchema,
    latestMoves: guruChangeSummarySchema.array(),
    history: guruPeriodSummarySchema.array(),
    source: z.object({
      accession: z.string().nullable(),
      form: z.enum(['13F-HR', '13F-HR/A']).nullable(),
      periodEnd: calendarDateSchema.nullable(),
      filedAt: utcInstantSchema.nullable(),
      sourceUrl: z.string().url().nullable(),
    }).strict(),
    aiSummaryState: z.enum(['NOT_GENERATED', 'PENDING', 'READY', 'ERROR']),
  }).strict(),
}).strict()

export const guruFollowResponseSchema = z.object({
  data: z.object({ following: z.boolean(), followerCount: z.number().int().nonnegative() }).strict(),
}).strict()

export type GuruDirectoryQuery = z.infer<typeof guruDirectoryQuerySchema>
export type GuruDirectoryItem = z.infer<typeof guruDirectoryItemSchema>
export type GuruPeriodSummary = z.infer<typeof guruPeriodSummarySchema>
