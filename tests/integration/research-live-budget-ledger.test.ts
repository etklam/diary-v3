import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { createDatabase, researchBudgetSessions } from '@diary/db'
import { reserveResearchLiveDispatch } from '../../apps/api/src/research-studio/service'
import { provisionTestDatabase } from '../support/database'

// Synthetic ledger-only fixtures: no evidence, generation request or transport is created.
const fixture = { synthetic: true, now: new Date('2026-09-25T12:00:00.000Z') }
let database: Awaited<ReturnType<typeof provisionTestDatabase>>
beforeAll(async () => { database = await provisionTestDatabase('research_budget_ledger') })
afterAll(async () => { await database?.dispose() })
beforeEach(async () => {
  expect(fixture.synthetic).toBe(true)
  await database.db.update(researchBudgetSessions).set({ dispatchLimit: 3, reserved: 0, consumed: 0, unknown: 0 }).where(eq(researchBudgetSessions.budgetKey, 'live-test'))
})
const reserve = () => database.db.transaction(tx => reserveResearchLiveDispatch(tx, fixture.now))

it('admits only three of eight concurrent synthetic ledger reservations', async () => {
  const results = await Promise.allSettled(Array.from({ length: 8 }, reserve))
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(3)
  const rejected = results.filter(result => result.status === 'rejected')
  expect(rejected).toHaveLength(5)
  for (const result of rejected) expect(result.reason).toMatchObject({ code: 'RESEARCH_BUDGET_EXCEEDED' })
  const [ledger] = await database.db.select().from(researchBudgetSessions)
  expect(ledger).toMatchObject({ dispatchLimit: 3, reserved: 3, consumed: 0, unknown: 0 })
})

it('counts known and unknown outcomes and stays exhausted after a client restart', async () => {
  await database.db.update(researchBudgetSessions).set({ consumed: 2, unknown: 1 }).where(eq(researchBudgetSessions.budgetKey, 'live-test'))
  await expect(reserve()).rejects.toMatchObject({ code: 'RESEARCH_BUDGET_EXCEEDED' })
  const restarted = createDatabase(database.url)
  try { await expect(restarted.db.transaction(tx => reserveResearchLiveDispatch(tx, fixture.now))).rejects.toMatchObject({ code: 'RESEARCH_BUDGET_EXCEEDED' }) }
  finally { await restarted.pool.end() }
  const [ledger] = await database.db.select().from(researchBudgetSessions)
  expect(ledger).toMatchObject({ reserved: 0, consumed: 2, unknown: 1 })
})

it('rolls back reservation when the surrounding dispatch-intent transaction fails', async () => {
  await expect(database.db.transaction(async tx => { await reserveResearchLiveDispatch(tx, fixture.now); throw new Error('Synthetic attempt persistence failure') })).rejects.toThrow('Synthetic attempt persistence failure')
  const [ledger] = await database.db.select().from(researchBudgetSessions)
  expect(ledger?.reserved).toBe(0)
})

it('does not recreate a missing fixed budget row', async () => {
  await database.db.delete(researchBudgetSessions)
  await expect(reserve()).rejects.toMatchObject({ code: 'RESEARCH_BUDGET_EXCEEDED' })
  expect(await database.db.select().from(researchBudgetSessions)).toHaveLength(0)
})
