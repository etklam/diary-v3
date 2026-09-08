import { alerts, diaries, diaryStocks, stocks, transactions, type Database } from '@diary/db'
import { diarySummarySchema } from '@diary/contracts/diary-summary'
import type { DiaryListQuery } from '@diary/contracts/diary-list'
import { diaryExcerpt } from '@diary/domain'
import { and, asc, count, desc, eq, gte, inArray, lte, or, sql } from 'drizzle-orm'
import { listDiaryAlerts, serializeDiary } from './diary.js'
import { listDiaryStocks } from './diary-stocks.js'
import { listLinkedTradePlans } from './trade-plans.js'

/** Filter, ordering and direction shared by the full and summary list queries. */
function diaryPageFilter(db: Database, userId: bigint, query: DiaryListQuery, now: Date) {
  const predicates = [eq(diaries.userId, userId)]
  if (query.search) {
    const pattern = `%${query.search.replace(/[\\%_]/g, character => `\\${character}`)}%`
    predicates.push(or(
      sql`${diaries.title} ilike ${pattern} escape ${'\\'}`,
      sql`${diaries.content} ilike ${pattern} escape ${'\\'}`,
      sql`${diaries.thesis} ilike ${pattern} escape ${'\\'}`,
      sql`${diaries.risk} ilike ${pattern} escape ${'\\'}`,
      sql`${diaries.execution} ilike ${pattern} escape ${'\\'}`,
      sql`array_to_string(${diaries.tags}, ' ') ilike ${pattern} escape ${'\\'}`,
      sql`exists (select 1 from ${diaryStocks} inner join ${stocks} on ${stocks.id} = ${diaryStocks.stockId} where ${diaryStocks.diaryId} = ${diaries.id} and ${stocks.symbol} ilike ${pattern} escape ${'\\'})`,
    )!)
  }
  if (query.symbol) {
    // Symbols persist normalized uppercase; exact match keeps the filter precise.
    predicates.push(inArray(diaries.id, db.select({ id: diaryStocks.diaryId }).from(diaryStocks)
      .innerJoin(stocks, eq(stocks.id, diaryStocks.stockId))
      .where(eq(stocks.symbol, query.symbol.toUpperCase()))))
  }
  if (query.dateFrom) predicates.push(gte(diaries.date, query.dateFrom))
  if (query.dateTo) predicates.push(lte(diaries.date, query.dateTo))
  if (query.reviewStatus) predicates.push(eq(diaries.reviewStatus, query.reviewStatus))
  if (query.reviewStatus === 'pending') predicates.push(lte(diaries.reviewDueAt, now))
  const direction = query.sortBy.endsWith('-asc') ? asc : desc
  const order = query.sortBy.startsWith('title-')
    ? direction(sql`${diaries.title} collate "diary_unicode_ci_ai"`)
    : direction(diaries.date)
  return { where: and(...predicates), order, direction }
}

export async function listDiaries(db: Database, userId: bigint, query: DiaryListQuery, now: Date) {
  const { where, order, direction } = diaryPageFilter(db, userId, query, now)

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

/** Bounded discovery feed for Library/Timeline/Overview. Content is read only
 * to build the excerpt inside the API process and is never serialized; counts
 * arrive as grouped SQL aggregates instead of full transaction/alert rows. */
export async function listDiarySummaries(db: Database, userId: bigint, query: DiaryListQuery, now: Date) {
  const { where, order, direction } = diaryPageFilter(db, userId, query, now)

  // Count and page share the same snapshot semantics as the full list.
  return db.transaction(async tx => {
    const [result] = await tx.select({ total: count() }).from(diaries).where(where)
    const total = result!.total
    const totalPages = Math.ceil(total / query.limit)
    const rows = query.page > totalPages ? [] : await tx.select({
      id: diaries.id,
      date: diaries.date,
      title: diaries.title,
      content: diaries.content,
      tags: diaries.tags,
      createdVia: diaries.createdVia,
      reviewStatus: diaries.reviewStatus,
      reviewDueAt: diaries.reviewDueAt,
      reviewOutcome: diaries.reviewOutcome,
    }).from(diaries).where(where).orderBy(order, direction(diaries.id))
      .limit(query.limit).offset((query.page - 1) * query.limit)
    const ids = rows.map(row => row.id)
    const transactionCounts = new Map<bigint, number>()
    const alertCounts = new Map<bigint, number>()
    if (ids.length > 0) {
      for (const row of await tx.select({ diaryId: transactions.diaryId, total: count() }).from(transactions)
        .where(and(eq(transactions.userId, userId), inArray(transactions.diaryId, ids)))
        .groupBy(transactions.diaryId)) transactionCounts.set(row.diaryId, row.total)
      // Alerts carry no owner column; join diaries to keep the count owner-scoped.
      for (const row of await tx.select({ diaryId: alerts.diaryId, total: count() }).from(alerts)
        .innerJoin(diaries, eq(diaries.id, alerts.diaryId))
        .where(and(eq(diaries.userId, userId), inArray(diaries.id, ids), eq(alerts.isDismissed, false)))
        .groupBy(alerts.diaryId)) alertCounts.set(row.diaryId, row.total)
    }
    const stockRows = await listDiaryStocks(tx, userId, ids)
    const stocksByDiary = new Map<bigint, string[]>()
    for (const stock of stockRows) {
      const group = stocksByDiary.get(stock.diaryId) ?? []
      group.push(stock.symbol)
      stocksByDiary.set(stock.diaryId, group)
    }
    return {
      data: rows.map(row => diarySummarySchema.parse({
        id: row.id.toString(),
        date: row.date,
        title: row.title,
        // Content stays in this process: only the bounded excerpt is serialized.
        excerpt: diaryExcerpt(row.content, 240),
        tags: row.tags.slice(0, 3),
        stockSymbols: (stocksByDiary.get(row.id) ?? []).slice(0, 10),
        createdVia: row.createdVia,
        reviewStatus: row.reviewStatus,
        reviewDueAt: row.reviewDueAt === null ? null : row.reviewDueAt.toISOString(),
        reviewOutcome: row.reviewOutcome,
        transactionCount: transactionCounts.get(row.id) ?? 0,
        alertCount: alertCounts.get(row.id) ?? 0,
      })),
      pagination: { page: query.page, limit: query.limit, total, totalPages },
    }
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' })
}
