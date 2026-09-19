import { stocks, stockNotes, partnerLinks, users, type Database } from '@diary/db'
import { and, count, desc, eq, or, sql, type SQLWrapper } from 'drizzle-orm'

type DbTransaction = Parameters<Parameters<Database['transaction']>[0]>[0]
type AuthorReference = bigint | SQLWrapper

/**
 * Stock Note read policy and row acquisition shared by the standalone list and Company Hub.
 *
 * The selected-author path checks the accepted link before looking up the stock so a denied
 * request does not learn whether a symbol exists. The preview path keeps the owner plus every
 * partner whose accepted link carries the author's sharing flag. Callers stay responsible for
 * their response projection: the list exposes ownership and pagination, while the Hub adds
 * attribution and its ten-row bound.
 */
export type StockNoteReadTarget =
  | { kind: 'owner' }
  | { kind: 'partner'; authorId: bigint }

export type AuthorizedStockNoteRow = {
  note: typeof stockNotes.$inferSelect
  authorName: string | null
}

export type StockNoteListRead = {
  authorized: true
  stock: typeof stocks.$inferSelect | null
  rows: AuthorizedStockNoteRow[]
  total: number
} | {
  authorized: false
  stock: null
  rows: []
  total: 0
}

function authorIsShared(viewerId: bigint, author: AuthorReference) {
  return sql`exists (
    select 1 from ${partnerLinks}
    where ${partnerLinks.acceptedAt} is not null and (
      (${partnerLinks.userAId} = ${viewerId} and ${partnerLinks.userBId} = ${author} and ${partnerLinks.userBSharesStockNotes} = true) or
      (${partnerLinks.userBId} = ${viewerId} and ${partnerLinks.userAId} = ${author} and ${partnerLinks.userASharesStockNotes} = true)
    )
  )`
}

async function findStock(tx: DbTransaction, symbol: string) {
  return (await tx.select().from(stocks).where(eq(stocks.symbol, symbol)))[0] ?? null
}

async function selectRows(tx: DbTransaction, where: ReturnType<typeof and>, limit: number, offset: number) {
  return tx.select({ note: stockNotes, authorName: users.name }).from(stockNotes)
    .innerJoin(users, eq(users.id, stockNotes.userId))
    .where(where)
    .orderBy(desc(stockNotes.date), desc(stockNotes.id))
    .limit(limit)
    .offset(offset)
}

export async function readStockNotesForAuthor(tx: DbTransaction, input: {
  viewerId: bigint
  symbol: string
  target: StockNoteReadTarget
  createdVia?: 'USER' | 'AGENT'
  page: number
  limit: number
}): Promise<StockNoteListRead> {
  // Keep this check before stock acquisition. A selected partner must be accepted and must have
  // enabled the author-side flag even when the requested symbol has no Stock row.
  if (input.target.kind === 'partner') {
    const [permission] = await tx.select({ id: partnerLinks.id }).from(partnerLinks).where(authorIsShared(input.viewerId, input.target.authorId)).limit(1)
    if (!permission) return { authorized: false, stock: null, rows: [], total: 0 }
  }

  const stock = await findStock(tx, input.symbol)
  if (!stock) return { authorized: true, stock: null, rows: [], total: 0 }
  const authorWhere = input.target.kind === 'owner'
    ? eq(stockNotes.userId, input.viewerId)
    : eq(stockNotes.userId, input.target.authorId)
  const where = and(
    eq(stockNotes.stockId, stock.id),
    authorWhere,
    input.createdVia ? eq(stockNotes.createdVia, input.createdVia) : undefined,
  )
  const [totalRow] = await tx.select({ total: count() }).from(stockNotes).where(where)
  const rows = await selectRows(tx, where, input.limit, (input.page - 1) * input.limit)
  return { authorized: true, stock, rows, total: totalRow?.total ?? 0 }
}

export async function readAuthorizedStockNotePreview(tx: DbTransaction, input: {
  viewerId: bigint
  stock: typeof stocks.$inferSelect | null
  limit: number
}): Promise<{ stock: typeof stocks.$inferSelect | null; rows: AuthorizedStockNoteRow[] }> {
  const stock = input.stock
  if (!stock) return { stock: null, rows: [] }
  const where = and(
    eq(stockNotes.stockId, stock.id),
    or(eq(stockNotes.userId, input.viewerId), authorIsShared(input.viewerId, stockNotes.userId)),
  )
  return { stock, rows: await selectRows(tx, where, input.limit, 0) }
}
