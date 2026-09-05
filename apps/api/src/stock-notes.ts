import { serializedIdSchema, type ErrorCode } from '@diary/contracts'
import { stockSymbolSchema } from '@diary/contracts/watchlist'
import { stockNoteCreateRequestSchema, stockNoteUpdateRequestSchema, stockNoteListParamsSchema, stockNoteListResponseSchema, toStockNoteContractResponse } from '@diary/contracts/stock-note'
import { stockNotes, stocks, partnerLinks, type Database } from '@diary/db'
import { and, count, desc, eq, or, isNotNull } from 'drizzle-orm'
import type { Context, Hono } from 'hono'
import type { z } from 'zod'
import type { AppEnv } from './app.js'
import { ensureWatchingStock } from './watchlist.js'

export function registerStockNoteRoutes(app: Hono<AppEnv>, dependencies: {
  db: Database
  now: () => Date
  fail: (status: number, code: ErrorCode, message: string) => never
  validationError: (error: z.ZodError) => never
  parseJson: <T>(context: Context<AppEnv>, schema: z.ZodType<T>) => Promise<T>
}) {
  const { db, now, fail, validationError, parseJson } = dependencies
  const owner = (c: Context<AppEnv>) => {
    c.header('Cache-Control', 'no-store')
    const user = c.get('user')
    return user ? BigInt(user.id) : fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
  }
  const symbolParam = (c: Context<AppEnv>) => {
    const result = stockSymbolSchema.safeParse(c.req.param('symbol'))
    if (!result.success) return validationError(result.error)
    return result.data
  }
  const idParam = (c: Context<AppEnv>) => {
    const result = serializedIdSchema.safeParse(c.req.param('id'))
    if (!result.success) return validationError(result.error)
    return BigInt(result.data)
  }
  app.get('/api/stocks/:symbol/notes', async c => {
    const userId = owner(c), symbol = symbolParam(c), parsed = stockNoteListParamsSchema.safeParse(c.req.query())
    if (!parsed.success) return validationError(parsed.error)
    const { page, limit, createdVia, partnerId } = parsed.data
    const result = await db.transaction(async tx => {
      let targetUserId = userId
      if (partnerId) {
        targetUserId = BigInt(partnerId)
        const [permission] = await tx.select({ id: partnerLinks.id }).from(partnerLinks).where(and(isNotNull(partnerLinks.acceptedAt), or(
          and(eq(partnerLinks.userAId, userId), eq(partnerLinks.userBId, targetUserId), eq(partnerLinks.userBSharesStockNotes, true)),
          and(eq(partnerLinks.userBId, userId), eq(partnerLinks.userAId, targetUserId), eq(partnerLinks.userASharesStockNotes, true)),
        )))
        if (!permission) return fail(403, 'PARTNER_LINK_ACCESS_DENIED', 'Partner sharing access denied')
      }
      const where = and(eq(stockNotes.userId, targetUserId), eq(stocks.symbol, symbol), createdVia ? eq(stockNotes.createdVia, createdVia) : undefined)
      const [totalRow] = await tx.select({ total: count() }).from(stockNotes).innerJoin(stocks, eq(stocks.id, stockNotes.stockId)).where(where)
      const total = totalRow!.total, totalPages = Math.ceil(total / limit)
      const rows = page > totalPages ? [] : await tx.select({ note: stockNotes, stock: stocks }).from(stockNotes)
        .innerJoin(stocks, eq(stocks.id, stockNotes.stockId)).where(where)
        .orderBy(desc(stockNotes.date), desc(stockNotes.id)).limit(limit).offset((page - 1) * limit)
      return stockNoteListResponseSchema.parse({ data: rows.map(row => ({ ...toStockNoteContractResponse({ ...row.note, stock: row.stock }), isOwnedByViewer: !partnerId })), pagination: { page, limit, total, totalPages } })
    }, { isolationLevel: 'repeatable read', accessMode: 'read only' })
    return c.json(result)
  })
  app.post('/api/stocks/:symbol/notes', async c => {
    const userId = owner(c), symbol = symbolParam(c), input = await parseJson(c, stockNoteCreateRequestSchema)
    const result = await db.transaction(async tx => {
      const { stock } = await ensureWatchingStock(tx, userId, symbol, now())
      const [note] = await tx.insert(stockNotes).values({ userId, stockId: stock.id, title: input.title, content: input.content, date: input.date ? new Date(input.date) : now(), createdVia: 'USER', createdAt: now(), updatedAt: now() }).returning()
      if (!note) throw new Error('Note insert returned no row')
      return toStockNoteContractResponse({ ...note, stock })
    })
    return c.json(result, 200)
  })
  async function mutate(c: Context<AppEnv>, remove: boolean) {
    const userId = owner(c), symbol = symbolParam(c), id = idParam(c)
    const result = await db.transaction(async tx => {
      const [row] = await tx.select({ note: stockNotes, stock: stocks }).from(stockNotes).innerJoin(stocks, eq(stocks.id, stockNotes.stockId))
        .where(and(eq(stockNotes.id, id), eq(stockNotes.userId, userId), eq(stocks.symbol, symbol))).for('update', { of: stockNotes })
      if (!row) return fail(404, 'STOCK_NOTE_NOT_FOUND', 'Note not found')
      if (row.note.createdVia !== 'USER') return fail(403, 'STOCK_NOTE_ACCESS_DENIED', `Cannot ${remove ? 'delete' : 'edit'} agent-created notes`)
      if (remove) { await tx.delete(stockNotes).where(eq(stockNotes.id, id)); return { success: true } }
      const input = await parseJson(c, stockNoteUpdateRequestSchema)
      const [note] = await tx.update(stockNotes).set({ ...input, date: input.date ? new Date(input.date) : undefined, updatedAt: now() }).where(eq(stockNotes.id, id)).returning()
      if (!note) throw new Error('Note update returned no row')
      return toStockNoteContractResponse({ ...note, stock: row.stock })
    })
    return c.json(result)
  }
  app.put('/api/stocks/:symbol/notes/:id', c => mutate(c, false))
  app.delete('/api/stocks/:symbol/notes/:id', c => mutate(c, true))
}
