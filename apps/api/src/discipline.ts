import { createDisciplineShare, parseDisciplineShare, importDisciplineRequestSchema, exportDisciplineQuerySchema } from '@diary/contracts/discipline-share'
import { randomInt } from 'node:crypto'
import { serializedIdSchema, type ErrorCode } from '@diary/contracts'
import { writeDisciplineSchema, reorderDisciplinesSchema, disciplineResponseSchema, randomDisciplineSchema } from '@diary/contracts/discipline'
import { disciplines, users, type Database } from '@diary/db'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import type { Context, Hono } from 'hono'
import type { z } from 'zod'
import type { AppEnv } from './app.js'
const defaults = ['寫日記是提升交易心態的最好方法', '明天又是新的一天，持續寫日記吧', '明天見']
const serialize = (row: typeof disciplines.$inferSelect) => disciplineResponseSchema.parse({ id: String(row.id), content: row.content, order: row.order, createdAt: row.createdAt.toISOString() })
export function registerDisciplineRoutes(app: Hono<AppEnv>, dependencies: {
  db: Database; now: () => Date; fail: (status: number, code: ErrorCode, message: string) => never
  validationError: (error: z.ZodError) => never; parseJson: <T>(context: Context<AppEnv>, schema: z.ZodType<T>) => Promise<T>
}) {
  const { db, now, fail, validationError, parseJson } = dependencies
  const owner = (c: Context<AppEnv>) => { c.header('Cache-Control', 'no-store'); const user = c.get('user'); return user ? BigInt(user.id) : fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required') }
  const id = (c: Context<AppEnv>) => { const parsed = serializedIdSchema.safeParse(c.req.param('id')); return parsed.success ? BigInt(parsed.data) : validationError(parsed.error) }
  type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]
  // The owner row exists even for an empty collection, serializing create/reorder/delete.
  const lock = async (tx: Transaction, userId: bigint) => {
    const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update')
    if (!user) fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
  }
  const list = (connection: Database | Transaction, userId: bigint) => connection.select().from(disciplines).where(eq(disciplines.userId, userId)).orderBy(asc(disciplines.order), asc(disciplines.id))
  app.get('/api/discipline', async c => c.json((await list(db, owner(c))).map(serialize)))
  app.get('/api/discipline/export', async c => {
    const userId = owner(c), parsed = exportDisciplineQuerySchema.safeParse(c.req.query())
    if (!parsed.success) return validationError(parsed.error)
    const result = await db.transaction(async tx => {
      const rows = await list(tx, userId)
      if (!rows.length) return fail(404, 'DISCIPLINE_NOT_FOUND', 'No disciplines to export')
      const [user] = parsed.data.includeAuthor === 'true' ? await tx.select({ name: users.name }).from(users).where(eq(users.id, userId)) : []
      const data = createDisciplineShare(rows, { title: parsed.data.title, description: parsed.data.description, author: user?.name || undefined }, now().toISOString())
      return { success: true as const, data, json: JSON.stringify(data, null, 2) }
    }, { isolationLevel: 'repeatable read' })
    return c.json(result)
  })
  app.post('/api/discipline/import', async c => {
    const userId = owner(c), input = await parseJson(c, importDisciplineRequestSchema)
    let preview: ReturnType<typeof parseDisciplineShare>
    try { preview = parseDisciplineShare(input.json) }
    catch { return fail(400, 'SYS_VALIDATION_ERROR', 'Invalid discipline share data') }
    const imported = await db.transaction(async tx => {
      await lock(tx, userId)
      if (input.replaceExisting) await tx.delete(disciplines).where(eq(disciplines.userId, userId))
      const [last] = await tx.select({ order: disciplines.order }).from(disciplines).where(eq(disciplines.userId, userId)).orderBy(desc(disciplines.order)).limit(1)
      const start = (last?.order ?? -1) + 1
      if (start + preview.count - 1 > 2147483647) fail(400, 'SYS_VALIDATION_ERROR', 'Reorder disciplines before importing at the maximum order')
      // Bounded batches avoid PostgreSQL's parameter limit; all share one transaction.
      for (let offset = 0; offset < preview.count; offset += 500) await tx.insert(disciplines).values(preview.disciplines.slice(offset, offset + 500).map((row, index) => ({ userId, content: row.content, order: start + offset + index, createdAt: now() })))
      return preview.count
    })
    return c.json({ success: true as const, imported, message: `Successfully imported ${imported} disciplines` })
  })
  app.get('/api/discipline/random', async c => {
    const userId = owner(c)
    const [selected] = await db.select({ content: disciplines.content }).from(disciplines).where(eq(disciplines.userId, userId)).orderBy(sql`random()`).limit(1)
    return c.json(randomDisciplineSchema.parse({ content: selected?.content ?? defaults[randomInt(defaults.length)], isCustom: Boolean(selected) }))
  })
  app.post('/api/discipline', async c => {
    const userId = owner(c), input = await parseJson(c, writeDisciplineSchema)
    const row = await db.transaction(async tx => {
      await lock(tx, userId)
      const [last] = await tx.select({ order: disciplines.order }).from(disciplines).where(eq(disciplines.userId, userId)).orderBy(desc(disciplines.order)).limit(1)
      const order = (last?.order ?? -1) + 1
      if (order > 2147483647) fail(400, 'SYS_VALIDATION_ERROR', 'Reorder disciplines before appending at the maximum order')
      const [created] = await tx.insert(disciplines).values({ userId, content: input.content, order, createdAt: now() }).returning()
      return serialize(created!)
    })
    return c.json(row)
  })
  app.patch('/api/discipline/reorder', async c => {
    const userId = owner(c), input = await parseJson(c, reorderDisciplinesSchema)
    const result = await db.transaction(async tx => {
      await lock(tx, userId)
      const rows = await tx.select({ id: disciplines.id }).from(disciplines).where(and(eq(disciplines.userId, userId), inArray(disciplines.id, input.map(row => BigInt(row.id)))))
      if (rows.length !== input.length) fail(404, 'DISCIPLINE_NOT_FOUND', 'Discipline not found')
      for (const row of input) await tx.update(disciplines).set({ order: row.order }).where(and(eq(disciplines.userId, userId), eq(disciplines.id, BigInt(row.id))))
      return (await list(tx, userId)).map(serialize)
    })
    return c.json(result)
  })
  app.put('/api/discipline/:id', async c => {
    const userId = owner(c), disciplineId = id(c), input = await parseJson(c, writeDisciplineSchema)
    const result = await db.transaction(async tx => {
      await lock(tx, userId)
      const [row] = await tx.update(disciplines).set(input).where(and(eq(disciplines.userId, userId), eq(disciplines.id, disciplineId))).returning()
      if (!row) return fail(404, 'DISCIPLINE_NOT_FOUND', 'Discipline not found')
      return serialize(row)
    })
    return c.json(result)
  })
  app.delete('/api/discipline/:id', async c => {
    const userId = owner(c), disciplineId = id(c)
    await db.transaction(async tx => {
      await lock(tx, userId)
      const [row] = await tx.delete(disciplines).where(and(eq(disciplines.userId, userId), eq(disciplines.id, disciplineId))).returning({ id: disciplines.id })
      if (!row) fail(404, 'DISCIPLINE_NOT_FOUND', 'Discipline not found')
    })
    return c.json({ success: true as const })
  })
}
