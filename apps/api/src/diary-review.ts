import { diaryReviewResponseSchema, structuredReviewInputSchema, type StructuredReviewInput } from '@diary/contracts/review'
import { serializedIdSchema, type ErrorCode } from '@diary/contracts'
import { diaries, type Database } from '@diary/db'
import { and, eq } from 'drizzle-orm'
import type { Context, Hono } from 'hono'
import type { z } from 'zod'
import type { AppEnv } from './app.js'
import { listDiaryTransactions } from './ledger.js'
import { listLinkedTradePlans, serializeLinkedTradePlan } from './trade-plans.js'

type DbTransaction = Parameters<Parameters<Database['transaction']>[0]>[0]
async function projectReview(db: Database | DbTransaction, row: typeof diaries.$inferSelect) {
  const rows = await listDiaryTransactions(db, row.id, row.userId)
  const planRows = await listLinkedTradePlans(db, row.userId, [row.id])
  return diaryReviewResponseSchema.parse({
    id: row.id.toString(), title: row.title, date: row.date, content: row.content, tags: row.tags,
    thesis: row.thesis, risk: row.risk, execution: row.execution,
    reviewDueAt: row.reviewDueAt?.toISOString() ?? null, reviewStatus: row.reviewStatus,
    reviewedAt: row.reviewedAt?.toISOString() ?? null, reviewOutcome: row.reviewOutcome,
    reviewSummary: row.reviewSummary, reviewLearning: row.reviewLearning, reviewAdjustment: row.reviewAdjustment,
    transactions: rows.map(transaction => ({
      id: transaction.id.toString(), symbol: transaction.symbol, type: transaction.type,
      quantity: transaction.quantity, price: transaction.price, tradeDate: transaction.tradeDate.toISOString(),
      notes: transaction.notes, strategy: transaction.strategy, emotion: transaction.emotion,
    })),
    tradePlans: planRows.map(serializeLinkedTradePlan),
  })
}

export async function readDiaryReview(db: Database, id: bigint, userId: bigint) {
  return db.transaction(async tx => {
    const [row] = await tx.select().from(diaries).where(and(eq(diaries.id, id), eq(diaries.userId, userId))).limit(1)
    return row ? projectReview(tx, row) : null
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' })
}
export async function saveDiaryReview(db: Database, id: bigint, userId: bigint, input: StructuredReviewInput, now: Date) {
  return db.transaction(async tx => {
    const [row] = await tx.update(diaries).set({
      reviewOutcome: input.reviewOutcome,
      reviewSummary: input.reviewSummary?.trim() || null,
      reviewLearning: input.reviewLearning?.trim() || null,
      reviewAdjustment: input.reviewAdjustment?.trim() || null,
      reviewStatus: 'reviewed', reviewedAt: now, updatedAt: now,
    }).where(and(eq(diaries.id, id), eq(diaries.userId, userId))).returning()
    return row ? projectReview(tx, row) : null
  })
}

export function registerDiaryReviewRoutes(app: Hono<AppEnv>, dependencies: {
  db: Database; now: () => Date;
  fail: (status: number, code: ErrorCode, message: string) => never;
  validationError: (error: z.ZodError) => never;
  parseJson: <T>(context: Context<AppEnv>, schema: z.ZodType<T>) => Promise<T>;
}) {
  const { db, now, fail, validationError, parseJson } = dependencies
  function ownerAndId(context: Context<AppEnv>) {
    const user = context.get('user')
    if (!user) return fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    const id = serializedIdSchema.safeParse(context.req.param('id'))
    if (!id.success) return validationError(id.error)
    return { id: BigInt(id.data), userId: BigInt(user.id) }
  }
  app.get('/api/diaries/:id/review', async context => {
    const { id, userId } = ownerAndId(context)
    const result = await readDiaryReview(db, id, userId)
    if (!result) return fail(404, 'DIARY_NOT_FOUND', 'Diary not found')
    return context.json(result)
  })
  app.patch('/api/diaries/:id/review', async context => {
    const { id, userId } = ownerAndId(context)
    const input = await parseJson(context, structuredReviewInputSchema)
    const result = await saveDiaryReview(db, id, userId, input, now())
    if (!result) return fail(404, 'DIARY_NOT_FOUND', 'Diary not found')
    return context.json(result)
  })
}
