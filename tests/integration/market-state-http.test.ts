import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { once } from 'node:events'
import { serve } from '@hono/node-server'
import type { AddressInfo } from 'node:net'
import { marketBreadthDaily } from '../../packages/db/src/schema'
import { marketStateHistoryResponseSchema, marketStateSnapshotSchema } from '../../packages/contracts/src/market-state'
import { createApp } from '../../apps/api/src/app'
import { getLatestBreadthSnapshot } from '../../apps/api/src/market-state-queries'
import { upsertMarketBreadthRows } from '../../apps/api/src/market-state-persistence'
import { provisionTestDatabase } from '../support/database'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let server: ReturnType<typeof serve>
let baseUrl: string

beforeAll(async () => {
  database = await provisionTestDatabase('market_state_http')
  const app = createApp({
    db: database.db,
    now: () => new Date('2026-09-06T12:00:00Z'),
    config: { jwtSecret: 'synthetic-market-state-key-with-at-least-32-characters', nodeEnv: 'test', trustProxy: false, webOrigin: 'http://127.0.0.1' },
    marketData: { quote: async () => { throw new Error('not used') }, historical: async () => { throw new Error('not used') }, intraday: async () => { throw new Error('not used') }, monthly: async () => { throw new Error('not used') }, dailyPrices: async () => { throw new Error('not used') }, dailyResearch: async () => { throw new Error('not used') }, fundValuation: async () => { throw new Error('not used') }, quotes: async () => ({ quotes: new Map(), errors: [] }) },
  })
  server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 })
  await once(server, 'listening')
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  server?.close()
  if (server) await once(server, 'close')
  await database?.dispose()
})

describe('market state HTTP and persistence', () => {
  it('returns no-store 404 before data and strict history query errors', async () => {
    const snapshot = await fetch(`${baseUrl}/api/market/state/snapshot`)
    expect(snapshot.status).toBe(404)
    expect(snapshot.headers.get('cache-control')).toBe('no-store')
    const invalid = await fetch(`${baseUrl}/api/market/state/history?days=0`)
    expect(invalid.status).toBe(400)
    expect(invalid.headers.get('cache-control')).toBe('no-store')
  })

  it('upserts rows on rerun and resolves stale/under-covered state to unknown', async () => {
    await upsertMarketBreadthRows(database.db, 'SP500_NDX', [
      { date: new Date('2026-09-02T00:00:00Z'), universeCount: 100, up4Count: 30, down4Count: 10, up4Pct: 30, down4Pct: 10, above40dCount: 60, above40dPct: 60, ratio5d: 1.5, ratio10d: 1.8, regime: 'risk_on', score: 70, coveragePct: 99, isStale: false },
    ])
    await upsertMarketBreadthRows(database.db, 'SP500_NDX', [
      { date: new Date('2026-09-02T00:00:00Z'), universeCount: 100, up4Count: 2, down4Count: 2, up4Pct: 2, down4Pct: 2, above40dCount: 25, above40dPct: 25, ratio5d: 0.5, ratio10d: 0.6, regime: 'defensive', score: 20, coveragePct: 91, isStale: false },
      { date: new Date('2026-09-03T00:00:00Z'), universeCount: 100, up4Count: 30, down4Count: 10, up4Pct: 30, down4Pct: 10, above40dCount: 60, above40dPct: 60, ratio5d: 1.5, ratio10d: 1.8, regime: 'risk_on', score: 70, coveragePct: 89, isStale: true },
    ])
    const stored = await database.db.select().from(marketBreadthDaily)
    expect(stored).toHaveLength(2)
    expect(stored.find(row => row.date === '2026-09-02')?.regime).toBe('defensive')
    const snapshot = await fetch(`${baseUrl}/api/market/state/snapshot`)
    const parsed = marketStateSnapshotSchema.parse(await snapshot.json())
    expect(parsed).toMatchObject({ date: '2026-09-03', marketState: 'unknown', isStale: true, coveragePct: 89 })
    const history = marketStateHistoryResponseSchema.parse(await (await fetch(`${baseUrl}/api/market/state/history?days=2`)).json())
    expect(history.map(row => row.date)).toEqual(['2026-09-03', '2026-09-02'])
    expect(history[0]?.marketState).toBe('unknown')
    expect(history[1]?.marketState).toBe('defensive')
    expect((await getLatestBreadthSnapshot(database.db, 'SP500_NDX', '2026-09-02'))?.marketState).toBe('defensive')
  })
})
