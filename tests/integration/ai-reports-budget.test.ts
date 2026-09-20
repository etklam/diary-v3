import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { provisionTestDatabase } from '../support/database'
import { lockAiGlobal } from '../../apps/api/src/ai-reports/job-store.js'
import { consumeGlobalAiBudget, releaseGlobalAiBudget, reserveGlobalAiBudget, settleGlobalAiBudget } from '../../apps/api/src/ai-reports/budget.js'
let database: Awaited<ReturnType<typeof provisionTestDatabase>>
beforeAll(async () => { database = await provisionTestDatabase('ai_budget') })
afterAll(async () => { await database?.dispose() })
describe('AI global monetary budget', () => {
  it('atomically reserves money across concurrent submissions without duplicate global buckets', async () => {
    const accepted = await Promise.all(Array.from({ length: 20 }, () => database.db.transaction(async tx => {
      await lockAiGlobal(tx)
      return reserveGlobalAiBudget(tx, { month: '2026-01-01', reservationCostCents: 13, monthlyBudgetCents: 100 })
    })))
    expect(accepted.filter(Boolean)).toHaveLength(7)
    const result = await database.pool.query("select reserved, reserved_cost_cents from ai_usage_bucket where scope='global' and bucket_month='2026-01-01'")
    expect(result.rows).toEqual([{ reserved: 7, reserved_cost_cents: 91 }])
    await expect(database.pool.query("insert into ai_usage_bucket(scope,bucket_month) values ('global','2026-01-01')")).rejects.toThrow()
  })
  it('tracks differently priced reservations, commits before dispatch and retains unknown cost in its original UTC month', async () => {
    const month = '2026-02-01'
    await database.db.transaction(async tx => {
      await lockAiGlobal(tx)
      expect(await reserveGlobalAiBudget(tx, { month, reservationCostCents: 10, monthlyBudgetCents: 50 })).toBe(true)
      expect(await reserveGlobalAiBudget(tx, { month, reservationCostCents: 40, monthlyBudgetCents: 50 })).toBe(true)
      expect(await reserveGlobalAiBudget(tx, { month, reservationCostCents: 1, monthlyBudgetCents: 50 })).toBe(false)
      await releaseGlobalAiBudget(tx, { month, reservationCostCents: 10 })
      await consumeGlobalAiBudget(tx, { month, reservationCostCents: 40 })
      await settleGlobalAiBudget(tx, { month, reservationCostCents: 40, actualCostCents: null, inputTokens: null, outputTokens: null })
      expect(await reserveGlobalAiBudget(tx, { month, reservationCostCents: 10, monthlyBudgetCents: 50 })).toBe(true)
      await consumeGlobalAiBudget(tx, { month, reservationCostCents: 10 })
      await settleGlobalAiBudget(tx, { month, reservationCostCents: 10, actualCostCents: 5, inputTokens: 10, outputTokens: 2 })
      expect(await reserveGlobalAiBudget(tx, { month, reservationCostCents: 6, monthlyBudgetCents: 50 })).toBe(false)
      expect(await reserveGlobalAiBudget(tx, { month, reservationCostCents: 5, monthlyBudgetCents: 50 })).toBe(true)
      await releaseGlobalAiBudget(tx, { month, reservationCostCents: 5 })
      expect(await reserveGlobalAiBudget(tx, { month: '2026-03-01', reservationCostCents: 1, monthlyBudgetCents: 50 })).toBe(true)
    })
    const result = await database.pool.query("select reserved, reserved_cost_cents, consumed, released, unknown, estimated_cost_cents, input_tokens, output_tokens from ai_usage_bucket where scope='global' and bucket_month='2026-02-01'")
    expect(result.rows[0]).toEqual({ reserved: 0, reserved_cost_cents: 0, consumed: 2, released: 2, unknown: 1, estimated_cost_cents: 45, input_tokens: 10, output_tokens: 2 })
  })
  it('fails closed on missing/double reservation consumption and database-negative costs', async () => {
    await expect(database.db.transaction(async tx => {
      await lockAiGlobal(tx)
      await consumeGlobalAiBudget(tx, { month: '2026-04-01', reservationCostCents: 1 })
    })).rejects.toThrow('AI_BUDGET_RESERVATION_MISSING')
    await expect(database.pool.query("insert into ai_usage_bucket(scope,bucket_month,reserved_cost_cents) values ('global','2026-04-01',-1)")).rejects.toThrow()
  })
})
