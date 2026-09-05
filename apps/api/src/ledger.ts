import {
  holdingsResponseSchema,
  ledgerTransactionResponseSchema,
  recentClosedTradesResponseSchema,
  type LedgerTransactionInput,
  type LedgerTransactionUpdateInput,
  type RecentClosedTradesQuery,
} from '@diary/contracts/ledger'
import { transactions, type Database } from '@diary/db'
import { LedgerValidationError, replayLedger, roundDecimalString } from '@diary/domain/ledger'
import { and, asc, eq, ne, notInArray, sql } from 'drizzle-orm'

export type LedgerTransactionRow = typeof transactions.$inferSelect
type DbTransaction = Parameters<Parameters<Database['transaction']>[0]>[0]
export { LedgerValidationError }

function instant(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString()
}

export function serializeLedgerTransaction(row: LedgerTransactionRow) {
  return ledgerTransactionResponseSchema.parse({
    id: row.id.toString(),
    diaryId: row.diaryId.toString(),
    userId: row.userId.toString(),
    symbol: row.symbol,
    type: row.type,
    quantity: row.quantity,
    price: row.price,
    tradeDate: instant(row.tradeDate),
    notes: row.notes,
    strategy: row.strategy,
    emotion: row.emotion,
    createdAt: instant(row.createdAt),
  })
}

export function ledgerUserLock(userId: bigint) {
  return sql`select pg_advisory_xact_lock(hashtextextended(${'ledger:' + userId.toString()}, 0::bigint))`
}

export async function insertLedgerTransactions(
  tx: DbTransaction,
  diaryId: bigint,
  userId: bigint,
  inputs: readonly LedgerTransactionInput[],
) {
  if (inputs.length === 0) return []
  return tx.insert(transactions).values(inputs.map(input => ({
    diaryId,
    userId,
    symbol: input.symbol,
    type: input.type,
    quantity: input.quantity,
    price: input.price,
    tradeDate: new Date(input.tradeDate),
    notes: input.notes ?? null,
    strategy: input.strategy ?? null,
    emotion: input.emotion ?? null,
  }))).returning()
}

// Transitional aliases keep independently running slices buildable while the
// Diary module switches from the BUY-only ticket 15 names.
export const insertBuyTransactions = insertLedgerTransactions

export async function readUserLedger(
  db: Database | DbTransaction,
  userId: bigint,
  excludeDiaryId?: bigint,
) {
  return db.select().from(transactions).where(and(
    eq(transactions.userId, userId),
    ...(excludeDiaryId === undefined ? [] : [ne(transactions.diaryId, excludeDiaryId)]),
  )).orderBy(asc(transactions.tradeDate), asc(transactions.id))
}

function replayRows(
  rows: readonly LedgerTransactionRow[],
  additions: readonly (LedgerTransactionInput & { id?: string })[] = [],
) {
  let nextOrder = [...rows.map(row => row.id), ...additions.flatMap(input => input.id ? [BigInt(input.id)] : [])]
    .reduce((highest, id) => id > highest ? id : highest, 0n)
  return replayLedger([
    ...rows.map(row => ({
      id: row.id.toString(), symbol: row.symbol, type: row.type,
      quantity: row.quantity, price: row.price, tradeDate: row.tradeDate, order: row.id,
    })),
    ...additions.map(input => ({
      ...input,
      order: input.id === undefined ? ++nextOrder : BigInt(input.id),
    })),
  ])
}

export async function validateLedgerAdditions(
  tx: DbTransaction,
  userId: bigint,
  additions: readonly LedgerTransactionInput[],
) {
  replayRows(await readUserLedger(tx, userId), additions)
}

export async function validateLedgerWithoutDiary(tx: DbTransaction, userId: bigint, diaryId: bigint) {
  replayRows(await readUserLedger(tx, userId, diaryId))
}

export async function replaceDiaryTransactions(
  tx: DbTransaction,
  diaryId: bigint,
  userId: bigint,
  inputs: readonly LedgerTransactionUpdateInput[],
) {
  const existing = await listDiaryTransactions(tx, diaryId, userId)
  const existingIds = new Set(existing.map(row => row.id.toString()))
  for (const input of inputs) {
    if (input.id !== undefined && !existingIds.has(input.id)) {
      throw new LedgerValidationError(input.symbol, `Transaction ${input.id} was not found in this diary`)
    }
  }

  // The caller holds the owner ledger lock. Validate the complete projected
  // history before deleting or changing a persisted row.
  replayRows(await readUserLedger(tx, userId, diaryId), inputs)

  const retainedIds = inputs.flatMap(input => input.id === undefined ? [] : [BigInt(input.id)])
  if (retainedIds.length === 0) {
    await tx.delete(transactions).where(and(
      eq(transactions.diaryId, diaryId), eq(transactions.userId, userId),
    ))
  } else {
    await tx.delete(transactions).where(and(
      eq(transactions.diaryId, diaryId), eq(transactions.userId, userId),
      notInArray(transactions.id, retainedIds),
    ))
  }

  for (const input of inputs) {
    if (input.id === undefined) continue
    const [updated] = await tx.update(transactions).set({
      userId,
      symbol: input.symbol,
      type: input.type,
      quantity: input.quantity,
      price: input.price,
      tradeDate: new Date(input.tradeDate),
      notes: input.notes ?? null,
      strategy: input.strategy ?? null,
      emotion: input.emotion ?? null,
    }).where(and(
      eq(transactions.id, BigInt(input.id)),
      eq(transactions.diaryId, diaryId),
      eq(transactions.userId, userId),
    )).returning({ id: transactions.id })
    if (!updated) throw new LedgerValidationError(input.symbol, `Transaction ${input.id} was not found in this diary`)
  }

  const additions: LedgerTransactionInput[] = inputs
    .filter(input => input.id === undefined)
    .map(({ id: _id, ...input }) => input)
  await insertLedgerTransactions(tx, diaryId, userId, additions)
  return listDiaryTransactions(tx, diaryId, userId)
}

export function listDiaryTransactions(db: Database | DbTransaction, diaryId: bigint, userId: bigint) {
  return db.select().from(transactions)
    .where(and(eq(transactions.diaryId, diaryId), eq(transactions.userId, userId)))
    .orderBy(asc(transactions.tradeDate), asc(transactions.id))
}

export async function getHoldings(db: Database | DbTransaction, userId: bigint) {
  return holdingsResponseSchema.parse(replayRows(await readUserLedger(db, userId)).holdings)
}
export const getBuyHoldings = getHoldings

export async function getRecentClosedTrades(
  db: Database,
  userId: bigint,
  query: RecentClosedTradesQuery,
  now: Date,
) {
  const cutoff = new Date(now.getTime() - query.days * 86_400_000)
  const { closedTrades } = replayRows(await readUserLedger(db, userId))
  const trades = closedTrades.filter(trade => trade.sellDate >= cutoff)
    .sort((left, right) => {
      const dateDifference = right.sellDate.getTime() - left.sellDate.getTime()
      if (dateDifference !== 0) return dateDifference
      return BigInt(left.id) < BigInt(right.id) ? -1 : 1
    })
    .slice(0, query.limit)
    .map(trade => ({
      id: trade.id,
      symbol: trade.symbol,
      sellDate: trade.sellDate.toISOString(),
      sellQuantity: trade.sellQuantity,
      realizedPnL: roundDecimalString(trade.realizedPnL, 2),
      realizedPnLPct: roundDecimalString(trade.realizedPnLPct, 2),
    }))
  return recentClosedTradesResponseSchema.parse({ trades })
}
