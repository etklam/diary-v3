import type { Context, Hono } from 'hono'
import type { z } from 'zod'
import { serializedIdSchema, type ErrorCode } from '@diary/contracts'
import { adminEtfCreateSchema, adminEtfCreatedSchema, adminEtfListSchema, adminEtfSeedSchema, adminEtfDeleteSchema, adminEtfInitializeSchema } from '@diary/contracts/etf'
import { etfs, etfPrices, etfWatchlists, type Database } from '@diary/db'
import { asc, count, eq, sql } from 'drizzle-orm'
import type { AppEnv } from './app.js'
import { MarketDataError, type createMarketData } from './market-data/index.js'
import { COMMON_ETFS } from './etf-seed.js'
export function registerEtfAdminRoutes(app: Hono<AppEnv>, dependencies: {
 db: Database; now: () => Date; market: ReturnType<typeof createMarketData>
 fail: (status: number, code: ErrorCode, message: string) => never
 validationError: (error: z.ZodError) => never; parseJson: <T>(context: Context<AppEnv>, schema: z.ZodType<T>) => Promise<T>
}) {
 const { db, now, market, fail, validationError, parseJson } = dependencies
 const admin = (c: Context<AppEnv>) => { c.header('Cache-Control', 'no-store'); const user = c.get('user'); if (!user) fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required'); if (user.role !== 'ADMIN') fail(403, 'AUTH_FORBIDDEN', 'Admin access required') }
 const id = (c: Context<AppEnv>) => { const parsed = serializedIdSchema.safeParse(c.req.param('id')); return parsed.success ? BigInt(parsed.data) : validationError(parsed.error) }
 const external = (error: unknown): never => { if (error instanceof MarketDataError && error.kind === 'rate-limited') return fail(429, 'AUTH_RATE_LIMITED', 'Market provider rate limited'); return fail(502, 'SYS_EXTERNAL_SERVICE_ERROR', 'Unable to retrieve ETF market data') }
 app.get('/api/admin/etf', async c => {
  admin(c)
  const rows = await db.select({ id: etfs.id, symbol: etfs.symbol, name: etfs.name, createdAt: etfs.createdAt, updatedAt: etfs.updatedAt,
   priceCount: sql<number>`(select count(*)::int from ${etfPrices} where etf_prices.etf_id=etfs.id)`, watchlistCount: sql<number>`(select count(*)::int from ${etfWatchlists} where etf_watchlists.etf_id=etfs.id)`,
  }).from(etfs).orderBy(asc(etfs.symbol))
  return c.json(adminEtfListSchema.parse(rows.map(row => ({ ...row, id: String(row.id), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }))))
 })
 app.post('/api/admin/etf', async c => {
  admin(c); const input = await parseJson(c, adminEtfCreateSchema)
  if ((await db.select({ id: etfs.id }).from(etfs).where(eq(etfs.symbol, input.symbol))).length) return fail(409, 'ETF_ALREADY_IN_WATCHLIST', 'ETF already exists')
  if (!input.skipValidation) {
   let quote
   try { quote = await market.quote(input.symbol, true) } catch (error) { if (error instanceof MarketDataError && error.kind === 'not-found') return fail(400, 'SYS_VALIDATION_ERROR', 'Invalid ETF symbol'); return external(error) }
   if (quote.source === 'stale') return external(null)
  }
  const [created] = await db.insert(etfs).values({ symbol: input.symbol, name: input.name, createdAt: now(), updatedAt: now() }).onConflictDoNothing({ target: etfs.symbol }).returning()
  if (!created) return fail(409, 'ETF_ALREADY_IN_WATCHLIST', 'ETF already exists')
  return c.json(adminEtfCreatedSchema.parse({ id: String(created.id), symbol: created.symbol, name: created.name, createdAt: created.createdAt.toISOString() }))
 })
 app.post('/api/admin/etf/seed', async c => {
  admin(c)
  const result = await db.transaction(async tx => { const added = await tx.insert(etfs).values(COMMON_ETFS.map(row => ({ ...row, createdAt: now(), updatedAt: now() }))).onConflictDoNothing({ target: etfs.symbol }).returning({ id: etfs.id }); const [total] = await tx.select({ count: count() }).from(etfs); return { success: true, added: added.length, skipped: COMMON_ETFS.length - added.length, total: total!.count } })
  return c.json(adminEtfSeedSchema.parse(result))
 })
 app.delete('/api/admin/etf/:id', async c => {
  admin(c); const etfId = id(c)
  const result = await db.transaction(async tx => {
   const [row] = await tx.select({ id: etfs.id }).from(etfs).where(eq(etfs.id, etfId)).for('update'); if (!row) return fail(404, 'ETF_NOT_FOUND', 'ETF not found')
   const [prices] = await tx.select({ count: count() }).from(etfPrices).where(eq(etfPrices.etfId, etfId)); const [watchlists] = await tx.select({ count: count() }).from(etfWatchlists).where(eq(etfWatchlists.etfId, etfId))
   await tx.delete(etfs).where(eq(etfs.id, etfId)); return { success: true, deletedPrices: prices!.count, deletedWatchlists: watchlists!.count }
  })
  return c.json(adminEtfDeleteSchema.parse(result))
 })
 app.post('/api/admin/etf/:id/initialize', async c => {
  admin(c); const etfId = id(c), [etf] = await db.select().from(etfs).where(eq(etfs.id, etfId)); if (!etf) return fail(404, 'ETF_NOT_FOUND', 'ETF not found')
  let history
  try { history = await market.monthly(etf.symbol) } catch (error) { return external(error) }
  if (history.source === 'stale') return external(null)
  const prices = history.data.map(row => ({ etfId, date: new Date(row.timestamp * 1000).toISOString().slice(0,10), open: row.open.toFixed(4), high: row.high.toFixed(4), low: row.low.toFixed(4), close: row.close.toFixed(4), adjClose: row.adjClose.toFixed(4), volume: row.volume === null ? null : BigInt(row.volume), createdAt: now() }))
  const added = await db.transaction(async tx => {
   const [current] = await tx.select({ id: etfs.id }).from(etfs).where(eq(etfs.id, etfId)).for('update'); if (!current) return fail(404, 'ETF_NOT_FOUND', 'ETF not found')
   return tx.insert(etfPrices).values(prices).onConflictDoNothing({ target: [etfPrices.etfId, etfPrices.date] }).returning({ id: etfPrices.id })
  })
  return c.json(adminEtfInitializeSchema.parse({ success: true, added: added.length, total: prices.length, symbol: etf.symbol, dateRange: { from: prices[0]!.date, to: prices.at(-1)!.date } }))
 })
}
