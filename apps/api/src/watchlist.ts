import { serializedIdSchema, type ErrorCode } from '@diary/contracts'
import { stockWatchlistCreateRequestSchema, stockWatchlistUpdateRequestSchema, stockWatchlistMutationResponseSchema, stockWatchlistResponseSchema, STOCK_WATCHLIST_MAX_ITEMS } from '@diary/contracts/watchlist'
import { stocks, stockWatchlists, stockTimelineRecords, type Database } from '@diary/db'
import { and, asc, count, desc, eq, inArray, max, sql } from 'drizzle-orm'
import type { Context, Hono } from 'hono'
import type { z } from 'zod'
import type { AppEnv } from './app.js'


type DbTransaction = Parameters<Parameters<Database['transaction']>[0]>[0]
export const watchlistLock = (userId: bigint) => sql`select pg_advisory_xact_lock(hashtextextended(${'watchlist:' + userId.toString()}, 0::bigint))`
export async function ensureWatchingStock(tx: DbTransaction, userId: bigint, symbol: string, timestamp: Date) {
  await tx.execute(watchlistLock(userId))
  await tx.insert(stocks).values({ symbol }).onConflictDoNothing({ target: stocks.symbol })
  const [stock] = await tx.select().from(stocks).where(eq(stocks.symbol, symbol))
  if (!stock) throw new Error('Canonical stock unavailable after insert')
  const [last] = await tx.select({ sortOrder: max(stockWatchlists.sortOrder) }).from(stockWatchlists).where(eq(stockWatchlists.userId, userId))
  const [item] = await tx.insert(stockWatchlists).values({
    userId, stockId: stock.id, sortOrder: (last?.sortOrder ?? -1) + 1, updatedAt: timestamp,
  }).onConflictDoUpdate({ target: [stockWatchlists.userId, stockWatchlists.stockId], set: { status: 'WATCHING', updatedAt: timestamp } }).returning()
  if (!item) throw new Error('Watchlist insert returned no row')
  return { item, stock }
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

  app.get('/api/stocks/watchlist', async c => {
    const userId = owner(c)
    const result = await db.transaction(async tx => {
      const rows = await tx.select({ item: stockWatchlists, stock: stocks }).from(stockWatchlists)
        .innerJoin(stocks, eq(stocks.id, stockWatchlists.stockId))
        .where(and(eq(stockWatchlists.userId, userId), eq(stockWatchlists.status, 'WATCHING')))
        .orderBy(asc(stockWatchlists.sortOrder), asc(stockWatchlists.id)).limit(STOCK_WATCHLIST_MAX_ITEMS)
      if (!rows.length) return { items: [] }
      const where = and(eq(stockTimelineRecords.userId, userId), inArray(stockTimelineRecords.stockId, rows.map(row => row.stock.id)))
      const counts = await tx.select({ stockId: stockTimelineRecords.stockId, total: count() }).from(stockTimelineRecords).where(where).groupBy(stockTimelineRecords.stockId)
      const latest = await tx.selectDistinctOn([stockTimelineRecords.stockId]).from(stockTimelineRecords).where(where)
        .orderBy(asc(stockTimelineRecords.stockId), desc(stockTimelineRecords.occurredAt), desc(stockTimelineRecords.id))
      const countMap = new Map(counts.map(row => [row.stockId, row.total]))
      const latestMap = new Map(latest.map(row => [row.stockId, row]))
      return stockWatchlistResponseSchema.parse({ items: rows.map(({ item, stock }) => {
        const record = latestMap.get(stock.id)
        return {
          id: String(item.id), status: item.status, sortOrder: item.sortOrder, updatedAt: item.updatedAt.toISOString(),
          stock: { symbol: stock.symbol, name: stock.name }, recordCount: countMap.get(stock.id) ?? 0,
          latestRecord: record ? { id: String(record.id), summary: record.summary, occurredAt: record.occurredAt.toISOString(), sourceType: record.sourceType, sourceTitle: record.sourceTitle, confidence: record.confidence } : null,
        }
      }) })
    }, { isolationLevel: 'repeatable read', accessMode: 'read only' })
    return c.json(result)
  })

  app.post('/api/stocks/watchlist', async c => {
    const userId = owner(c), input = await parseJson(c, stockWatchlistCreateRequestSchema)
    const result = await db.transaction(async tx => {
      const { item, stock } = await ensureWatchingStock(tx, userId, input.symbol, now())
      return stockWatchlistMutationResponseSchema.parse({ id: String(item.id), symbol: stock.symbol, sortOrder: item.sortOrder, status: item.status })
    })
    return c.json(result, 200)
  })

  app.patch('/api/stocks/watchlist/:id', async c => {
    const userId = owner(c), itemId = id(c), input = await parseJson(c, stockWatchlistUpdateRequestSchema)
    const result = await db.transaction(async tx => {
      await tx.execute(lock(userId))
      const [item] = await tx.update(stockWatchlists).set({ ...input, updatedAt: now() })
        .where(and(eq(stockWatchlists.id, itemId), eq(stockWatchlists.userId, userId))).returning()
      if (!item) return undefined
      const [stock] = await tx.select().from(stocks).where(eq(stocks.id, item.stockId))
      if (!stock) throw new Error('Canonical stock missing')
      return stockWatchlistMutationResponseSchema.parse({ id: String(item.id), symbol: stock.symbol, status: item.status, sortOrder: item.sortOrder, updatedAt: item.updatedAt.toISOString() })
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
      return item
    })
    if (!result) fail(404, 'WATCHLIST_ITEM_NOT_FOUND', `Watchlist item ${itemId} not found`)
    return c.json({ success: true })
  })
}
