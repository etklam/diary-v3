import { deleteGoalResponseSchema, goalListSchema, goalResponseSchema, serializedIdSchema, type ErrorCode } from '@diary/contracts'
import { writeGoalSchema } from '@diary/contracts/goals'
import { personalGoals, type Database } from '@diary/db'
import { and, desc, eq, sql } from 'drizzle-orm'
import type { Context, Hono } from 'hono'
import type { z } from 'zod'
import type { AppEnv } from './app-context.js'

const serialize = (row: typeof personalGoals.$inferSelect) => goalResponseSchema.parse({
  id: String(row.id),
  content: row.content,
  targetDate: row.targetDate,
  status: row.status,
  achievedDate: row.achievedDate,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
})

export function registerGoalRoutes(app: Hono<AppEnv>, dependencies: {
  db: Database
  now: () => Date
  fail: (status: number, code: ErrorCode, message: string) => never
  validationError: (error: z.ZodError) => never
  parseJson: <T>(context: Context<AppEnv>, schema: z.ZodType<T>) => Promise<T>
}) {
  const { db, now, fail, validationError, parseJson } = dependencies
  const owner = (c: Context<AppEnv>) => {
    c.header('Cache-Control', 'no-store')
    const user = c.get('user')
    return user ? BigInt(user.id) : fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
  }
  const id = (c: Context<AppEnv>) => {
    const parsed = serializedIdSchema.safeParse(c.req.param('id'))
    return parsed.success ? BigInt(parsed.data) : validationError(parsed.error)
  }
  const today = () => now().toISOString().slice(0, 10)
  // Open-ended goals sort after dated ones so the nearest deadline leads the list.
  const list = (userId: bigint) => db.select().from(personalGoals)
    .where(eq(personalGoals.userId, userId))
    .orderBy(
      sql`case when ${personalGoals.status} = 'active' then 0 else 1 end`,
      sql`${personalGoals.targetDate} asc nulls last`,
      desc(personalGoals.id),
    )

  app.get('/api/goals', async c => c.json(goalListSchema.parse((await list(owner(c))).map(serialize))))

  app.post('/api/goals', async c => {
    const userId = owner(c)
    const input = await parseJson(c, writeGoalSchema)
    const timestamp = now()
    const status = input.status ?? 'active'
    const [created] = await db.insert(personalGoals).values({
      userId,
      content: input.content,
      targetDate: input.targetDate,
      status,
      achievedDate: status === 'achieved' ? today() : null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }).returning()
    return c.json(serialize(created!))
  })

  app.put('/api/goals/:id', async c => {
    const userId = owner(c)
    const goalId = id(c)
    const input = await parseJson(c, writeGoalSchema)
    // `achievedDate` is derived from the status transition so the two can never
    // disagree; re-confirming an achieved goal keeps the original date.
    const statusChange = input.status === undefined ? {} : {
      status: input.status,
      achievedDate: input.status === 'achieved'
        ? sql`coalesce(${personalGoals.achievedDate}, ${today()}::date)`
        : null,
    }
    const [updated] = await db.update(personalGoals)
      .set({ content: input.content, targetDate: input.targetDate, ...statusChange, updatedAt: now() })
      .where(and(eq(personalGoals.userId, userId), eq(personalGoals.id, goalId)))
      .returning()
    if (!updated) return fail(404, 'GOAL_NOT_FOUND', 'Goal not found')
    return c.json(serialize(updated))
  })

  app.delete('/api/goals/:id', async c => {
    const userId = owner(c)
    const goalId = id(c)
    const [deleted] = await db.delete(personalGoals)
      .where(and(eq(personalGoals.userId, userId), eq(personalGoals.id, goalId)))
      .returning({ id: personalGoals.id })
    if (!deleted) fail(404, 'GOAL_NOT_FOUND', 'Goal not found')
    return c.json(deleteGoalResponseSchema.parse({ success: true }))
  })
}
