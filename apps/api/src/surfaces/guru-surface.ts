import type { Hono } from 'hono'
import { fail, parseJson, validationError, type AppEnv } from '../app-context.js'
import { registerGuruAnalysisRoutes } from '../guru-analysis/routes.js'
import { registerGuruComparisonRoutes } from '../guru-comparison-routes.js'
import { registerGuruConsensusRoutes } from '../guru-consensus-routes.js'
import { registerGuruNotificationRoutes } from '../guru-notifications/routes.js'
import { registerGuruResearchRoutes } from '../guru-research.js'
import { registerGuruRoutes } from '../gurus.js'
import type { SurfaceContext } from './context.js'

/**
 * Guru reading and following.
 *
 * ORDERING CONSTRAINT — this one is load-bearing. `registerGuruRoutes` owns
 * `/api/gurus/:slug`, and Hono matches in registration order, so every literal
 * `/api/gurus/*` path must register before it or a profile slug will shadow it.
 * `registerGuruRoutes` therefore stays last in this function, and the reserved
 * slugs are additionally a check constraint in the database.
 * `tests/unit/api-route-order.test.ts` asserts the literal-before-slug
 * relationship directly, not just the frozen order.
 */
export function registerGuruSurface(app: Hono<AppEnv>, { db, now }: SurfaceContext) {
  registerGuruResearchRoutes(app, { db, fail, validationError })
  registerGuruConsensusRoutes(app, { db, fail, validationError })
  registerGuruComparisonRoutes(app, { db, now, fail, validationError })
  registerGuruNotificationRoutes(app, { db, now, fail, validationError, parseJson })
  registerGuruAnalysisRoutes(app, { db, now, fail, validationError, parseJson })
  // Must stay last: see the ordering constraint above.
  registerGuruRoutes(app, { db, now, fail, validationError })
}
