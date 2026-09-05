import { serializedIdSchema, type ErrorCode } from '@diary/contracts'
import { alertCreateRequestWireSchema, alertListResponseSchema, toAlertResponse, type AlertDraft } from '@diary/contracts/alerts'
import { generateRecurringAlertsData } from '@diary/domain/recurring-alerts'
import { alerts, diaries, users, type Database } from '@diary/db'
import { and, asc, eq, or, sql } from 'drizzle-orm'
import type { Context, Hono } from 'hono'
import type { z } from 'zod'
import type { AppEnv } from './app.js'
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]
export async function persistDiaryAlert(tx: Transaction, diaryId: bigint, input: AlertDraft, timezone: string, timestamp: Date) {
  if (!input.recurringMode) return (await tx.insert(alerts).values({ diaryId, message: input.message, triggerAt: new Date(input.triggerAt), createdAt: timestamp }).returning())[0]!
  const [first, ...children] = generateRecurringAlertsData({ diaryId, message: input.message, startDate: new Date(input.triggerAt), mode: input.recurringMode, timezone })
  if (!first) return null
  const [root] = await tx.insert(alerts).values({ ...first, parentId: null, createdAt: timestamp }).returning()
  if (!root) throw new Error('Alert root insert returned no row')
  const [parent] = await tx.update(alerts).set({ parentId: root.id }).where(eq(alerts.id, root.id)).returning()
  if (children.length) await tx.insert(alerts).values(children.map(child => ({ ...child, parentId: root.id, createdAt: timestamp })))
  return parent!
}
export function registerAlertRoutes(app: Hono<AppEnv>, dependencies: {
  db: Database; now: () => Date; fail: (status: number, code: ErrorCode, message: string) => never
  validationError: (error: z.ZodError) => never; parseJson: <T>(context: Context<AppEnv>, schema: z.ZodType<T>) => Promise<T>
}) {
  const { db, now, fail, validationError, parseJson } = dependencies
  const owner = (c: Context<AppEnv>) => { c.header('Cache-Control', 'no-store'); const user = c.get('user'); return user ? BigInt(user.id) : fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required') }
  app.get('/api/alerts', async c => {
    const userId = owner(c)
    const rows = await db.select({ alert: alerts, diary: { id: diaries.id, title: diaries.title } }).from(alerts).innerJoin(diaries, eq(diaries.id, alerts.diaryId))
      .where(and(eq(diaries.userId, userId), eq(alerts.isDismissed, false), sql`(${alerts.parentId} is null or exists(select 1 from alerts parent where parent.id=${alerts.parentId} and parent.diary_id=${alerts.diaryId} and parent.is_dismissed=false))`))
      .orderBy(asc(alerts.triggerAt), asc(alerts.id)).limit(100)
    return c.json(alertListResponseSchema.parse(rows.map(row => toAlertResponse({ ...row.alert, diary: row.diary }))))
  })
  app.post('/api/alerts', async c => {
    const userId = owner(c), input = await parseJson(c, alertCreateRequestWireSchema)
    const diaryId = BigInt(input.diaryId)
    const triggerAt = input.triggerAt ?? now().toISOString()
    const result = await db.transaction(async tx => {
      const [diary] = await tx.select().from(diaries).where(and(eq(diaries.id, diaryId), eq(diaries.userId, userId))).for('update')
      if (!diary) return fail(404, 'DIARY_NOT_FOUND', 'Diary not found')
      const [user] = await tx.select({ timezone: users.timezone }).from(users).where(eq(users.id, userId))
      const draft: AlertDraft = { message: input.message, triggerAt, ...(input.recurringMode ? { recurringMode: input.recurringMode } : {}) }
      const alert = await persistDiaryAlert(tx, diary.id, draft, user!.timezone, now())
      return alert ? toAlertResponse({ ...alert, diary }) : null
    })
    return c.json(result)
  })
  app.put('/api/alerts/:id/dismiss', async c => {
    const userId = owner(c), parsed = serializedIdSchema.safeParse(c.req.param('id')); if (!parsed.success) return validationError(parsed.error)
    const id = BigInt(parsed.data)
    const result = await dismissDiaryAlert(db, userId, id)
    if (!result) return fail(404, 'ALERT_NOT_FOUND', 'Alert not found')
    return c.json(result)
  })
}

export async function dismissDiaryAlert(db: Database, userId: bigint, id: bigint) {
  return db.transaction(async tx => {
      const [candidate] = await tx.select({ diaryId: alerts.diaryId }).from(alerts).innerJoin(diaries, eq(diaries.id, alerts.diaryId)).where(and(eq(alerts.id, id), eq(diaries.userId, userId)))
      if (!candidate) return undefined
      const [diary] = await tx.select().from(diaries).where(and(eq(diaries.id, candidate.diaryId), eq(diaries.userId, userId))).for('update')
      if (!diary) return undefined
      const [existing] = await tx.select().from(alerts).where(eq(alerts.id, id)).for('update')
      if (!existing) return undefined
      const root = existing.recurringMode !== null && existing.instanceNumber === 1 && (existing.parentId === null || existing.parentId === existing.id)
      if (root) await tx.update(alerts).set({ isDismissed: true }).where(and(eq(alerts.diaryId, diary.id), or(eq(alerts.id, id), eq(alerts.parentId, id))))
      else await tx.update(alerts).set({ isDismissed: true }).where(eq(alerts.id, id))
      return toAlertResponse({ ...existing, isDismissed: true, diary })
    })
}
