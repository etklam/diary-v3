import { type ErrorCode } from '@diary/contracts'
import { stockSymbolSchema } from '@diary/contracts/watchlist'
import { completeThesisReviewRequestSchema, currentInvestmentThesisSchema, investmentThesisResponseSchema, saveInvestmentThesisRequestSchema, thesisReviewListParamsSchema, thesisReviewRecordSchema, thesisReviewResponseSchema } from '@diary/contracts/investment-thesis'
import { deriveInvestmentThesisHealth, replaceInvestmentThesis } from '@diary/domain/investment-thesis'
import { investmentTheses, thesisReviews, stocks, type Database } from '@diary/db'
import { and, desc, eq, sql } from 'drizzle-orm'
import type { Context, Hono } from 'hono'
import type { z } from 'zod'
import type { AppEnv } from './app.js'

type Thesis = typeof investmentTheses.$inferSelect
type Review = typeof thesisReviews.$inferSelect
const iso = (date: Date | null) => date?.toISOString() ?? null
export function serializeThesis(thesis: Thesis, symbol: string, now: Date) {
  return currentInvestmentThesisSchema.parse({ ...thesis,
    id: String(thesis.id), userId: String(thesis.userId), stockId: String(thesis.stockId), symbol,
    reviewDueAt: iso(thesis.reviewDueAt), lastReviewedAt: iso(thesis.lastReviewedAt), activatedAt: iso(thesis.activatedAt), archivedAt: iso(thesis.archivedAt),
    createdAt: thesis.createdAt.toISOString(), updatedAt: thesis.updatedAt.toISOString(),
    health: deriveInvestmentThesisHealth({ ...thesis, reviewDueAt: iso(thesis.reviewDueAt) }, now),
  })
}
export function serializeThesisReview(review: Review) {
  return thesisReviewRecordSchema.parse({
    id: String(review.id), thesisId: String(review.thesisId), userId: String(review.userId), reviewedAt: review.reviewedAt.toISOString(),
    outcome: review.outcome, portfolioDecision: review.portfolioDecision, whatImproved: review.whatImproved, whatDeteriorated: review.whatDeteriorated, whatChanged: review.whatChanged,
    invalidationTriggered: review.invalidationTriggered, createdAt: review.createdAt.toISOString(),
    snapshot: { status: review.snapshotStatus, summary: review.snapshotSummary, whyIOwnIt: review.snapshotWhyIOwnIt, growthDrivers: review.snapshotGrowthDrivers, risks: review.snapshotRisks,
      invalidationConditions: review.snapshotInvalidationConditions, expectedHoldingPeriod: review.snapshotExpectedHoldingPeriod, reviewDueAt: iso(review.snapshotReviewDueAt) },
  })
}
export function registerInvestmentThesisRoutes(app: Hono<AppEnv>, dependencies: {
  db: Database
  now: () => Date
  fail: (status: number, code: ErrorCode, message: string) => never
  validationError: (error: z.ZodError) => never
  parseJson: <T>(context: Context<AppEnv>, schema: z.ZodType<T>) => Promise<T>
}) {
  const { db, now, fail, validationError, parseJson } = dependencies
  const owner = (c: Context<AppEnv>) => { c.header('Cache-Control', 'no-store'); const user = c.get('user'); return user ? BigInt(user.id) : fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required') }
  const symbolParam = (c: Context<AppEnv>) => { const parsed = stockSymbolSchema.safeParse(c.req.param('symbol')); if (!parsed.success) return validationError(parsed.error); return parsed.data }
  const lock = (userId: bigint, symbol: string) => sql`select pg_advisory_xact_lock(hashtextextended(${'thesis:' + userId.toString() + ':' + symbol}, 0::bigint))`
  app.get('/api/stocks/:symbol/thesis', async c => {
    const userId = owner(c), symbol = symbolParam(c), query = thesisReviewListParamsSchema.safeParse(c.req.query())
    if (!query.success) return validationError(query.error)
    const result = await db.transaction(async tx => {
      const [row] = await tx.select({ thesis: investmentTheses }).from(investmentTheses).innerJoin(stocks, eq(stocks.id, investmentTheses.stockId))
        .where(and(eq(investmentTheses.userId, userId), eq(stocks.symbol, symbol)))
      if (!row) return { thesis: null, reviews: [] }
      const reviews = await tx.select().from(thesisReviews).where(and(eq(thesisReviews.userId, userId), eq(thesisReviews.thesisId, row.thesis.id)))
        .orderBy(desc(thesisReviews.reviewedAt), desc(thesisReviews.id)).limit(query.data.limit)
      return { thesis: serializeThesis(row.thesis, symbol, now()), reviews: reviews.map(serializeThesisReview) }
    }, { isolationLevel: 'repeatable read', accessMode: 'read only' })
    return c.json(investmentThesisResponseSchema.parse(result))
  })
  app.put('/api/stocks/:symbol/thesis', async c => {
    const userId = owner(c), symbol = symbolParam(c), input = await parseJson(c, saveInvestmentThesisRequestSchema)
    const result = await db.transaction(async tx => {
      await tx.execute(lock(userId, symbol))
      await tx.insert(stocks).values({ symbol }).onConflictDoNothing({ target: stocks.symbol })
      const [stock] = await tx.select().from(stocks).where(eq(stocks.symbol, symbol))
      if (!stock) throw new Error('Canonical stock unavailable')
      const [existing] = await tx.select().from(investmentTheses).where(and(eq(investmentTheses.userId, userId), eq(investmentTheses.stockId, stock.id))).for('update')
      const timestamp = now(), replaced = replaceInvestmentThesis(input, iso(existing?.activatedAt ?? null), timestamp)
      const values = { ...replaced, reviewDueAt: replaced.reviewDueAt ? new Date(replaced.reviewDueAt) : null, activatedAt: replaced.activatedAt ? new Date(replaced.activatedAt) : null, archivedAt: replaced.archivedAt ? new Date(replaced.archivedAt) : null, updatedAt: timestamp }
      const [thesis] = await tx.insert(investmentTheses).values({ userId, stockId: stock.id, ...values, createdAt: timestamp })
        .onConflictDoUpdate({ target: [investmentTheses.userId, investmentTheses.stockId], set: values }).returning()
      if (!thesis) throw new Error('Thesis insert returned no row')
      return serializeThesis(thesis, symbol, timestamp)
    })
    return c.json({ thesis: result })
  })
  app.post('/api/stocks/:symbol/thesis/reviews', async c => {
    const userId = owner(c), symbol = symbolParam(c), input = await parseJson(c, completeThesisReviewRequestSchema)
    const result = await db.transaction(async tx => {
      await tx.execute(lock(userId, symbol))
      const [row] = await tx.select({ thesis: investmentTheses }).from(investmentTheses).innerJoin(stocks, eq(stocks.id, investmentTheses.stockId))
        .where(and(eq(investmentTheses.userId, userId), eq(stocks.symbol, symbol))).for('update', { of: investmentTheses })
      if (!row) return fail(404, 'INVESTMENT_THESIS_NOT_FOUND', `Investment Thesis for ${symbol} not found`)
      const current = row.thesis
      if (current.status !== 'ACTIVE') return fail(409, 'INVESTMENT_THESIS_NOT_ACTIVE', 'Investment Thesis is not active')
      const timestamp = now(), clean = (value: string | null | undefined) => value?.trim() || null
      const [review] = await tx.insert(thesisReviews).values({ thesisId: current.id, userId, reviewedAt: timestamp, createdAt: timestamp,
        outcome: input.outcome, portfolioDecision: input.portfolioDecision, whatImproved: clean(input.whatImproved), whatDeteriorated: clean(input.whatDeteriorated), whatChanged: clean(input.whatChanged), invalidationTriggered: input.invalidationTriggered ?? false,
        snapshotStatus: current.status, snapshotSummary: current.summary, snapshotWhyIOwnIt: current.whyIOwnIt, snapshotGrowthDrivers: current.growthDrivers, snapshotRisks: current.risks,
        snapshotInvalidationConditions: current.invalidationConditions, snapshotExpectedHoldingPeriod: current.expectedHoldingPeriod, snapshotReviewDueAt: current.reviewDueAt,
      }).returning()
      const [thesis] = await tx.update(investmentTheses).set({ lastReviewedAt: timestamp, latestReviewOutcome: input.outcome, updatedAt: timestamp }).where(eq(investmentTheses.id, current.id)).returning()
      if (!review || !thesis) throw new Error('Thesis review write returned no row')
      return { thesis: serializeThesis(thesis, symbol, timestamp), review: serializeThesisReview(review) }
    })
    return c.json(thesisReviewResponseSchema.parse(result))
  })
}
