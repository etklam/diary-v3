import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { researchSearchBudgets, researchSearchReservations } from '@diary/db'
import { createPostgresTavilySearchBudget } from '../../apps/api/src/research-studio/search-budget.js'
import { provisionTestDatabase } from '../support/database.js'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
const query = 'SOXX synthetic search budget fixture'
const reserveInput = (queryText = query) => ({ provider: 'tavily' as const, query: queryText, maxCallsPerRun: 3, maxCreditsPerCall: 1, maxResults: 5 })

beforeAll(async () => { database = await provisionTestDatabase('research_search') })
beforeEach(async () => {
  await database.db.delete(researchSearchReservations)
  await database.db.update(researchSearchBudgets).set({ enabled: false, callLimit: 0, reserved: 0, consumed: 0, unknown: 0 })
})
afterAll(async () => { await database?.dispose() })

describe('Research Studio durable Tavily search budget', () => {
  it('does not reserve or authorize a call while its singleton is disabled', async () => {
    const budget = createPostgresTavilySearchBudget(database.db)

    expect(await budget.isConfigured?.()).toBe(false)
    expect(await budget.reserve(reserveInput())).toBe(false)
    const [row] = await database.db.select().from(researchSearchBudgets)
    expect(row).toMatchObject({ enabled: false, callLimit: 0, reserved: 0, consumed: 0, unknown: 0 })
    expect(await database.db.select().from(researchSearchReservations)).toHaveLength(0)
  })

  it('serializes concurrent reservations against one global call limit', async () => {
    await database.db.update(researchSearchBudgets).set({ enabled: true, callLimit: 3 })
    const budget = createPostgresTavilySearchBudget(database.db)
    const results = await Promise.all(Array.from({ length: 8 }, () => budget.reserve(reserveInput())))

    expect(await budget.isConfigured?.()).toBe(true)
    expect(results.filter((reservation): reservation is string => typeof reservation === 'string')).toHaveLength(3)
    expect(results.filter(reservation => reservation === false || reservation === null)).toHaveLength(5)
    const [row] = await database.db.select().from(researchSearchBudgets)
    expect(row).toMatchObject({ enabled: true, callLimit: 3, reserved: 3, consumed: 0, unknown: 0 })
  })

  it('settles known and unknown outcomes once, preserves nullable billing, and never double counts retries', async () => {
    await database.db.update(researchSearchBudgets).set({ enabled: true, callLimit: 3 })
    const budget = createPostgresTavilySearchBudget(database.db)
    const [knownId, unknownId] = await Promise.all([
      budget.reserve(reserveInput()),
      budget.reserve(reserveInput()),
    ])
    expect(typeof knownId).toBe('string')
    expect(typeof unknownId).toBe('string')

    const knownSettlement = { provider: 'tavily' as const, query, success: true, returnedResults: 4, billedCredits: 1.25, reservationId: knownId as string }
    await Promise.all([budget.settle!(knownSettlement), budget.settle!(knownSettlement)])
    const unknownSettlement = { provider: 'tavily' as const, query, success: false, returnedResults: 0, billedCredits: null, reservationId: unknownId as string }
    await Promise.all([budget.settle!(unknownSettlement), budget.settle!(unknownSettlement)])

    const [row] = await database.db.select().from(researchSearchBudgets)
    expect(row).toMatchObject({ reserved: 0, consumed: 1, unknown: 1 })
    const reservations = await database.db.select().from(researchSearchReservations).orderBy(researchSearchReservations.status)
    expect(reservations).toEqual(expect.arrayContaining([
      expect.objectContaining({ reservationId: knownId, status: 'CONSUMED', returnedResults: 4, billedCredits: '1.250' }),
      expect.objectContaining({ reservationId: unknownId, status: 'UNKNOWN', returnedResults: 0, billedCredits: null }),
    ]))
    expect(await budget.reserve(reserveInput('another synthetic query'))).toMatch(/^[0-9a-f-]{36}$/u)
    const [final] = await database.db.select().from(researchSearchBudgets).where(eq(researchSearchBudgets.singleton, 'default'))
    expect(final).toMatchObject({ reserved: 1, consumed: 1, unknown: 1 })
    expect(await budget.reserve(reserveInput('one too many'))).toBe(false)
  })

  it('refuses a reservation with an unknown or mismatched durable token', async () => {
    await database.db.update(researchSearchBudgets).set({ enabled: true, callLimit: 2 })
    const budget = createPostgresTavilySearchBudget(database.db)

    await expect(budget.settle!({ provider: 'tavily', query, success: false, returnedResults: 0, billedCredits: null, reservationId: 'missing' })).rejects.toThrow('Durable search reservation is unavailable')
    const token = await budget.reserve(reserveInput())
    expect(typeof token).toBe('string')
    await expect(budget.settle!({ provider: 'tavily', query: 'different query', success: true, returnedResults: 0, billedCredits: 0, reservationId: token as string })).rejects.toThrow('Durable search reservation is unavailable')
    const [row] = await database.db.select().from(researchSearchBudgets)
    expect(row).toMatchObject({ reserved: 1, consumed: 0, unknown: 0 })
  })
})
