import { diaryResponseSchema, type CreateDiaryRequest, type UpdateDiaryRequest } from '@diary/contracts'
import { alerts, diaries, users, type Database } from '@diary/db'
import { and, asc, eq, inArray, sql, type SQL } from 'drizzle-orm'
import {
  insertLedgerTransactions,
  ledgerUserLock,
  listDiaryTransactions,
  replaceDiaryTransactions,
  serializeLedgerTransaction,
  validateLedgerAdditions,
  validateLedgerWithoutDiary,
  type LedgerTransactionRow,
} from './ledger.js'
import { serializeLinkedTradePlan } from './trade-plans.js'
import { tradePlans } from '@diary/db'
import { listDiaryStocks, writeDiaryStocks } from './diary-stocks.js'

import { toAlertResponse } from '@diary/contracts/alerts'
import { persistDiaryAlert } from './alerts.js'

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]
export async function listDiaryAlerts(db: Database | Transaction, userId: bigint, diaryIds: bigint[]) {
  if (!diaryIds.length) return []
  const rows = await db.select({ alert: alerts }).from(alerts).innerJoin(diaries, eq(diaries.id, alerts.diaryId))
    .where(and(eq(diaries.userId, userId), inArray(diaries.id, diaryIds)))
    .orderBy(asc(alerts.triggerAt), asc(alerts.id))
  return rows.map(row => row.alert)
}
async function writeAlerts(tx: Transaction, userId: bigint, diaryId: bigint, drafts: CreateDiaryRequest['alerts'], timestamp: Date, replace = false) {
  if (drafts === undefined) return
  if (replace) await tx.delete(alerts).where(eq(alerts.diaryId, diaryId))
  if (!drafts.length) return
  const [user] = await tx.select({ timezone: users.timezone }).from(users).where(eq(users.id, userId))
  if (!user) throw new Error('Diary owner missing')
  for (const draft of drafts) await persistDiaryAlert(tx, diaryId, draft, user.timezone, timestamp)
}

type TradePlanRow = typeof tradePlans.$inferSelect

function instant(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString()
}

export function serializeDiary(
  row: typeof diaries.$inferSelect,
  detail: boolean,
  transactionRows: readonly LedgerTransactionRow[] = [],
  tradePlanRows: readonly TradePlanRow[] = [],
  stockSymbols: readonly string[] = [],
  alertRows: readonly (typeof alerts.$inferSelect)[] = [],
) {
  const linkedPlans = tradePlanRows.map(serializeLinkedTradePlan)
  const statuses = ['draft', 'active', 'closed', 'cancelled'] as const
  return diaryResponseSchema.parse({
    id: row.id.toString(),
    userId: row.userId.toString(),
    title: row.title,
    content: row.content,
    tags: row.tags,
    tagsString: row.tags.length === 0 ? null : row.tags.join(','),
    createdVia: row.createdVia,
    createdByLabel: row.createdByLabel,
    date: row.date,
    createdAt: instant(row.createdAt),
    updatedAt: instant(row.updatedAt),
    transactions: transactionRows.map(serializeLedgerTransaction),
    alerts: alertRows.map(toAlertResponse),
    ...(detail ? { tradePlans: linkedPlans } : {}),
    ...(!detail && linkedPlans.length > 0 ? { tradePlanSummary: {
      total: linkedPlans.length,
      statuses: statuses.map(status => ({
        status, count: linkedPlans.filter(plan => plan.status === status).length,
      })).filter(item => item.count > 0),
    } } : {}),
    thesis: row.thesis,
    risk: row.risk,
    execution: row.execution,
    reviewDueAt: row.reviewDueAt === null ? null : instant(row.reviewDueAt),
    reviewStatus: row.reviewStatus,
    reviewedAt: row.reviewedAt === null ? null : instant(row.reviewedAt),
    reviewOutcome: row.reviewOutcome,
    reviewSummary: row.reviewSummary,
    reviewLearning: row.reviewLearning,
    reviewAdjustment: row.reviewAdjustment,
    stockSymbols,
  })
}

export async function createDiary(
  db: Database,
  userId: bigint,
  input: CreateDiaryRequest,
  date: string,
  now: () => Date,
  source: { createdVia: 'WEB' | 'API_KEY'; createdByLabel: string | null } = { createdVia: 'WEB', createdByLabel: null },
) {
  return db.transaction(async (tx) => {
    // A row lock cannot protect an absent diary. Serialize both create and
    // append on the logical owner/date key so an append racing the first
    // create re-reads the committed row instead of losing either body.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(
      ${`diary:${userId.toString()}:${date}`}, 0
    ))`)
    if ((input.transactions?.length ?? 0) > 0) {
      await tx.execute(ledgerUserLock(userId))
      await validateLedgerAdditions(tx, userId, input.transactions ?? [])
    }

    if (input.appendToToday) {
      const [existing] = await tx.select().from(diaries).where(and(
        eq(diaries.userId, userId), eq(diaries.date, date),
      )).limit(1).for('update')
      if (existing) {
        const tags = input.tags?.length
          ? [...new Set([...existing.tags, ...input.tags])]
          : existing.tags
        const [updated] = await tx.update(diaries).set({
          content: `${existing.content}\n\n---\n\n${input.content}`,
          tags,
          updatedAt: now(),
          // These fields were accepted then discarded by the former append
          // branch. Apply explicit values with ordinary update semantics.
          ...(input.thesis !== undefined ? { thesis: input.thesis } : {}),
          ...(input.risk !== undefined ? { risk: input.risk } : {}),
          ...(input.execution !== undefined ? { execution: input.execution } : {}),
          ...(input.reviewDueAt !== undefined ? {
            reviewDueAt: input.reviewDueAt === null ? null : new Date(input.reviewDueAt),
            reviewStatus: sql`case when ${diaries.reviewStatus} = 'reviewed'
              then ${diaries.reviewStatus}
              else ${input.reviewDueAt === null ? 'none' : 'pending'}::diary_review_status end`,
          } : {}),
        }).where(and(eq(diaries.id, existing.id), eq(diaries.userId, userId))).returning()
        if (!updated) throw new Error('Diary append returned no row')
        const inserted = await insertLedgerTransactions(tx, updated.id, userId, input.transactions ?? [])
        const persisted = await listDiaryTransactions(tx, updated.id, userId)
        await writeDiaryStocks(tx, updated.id, input.stockSymbols ?? [])
        await writeAlerts(tx, userId, updated.id, input.alerts, now())
        return { alerts: await listDiaryAlerts(tx, userId, [updated.id]), diary: updated, transactions: persisted.length ? persisted : inserted, stockSymbols: (await listDiaryStocks(tx, userId, [updated.id])).map(row => row.symbol) }
      }
    }

    const [diary] = await tx.insert(diaries).values({
      userId,
      title: input.title,
      content: input.content,
      tags: input.tags ?? [],
      date,
      createdVia: source.createdVia,
      createdByLabel: source.createdByLabel,
      thesis: input.thesis ?? null,
      risk: input.risk ?? null,
      execution: input.execution ?? null,
      reviewDueAt: input.reviewDueAt === null || input.reviewDueAt === undefined ? null : new Date(input.reviewDueAt),
      reviewStatus: input.reviewDueAt ? 'pending' : 'none',
    }).returning()
    if (!diary) throw new Error('Diary insert returned no row')
    await insertLedgerTransactions(tx, diary.id, userId, input.transactions ?? [])
    await writeDiaryStocks(tx, diary.id, input.stockSymbols ?? [])
    await writeAlerts(tx, userId, diary.id, input.alerts, now())
    return { alerts: await listDiaryAlerts(tx, userId, [diary.id]), diary, transactions: await listDiaryTransactions(tx, diary.id, userId), stockSymbols: (await listDiaryStocks(tx, userId, [diary.id])).map(row => row.symbol) }
  })
}

export async function findDiary(db: Database, id: bigint, userId: bigint) {
  const [diary] = await db.select().from(diaries).where(and(
    eq(diaries.id, id), eq(diaries.userId, userId),
  )).limit(1)
  return diary
}

export async function findDiaryByDate(db: Database, date: string, userId: bigint) {
  const [diary] = await db.select().from(diaries).where(and(
    eq(diaries.date, date), eq(diaries.userId, userId),
  )).limit(1)
  return diary
}

export async function findDiaryTransactions(db: Database, diaryId: bigint, userId: bigint) {
  return listDiaryTransactions(db, diaryId, userId)
}

export async function updateDiary(
  db: Database,
  id: bigint,
  userId: bigint,
  input: UpdateDiaryRequest,
  updatedAt: Date,
) {
  type DiaryInsert = typeof diaries.$inferInsert
  const values: Omit<Partial<DiaryInsert>, 'reviewStatus'> & {
    reviewStatus?: DiaryInsert['reviewStatus'] | SQL
  } = {
    title: input.title,
    content: input.content,
    updatedAt,
  }
  if (input.tags !== undefined) values.tags = input.tags
  if (input.date !== undefined) values.date = input.date
  if (input.thesis !== undefined) values.thesis = input.thesis
  if (input.risk !== undefined) values.risk = input.risk
  if (input.execution !== undefined) values.execution = input.execution
  if (input.reviewDueAt !== undefined) {
    values.reviewDueAt = input.reviewDueAt === null ? null : new Date(input.reviewDueAt)
    values.reviewStatus = sql`case when ${diaries.reviewStatus} = 'reviewed'
      then ${diaries.reviewStatus}
      else ${input.reviewDueAt === null ? 'none' : 'pending'}::diary_review_status end`
  }

  return db.transaction(async tx => {
    // Match create/append/delete lock ordering: ledger lock precedes Diary row
    // access whenever the transaction collection will change.
    if (input.transactions !== undefined) await tx.execute(ledgerUserLock(userId))
    const [existing] = await tx.select({ id: diaries.id }).from(diaries).where(and(
      eq(diaries.id, id), eq(diaries.userId, userId),
    )).limit(1).for('update')
    if (!existing) return undefined

    const transactionRows = input.transactions === undefined
      ? await listDiaryTransactions(tx, id, userId)
      : await replaceDiaryTransactions(tx, id, userId, input.transactions)
    const [diary] = await tx.update(diaries).set(values).where(and(
      eq(diaries.id, id), eq(diaries.userId, userId),
    )).returning()
    if (!diary) throw new Error('Diary update returned no row')
    if (input.stockSymbols !== undefined) await writeDiaryStocks(tx, id, input.stockSymbols, true)
    await writeAlerts(tx, userId, id, input.alerts, updatedAt, true)
    return { alerts: await listDiaryAlerts(tx, userId, [id]), diary, transactions: transactionRows, stockSymbols: (await listDiaryStocks(tx, userId, [id])).map(row => row.symbol) }
  })
}

export async function deleteDiary(db: Database, id: bigint, userId: bigint) {
  return db.transaction(async tx => {
    await tx.execute(ledgerUserLock(userId))
    const [owned] = await tx.select({ id: diaries.id }).from(diaries).where(and(
      eq(diaries.id, id), eq(diaries.userId, userId),
    )).limit(1).for('update')
    if (!owned) return false
    await validateLedgerWithoutDiary(tx, userId, id)
    const [deleted] = await tx.delete(diaries).where(and(
      eq(diaries.id, id), eq(diaries.userId, userId),
    )).returning({ id: diaries.id })
    return deleted !== undefined
  })
}
