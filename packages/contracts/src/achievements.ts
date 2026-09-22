import { z } from 'zod'
import { calendarDateSchema, serializedIdSchema, utcInstantSchema } from './common.js'

/** A manually recorded milestone; no financial data is inferred server-side. */
export const achievementContentSchema = z.string().trim().min(1).max(1000)
export const writeAchievementSchema = z.object({
  date: calendarDateSchema,
  content: achievementContentSchema,
}).strict()
export const achievementResponseSchema = z.object({
  id: serializedIdSchema,
  date: calendarDateSchema,
  content: achievementContentSchema,
  createdAt: utcInstantSchema,
  updatedAt: utcInstantSchema,
}).strict()
export const achievementListSchema = z.array(achievementResponseSchema)
export const deleteAchievementResponseSchema = z.object({ success: z.literal(true) }).strict()

export type AchievementResponse = z.infer<typeof achievementResponseSchema>
