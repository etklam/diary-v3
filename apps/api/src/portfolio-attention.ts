import { type ErrorCode } from '@diary/contracts'
import { portfolioAttentionQuerySchema, portfolioAttentionResponseSchema } from '@diary/contracts/portfolio-attention'
import { evaluatePortfolioAttention } from '@diary/domain/portfolio-attention'
import { concentration } from '@diary/domain/portfolio'
import { investmentTheses, stocks, type Database } from '@diary/db'
import { eq, sql } from 'drizzle-orm'
import type { Context, Hono } from 'hono'
import type { z } from 'zod'
import type { AppEnv } from './app.js'
import type { createMarketData } from './market-data/index.js'
import { valuePortfolio } from './portfolio.js'

export function registerPortfolioAttentionRoutes(app: Hono<AppEnv>, dependencies: {
  db: Database; now: () => Date; market: ReturnType<typeof createMarketData>
  fail: (status: number, code: ErrorCode, message: string) => never
  validationError: (error: z.ZodError) => never
}) {
  const { db, now, market, fail, validationError } = dependencies
  const read = async (c: Context<AppEnv>) => {
    c.header('Cache-Control', 'no-store'); const user = c.get('user')
    if (!user) return fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    const parsed = portfolioAttentionQuerySchema.safeParse(c.req.query()); if (!parsed.success) return validationError(parsed.error)
    const userId = BigInt(user.id), asOf = now()
    const { holdings, valuation } = await valuePortfolio(db, userId, market, asOf)
    const concentrationBySymbol = concentration(holdings, { basis: 'market_value' })
    const { theses, diaryReviews } = await db.transaction(async tx => {
      const theses = await tx.select({ symbol: stocks.symbol, status: investmentTheses.status, reviewDueAt: investmentTheses.reviewDueAt, lastReviewedAt: investmentTheses.lastReviewedAt, latestOutcome: investmentTheses.latestReviewOutcome })
        .from(investmentTheses).innerJoin(stocks, eq(stocks.id, investmentTheses.stockId)).where(eq(investmentTheses.userId, userId))
      // Filter completed rows before the source's 100-candidate limit. Explicit
      // stock contexts use a deterministic symbol order rather than join order.
      const rows = await tx.execute(sql`select d.id::text as id,d.title,d.review_due_at as "reviewDueAt",d.review_status as "reviewStatus",
        (select s.symbol from diary_stocks ds join stocks s on s.id=ds.stock_id where ds.diary_id=d.id order by s.symbol limit 1) as symbol
        from diaries d where d.user_id=${userId} and d.review_status <> 'reviewed' and d.review_due_at is not null
        order by d.review_due_at asc,d.id asc limit 100`)
      return { theses, diaryReviews: rows.rows.map(row => ({ id: String(row.id), title: String(row.title), reviewDueAt: row.reviewDueAt as Date, reviewStatus: String(row.reviewStatus), symbol: row.symbol === null ? null : String(row.symbol) })) }
    }, { isolationLevel: 'repeatable read', accessMode: 'read only' })
    return c.json(portfolioAttentionResponseSchema.parse({
      items: evaluatePortfolioAttention({ asOf, maxItems: 50, holdings: holdings.map(row => ({ symbol: row.symbol, quantity: row.quantity, concentrationPct: concentrationBySymbol.get(row.symbol) ?? null })), theses, diaryReviews }),
      asOf: asOf.toISOString(), coverage: { valuationStatus: valuation.valuationStatus, complete: valuation.valuationStatus === 'complete' || valuation.valuationStatus === 'empty', priced: valuation.pricedPositionCount, total: valuation.totalHoldings },
    }))
  }
  app.get('/api/portfolio/attention', read)
  app.get('/api/stocks/attention', read)
}
