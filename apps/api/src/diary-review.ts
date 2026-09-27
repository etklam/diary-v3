import { diaryReviewWorkflowResponseSchema, diaryReviewWorkflowInputSchema, diaryReviewScheduleInputSchema, structuredReviewInputSchema, type StructuredReviewInput } from '@diary/contracts/review'
import { serializedIdSchema, type ErrorCode } from '@diary/contracts'
import { diaries, type Database } from '@diary/db'
import { and, eq, sql } from 'drizzle-orm'
import type { Context, Hono } from 'hono'
import type { z } from 'zod'
import type { AppEnv } from './app.js'
import { projectDiaryReview, readDiaryReview } from './diary-read.js'
export async function saveDiaryReview(db: Database, id: bigint, userId: bigint, input: StructuredReviewInput, now: Date) {
  return db.transaction(async tx => {
    const [row] = await tx.update(diaries).set({
      reviewOutcome: input.reviewOutcome,
      reviewSummary: input.reviewSummary?.trim() || null,
      reviewLearning: input.reviewLearning?.trim() || null,
      reviewAdjustment: input.reviewAdjustment?.trim() || null,
      reviewStatus: 'reviewed', reviewedAt: now, updatedAt: now,
      revision: sql`${diaries.revision} + 1`,
    }).where(and(eq(diaries.id, id), eq(diaries.userId, userId))).returning()
    if (!row) return null
    return projectDiaryReview(tx, userId, row)
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
  app.get('/api/diaries/:id/review-workflow', async context => {
    const { id, userId } = ownerAndId(context)
    const result = await db.transaction(async tx => {
      const [row] = await tx.select().from(diaries).where(and(eq(diaries.id, id), eq(diaries.userId, userId)))
      if (!row) return fail(404, 'DIARY_NOT_FOUND', 'Diary not found')
      return { review: await projectDiaryReview(tx, userId, row), revision: row.revision }
    }, { isolationLevel: 'repeatable read', accessMode: 'read only' })
    context.header('Cache-Control', 'no-store')
    return context.json(diaryReviewWorkflowResponseSchema.parse(result))
  })
  for (const schedule of [false, true]) {
    app.patch(schedule ? '/api/diaries/:id/review-schedule' : '/api/diaries/:id/review-workflow', async context => {
      const { id, userId } = ownerAndId(context)
      const input = schedule ? await parseJson(context, diaryReviewScheduleInputSchema) : await parseJson(context, diaryReviewWorkflowInputSchema)
      const result = await db.transaction(async tx => {
        const [current] = await tx.select().from(diaries).where(and(eq(diaries.id, id), eq(diaries.userId, userId))).for('update')
        if (!current) return fail(404, 'DIARY_NOT_FOUND', 'Diary not found')
        if (current.revision !== input.expectedRevision) return fail(409, 'DIARY_REVISION_CONFLICT', 'Diary changed; reload before saving')
        const timestamp = now()
        const values: Partial<typeof diaries.$inferInsert> = 'review' in input ? {
          reviewOutcome: input.review.reviewOutcome,
          reviewSummary: input.review.reviewSummary?.trim() || null,
          reviewLearning: input.review.reviewLearning?.trim() || null,
          reviewAdjustment: input.review.reviewAdjustment?.trim() || null,
          reviewStatus: 'reviewed', reviewedAt: timestamp,
        } : { reviewDueAt: input.reviewDueAt ? new Date(input.reviewDueAt) : null,
          reviewStatus: input.reviewDueAt ? 'pending' : current.reviewStatus === 'reviewed' ? 'reviewed' : 'none' }
        const [row] = await tx.update(diaries).set({ ...values, updatedAt: timestamp, revision: sql`${diaries.revision} + 1` })
          .where(and(eq(diaries.id, id), eq(diaries.userId, userId))).returning()
        if (!row) throw new Error('Review update returned no row')
        return { review: await projectDiaryReview(tx, userId, row), revision: row.revision }
      })
      return context.json(diaryReviewWorkflowResponseSchema.parse(result))
    })
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
