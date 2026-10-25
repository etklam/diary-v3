import type { Hono } from 'hono'
import { fail, validationError, type AppEnv } from '../app-context.js'
import { registerCompanyHubRoute } from '../company-hub.js'
import { registerPerformanceRoute } from '../performance.js'
import { registerPortfolioAttentionRoutes } from '../portfolio-attention.js'
import type { SurfaceContext } from './context.js'

/**
 * Derived reads over the ledger and the market: performance statistics, the
 * attention list and the per-company hub. The portfolio's own write routes
 * register in the composition root, after authentication.
 */
export function registerPerformanceSurface(app: Hono<AppEnv>, { db, now, market, logger }: SurfaceContext) {
  registerPerformanceRoute(app, { db, fail, validationError })
  registerPortfolioAttentionRoutes(app, { db, now, market, fail, validationError, logger })
  registerCompanyHubRoute(app, { db, now, market, fail, validationError })
}
