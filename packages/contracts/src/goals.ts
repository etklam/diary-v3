import { z } from 'zod'
import { calendarDateSchema, serializedIdSchema, utcInstantSchema } from './common.js'

/**
 * A manually recorded intention. Goals stay free text on purpose: portfolio
 * valuation cannot supply an honest YTD return or account total, so no
 * progress figure is inferred server-side.
 */
export const goalContentSchema = z.string().trim().min(1).max(1000)
export const goalStatusSchema = z.enum(['active', 'achieved'])
/** `targetDate` is null for open-ended goals; `status` is omitted when only the text changes. */
export const writeGoalSchema = z.object({
  content: goalContentSchema,
  targetDate: calendarDateSchema.nullable(),
  status: goalStatusSchema.optional(),
}).strict()
export const goalResponseSchema = z.object({
  id: serializedIdSchema,
  content: goalContentSchema,
  targetDate: calendarDateSchema.nullable(),
  status: goalStatusSchema,
  achievedDate: calendarDateSchema.nullable(),
  createdAt: utcInstantSchema,
  updatedAt: utcInstantSchema,
}).strict()
export const goalListSchema = z.array(goalResponseSchema)
export const deleteGoalResponseSchema = z.object({ success: z.literal(true) }).strict()

export type GoalStatus = z.infer<typeof goalStatusSchema>
export type GoalResponse = z.infer<typeof goalResponseSchema>
