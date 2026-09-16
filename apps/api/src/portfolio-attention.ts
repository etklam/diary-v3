import { type ErrorCode } from '@diary/contracts'
import { portfolioAttentionQuerySchema, portfolioAttentionResponseSchema } from '@diary/contracts/portfolio-attention'
import { portfolioOverviewResponseSchema } from '@diary/contracts/portfolio-overview'
import { evaluatePortfolioAttention } from '@diary/domain/portfolio-attention'
import { concentration } from '@diary/domain/portfolio'
import { getHoldings } from './ledger.js'
import { investmentTheses, stocks, type Database } from '@diary/db'
import { eq, sql } from 'drizzle-orm'
import type { Context, Hono } from 'hono'
import type { z } from 'zod'
import type { AppEnv } from './app.js'
import type { createMarketData } from './market-data/index.js'
import { valuePortfolio, valuePortfolioFromHoldings } from './portfolio.js'

type DbTransaction = Parameters<Parameters<Database['transaction']>[0]>[0]
type PortfolioValue = Awaited<ReturnType<typeof valuePortfolio>>

async function readAttentionFacts(tx: DbTransaction, userId: bigint) {
  const theses = await tx.select({ symbol: stocks.symbol, status: investmentTheses.status, reviewDueAt: investmentTheses.reviewDueAt, lastReviewedAt: investmentTheses.lastReviewedAt, latestOutcome: investmentTheses.latestReviewOutcome })
    .from(investmentTheses).innerJoin(stocks, eq(stocks.id, investmentTheses.stockId)).where(eq(investmentTheses.userId, userId))
  // Filter completed rows before the source's 100-candidate limit. Explicit
  // stock contexts use a deterministic symbol order rather than join order.
  const rows = await tx.execute(sql`select d.id::text as id,d.title,d.review_due_at as "reviewDueAt",d.review_status as "reviewStatus",
    (select s.symbol from diary_stocks ds join stocks s on s.id=ds.stock_id where ds.diary_id=d.id order by s.symbol limit 1) as symbol
    from diaries d where d.user_id=${userId} and d.review_status <> 'reviewed' and d.review_due_at is not null
    order by d.review_due_at asc,d.id asc limit 100`)
  return {
    theses,
    diaryReviews: rows.rows.map(row => ({
      id: String(row.id), title: String(row.title), reviewDueAt: row.reviewDueAt as Date,
      reviewStatus: String(row.reviewStatus), symbol: row.symbol === null ? null : String(row.symbol),
    })),
  }
}

function buildAttentionResponse(
  asOf: Date,
  portfolio: PortfolioValue,
  facts: Awaited<ReturnType<typeof readAttentionFacts>>,
) {
  const concentrationBySymbol = concentration(portfolio.holdings, { basis: 'market_value' })
  return portfolioAttentionResponseSchema.parse({
    items: evaluatePortfolioAttention({
      asOf,
      maxItems: 50,
      holdings: portfolio.holdings.map(row => ({
        symbol: row.symbol,
        quantity: row.quantity,
        concentrationPct: concentrationBySymbol.get(row.symbol) ?? null,
      })),
      theses: facts.theses,
      diaryReviews: facts.diaryReviews,
    }),
    asOf: asOf.toISOString(),
    coverage: {
      valuationStatus: portfolio.valuation.valuationStatus,
      complete: portfolio.valuation.valuationStatus === 'complete' || portfolio.valuation.valuationStatus === 'empty',
      priced: portfolio.valuation.pricedPositionCount,
      total: portfolio.valuation.totalHoldings,
    },
  })
}

function failedSection(requestId: string) {
  return { status: 'failed' as const, error: { code: 'SYS_INTERNAL_ERROR' as const, requestId } }
}

function logSectionFailure(logger: { error(message: string, context: Record<string, unknown>): void }, requestId: string, section: string, error: unknown) {
  logger.error('Overview portfolio composition failed', { requestId, section, error })
}

export function registerPortfolioAttentionRoutes(app: Hono<AppEnv>, dependencies: {
  db: Database; now: () => Date; market: ReturnType<typeof createMarketData>
  fail: (status: number, code: ErrorCode, message: string) => never
  validationError: (error: z.ZodError) => never
  logger: { error(message: string, context: Record<string, unknown>): void }
}) {
  const { db, now, market, fail, validationError, logger } = dependencies
  const read = async (c: Context<AppEnv>) => {
    c.header('Cache-Control', 'no-store'); const user = c.get('user')
    if (!user) return fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    const parsed = portfolioAttentionQuerySchema.safeParse(c.req.query()); if (!parsed.success) return validationError(parsed.error)
    const userId = BigInt(user.id), asOf = now()
    const portfolio = await valuePortfolio(db, userId, market, asOf, c.req.raw.signal)
    const facts = await db.transaction(tx => readAttentionFacts(tx, userId), { isolationLevel: 'repeatable read', accessMode: 'read only' })
    return c.json(buildAttentionResponse(asOf, portfolio, facts))
  }
  app.get('/api/portfolio/attention', read)
  app.get('/api/stocks/attention', read)

  app.get('/api/portfolio/overview', async c => {
    c.header('Cache-Control', 'no-store')
    const user = c.get('user')
    if (!user) return fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    const userId = BigInt(user.id), asOf = now(), requestId = c.get('requestId')
    let inputs: Awaited<ReturnType<typeof loadPortfolioInputs>>
    try {
      inputs = await loadPortfolioInputs(db, userId)
    } catch (error) {
      logSectionFailure(logger, requestId, 'snapshot', error)
      const failed = failedSection(requestId)
      return c.json(portfolioOverviewResponseSchema.parse({ attention: failed, valuation: failed }))
    }

    let valuation: PortfolioValue
    try {
      valuation = await valuePortfolioFromHoldings(inputs.holdings, market, asOf, c.req.raw.signal)
    } catch (error) {
      logSectionFailure(logger, requestId, 'valuation', error)
      const failed = failedSection(requestId)
      return c.json(portfolioOverviewResponseSchema.parse({ attention: failed, valuation: failed }))
    }

    let attention
    try {
      attention = buildAttentionResponse(asOf, valuation, inputs.facts)
    } catch (error) {
      logSectionFailure(logger, requestId, 'attention', error)
    }
    return c.json(portfolioOverviewResponseSchema.parse({
      valuation: { status: 'ready', data: valuation },
      attention: attention ? { status: 'ready', data: attention } : failedSection(requestId),
    }))
  })
}

async function loadPortfolioInputs(db: Database, userId: bigint) {
  return db.transaction(async tx => ({
    holdings: await getHoldings(tx, userId),
    facts: await readAttentionFacts(tx, userId),
  }), { isolationLevel: 'repeatable read', accessMode: 'read only' })
}
