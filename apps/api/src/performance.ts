import { type ErrorCode } from '@diary/contracts'
import { performanceQuerySchema, performanceResponseSchema } from '@diary/contracts/performance'
import { computePerformanceStats } from '@diary/domain/performance-stats'
import type { Database } from '@diary/db'
import type { Hono } from 'hono'
import type { z } from 'zod'
import type { AppEnv } from './app.js'
import { readUserLedger } from './ledger.js'
export function registerPerformanceRoute(app: Hono<AppEnv>, dependencies: {
  db: Database; fail: (status: number, code: ErrorCode, message: string) => never; validationError: (error: z.ZodError) => never
}) {
  const { db, fail, validationError } = dependencies
  app.get('/api/stats/performance', async c => {
    c.header('Cache-Control', 'no-store'); const user = c.get('user'); if (!user) return fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    const parsed = performanceQuerySchema.safeParse(c.req.query()); if (!parsed.success) return validationError(parsed.error)
    const rows = await readUserLedger(db, BigInt(user.id))
    const result = computePerformanceStats(parsed.data.symbol ? rows.filter(row => row.symbol === parsed.data.symbol) : rows, { period: parsed.data.period })
    return c.json(performanceResponseSchema.parse({ ...result,
      topWins: result.topWins.map(trade => ({ ...trade, sellDate: trade.sellDate.toISOString() })),
      topLosses: result.topLosses.map(trade => ({ ...trade, sellDate: trade.sellDate.toISOString() })),
    }))
  })
}
