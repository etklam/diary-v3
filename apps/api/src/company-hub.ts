import { type ErrorCode } from '@diary/contracts'
import { companyHubResponseSchema } from '@diary/contracts/company-hub'
import { stockSymbolSchema } from '@diary/contracts/watchlist'
import { concentration } from '@diary/domain/portfolio'
import { stocks, stockWatchlists, investmentTheses, thesisReviews, stockNotes, stockTimelineRecords, users, partnerLinks, type Database } from '@diary/db'
import { and, desc, eq, sql, or } from 'drizzle-orm'
import type { Hono } from 'hono'
import type { z } from 'zod'
import type { AppEnv } from './app.js'
import type { createMarketData } from './market-data/index.js'
import { getHoldings } from './ledger.js'
import { serializeThesis, serializeThesisReview } from './investment-thesis.js'

export function registerCompanyHubRoute(app: Hono<AppEnv>, dependencies: {
  db: Database; now: () => Date; market: ReturnType<typeof createMarketData>
  fail: (status: number, code: ErrorCode, message: string) => never
  validationError: (error: z.ZodError) => never
}) {
  const { db, now, market, fail, validationError } = dependencies
  app.get('/api/stocks/:symbol/hub', async c => {
    c.header('Cache-Control', 'no-store')
    const user = c.get('user'); if (!user) return fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    const parsed = stockSymbolSchema.safeParse(c.req.param('symbol')); if (!parsed.success) return validationError(parsed.error)
    const symbol = parsed.data, userId = BigInt(user.id)
    // Provider errors affect valuation only; owner data uses one coherent snapshot.
    const quotePromise = market.quote(symbol).then(({ data }) => data.regularMarketPrice >= 0 ? data : null).catch(() => null)
    const snapshot = await db.transaction(async tx => {
      const [stock] = await tx.select().from(stocks).where(eq(stocks.symbol, symbol))
      const holdings = (await getHoldings(tx, userId)).map(row => ({ symbol: row.symbol, quantity: Number(row.quantity), avgCost: Number(row.avgCost), totalCost: Number(row.totalCost) }))
      const holding = holdings.find(row => row.symbol === symbol)
      const history = await tx.execute(sql`select exists(select 1 from transactions where user_id=${userId} and symbol=${symbol}) as present`)
      const watch = stock ? (await tx.select().from(stockWatchlists).where(and(eq(stockWatchlists.userId, userId), eq(stockWatchlists.stockId, stock.id))))[0] : null
      const thesis = stock ? (await tx.select().from(investmentTheses).where(and(eq(investmentTheses.userId, userId), eq(investmentTheses.stockId, stock.id))))[0] : null
      const reviews = thesis ? (await tx.select().from(thesisReviews).where(and(eq(thesisReviews.userId, userId), eq(thesisReviews.thesisId, thesis.id))).orderBy(desc(thesisReviews.reviewedAt), desc(thesisReviews.id)).limit(10)).map(serializeThesisReview) : []
      const notes = stock ? await tx.select({ note: stockNotes, name: users.name }).from(stockNotes).innerJoin(users, eq(users.id, stockNotes.userId)).where(and(eq(stockNotes.stockId, stock.id), or(eq(stockNotes.userId, userId), sql`exists (
        select 1 from ${partnerLinks} where ${partnerLinks.acceptedAt} is not null and (
          (${partnerLinks.userAId} = ${userId} and ${partnerLinks.userBId} = ${stockNotes.userId} and ${partnerLinks.userBSharesStockNotes} = true) or
          (${partnerLinks.userBId} = ${userId} and ${partnerLinks.userAId} = ${stockNotes.userId} and ${partnerLinks.userASharesStockNotes} = true)
        ))`))).orderBy(desc(stockNotes.date), desc(stockNotes.id)).limit(10) : []
      const evidence = stock ? await tx.select().from(stockTimelineRecords).where(and(eq(stockTimelineRecords.userId, userId), eq(stockTimelineRecords.stockId, stock.id))).orderBy(desc(stockTimelineRecords.occurredAt), desc(stockTimelineRecords.id)).limit(10) : []
      const related = await tx.execute(sql`select d.id::text as id,d.title,d.date::text as date,
        (select count(*)::int from transactions t where t.diary_id=d.id and t.user_id=${userId} and t.symbol=${symbol}) as "transactionCount",
        case when exists(select 1 from diary_stocks ds join stocks s on s.id=ds.stock_id where ds.diary_id=d.id and s.symbol=${symbol}) then 'explicit_context' else 'transaction' end as relation
        from diaries d where d.user_id=${userId} and (
          exists(select 1 from diary_stocks ds join stocks s on s.id=ds.stock_id where ds.diary_id=d.id and s.symbol=${symbol}) or
          exists(select 1 from transactions t where t.diary_id=d.id and t.user_id=${userId} and t.symbol=${symbol}))
        order by d.date desc,d.id desc limit 10`)
      return {
        company: { id: stock?.id.toString() ?? null, symbol, name: stock?.name ?? null, currency: stock?.currency ?? null, watchStatus: watch?.status ?? null },
        position: { state: holding ? 'held' : history.rows[0]?.present ? 'closed' : watch?.status === 'WATCHING' ? 'research_only' : 'untracked',
          quantity: holding?.quantity ?? 0, averageCost: holding?.avgCost ?? null, totalCost: holding?.totalCost ?? 0,
          concentrationPct: holding ? concentration(holdings, { basis: 'cost_basis' }).get(symbol) ?? null : null,
          concentrationBasis: holding ? 'cost_basis' : 'unavailable' },
        thesis: thesis ? serializeThesis(thesis, symbol, now()) : null, latestReview: reviews[0] ?? null, reviews,
        notes: notes.map(({ note, name }) => ({ id: String(note.id), title: note.title, content: note.content, date: note.date.toISOString(), createdVia: note.createdVia, createdByLabel: note.createdByLabel, source: note.userId === userId ? 'owner' : 'partner', sourceName: note.userId === userId ? null : name || 'Partner' })),
        evidence: evidence.map(row => ({ id: String(row.id), summary: row.summary, sourceType: row.sourceType, sourceTitle: row.sourceTitle, sourceUrl: row.sourceUrl, occurredAt: row.occurredAt.toISOString(), createdByLabel: row.createdByLabel })),
        relatedDiaries: related.rows,
      }
    }, { isolationLevel: 'repeatable read', accessMode: 'read only' })
    const quote = await quotePromise
    return c.json(companyHubResponseSchema.parse({ ...snapshot,
      company: { ...snapshot.company, currency: quote?.currency ?? snapshot.company.currency },
      position: { ...snapshot.position, price: quote?.regularMarketPrice ?? null,
        marketValue: snapshot.position.state === 'held' && quote ? snapshot.position.quantity * quote.regularMarketPrice : null,
        quoteStatus: quote ? 'priced' : 'missing' },
    }))
  })
}
