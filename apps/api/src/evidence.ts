import { type ErrorCode } from '@diary/contracts'
import { stockSymbolSchema } from '@diary/contracts/watchlist'
import { stockTimelineQuerySchema, webEvidenceRequestSchema, stockTimelineListResponseSchema, stockSymbolTimelineResponseSchema, toStockTimelineRecordResponse } from '@diary/contracts/evidence'
import { stocks, stockTimelineRecords, type Database } from '@diary/db'
import { and, desc, eq } from 'drizzle-orm'
import type { Context, Hono } from 'hono'
import type { z } from 'zod'
import type { AppEnv } from './app.js'
import { insertStockTimelineRecord } from './stock-timeline-capture.js'
import { ensureWatchingStock } from './watchlist.js'

export function registerEvidenceRoutes(app: Hono<AppEnv>, dependencies: {
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
  const symbolParam = (c: Context<AppEnv>) => {
    const result = stockSymbolSchema.safeParse(c.req.param('symbol'))
    if (!result.success) return validationError(result.error)
    return result.data
  }
  async function read(c: Context<AppEnv>, userId: bigint, symbol?: string) {
    const query = stockTimelineQuerySchema.safeParse(c.req.query())
    if (!query.success) return validationError(query.error)
    const rows = await db.select({ record: stockTimelineRecords, stock: { symbol: stocks.symbol } }).from(stockTimelineRecords)
      .innerJoin(stocks, eq(stocks.id, stockTimelineRecords.stockId))
      .where(and(eq(stockTimelineRecords.userId, userId), symbol === undefined ? undefined : eq(stocks.symbol, symbol)))
      .orderBy(desc(stockTimelineRecords.occurredAt), desc(stockTimelineRecords.id)).limit(query.data.limit)
    return rows.map(row => toStockTimelineRecordResponse({ ...row.record, stock: row.stock }))
  }
  app.get('/api/stocks/timeline', async c => c.json(stockTimelineListResponseSchema.parse({ records: await read(c, owner(c)) })))
  app.get('/api/stocks/:symbol/timeline', async c => {
    const userId = owner(c), symbol = symbolParam(c)
    return c.json(stockSymbolTimelineResponseSchema.parse({ stock: { symbol, name: null }, records: await read(c, userId, symbol) }))
  })
  app.post('/api/stocks/:symbol/evidence', async c => {
    const userId = owner(c), symbol = symbolParam(c), input = await parseJson(c, webEvidenceRequestSchema)
    const record = await db.transaction(async tx => {
      const timestamp = now()
      const { stock } = await ensureWatchingStock(tx, userId, symbol, timestamp)
      const { record } = await insertStockTimelineRecord(tx, {
        userId,
        stockId: stock.id,
        summary: input.summary,
        sourceType: input.sourceType,
        sourceTitle: input.sourceTitle,
        sourceUrl: input.sourceUrl,
        idempotencyKey: input.idempotencyKey,
        occurredAt: new Date(input.occurredAt),
        metadataJson: input.metadataJson,
        createdVia: 'WEB',
        createdByLabel: null,
        now: timestamp,
      })
      return toStockTimelineRecordResponse({ ...record, stock })
    })
    return c.json(record, 200)
  })
}
