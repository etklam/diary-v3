import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { marketBreadthDaily, marketUniverse } from '../../packages/db/src/schema'
import { runMarketStateBatch, MarketStateBatchBusy } from '../../apps/api/src/market-state-batch'
import type { DailyMarketPrice } from '../../apps/api/src/market-data/daily-prices'
import { provisionTestDatabase } from '../support/database'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
beforeAll(async () => { database = await provisionTestDatabase('market_state_batch') })
afterAll(async () => { await database?.dispose() })

function prices(symbol: string, bump: number): DailyMarketPrice[] {
  return Array.from({ length: 50 }, (_, index) => {
    const value = 100 + bump + index / 10
    const date = new Date(Date.UTC(2026, 5, index + 1)).toISOString().slice(0, 10)
    return { symbol, date, open: value.toFixed(6), high: (value + 1).toFixed(6), low: (value - 1).toFixed(6), close: value.toFixed(6), adjustedClose: value.toFixed(6), volume: 100n }
  })
}

describe('market state breadth batch', () => {
  it('persists prices first, recalculates existing breadth dates on rerun, and serializes the universe job', async () => {
    await database.db.insert(marketUniverse).values([
      { symbol: 'AAA', name: 'AAA', exchange: 'Fixture', assetType: 'stock', isActive: true },
      { symbol: 'BBB', name: 'BBB', exchange: 'Fixture', assetType: 'stock', isActive: true },
    ])
    let bump = 0
    const market = { dailyPrices: async (symbol: string) => ({ source: 'upstream' as const, fetchedAt: '2026-07-01T00:00:00.000Z', data: prices(symbol, bump) }) }
    const deps = { db: database.db, pool: database.pool, market, now: () => new Date('2026-07-01T00:00:00Z') }
    const first = await runMarketStateBatch(deps)
    expect(first).toMatchObject({ status: 'success', symbolCount: 2, successfulSymbolCount: 2, failedSymbolCount: 0, breadthDateCount: 10, upsertedCount: 10 })
    const firstRows = await database.db.select().from(marketBreadthDaily)
    expect(firstRows).toHaveLength(10)
    bump = 20
    await runMarketStateBatch(deps)
    const secondRows = await database.db.select().from(marketBreadthDaily)
    expect(secondRows).toHaveLength(10)
    expect(secondRows.find(row => row.date === firstRows[0]?.date)?.updatedAt.getTime()).toBeGreaterThanOrEqual(firstRows[0]!.updatedAt.getTime())
    await database.pool.query("CREATE FUNCTION reject_market_price_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic market price persistence failure'; END $$")
    await database.pool.query("CREATE TRIGGER reject_market_price_update BEFORE UPDATE ON market_daily_price FOR EACH ROW EXECUTE FUNCTION reject_market_price_update()")
    bump = 40
    await expect(runMarketStateBatch(deps)).rejects.toThrow()
    const lock = await database.pool.connect()
    await lock.query("select pg_advisory_lock(hashtextextended('diary:market-state:SP500_NDX',0))")
    try {
      await expect(runMarketStateBatch(deps)).rejects.toBeInstanceOf(MarketStateBatchBusy)
    } finally {
      await lock.query("select pg_advisory_unlock(hashtextextended('diary:market-state:SP500_NDX',0))")
      lock.release()
    }
  })
})
