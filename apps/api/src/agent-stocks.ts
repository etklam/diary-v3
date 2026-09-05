import type { Context, Hono } from 'hono'
import type { z } from 'zod'
import type { ErrorCode } from '@diary/contracts'
import { stockSymbolSchema, STOCK_WATCHLIST_MAX_ITEMS, agentWatchlistResponseSchema } from '@diary/contracts/watchlist'
import { stockNoteCreateRequestSchema, toStockNoteContractResponse } from '@diary/contracts/stock-note'
import { agentTimelineBatchRequestSchema, agentTimelineBatchResponseSchema } from '@diary/contracts/evidence'
import { diaries, stockTimelineRecords, stocks, stockWatchlists, stockNotes, type Database } from '@diary/db'
import { and, asc, eq } from 'drizzle-orm'
import type { AppEnv } from './app.js'
import { ensureWatchingStock, watchlistLock } from './watchlist.js'
export function registerAgentStockRoutes(app: Hono<AppEnv>, dependencies: {
 db: Database; now: () => Date; fail: (status: number, code: ErrorCode, message: string) => never
 validationError: (error: z.ZodError) => never; parseJson: <T>(context: Context<AppEnv>, schema: z.ZodType<T>) => Promise<T>
}) {
 const { db, now, fail, validationError, parseJson } = dependencies
 const agent = (c: Context<AppEnv>) => {
  c.header('Cache-Control', 'no-store'); const key = c.get('apiKey')
  if (!key) return fail(401, 'AUTH_TOKEN_INVALID', 'API key required')
  if (key.scope !== 'AGENT_WRITE') return fail(403, 'AUTH_API_KEY_SCOPE_DENIED', 'API key scope denied')
  return key
 }
 app.post('/api/agent/stocks/records', async c => {
  const key = agent(c), input = await parseJson(c, agentTimelineBatchRequestSchema), userId = BigInt(key.userId)
  const result = await db.transaction(async tx => {
   await tx.execute(watchlistLock(userId))
   const watching = await tx.select({ symbol: stocks.symbol, stockId: stocks.id }).from(stockWatchlists).innerJoin(stocks, eq(stocks.id, stockWatchlists.stockId)).where(and(eq(stockWatchlists.userId, userId), eq(stockWatchlists.status, 'WATCHING')))
   const watchMap = new Map(watching.map(row => [row.symbol, row.stockId]))
   const created: string[] = [], skipped: { symbol: string; reason: 'NOT_IN_WATCHLIST' | 'SOURCE_DIARY_NOT_OWNED' | 'ALREADY_EXISTS' }[] = []
   for (const record of input.records) {
    const stockId = watchMap.get(record.symbol)
    if (!stockId) { skipped.push({ symbol: record.symbol, reason: 'NOT_IN_WATCHLIST' }); continue }
    if (record.sourceDiaryId) {
     const [owned] = await tx.select({ id: diaries.id }).from(diaries).where(and(eq(diaries.id, BigInt(record.sourceDiaryId)), eq(diaries.userId, userId))).for('key share')
     if (!owned) { skipped.push({ symbol: record.symbol, reason: 'SOURCE_DIARY_NOT_OWNED' }); continue }
    }
    const [row] = await tx.insert(stockTimelineRecords).values({
     userId, stockId, summary: record.summary, sourceType: record.sourceType, sourceTitle: record.sourceTitle ?? null, sourceUrl: record.sourceUrl ?? null,
     sourceDiaryId: record.sourceDiaryId ? BigInt(record.sourceDiaryId) : null, sourceExternalId: record.sourceExternalId ?? null, sourceExcerpt: record.sourceExcerpt ?? null,
     confidence: record.confidence ?? null, idempotencyKey: record.idempotencyKey, occurredAt: new Date(record.occurredAt), metadataJson: record.metadataJson ?? null,
     createdVia: 'API_KEY', createdByLabel: key.label, createdAt: now(), updatedAt: now(),
    }).onConflictDoNothing({ target: [stockTimelineRecords.userId, stockTimelineRecords.stockId, stockTimelineRecords.idempotencyKey] }).returning({ id: stockTimelineRecords.id })
    if (row) created.push(String(row.id)); else skipped.push({ symbol: record.symbol, reason: 'ALREADY_EXISTS' })
   }
   return { created, updated: [], skipped }
  })
  return c.json(agentTimelineBatchResponseSchema.parse(result))
 })
 app.get('/api/agent/stocks/watchlist', async c => {
  const key = agent(c)
  const rows = await db.select({ id: stockWatchlists.id, symbol: stocks.symbol, name: stocks.name, sortOrder: stockWatchlists.sortOrder, status: stockWatchlists.status }).from(stockWatchlists).innerJoin(stocks, eq(stocks.id, stockWatchlists.stockId)).where(and(eq(stockWatchlists.userId, BigInt(key.userId)), eq(stockWatchlists.status, 'WATCHING'))).orderBy(asc(stockWatchlists.sortOrder), asc(stockWatchlists.id)).limit(STOCK_WATCHLIST_MAX_ITEMS)
  return c.json(agentWatchlistResponseSchema.parse({ watchlist: rows.map(row => ({ ...row, id: String(row.id) })) }))
 })
 app.post('/api/agent/stocks/:symbol/notes', async c => {
  const key = agent(c), symbol = stockSymbolSchema.safeParse(c.req.param('symbol'))
  if (!symbol.success) return validationError(symbol.error)
  const input = await parseJson(c, stockNoteCreateRequestSchema)
  const result = await db.transaction(async tx => {
   const { stock } = await ensureWatchingStock(tx, BigInt(key.userId), symbol.data, now())
   const [note] = await tx.insert(stockNotes).values({ userId: BigInt(key.userId), stockId: stock.id, title: input.title, content: input.content, date: input.date ? new Date(input.date) : now(), createdVia: 'AGENT', createdByLabel: key.label, createdAt: now(), updatedAt: now() }).returning()
   return toStockNoteContractResponse({ ...note!, stock })
  })
  return c.json(result)
 })
}
