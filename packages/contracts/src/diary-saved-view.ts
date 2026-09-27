import { z } from 'zod'
import { calendarDateSchema, serializedIdSchema, utcInstantSchema } from './common.js'

export const DIARY_SAVED_VIEW_MAX = 20
export const DIARY_SAVED_VIEW_VERSION = 1

/** Only filters and ordering are persisted; pagination and private results never enter this schema. */
export const diarySavedViewQuerySchema = z.object({
  search: z.string().trim().min(1).max(500).optional(),
  symbol: z.string().trim().min(1).max(20).optional(),
  dateFrom: calendarDateSchema.optional(),
  dateTo: calendarDateSchema.optional(),
  reviewStatus: z.enum(['none', 'pending', 'reviewed']).optional(),
  sortBy: z.enum(['date-desc', 'date-asc', 'title-asc', 'title-desc']).optional(),
}).strict().refine(query => !query.dateFrom || !query.dateTo || query.dateFrom <= query.dateTo, {
  path: ['dateTo'], message: 'dateTo must be on or after dateFrom',
})

export const diarySavedViewCreateRequestSchema = z.object({
  name: z.string().trim().min(1).max(80),
  query: diarySavedViewQuerySchema,
}).strict()

export const diarySavedViewUpdateRequestSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  query: diarySavedViewQuerySchema.optional(),
}).strict().refine(value => value.name !== undefined || value.query !== undefined, {
  message: 'name or query is required',
})

export const diarySavedViewSchema = z.object({
  id: serializedIdSchema,
  name: z.string().min(1).max(80),
  version: z.literal(DIARY_SAVED_VIEW_VERSION),
  query: diarySavedViewQuerySchema,
  createdAt: utcInstantSchema,
  updatedAt: utcInstantSchema,
}).strict()

export const diarySavedViewListResponseSchema = z.object({ views: z.array(diarySavedViewSchema).max(DIARY_SAVED_VIEW_MAX) }).strict()
export const diarySavedViewDeleteResponseSchema = z.object({ success: z.literal(true) }).strict()

export type DiarySavedViewQuery = z.infer<typeof diarySavedViewQuerySchema>
export type DiarySavedView = z.infer<typeof diarySavedViewSchema>
