import { diaries, diaryStocks, stocks, type Database } from '@diary/db'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { MAX_DIARY_STOCK_SYMBOLS } from '@diary/contracts'

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

export class DiaryStockLimitError extends Error {
  readonly code = 'DIARY_STOCK_LIMIT'

  constructor() {
    super(`A Diary can be associated with at most ${MAX_DIARY_STOCK_SYMBOLS} company symbols`)
    this.name = 'DiaryStockLimitError'
  }
}

export function mergeDiaryStockSymbols(existing: readonly string[], incoming: readonly string[]) {
  const merged = [...new Set([...existing, ...incoming])]
  if (merged.length > MAX_DIARY_STOCK_SYMBOLS) throw new DiaryStockLimitError()
  return merged
}

export async function listDiaryStocks(db: Database | Transaction, userId: bigint, diaryIds: bigint[]) {
  if (!diaryIds.length) return []
  return db.select({ diaryId: diaryStocks.diaryId, symbol: stocks.symbol }).from(diaryStocks)
    .innerJoin(diaries, eq(diaries.id, diaryStocks.diaryId))
    .innerJoin(stocks, eq(stocks.id, diaryStocks.stockId))
    .where(and(eq(diaries.userId, userId), inArray(diaryStocks.diaryId, diaryIds)))
    .orderBy(asc(diaryStocks.createdAt), asc(stocks.id))
}

/** Caller holds the Diary row/date lock; links share its write transaction. */
export async function writeDiaryStocks(tx: Transaction, diaryId: bigint, symbols: string[], replace = false) {
  if (replace) await tx.delete(diaryStocks).where(eq(diaryStocks.diaryId, diaryId))
  // Stable acquisition order prevents opposite symbol lists from deadlocking.
  for (const symbol of [...symbols].sort()) {
    await tx.insert(stocks).values({ symbol }).onConflictDoNothing({ target: stocks.symbol })
    const [stock] = await tx.select({ id: stocks.id }).from(stocks).where(eq(stocks.symbol, symbol))
    if (!stock) throw new Error('Stock insert returned no row')
    await tx.insert(diaryStocks).values({ diaryId, stockId: stock.id }).onConflictDoNothing()
  }
}
