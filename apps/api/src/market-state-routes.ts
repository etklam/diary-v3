import type { Hono } from 'hono'
import {
  marketStateHistoryQuerySchema,
  marketStateHistoryResponseSchema,
  marketStateSnapshotQuerySchema,
  marketStateSnapshotSchema,
} from '@diary/contracts/market-state'
import type { ErrorCode } from '@diary/contracts'
import type { Database } from '@diary/db'
import type { AppEnv } from './app.js'
import {
  getBreadthHistory,
  getLatestBreadthSnapshot,
  getRegimeGuidance,
} from './market-state-queries.js'

export function registerMarketStateRoutes(
  app: Hono<AppEnv>,
  dependencies: {
    db: Database
    fail: (status: number, code: ErrorCode, message: string) => never
    validationError: (error: import('zod').ZodError) => never
  },
) {
  app.get('/api/market/state/snapshot', async c => {
    c.header('Cache-Control', 'no-store')
    const query = marketStateSnapshotQuerySchema.safeParse(c.req.query())
    if (!query.success) dependencies.validationError(query.error)
    const snapshot = await getLatestBreadthSnapshot(dependencies.db)
    if (!snapshot) return dependencies.fail(404, 'SYS_NOT_FOUND', 'No market state snapshot available')
    const guidance = getRegimeGuidance(snapshot.marketState)
    return c.json(marketStateSnapshotSchema.parse({ ...snapshot, ...guidance }))
  })

  app.get('/api/market/state/history', async c => {
    c.header('Cache-Control', 'no-store')
    const query = marketStateHistoryQuerySchema.safeParse(c.req.query())
    if (!query.success) dependencies.validationError(query.error)
    const history = await getBreadthHistory(dependencies.db, query.data.days)
    return c.json(marketStateHistoryResponseSchema.parse(history.map(({ date, up4, down4, up4Pct, down4Pct, ratio10d, above40dPct, marketState }) => ({
      date, up4, down4, up4Pct, down4Pct, ratio10d, above40dPct, marketState,
    }))))
  })
}
