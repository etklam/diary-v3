import type { Hono } from 'hono'
import {
  marketRotationMonitorQuerySchema,
  marketRotationMonitorResponseSchema,
} from '@diary/contracts/rotation-monitor'
import { fail, parseJson, validationError, type AppEnv } from '../app-context.js'
import { createNagerHolidayProvider, registerHolidayRoutes, type HolidayProvider } from '../holidays.js'
import { registerEtfAdminRoutes } from '../etf-admin.js'
import { registerEtfProfileRoutes } from '../etf-profile.js'
import { registerEtfWatchlistRoutes } from '../etf-watchlist.js'
import { registerMarketRoutes } from '../market-routes.js'
import { registerMarketStateRoutes } from '../market-state-routes.js'
import { registerRotationAdmin } from '../rotation-admin.js'
import { registerSecFilingRoutes } from '../sec-filings.js'
import { readRotationMonitor } from '../rotation-monitor.js'
import { runRotationBatch } from '../rotation-batch.js'
import { createSecEdgarService, type SecEdgarService } from '../sec-edgar/service.js'
import { createPostgresSecSharedScheduler } from '../sec-edgar/postgres-scheduler.js'
import type { SurfaceContext } from './context.js'

interface MarketSurfaceDependencies {
  secFilings?: SecEdgarService
  holidays?: HolidayProvider
  databasePool?: Pick<import('pg').Pool, 'connect'>
}

/**
 * Market, ETF and calendar reads, plus the SEC filing tool.
 *
 * SEC filings are a research tool rather than market data, and they register
 * here because they share this surface's policy exactly: an unauthenticated
 * provider-backed read, throttled per client IP. Nothing else in the API needs
 * `clientIp`.
 *
 * No ordering constraint inside this surface — every registrar owns a disjoint
 * path prefix. The frozen order in `tests/unit/api-route-order.test.ts` is what
 * proves that stays true.
 */
export function registerMarketSurface(
  app: Hono<AppEnv>,
  context: SurfaceContext,
  { secFilings, holidays, databasePool }: MarketSurfaceDependencies,
) {
  const { db, config, now, market, consume, clientIp } = context

  registerMarketRoutes(app, { market, consume, clientIp, fail, validationError })
  registerSecFilingRoutes(app, {
    service:
      secFilings ??
      createSecEdgarService(
        config.secUserAgent ?? '',
        undefined,
        createPostgresSecSharedScheduler(db),
        config.secCacheMaxBytes,
      ),
    consume,
    clientIp,
    fail,
    validationError,
  })

  app.get('/api/market/rotation-monitor', async c => {
    c.header('Cache-Control', 'no-store')
    const query = marketRotationMonitorQuerySchema.safeParse(c.req.query())
    if (!query.success) return validationError(query.error)
    const snapshot = await readRotationMonitor(db, query.data.scope, now().toISOString().slice(0, 10))
    if (!snapshot) return fail(404, 'SYS_NOT_FOUND', 'No qualified rotation snapshots available')
    return c.json(marketRotationMonitorResponseSchema.parse(snapshot.payload))
  })

  registerMarketStateRoutes(app, { db, fail, validationError })
  registerRotationAdmin(app, {
    run: databasePool ? scope => runRotationBatch({ db, pool: databasePool, market, now }, scope) : undefined,
    parseJson,
    fail,
  })
  registerEtfProfileRoutes(app, { market, now, validationError })
  registerEtfWatchlistRoutes(app, { db, now, fail, validationError, parseJson })
  registerEtfAdminRoutes(app, { db, now, market, fail, validationError, parseJson })
  registerHolidayRoutes(app, { holidays: holidays ?? createNagerHolidayProvider(), fail, validationError })
}
