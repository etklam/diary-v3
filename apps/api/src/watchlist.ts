import { serializedIdSchema, type ErrorCode } from '@diary/contracts'
import { stockWatchlistCreateRequestSchema, stockWatchlistUpdateRequestSchema, stockWatchlistMutationResponseSchema, stockWatchlistResponseSchema, stockWatchlistReorderRequestSchema, stockWatchlistReorderResponseSchema, stockWatchlistDeleteResponseSchema, STOCK_WATCHLIST_MAX_ITEMS } from '@diary/contracts/watchlist'
import { stocks, stockWatchlists, stockTimelineRecords, type Database } from '@diary/db'
import { and, asc, count, desc, eq, gte, inArray, max, sql } from 'drizzle-orm'
import type { Context, Hono } from 'hono'
import type { z } from 'zod'
import type { AppEnv } from './app-context.js'


type DbTransaction = Parameters<Parameters<Database['transaction']>[0]>[0]
export const watchlistLock = (userId: bigint) => sql`select pg_advisory_xact_lock(hashtextextended(${'watchlist:' + userId.toString()}, 0::bigint))`

async function resequenceWatchlist(tx: DbTransaction, userId: bigint, timestamp: Date) {
  const rows = await tx.select({ id: stockWatchlists.id, sortOrder: stockWatchlists.sortOrder, pinned: stockWatchlists.pinned })
    .from(stockWatchlists)
    .where(and(eq(stockWatchlists.userId, userId), eq(stockWatchlists.status, 'WATCHING')))
    .orderBy(desc(stockWatchlists.pinned), asc(stockWatchlists.sortOrder), asc(stockWatchlists.id))
    .limit(STOCK_WATCHLIST_MAX_ITEMS)
  for (const [sortOrder, row] of rows.entries()) {
    if (row.sortOrder === sortOrder) continue
    await tx.update(stockWatchlists).set({ sortOrder, updatedAt: timestamp }).where(and(eq(stockWatchlists.id, row.id), eq(stockWatchlists.userId, userId)))
  }
  return rows.map((row, sortOrder) => ({ ...row, sortOrder }))
}

async function shiftFollowingWatchlistItems(tx: DbTransaction, userId: bigint, itemId: bigint, sortOrder: number, timestamp: Date) {
  const following = await tx.select({ id: stockWatchlists.id, sortOrder: stockWatchlists.sortOrder })
    .from(stockWatchlists)
    .where(and(eq(stockWatchlists.userId, userId), eq(stockWatchlists.status, 'WATCHING'), gte(stockWatchlists.sortOrder, sortOrder), sql`${stockWatchlists.id} <> ${itemId}`))
    .orderBy(desc(stockWatchlists.sortOrder), desc(stockWatchlists.id))
  for (const row of following) {
    await tx.update(stockWatchlists).set({ sortOrder: row.sortOrder + 1, updatedAt: timestamp }).where(and(eq(stockWatchlists.id, row.id), eq(stockWatchlists.userId, userId)))
  }
}

export async function ensureWatchingStock(tx: DbTransaction, userId: bigint, symbol: string, timestamp: Date, requestedSortOrder?: number, requestedPinned?: boolean) {
  await tx.execute(watchlistLock(userId))
  await tx.insert(stocks).values({ symbol }).onConflictDoNothing({ target: stocks.symbol })
  const [stock] = await tx.select().from(stocks).where(eq(stocks.symbol, symbol))
  if (!stock) throw new Error('Canonical stock unavailable after insert')
  const [existing] = await tx.select({ status: stockWatchlists.status }).from(stockWatchlists)
    .where(and(eq(stockWatchlists.userId, userId), eq(stockWatchlists.stockId, stock.id)))
  const [last] = await tx.select({ sortOrder: max(stockWatchlists.sortOrder) }).from(stockWatchlists).where(eq(stockWatchlists.userId, userId))
  const [item] = await tx.insert(stockWatchlists).values({
    userId, stockId: stock.id, sortOrder: requestedSortOrder ?? (last?.sortOrder ?? -1) + 1, pinned: requestedPinned ?? false, updatedAt: timestamp,
  }).onConflictDoUpdate({ target: [stockWatchlists.userId, stockWatchlists.stockId], set: { status: 'WATCHING', ...(requestedSortOrder === undefined ? {} : { sortOrder: requestedSortOrder }), ...(requestedPinned === undefined ? {} : { pinned: requestedPinned }), updatedAt: timestamp } }).returning()
  if (!item) throw new Error('Watchlist insert returned no row')
  if (requestedSortOrder === undefined) {
    if (existing?.status === 'ARCHIVED') await shiftFollowingWatchlistItems(tx, userId, item.id, item.sortOrder, timestamp)
    else await resequenceWatchlist(tx, userId, timestamp)
  } else await shiftFollowingWatchlistItems(tx, userId, item.id, requestedSortOrder, timestamp)
  const [normalized] = await tx.select().from(stockWatchlists).where(eq(stockWatchlists.id, item.id))
  return { item: normalized ?? item, stock }
}

export function registerWatchlistRoutes(app: Hono<AppEnv>, dependencies: {
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
    if (!parsed.success) return validationError(parsed.error)
    return BigInt(parsed.data)
  }
  // Serializes ordering decisions and duplicate restoration for one owner only.
  const lock = watchlistLock
  const includeManagementFields = (c: Context<AppEnv>) => c.req.header('x-watchlist-features') === 'management-v1'

  /** Clients without the `management-v1` feature header never see `pinned`. */
  function legacyItemShape<T extends { pinned?: boolean }>(item: T, includePinned: boolean) {
    if (includePinned) return item
    const legacy = { ...item }
    delete legacy.pinned
    return legacy
  }

  app.get('/api/stocks/watchlist', async c => {
    const userId = owner(c)
    const includePinned = includeManagementFields(c)
    const result = await db.transaction(async tx => {
      const rows = await tx.select({ item: stockWatchlists, stock: stocks }).from(stockWatchlists)
        .innerJoin(stocks, eq(stocks.id, stockWatchlists.stockId))
        .where(and(eq(stockWatchlists.userId, userId), eq(stockWatchlists.status, 'WATCHING')))
        .orderBy(desc(stockWatchlists.pinned), asc(stockWatchlists.sortOrder), asc(stockWatchlists.id)).limit(STOCK_WATCHLIST_MAX_ITEMS)
      if (!rows.length) return { items: [] }
      const where = and(eq(stockTimelineRecords.userId, userId), inArray(stockTimelineRecords.stockId, rows.map(row => row.stock.id)))
      const counts = await tx.select({ stockId: stockTimelineRecords.stockId, total: count() }).from(stockTimelineRecords).where(where).groupBy(stockTimelineRecords.stockId)
      const latest = await tx.selectDistinctOn([stockTimelineRecords.stockId]).from(stockTimelineRecords).where(where)
        .orderBy(asc(stockTimelineRecords.stockId), desc(stockTimelineRecords.occurredAt), desc(stockTimelineRecords.id))
      const countMap = new Map(counts.map(row => [row.stockId, row.total]))
      const latestMap = new Map(latest.map(row => [row.stockId, row]))
      const payload = stockWatchlistResponseSchema.parse({ items: rows.map(({ item, stock }) => {
        const record = latestMap.get(stock.id)
        return {
          id: String(item.id), status: item.status, sortOrder: item.sortOrder, pinned: item.pinned, updatedAt: item.updatedAt.toISOString(),
          stock: { symbol: stock.symbol, name: stock.name }, recordCount: countMap.get(stock.id) ?? 0,
          latestRecord: record ? { id: String(record.id), summary: record.summary, occurredAt: record.occurredAt.toISOString(), sourceType: record.sourceType, sourceTitle: record.sourceTitle, confidence: record.confidence } : null,
        }
      }) })
      return { items: payload.items.map(item => legacyItemShape(item, includePinned)) }
    }, { isolationLevel: 'repeatable read', accessMode: 'read only' })
    return c.json(result)
  })

  app.post('/api/stocks/watchlist', async c => {
    const userId = owner(c), input = await parseJson(c, stockWatchlistCreateRequestSchema)
    const includePinned = includeManagementFields(c)
    const result = await db.transaction(async tx => {
      const { item, stock } = await ensureWatchingStock(tx, userId, input.symbol, now(), input.sortOrder, input.pinned)
      return legacyItemShape(stockWatchlistMutationResponseSchema.parse({ id: String(item.id), symbol: stock.symbol, sortOrder: item.sortOrder, pinned: item.pinned, status: item.status }), includePinned)
    })
    return c.json(result, 200)
  })

  app.post('/api/stocks/watchlist/reorder', async c => {
    const userId = owner(c), input = await parseJson(c, stockWatchlistReorderRequestSchema)
    const result = await db.transaction(async tx => {
      await tx.execute(lock(userId))
      const rows = await resequenceWatchlist(tx, userId, now())
      const currentIndex = rows.findIndex(row => row.id.toString() === input.id)
      if (currentIndex < 0) return undefined
      const current = rows[currentIndex]!
      const group = rows.filter(row => row.pinned === current.pinned)
      const groupIndex = group.findIndex(row => row.id === current.id)
      const neighbor = group[input.direction === 'up' ? groupIndex - 1 : groupIndex + 1]
      if (!neighbor) return { success: true as const, items: rows.map(row => ({ id: row.id.toString(), sortOrder: row.sortOrder })) }
      const timestamp = now()
      await tx.update(stockWatchlists).set({ sortOrder: neighbor.sortOrder, updatedAt: timestamp }).where(and(eq(stockWatchlists.id, current.id), eq(stockWatchlists.userId, userId)))
      await tx.update(stockWatchlists).set({ sortOrder: current.sortOrder, updatedAt: timestamp }).where(and(eq(stockWatchlists.id, neighbor.id), eq(stockWatchlists.userId, userId)))
      return stockWatchlistReorderResponseSchema.parse({
        success: true,
        items: rows.map(row => row.id === current.id
          ? { id: row.id.toString(), sortOrder: neighbor.sortOrder }
          : row.id === neighbor.id ? { id: row.id.toString(), sortOrder: current.sortOrder } : { id: row.id.toString(), sortOrder: row.sortOrder }),
      })
    })
    if (!result) fail(404, 'WATCHLIST_ITEM_NOT_FOUND', `Watchlist item ${input.id} not found`)
    return c.json(result)
  })

  app.patch('/api/stocks/watchlist/:id', async c => {
    const userId = owner(c), itemId = id(c), input = await parseJson(c, stockWatchlistUpdateRequestSchema)
    const includePinned = includeManagementFields(c)
    const result = await db.transaction(async tx => {
      await tx.execute(lock(userId))
      const timestamp = now()
      const [item] = await tx.update(stockWatchlists).set({ ...input, updatedAt: timestamp })
        .where(and(eq(stockWatchlists.id, itemId), eq(stockWatchlists.userId, userId))).returning()
      if (!item) return undefined
      if (input.sortOrder !== undefined) await shiftFollowingWatchlistItems(tx, userId, item.id, input.sortOrder, timestamp)
      else if (input.pinned !== undefined || input.status !== undefined) await resequenceWatchlist(tx, userId, timestamp)
      const [normalized] = await tx.select().from(stockWatchlists).where(and(eq(stockWatchlists.id, item.id), eq(stockWatchlists.userId, userId)))
      const [stock] = await tx.select().from(stocks).where(eq(stocks.id, item.stockId))
      if (!stock) throw new Error('Canonical stock missing')
      return legacyItemShape(stockWatchlistMutationResponseSchema.parse({ id: String(item.id), symbol: stock.symbol, status: normalized?.status ?? item.status, sortOrder: normalized?.sortOrder ?? item.sortOrder, pinned: normalized?.pinned ?? item.pinned, updatedAt: normalized?.updatedAt.toISOString() ?? item.updatedAt.toISOString() }), includePinned)
    })
    if (!result) fail(404, 'WATCHLIST_ITEM_NOT_FOUND', `Watchlist item ${itemId} not found`)
    return c.json(result)
  })

  app.delete('/api/stocks/watchlist/:id', async c => {
    const userId = owner(c), itemId = id(c)
    const result = await db.transaction(async tx => {
      await tx.execute(lock(userId))
      const [item] = await tx.update(stockWatchlists).set({ status: 'ARCHIVED', updatedAt: now() })
        .where(and(eq(stockWatchlists.id, itemId), eq(stockWatchlists.userId, userId))).returning({ id: stockWatchlists.id })
      await resequenceWatchlist(tx, userId, now())
      return item
    })
    if (!result) fail(404, 'WATCHLIST_ITEM_NOT_FOUND', `Watchlist item ${itemId} not found`)
    return c.json(stockWatchlistDeleteResponseSchema.parse({ success: true }))
  })
}
