import type { Context } from 'hono'
import type { Database } from '@diary/db'
import type { createMarketData } from '../market-data/index.js'
import type { RateLimitPolicy } from '../rate-limit/index.js'
import type { ApiConfig, AppEnv } from '../app-context.js'

/**
 * What every route surface needs from the composition root.
 *
 * Deliberately small. `fail`, `validationError` and `parseJson` are module
 * imports from `app-context.js`, so they do not travel here, and nothing
 * domain-specific does either: a surface that needs the SEC service or the SMTP
 * keyring takes it as its own second argument. The point of grouping the root's
 * registrar calls was to stop one file owning everything, which a context
 * object carrying every dependency would quietly reinstate.
 *
 * Leaf registrars keep the exact dependency sets they have today.
 * `registerDiaryRoutes(app, { db, now })` does not grow unused error helpers to
 * make its call look like its neighbours.
 */
export interface SurfaceContext {
  db: Database
  config: ApiConfig
  now: () => Date
  logger: {
    error(message: string, context: Record<string, unknown>): void
    info?(message: string, context?: Record<string, unknown>): void
  }
  market: ReturnType<typeof createMarketData>
  consume: (context: Context<AppEnv>, policy: RateLimitPolicy, scope: string, identity: string) => Promise<void>
  /** Already bound to `config.trustProxy` by the root. */
  clientIp: (context: Context<AppEnv>) => string
}
