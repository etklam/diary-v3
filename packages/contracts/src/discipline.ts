import { z } from 'zod'
import { serializedIdSchema, utcInstantSchema } from './common.js'

export const disciplineContentSchema = z.string().trim().min(1).max(255)
export const writeDisciplineSchema = z.object({ content: disciplineContentSchema }).strict()
export const disciplineResponseSchema = z.object({
  id: serializedIdSchema,
  content: disciplineContentSchema,
  order: z.number().int().min(-2147483648).max(2147483647),
  createdAt: utcInstantSchema,
}).strict()
export const disciplineListSchema = z.array(disciplineResponseSchema)
// Preserve partial reorders and signed source order values, with deterministic ID ties.
export const reorderDisciplinesSchema = z.array(z.object({
  id: serializedIdSchema,
  order: z.number().int().min(-2147483648).max(2147483647),
}).strict()).min(1).refine(rows => new Set(rows.map(row => row.id)).size === rows.length, 'Discipline IDs must be unique')
export const randomDisciplineSchema = z.object({ content: disciplineContentSchema, isCustom: z.boolean() }).strict()
export type DisciplineResponse = z.infer<typeof disciplineResponseSchema>
