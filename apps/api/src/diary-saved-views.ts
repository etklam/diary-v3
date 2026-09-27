import { diarySavedViewQuerySchema, diarySavedViewCreateRequestSchema, diarySavedViewDeleteResponseSchema, diarySavedViewListResponseSchema, diarySavedViewSchema, diarySavedViewUpdateRequestSchema, DIARY_SAVED_VIEW_MAX, DIARY_SAVED_VIEW_VERSION } from '@diary/contracts'
import { serializedIdSchema, type ErrorCode } from '@diary/contracts'
import { diarySavedViews, type Database } from '@diary/db'
import { and, asc, count, desc, eq, sql } from 'drizzle-orm'
import type { Context, Hono } from 'hono'
import type { z } from 'zod'
import type { AppEnv } from './app.js'

type SavedViewRow = typeof diarySavedViews.$inferSelect
type SavedViewFail = (status: number, code: ErrorCode, message: string) => never

export const diarySavedViewLock = (userId: bigint) => sql`select pg_advisory_xact_lock(hashtextextended(${'diary-saved-views:' + userId.toString()}, 0::bigint))`

function uniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: unknown; cause?: unknown }
  if (candidate.code === '23505') return true
  return candidate.cause !== undefined && uniqueViolation(candidate.cause)
}

function serializeSavedView(row: SavedViewRow) {
  const query = diarySavedViewQuerySchema.safeParse(row.query)
  if (!query.success) return null
  const parsed = diarySavedViewSchema.safeParse({
    id: row.id.toString(),
    name: row.name,
    version: row.version,
    query: query.data,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  })
  return parsed.success ? parsed.data : null
}

export function registerDiarySavedViewRoutes(app: Hono<AppEnv>, dependencies: {
  db: Database
  now: () => Date
  fail: SavedViewFail
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
    if (!parsed.success) return validationError(parsed.error)
    return BigInt(parsed.data)
  }

  app.get('/api/diaries/saved-views', async c => {
    const userId = owner(c)
    const rows = await db.select().from(diarySavedViews)
      .where(eq(diarySavedViews.userId, userId))
      .orderBy(asc(diarySavedViews.name), desc(diarySavedViews.updatedAt), desc(diarySavedViews.id))
      .limit(DIARY_SAVED_VIEW_MAX)
    return c.json(diarySavedViewListResponseSchema.parse({ views: rows.flatMap(row => {
      const view = serializeSavedView(row)
      return view ? [view] : []
    }) }))
  })

  app.post('/api/diaries/saved-views', async c => {
    const userId = owner(c)
    const input = await parseJson(c, diarySavedViewCreateRequestSchema)
    try {
      const view = await db.transaction(async tx => {
        await tx.execute(diarySavedViewLock(userId))
        const [existing] = await tx.select({ total: count() }).from(diarySavedViews).where(eq(diarySavedViews.userId, userId))
        if ((existing?.total ?? 0) >= DIARY_SAVED_VIEW_MAX) {
          return fail(400, 'SYS_VALIDATION_ERROR', `You can save up to ${DIARY_SAVED_VIEW_MAX} views`)
        }
        const timestamp = now()
        const [row] = await tx.insert(diarySavedViews).values({
          userId, name: input.name, version: 1, query: input.query, createdAt: timestamp, updatedAt: timestamp,
        }).returning()
        if (!row) throw new Error('Saved view insert returned no row')
        const view = serializeSavedView(row)
        if (!view) throw new Error('Saved view insert returned invalid query')
        return view
      })
      return c.json(view, 201)
    } catch (error) {
      if (uniqueViolation(error)) return fail(409, 'SYS_VALIDATION_ERROR', 'A saved view with this name already exists')
      throw error
    }
  })

  app.patch('/api/diaries/saved-views/:id', async c => {
    const userId = owner(c), viewId = id(c)
    const input = await parseJson(c, diarySavedViewUpdateRequestSchema)
    try {
      const view = await db.transaction(async tx => {
        await tx.execute(diarySavedViewLock(userId))
        const [current] = await tx.select().from(diarySavedViews)
          .where(and(eq(diarySavedViews.id, viewId), eq(diarySavedViews.userId, userId))).for('update')
        if (!current) return fail(404, 'SYS_NOT_FOUND', 'Saved view not found')
        if (current.version !== DIARY_SAVED_VIEW_VERSION || !diarySavedViewQuerySchema.safeParse(current.query).success) return fail(409, 'SYS_VALIDATION_ERROR', 'Saved view format is no longer supported; delete and recreate it')
        const timestamp = now()
        const [row] = await tx.update(diarySavedViews).set({
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.query === undefined ? {} : { query: input.query }),
          // Version identifies the persisted query format, not an update revision.
          version: current.version,
          updatedAt: timestamp,
        }).where(and(eq(diarySavedViews.id, viewId), eq(diarySavedViews.userId, userId))).returning()
        if (!row) throw new Error('Saved view update returned no row')
        const view = serializeSavedView(row)
        if (!view) throw new Error('Saved view update returned invalid query')
        return view
      })
      return c.json(view)
    } catch (error) {
      if (uniqueViolation(error)) return fail(409, 'SYS_VALIDATION_ERROR', 'A saved view with this name already exists')
      throw error
    }
  })

  app.delete('/api/diaries/saved-views/:id', async c => {
    const userId = owner(c), viewId = id(c)
    const deleted = await db.transaction(async tx => {
      await tx.execute(diarySavedViewLock(userId))
      const [row] = await tx.delete(diarySavedViews)
        .where(and(eq(diarySavedViews.id, viewId), eq(diarySavedViews.userId, userId)))
        .returning({ id: diarySavedViews.id })
      return row
    })
    if (!deleted) return fail(404, 'SYS_NOT_FOUND', 'Saved view not found')
    return c.json(diarySavedViewDeleteResponseSchema.parse({ success: true }))
  })
}
