import { diaryReviewResponseSchema } from '@diary/contracts/review'
import { alerts, diaries, type Database, tradePlans, transactions } from '@diary/db'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { listDiaryAlerts, serializeDiary } from './diary.js'
import { listDiaryStocks } from './diary-stocks.js'
import { type LedgerTransactionRow } from './ledger.js'
import { listLinkedTradePlans, serializeLinkedTradePlan } from './trade-plans.js'

type DbTransaction = Parameters<Parameters<Database['transaction']>[0]>[0]
type DiaryRow = typeof diaries.$inferSelect
type TradePlanRow = typeof tradePlans.$inferSelect
type AlertRow = typeof alerts.$inferSelect

type DiaryProjection = 'detail' | 'byDate' | 'list' | 'review'

interface DiaryAssociationProjection {
  includeTransactions: boolean
  includeTradePlans: boolean
  includeStocks: boolean
  includeAlerts: boolean
}

interface DiaryAssociations {
  transactionsByDiary: Map<bigint, LedgerTransactionRow[]>
  tradePlansByDiary: Map<bigint, TradePlanRow[]>
  stockSymbolsByDiary: Map<bigint, string[]>
  alertsByDiary: Map<bigint, AlertRow[]>
}

function emptyAssociations(): DiaryAssociations {
  return {
    transactionsByDiary: new Map(),
    tradePlansByDiary: new Map(),
    stockSymbolsByDiary: new Map(),
    alertsByDiary: new Map(),
  }
}

function pushGrouped<T extends { diaryId: bigint }>(groups: Map<bigint, T[]>, row: T) {
  const group = groups.get(row.diaryId) ?? []
  group.push(row)
  groups.set(row.diaryId, group)
}

/** Load only the associations required by a named Diary projection. */
async function collectDiaryAssociations(
  db: Database | DbTransaction,
  userId: bigint,
  diaryIds: readonly bigint[],
  projection: DiaryAssociationProjection,
): Promise<DiaryAssociations> {
  const ids = [...new Set(diaryIds)]
  const associations = emptyAssociations()
  if (ids.length === 0) return associations

  if (projection.includeTransactions) {
    const rows = await db.select().from(transactions)
      .where(and(
        eq(transactions.userId, userId),
        inArray(transactions.diaryId, ids),
      ))
      .orderBy(
        asc(transactions.tradeDate),
        asc(transactions.id),
      )
    for (const row of rows) pushGrouped(associations.transactionsByDiary, row)
  }

  if (projection.includeTradePlans) {
    for (const row of await listLinkedTradePlans(db, userId, ids)) {
      if (row.diaryId !== null) {
        const group = associations.tradePlansByDiary.get(row.diaryId) ?? []
        group.push(row)
        associations.tradePlansByDiary.set(row.diaryId, group)
      }
    }
  }

  if (projection.includeStocks) {
    for (const row of await listDiaryStocks(db, userId, ids)) {
      const group = associations.stockSymbolsByDiary.get(row.diaryId) ?? []
      group.push(row.symbol)
      associations.stockSymbolsByDiary.set(row.diaryId, group)
    }
  }

  if (projection.includeAlerts) {
    for (const row of await listDiaryAlerts(db, userId, ids)) pushGrouped(associations.alertsByDiary, row)
  }

  return associations
}

function associationsFor(projection: DiaryProjection): DiaryAssociationProjection {
  switch (projection) {
    case 'review':
      return { includeTransactions: true, includeTradePlans: true, includeStocks: false, includeAlerts: false }
    case 'byDate':
      return { includeTransactions: true, includeTradePlans: false, includeStocks: true, includeAlerts: true }
    case 'detail':
    case 'list':
      return { includeTransactions: true, includeTradePlans: true, includeStocks: true, includeAlerts: true }
  }
}

function instant(value: Date | string | null): string | null {
  return value === null ? null : (value instanceof Date ? value : new Date(value)).toISOString()
}

function serializeDiaryReview(
  row: DiaryRow,
  transactionRows: readonly LedgerTransactionRow[],
  tradePlanRows: readonly TradePlanRow[],
) {
  return diaryReviewResponseSchema.parse({
    id: row.id.toString(), title: row.title, date: row.date, content: row.content, tags: row.tags,
    thesis: row.thesis, risk: row.risk, execution: row.execution,
    reviewDueAt: instant(row.reviewDueAt), reviewStatus: row.reviewStatus,
    reviewedAt: instant(row.reviewedAt), reviewOutcome: row.reviewOutcome,
    reviewSummary: row.reviewSummary, reviewLearning: row.reviewLearning, reviewAdjustment: row.reviewAdjustment,
    transactions: transactionRows.map(transaction => ({
      id: transaction.id.toString(), symbol: transaction.symbol, type: transaction.type,
      quantity: transaction.quantity, price: transaction.price, tradeDate: transaction.tradeDate.toISOString(),
      notes: transaction.notes, strategy: transaction.strategy, emotion: transaction.emotion,
    })),
    tradePlans: tradePlanRows.map(serializeLinkedTradePlan),
  })
}

type DiarySelector = { id: bigint } | { date: string }

async function projectDiaryRow(
  db: Database | DbTransaction,
  userId: bigint,
  row: DiaryRow,
  projection: Exclude<DiaryProjection, 'review'>,
) {
  const associations = await collectDiaryAssociations(db, userId, [row.id], associationsFor(projection))
  return serializeDiary(
    row,
    projection === 'detail',
    associations.transactionsByDiary.get(row.id) ?? [],
    associations.tradePlansByDiary.get(row.id) ?? [],
    associations.stockSymbolsByDiary.get(row.id) ?? [],
    associations.alertsByDiary.get(row.id) ?? [],
  )
}

/** Full list projection owns its batched associations and serialization. */
export async function projectDiaryListRows(
  db: Database | DbTransaction,
  userId: bigint,
  rows: readonly DiaryRow[],
) {
  const associations = await collectDiaryAssociations(db, userId, rows.map(row => row.id), associationsFor('list'))
  return rows.map(row => serializeDiary(
    row,
    false,
    associations.transactionsByDiary.get(row.id) ?? [],
    associations.tradePlansByDiary.get(row.id) ?? [],
    associations.stockSymbolsByDiary.get(row.id) ?? [],
    associations.alertsByDiary.get(row.id) ?? [],
  ))
}

/** Review projection owns its private association set and serialization. */
export async function projectDiaryReview(
  db: Database | DbTransaction,
  userId: bigint,
  row: DiaryRow,
) {
  const associations = await collectDiaryAssociations(db, userId, [row.id], associationsFor('review'))
  return serializeDiaryReview(
    row,
    associations.transactionsByDiary.get(row.id) ?? [],
    associations.tradePlansByDiary.get(row.id) ?? [],
  )
}

async function readDiary(
  db: Database,
  userId: bigint,
  selector: DiarySelector,
  detail: boolean,
) {
  return db.transaction(async tx => {
    const [row] = await tx.select().from(diaries).where(and(
      eq(diaries.userId, userId),
      'id' in selector ? eq(diaries.id, selector.id) : eq(diaries.date, selector.date),
    )).limit(1)
    if (!row) return null
    return projectDiaryRow(tx, userId, row, detail ? 'detail' : 'byDate')
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' })
}

export function readDiaryDetail(db: Database, id: bigint, userId: bigint) {
  return readDiary(db, userId, { id }, true)
}

export function readDiaryByDate(db: Database, date: string, userId: bigint) {
  return readDiary(db, userId, { date }, false)
}

export async function readDiaryReview(db: Database, id: bigint, userId: bigint) {
  return db.transaction(async tx => {
    const [row] = await tx.select().from(diaries).where(and(
      eq(diaries.id, id), eq(diaries.userId, userId),
    )).limit(1)
    if (!row) return null
    return projectDiaryReview(tx, userId, row)
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' })
}
