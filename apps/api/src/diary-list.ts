import { diaries, transactions, type Database } from '@diary/db'
import type { DiaryListQuery } from '@diary/contracts/diary-list'
import { and, asc, count, desc, eq, gte, inArray, lte, or, sql } from 'drizzle-orm'
import { listDiaryAlerts, serializeDiary } from './diary.js'
import { listDiaryStocks } from './diary-stocks.js'
import { listLinkedTradePlans } from './trade-plans.js'

export async function listDiaries(db: Database, userId: bigint, query: DiaryListQuery, now: Date) {
  const predicates = [eq(diaries.userId, userId)]
  if (query.search) {
    const pattern = `%${query.search.replace(/[\\%_]/g, character => `\\${character}`)}%`
    predicates.push(or(
      sql`${diaries.title} ilike ${pattern} escape ${'\\'}`,
      sql`${diaries.content} ilike ${pattern} escape ${'\\'}`,
    )!)
  }
  if (query.dateFrom) predicates.push(gte(diaries.date, query.dateFrom))
  if (query.dateTo) predicates.push(lte(diaries.date, query.dateTo))
  if (query.reviewStatus) predicates.push(eq(diaries.reviewStatus, query.reviewStatus))
  if (query.reviewStatus === 'pending') predicates.push(lte(diaries.reviewDueAt, now))
  const where = and(...predicates)
  const direction = query.sortBy.endsWith('-asc') ? asc : desc
  const order = query.sortBy.startsWith('title-')
    ? direction(sql`${diaries.title} collate "diary_unicode_ci_ai"`)
    : direction(diaries.date)

  // Count and page share a snapshot, including during concurrent creates/deletes.
  return db.transaction(async tx => {
    const [result] = await tx.select({ total: count() }).from(diaries).where(where)
    const total = result!.total
    const totalPages = Math.ceil(total / query.limit)
    // Avoid an overflowing numeric offset for a valid but far-out page request.
    const rows = query.page > totalPages ? [] : await tx.select().from(diaries)
      .where(where).orderBy(order, direction(diaries.id))
      .limit(query.limit).offset((query.page - 1) * query.limit)
    const transactionRows = rows.length === 0 ? [] : await tx.select().from(transactions)
      .where(and(
        eq(transactions.userId, userId),
        inArray(transactions.diaryId, rows.map(row => row.id)),
      ))
      .orderBy(asc(transactions.tradeDate), asc(transactions.id))
    const transactionsByDiary = new Map<bigint, typeof transactionRows>()
    for (const transaction of transactionRows) {
      const group = transactionsByDiary.get(transaction.diaryId) ?? []
      group.push(transaction)
      transactionsByDiary.set(transaction.diaryId, group)
    }
    const planRows = await listLinkedTradePlans(tx, userId, rows.map(row => row.id))
    const plansByDiary = new Map<bigint, typeof planRows>()
    for (const plan of planRows) {
      if (plan.diaryId === null) continue
      const group = plansByDiary.get(plan.diaryId) ?? []
      group.push(plan)
      plansByDiary.set(plan.diaryId, group)
    }
    const stockRows = await listDiaryStocks(tx, userId, rows.map(row => row.id))
    const stocksByDiary = new Map<bigint, string[]>()
    for (const stock of stockRows) {
      const group = stocksByDiary.get(stock.diaryId) ?? []
      group.push(stock.symbol)
      stocksByDiary.set(stock.diaryId, group)
    }
    const alertRows = await listDiaryAlerts(tx, userId, rows.map(row => row.id))
    const alertsByDiary = new Map<bigint, typeof alertRows>()
    for (const alert of alertRows) {
      const group = alertsByDiary.get(alert.diaryId) ?? []
      group.push(alert)
      alertsByDiary.set(alert.diaryId, group)
    }
    return {
      data: rows.map(row => serializeDiary(
        row, false, transactionsByDiary.get(row.id) ?? [], plansByDiary.get(row.id) ?? [], stocksByDiary.get(row.id) ?? [], alertsByDiary.get(row.id) ?? [],
      )),
      pagination: { page: query.page, limit: query.limit, total, totalPages },
    }
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' })
}
