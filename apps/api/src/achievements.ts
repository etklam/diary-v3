import { achievementListSchema, achievementResponseSchema, deleteAchievementResponseSchema, serializedIdSchema, type ErrorCode } from '@diary/contracts'
import { writeAchievementSchema } from '@diary/contracts/achievements'
import { personalAchievements, type Database } from '@diary/db'
import { and, desc, eq } from 'drizzle-orm'
import type { Context, Hono } from 'hono'
import type { z } from 'zod'
import type { AppEnv } from './app.js'

const serialize = (row: typeof personalAchievements.$inferSelect) => achievementResponseSchema.parse({
  id: String(row.id),
  date: row.date,
  content: row.content,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
})

export function registerAchievementRoutes(app: Hono<AppEnv>, dependencies: {
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
  const list = (userId: bigint) => db.select().from(personalAchievements)
    .where(eq(personalAchievements.userId, userId))
    .orderBy(desc(personalAchievements.date), desc(personalAchievements.id))

  app.get('/api/achievements', async c => c.json(achievementListSchema.parse((await list(owner(c))).map(serialize))))

  app.post('/api/achievements', async c => {
    const userId = owner(c)
    const input = await parseJson(c, writeAchievementSchema)
    const timestamp = now()
    const [created] = await db.insert(personalAchievements).values({
      userId,
      date: input.date,
      content: input.content,
      createdAt: timestamp,
      updatedAt: timestamp,
    }).returning()
    return c.json(serialize(created!))
  })

  app.put('/api/achievements/:id', async c => {
    const userId = owner(c)
    const achievementId = id(c)
    const input = await parseJson(c, writeAchievementSchema)
    const [updated] = await db.update(personalAchievements).set({ ...input, updatedAt: now() })
      .where(and(eq(personalAchievements.userId, userId), eq(personalAchievements.id, achievementId)))
      .returning()
    if (!updated) return fail(404, 'ACHIEVEMENT_NOT_FOUND', 'Achievement not found')
    return c.json(serialize(updated))
  })

  app.delete('/api/achievements/:id', async c => {
    const userId = owner(c)
    const achievementId = id(c)
    const [deleted] = await db.delete(personalAchievements)
      .where(and(eq(personalAchievements.userId, userId), eq(personalAchievements.id, achievementId)))
      .returning({ id: personalAchievements.id })
    if (!deleted) fail(404, 'ACHIEVEMENT_NOT_FOUND', 'Achievement not found')
    return c.json(deleteAchievementResponseSchema.parse({ success: true }))
  })
}
