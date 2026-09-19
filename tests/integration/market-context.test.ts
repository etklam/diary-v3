import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { marketBreadthDaily, marketRotationSnapshots, schema } from '../../packages/db/src'
import { getSectorsUniverse } from '../../packages/domain/src/market-rotation/universe'
import { readPortfolioMarketContext } from '../../apps/api/src/market-context'
import { provisionTestDatabase } from '../support/database'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
beforeAll(async () => { database = await provisionTestDatabase('market_context') })
afterAll(async () => { await database?.dispose() })

it('reads one qualified sector snapshot without loading comparison history', async () => {
  const dates = Array.from({ length: 12 }, (_, index) => `2026-08-${String(index + 1).padStart(2, '0')}`)
  await database.db.insert(marketRotationSnapshots).values(dates.flatMap(date => getSectorsUniverse().map((entry, index) => ({
    symbol: entry.symbol, date, rankScope: 'sectors', groupType: entry.groupType, sectorName: entry.sectorName,
    lastPrice: '100', adjustedClose: '100', rsi14: '55', above20d: true, above50d: index < 10,
    maStatus: 'bullish_stack', rotationRank: index + 1, rankDelta2W: index === 0 ? 2 : index === 1 ? -2 : 0,
    signalStatus: 'complete',
  }))))
  await database.db.insert(marketBreadthDaily).values({
    universeKey: 'SP500_NDX', date: '2026-08-12', universeCount: 100, regime: 'risk_on', score: 70,
    coveragePct: '99.00', isStale: false,
  })

  const queries: string[] = []
  const observed = drizzle(database.pool, { schema, logger: { logQuery(query) { queries.push(query) } } })
  const context = await readPortfolioMarketContext(observed, '2026-08-12')
  expect(context).toMatchObject({ marketState: 'risk_on', summaryAsOfDate: '2026-08-12' })
  const rotationQueries = queries.filter(query => query.toLowerCase().includes('market_rotation_snapshot'))
  expect(rotationQueries).toHaveLength(2)
  expect(rotationQueries.some(query => query.toLowerCase().includes('select "market_rotation_snapshot"."symbol", "market_rotation_snapshot"."date"'))).toBe(false)
})
