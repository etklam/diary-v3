import {
  deleteTradePlanResponseSchema,
  linkedTradePlanResponseSchema,
  tradePlanInputSchema,
  tradePlanListQuerySchema,
  tradePlanListResponseSchema,
  tradePlanResponseSchema,
  tradePlanUpdateSchema,
  type LinkedTradePlanResponse,
  type TradePlanInput,
  type TradePlanUpdate,
} from '@diary/contracts/trade-plan'
import { diaries, tradePlans, transactions, type Database } from '@diary/db'
import { and, asc, count, desc, eq, inArray, like } from 'drizzle-orm'
import type { Context, Hono } from 'hono'
import type { z } from 'zod'
import { serializedIdSchema, type ErrorCode } from '@diary/contracts'
import type { AppEnv } from './app.js'

type DbTransaction = Parameters<Parameters<Database['transaction']>[0]>[0]
type TradePlanRow = typeof tradePlans.$inferSelect
type DiaryLink = {
  id: bigint
  title: string
  date: string
  reviewStatus: 'none' | 'pending' | 'reviewed'
  reviewOutcome: 'INTACT' | 'PARTIAL' | 'INVALIDATED' | 'UNCLEAR' | null
  transactionCount: number
}

function instant(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString()
}

export function serializeLinkedTradePlan(row: TradePlanRow): LinkedTradePlanResponse {
  return linkedTradePlanResponseSchema.parse({
    id: row.id.toString(), symbol: row.symbol, setupType: row.setupType,
    entryPrice: row.entryPrice, entryZoneLow: row.entryZoneLow, entryZoneHigh: row.entryZoneHigh,
    stopLoss: row.stopLoss, targetPrice: row.targetPrice, maxPositionSize: row.maxPositionSize,
    invalidationCondition: row.invalidationCondition, notes: row.notes, status: row.status,
  })
}

function serializeTradePlan(row: TradePlanRow, diary: DiaryLink | null) {
  return tradePlanResponseSchema.parse({
    ...serializeLinkedTradePlan(row),
    userId: row.userId.toString(), diaryId: row.diaryId?.toString() ?? null,
    createdAt: instant(row.createdAt), updatedAt: instant(row.updatedAt),
    diary: diary ? { ...diary, id: diary.id.toString() } : null,
  })
}

async function loadDiaryLinks(
  db: Database | DbTransaction,
  userId: bigint,
  diaryIds: readonly bigint[],
): Promise<Map<bigint, DiaryLink>> {
  if (diaryIds.length === 0) return new Map()
  const rows = await db.select({
    id: diaries.id, title: diaries.title, date: diaries.date,
    reviewStatus: diaries.reviewStatus, reviewOutcome: diaries.reviewOutcome,
    transactionCount: count(transactions.id),
  }).from(diaries)
    .leftJoin(transactions, and(eq(transactions.diaryId, diaries.id), eq(transactions.userId, userId)))
    .where(and(eq(diaries.userId, userId), inArray(diaries.id, [...new Set(diaryIds)])))
    .groupBy(diaries.id, diaries.title, diaries.date, diaries.reviewStatus, diaries.reviewOutcome)
  return new Map(rows.map(row => [row.id, row]))
}

export async function listLinkedTradePlans(
  db: Database | DbTransaction,
  userId: bigint,
  diaryIds: readonly bigint[],
) {
  if (diaryIds.length === 0) return []
  return db.select().from(tradePlans).where(and(
    eq(tradePlans.userId, userId), inArray(tradePlans.diaryId, [...new Set(diaryIds)]),
  )).orderBy(asc(tradePlans.id))
}

function assertMergedZone(
  existing: Pick<TradePlanRow, 'symbol' | 'entryZoneLow' | 'entryZoneHigh'>,
  update: TradePlanUpdate,
  validationError: (error: z.ZodError) => never,
) {
  const low = update.entryZoneLow === undefined ? existing.entryZoneLow : update.entryZoneLow
  const high = update.entryZoneHigh === undefined ? existing.entryZoneHigh : update.entryZoneHigh
  const merged = tradePlanInputSchema.safeParse({ symbol: existing.symbol, entryZoneLow: low, entryZoneHigh: high })
  if (!merged.success) validationError(merged.error)
}

async function lockOwnedDiary(db: DbTransaction, diaryId: bigint, userId: bigint) {
  const [row] = await db.select({ id: diaries.id }).from(diaries)
    .where(and(eq(diaries.id, diaryId), eq(diaries.userId, userId)))
    .limit(1).for('key share')
  return row
}

export function registerTradePlanRoutes(app: Hono<AppEnv>, dependencies: {
  db: Database
  now: () => Date
  fail: (status: number, code: ErrorCode, message: string) => never
  validationError: (error: z.ZodError) => never
  parseJson: <T>(context: Context<AppEnv>, schema: z.ZodType<T>) => Promise<T>
}) {
  const { db, now, fail, validationError, parseJson } = dependencies
  const owner = (context: Context<AppEnv>) => {
    const user = context.get('user')
    return user ? BigInt(user.id) : fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
  }
  const resource = (context: Context<AppEnv>) => {
    const parsed = serializedIdSchema.safeParse(context.req.param('id'))
    if (!parsed.success) return validationError(parsed.error)
    return BigInt(parsed.data)
  }

  app.get('/api/trade-plans', async context => {
    const userId = owner(context)
    const query = tradePlanListQuerySchema.safeParse(context.req.query())
    if (!query.success) return validationError(query.error)
    const input = query.data
    return context.json(await db.transaction(async tx => {
      const predicates = [eq(tradePlans.userId, userId)]
      if (input.status) predicates.push(eq(tradePlans.status, input.status))
      if (input.symbol) predicates.push(like(tradePlans.symbol, `%${input.symbol}%`))
      const where = and(...predicates)
      const [totalRow] = await tx.select({ total: count() }).from(tradePlans).where(where)
      const total = totalRow!.total
      const totalPages = Math.ceil(total / input.limit)
      const order = input.sortBy === 'createdAt-desc'
        ? [desc(tradePlans.createdAt), desc(tradePlans.id)]
        : input.sortBy === 'symbol-asc'
          ? [asc(tradePlans.symbol), asc(tradePlans.id)]
          : [desc(tradePlans.updatedAt), desc(tradePlans.id)]
      const rows = input.page > totalPages ? [] : await tx.select().from(tradePlans).where(where)
        .orderBy(...order).limit(input.limit).offset((input.page - 1) * input.limit)
      const links = await loadDiaryLinks(tx, userId, rows.flatMap(row => row.diaryId === null ? [] : [row.diaryId]))
      return tradePlanListResponseSchema.parse({
        data: rows.map(row => serializeTradePlan(row, row.diaryId === null ? null : links.get(row.diaryId) ?? null)),
        pagination: { page: input.page, limit: input.limit, total, totalPages },
      })
    }, { isolationLevel: 'repeatable read', accessMode: 'read only' }))
  })

  app.get('/api/trade-plans/:id', async context => {
    const userId = owner(context), id = resource(context)
    const result = await db.transaction(async tx => {
      const [row] = await tx.select().from(tradePlans)
        .where(and(eq(tradePlans.id, id), eq(tradePlans.userId, userId))).limit(1)
      if (!row) return undefined
      const links = await loadDiaryLinks(tx, userId, row.diaryId === null ? [] : [row.diaryId])
      return serializeTradePlan(row, row.diaryId === null ? null : links.get(row.diaryId) ?? null)
    }, { isolationLevel: 'repeatable read', accessMode: 'read only' })
    if (!result) fail(404, 'TRADE_PLAN_NOT_FOUND', `Trade plan ${id} not found`)
    return context.json(result)
  })

  app.post('/api/trade-plans', async context => {
    const userId = owner(context)
    const input = await parseJson(context, tradePlanInputSchema)
    const result = await db.transaction(async tx => {
      const diaryId = input.diaryId === null || input.diaryId === undefined ? null : BigInt(input.diaryId)
      if (diaryId !== null && !await lockOwnedDiary(tx, diaryId, userId)) {
        fail(404, 'DIARY_NOT_FOUND', `Diary ${diaryId} not found`)
      }
      const [row] = await tx.insert(tradePlans).values({
        ...writeValues(input), symbol: input.symbol, userId, diaryId, updatedAt: now(),
      }).returning()
      if (!row) throw new Error('Trade plan insert returned no row')
      const links = await loadDiaryLinks(tx, userId, diaryId === null ? [] : [diaryId])
      return serializeTradePlan(row, diaryId === null ? null : links.get(diaryId) ?? null)
    })
    return context.json(result, 200)
  })

  app.put('/api/trade-plans/:id', async context => {
    const userId = owner(context), id = resource(context)
    const input = await parseJson(context, tradePlanUpdateSchema)
    const result = await db.transaction(async tx => {
      const [existing] = await tx.select().from(tradePlans).where(and(
        eq(tradePlans.id, id), eq(tradePlans.userId, userId),
      )).limit(1).for('update')
      if (!existing) return undefined
      assertMergedZone(existing, input, validationError)
      const diaryId = input.diaryId === undefined
        ? existing.diaryId
        : input.diaryId === null ? null : BigInt(input.diaryId)
      if (input.diaryId !== undefined && diaryId !== null && !await lockOwnedDiary(tx, diaryId, userId)) {
        fail(404, 'DIARY_NOT_FOUND', `Diary ${diaryId} not found`)
      }
      const [row] = await tx.update(tradePlans).set({
        ...writeValues(input),
        ...(input.diaryId !== undefined ? { diaryId } : {}),
        updatedAt: now(),
      }).where(and(eq(tradePlans.id, id), eq(tradePlans.userId, userId))).returning()
      if (!row) throw new Error('Trade plan update returned no row')
      const links = await loadDiaryLinks(tx, userId, diaryId === null ? [] : [diaryId])
      return serializeTradePlan(row, diaryId === null ? null : links.get(diaryId) ?? null)
    })
    if (!result) fail(404, 'TRADE_PLAN_NOT_FOUND', `Trade plan ${id} not found`)
    return context.json(result)
  })

  app.delete('/api/trade-plans/:id', async context => {
    const userId = owner(context), id = resource(context)
    const [deleted] = await db.delete(tradePlans).where(and(
      eq(tradePlans.id, id), eq(tradePlans.userId, userId),
    )).returning({ id: tradePlans.id })
    if (!deleted) fail(404, 'TRADE_PLAN_NOT_FOUND', `Trade plan ${id} not found`)
    return context.json(deleteTradePlanResponseSchema.parse({ success: true }))
  })
}

function writeValues(input: TradePlanInput | TradePlanUpdate) {
  return {
    ...(input.symbol !== undefined ? { symbol: input.symbol } : {}),
    ...(input.setupType !== undefined ? { setupType: input.setupType } : {}),
    ...(input.entryPrice !== undefined ? { entryPrice: input.entryPrice } : {}),
    ...(input.entryZoneLow !== undefined ? { entryZoneLow: input.entryZoneLow } : {}),
    ...(input.entryZoneHigh !== undefined ? { entryZoneHigh: input.entryZoneHigh } : {}),
    ...(input.stopLoss !== undefined ? { stopLoss: input.stopLoss } : {}),
    ...(input.targetPrice !== undefined ? { targetPrice: input.targetPrice } : {}),
    ...(input.maxPositionSize !== undefined ? { maxPositionSize: input.maxPositionSize } : {}),
    ...(input.invalidationCondition !== undefined ? { invalidationCondition: input.invalidationCondition } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
  }
}
