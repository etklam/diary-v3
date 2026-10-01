import { z } from 'zod'
import { calendarDateSchema, serializedIdSchema } from './common.js'

export const diaryActivityQuerySchema = z.object({
  dateFrom: calendarDateSchema,
  dateTo: calendarDateSchema,
}).refine(({ dateFrom, dateTo }) => {
  const days = (Date.parse(`${dateTo}T00:00:00Z`) - Date.parse(`${dateFrom}T00:00:00Z`)) / 86_400_000 + 1
  return days >= 1 && days <= 371
}, { path: ['dateTo'], message: 'Activity range must be between 1 and 371 days' })

/**
 * One row per calendar date that carries any activity, in the account
 * timezone. A trade or a completed review keeps its own date, so a day can
 * hold activity without holding a diary — `diaryId` is null there and the
 * Calendar sends that day to the merged timeline instead of a diary.
 */
export const diaryActivityDaySchema = z.object({
  date: calendarDateSchema,
  diaryId: serializedIdSchema.nullable(),
  alertCount: z.number().int().nonnegative(),
  transactionCount: z.number().int().nonnegative(),
  reviewCount: z.number().int().nonnegative(),
}).strict()
export const diaryActivityResponseSchema = z.object({
  data: z.array(diaryActivityDaySchema),
  dateFrom: calendarDateSchema,
  dateTo: calendarDateSchema,
}).strict()

export type DiaryActivityDay = z.infer<typeof diaryActivityDaySchema>
