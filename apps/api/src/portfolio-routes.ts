/**
 * Position and realized-performance reads over the ledger: current exposure,
 * holdings, live valuation, bounded quote lookups and the closed-trade feeds.
 */
import { recentClosedTradesQuerySchema } from '@diary/contracts/ledger'
import type { Database } from '@diary/db'
import type { Context, Hono } from 'hono'
import { z } from 'zod'
import { clientIp, fail, parseJson, validationError, type ApiConfig, type AppEnv } from './app-context.js'
import { getHoldings, getRecentClosedTrades } from './ledger.js'
import type { createMarketData } from './market-data/index.js'
import { readPortfolioExposure } from './portfolio-exposure.js'
import { batchQuotePrices, valuePortfolio } from './portfolio.js'
import { RATE_LIMIT_POLICIES, type RateLimitPolicy } from './rate-limit/index.js'
import { exportClosedTrades, tradeExportFilename } from './trade-export.js'

export function registerPortfolioRoutes(app: Hono<AppEnv>, dependencies: {
  db: Database
  config: ApiConfig
  now: () => Date
  market: ReturnType<typeof createMarketData>
  consume: (context: Context<AppEnv>, policy: RateLimitPolicy, scope: string, identity: string) => Promise<void>
}) {
  const { db, config, now, market, consume: consumeRateLimit } = dependencies

  app.get('/api/stocks/exposure', async c => {
    c.header('Cache-Control', 'no-store')
    const user = c.get('user'); if (!user) return fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    return c.json(await readPortfolioExposure(db, BigInt(user.id), now().toISOString().slice(0, 10)))
  })

  app.get('/api/stocks/holdings', async (c) => {
    const session = c.get('user')
    if (!session) fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    return c.json(await getHoldings(db, BigInt(session.id)), 200)
  })

  app.get('/api/stocks/portfolio', async c => {
    const session = c.get('user')
    if (!session) fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    c.header('Cache-Control', 'no-store')
    return c.json(await valuePortfolio(db, BigInt(session.id), market, now(), c.req.raw.signal))
  })

  app.post('/api/stocks/prices', async c => {
    const session = c.get('user')
    if (!session) fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    const input = await parseJson(c, z.object({ symbols: z.array(z.string().max(32)).min(1).max(25) }).strict())
    await consumeRateLimit(c, RATE_LIMIT_POLICIES.marketIp, 'ip', clientIp(c, config.trustProxy))
    const quotes = await batchQuotePrices(market, input.symbols, c.req.raw.signal)
    if (Object.keys(quotes).length === 0) fail(502, 'SYS_EXTERNAL_SERVICE_ERROR', 'Prices unavailable. Please try again later.')
    c.header('Cache-Control', 'no-store')
    return c.json(quotes)
  })

  app.get('/api/stats/recent-trades', async (c) => {
    const session = c.get('user')
    if (!session) fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    const query = recentClosedTradesQuerySchema.safeParse(c.req.query())
    if (!query.success) validationError(query.error)
    return c.json(await getRecentClosedTrades(db, BigInt(session.id), query.data, now()), 200)
  })

  app.get('/api/stats/export-trades', async (c) => {
    const session = c.get('user')
    if (!session) fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    const query = z.object({ symbol: z.string().trim().max(20).transform(value => value.toUpperCase()).optional() }).strict().safeParse(c.req.query())
    if (!query.success) validationError(query.error)
    const csv = await exportClosedTrades(db, BigInt(session.id), query.data.symbol)
    c.header('Content-Type', 'text/csv; charset=utf-8')
    c.header('Content-Disposition', `attachment; filename="${tradeExportFilename(now(), query.data.symbol)}"`)
    c.header('Cache-Control', 'no-store')
    return c.body(csv)
  })
}
