import { createHash, randomUUID } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { researchSearchBudgets, researchSearchReservations, type Database } from '@diary/db'
import type { TavilySearchBudget } from './sources.js'

const SINGLETON = 'default'

function queryHash(query: string): string {
  return createHash('sha256').update(query).digest('hex')
}

/** Durable, globally serialized Tavily call accounting. The migration seeds it disabled at zero. */
export function createPostgresTavilySearchBudget(db: Database): TavilySearchBudget {
  return {
    async isConfigured() {
      const [budget] = await db.select().from(researchSearchBudgets).where(eq(researchSearchBudgets.singleton, SINGLETON)).limit(1)
      return Boolean(budget?.enabled && budget.callLimit > 0)
    },
    async reserve(input) {
      return db.transaction(async tx => {
        const [budget] = await tx.select().from(researchSearchBudgets).where(eq(researchSearchBudgets.singleton, SINGLETON)).limit(1).for('update')
        if (!budget || !budget.enabled || budget.callLimit <= 0) return false
        if (budget.reserved + budget.consumed + budget.unknown >= budget.callLimit) return false
        const reservationId = randomUUID()
        const now = new Date()
        await tx.insert(researchSearchReservations).values({ reservationId, queryHash: queryHash(input.query), status: 'RESERVED', createdAt: now })
        const [updated] = await tx.update(researchSearchBudgets).set({ reserved: sql`${researchSearchBudgets.reserved} + 1`, updatedAt: now }).where(eq(researchSearchBudgets.singleton, SINGLETON)).returning({ singleton: researchSearchBudgets.singleton })
        if (!updated) throw new Error('Research search budget is unavailable')
        return reservationId
      })
    },
    async settle(input) {
      if (!input.reservationId) throw new Error('Durable search reservation ID is required')
      await db.transaction(async tx => {
        const [budget] = await tx.select().from(researchSearchBudgets).where(eq(researchSearchBudgets.singleton, SINGLETON)).limit(1).for('update')
        const [reservation] = await tx.select().from(researchSearchReservations).where(eq(researchSearchReservations.reservationId, input.reservationId!)).limit(1).for('update')
        if (!budget || !reservation || reservation.queryHash !== queryHash(input.query)) throw new Error('Durable search reservation is unavailable')
        if (reservation.status !== 'RESERVED') return
        const status = input.success ? 'CONSUMED' : 'UNKNOWN'
        const now = new Date()
        const [settled] = await tx.update(researchSearchReservations).set({
          status,
          returnedResults: input.returnedResults,
          billedCredits: input.billedCredits === null ? null : String(input.billedCredits),
          settledAt: now,
        }).where(eq(researchSearchReservations.reservationId, reservation.reservationId)).returning({ reservationId: researchSearchReservations.reservationId })
        if (!settled) return
        await tx.update(researchSearchBudgets).set({
          reserved: sql`greatest(0, ${researchSearchBudgets.reserved} - 1)`,
          consumed: sql`${researchSearchBudgets.consumed} + ${input.success ? 1 : 0}`,
          unknown: sql`${researchSearchBudgets.unknown} + ${input.success ? 0 : 1}`,
          updatedAt: now,
        }).where(eq(researchSearchBudgets.singleton, SINGLETON))
      })
    },
  }
}
