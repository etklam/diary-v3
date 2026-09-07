import { z } from 'zod'
import { calendarDateSchema, diaryResponseSchema } from './index.js'

export const diaryListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(500).optional(),
  symbol: z.string().trim().min(1).max(20).optional(),
  sortBy: z.enum(['date-desc', 'date-asc', 'title-asc', 'title-desc']).default('date-desc'),
  dateFrom: calendarDateSchema.optional(),
  dateTo: calendarDateSchema.optional(),
  reviewStatus: z.enum(['none', 'pending', 'reviewed']).optional(),
}).strict().refine(query => !query.dateFrom || !query.dateTo || query.dateFrom <= query.dateTo, {
  path: ['dateTo'], message: 'dateTo must be on or after dateFrom',
})

export const diaryListResponseSchema = z.object({
  data: z.array(diaryResponseSchema),
  pagination: z.object({
    page: z.number().int().min(1),
    limit: z.number().int().min(1).max(100),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }).strict(),
}).strict()
export type DiaryListQuery = z.infer<typeof diaryListQuerySchema>
