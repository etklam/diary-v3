import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { marketBreadthDaily, marketRotationSnapshots } from '../../packages/db/src/schema'
import { getIndexesUniverse } from '../../packages/domain/src/market-rotation/universe'
import { readRotationMonitor } from '../../apps/api/src/rotation-monitor'
import { provisionTestDatabase } from '../support/database'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
beforeAll(async () => { database = await provisionTestDatabase('market_state_monitor') })
afterAll(async () => { await database?.dispose() })

describe('rotation monitor market state context', () => {
  it('uses the latest breadth row at the ranking observation date and keeps stale state unknown', async () => {
    await database.db.insert(marketRotationSnapshots).values(getIndexesUniverse().flatMap(entry => ['2026-09-03', '2026-09-04'].map(date => ({
      symbol: entry.symbol, date, rankScope: 'indexes', groupType: 'index',
      lastPrice: '100', adjustedClose: '100', rsi14: '55', above20d: true, above50d: true,
      maStatus: 'bullish_stack', signalStatus: 'complete', rotationRank: entry.symbol === 'SPY' ? 1 : null,
    }))))
    await database.db.insert(marketBreadthDaily).values([
      { universeKey: 'SP500_NDX', date: '2026-09-03', universeCount: 100, up4Count: 40, down4Count: 10, up4Pct: '40.0000', down4Pct: '10.0000', above40dCount: 60, above40dPct: '60.0000', ratio5d: '1.5000', ratio10d: '1.8000', regime: 'risk_on', score: 70, coveragePct: '99.00', isStale: false },
      { universeKey: 'SP500_NDX', date: '2026-09-04', universeCount: 100, up4Count: 40, down4Count: 10, up4Pct: '40.0000', down4Pct: '10.0000', above40dCount: 60, above40dPct: '60.0000', ratio5d: '1.5000', ratio10d: '1.8000', regime: 'risk_on', score: 70, coveragePct: '89.00', isStale: true },
    ])
    const stale = await readRotationMonitor(database.db, 'indexes', '2026-09-04')
    expect(stale?.payload.marketState).toBe('unknown')
    expect(stale?.payload.marketStateAsOfDate).toBe('2026-09-04')
    const prior = await readRotationMonitor(database.db, 'indexes', '2026-09-03')
    expect(prior?.payload.marketState).toBe('risk_on')
    expect(prior?.payload.marketStateAsOfDate).toBe('2026-09-03')
  })
})
