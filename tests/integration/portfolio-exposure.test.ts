import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from 'vitest'
import { createApp } from '../../apps/api/src/app'
import { createMarketData } from '../../apps/api/src/market-data'
import { marketBreadthDaily, marketRotationSnapshots } from '../../packages/db/src/schema'
import { getSectorsUniverse } from '../../packages/domain/src/market-rotation/universe'
import { BrowserSession } from '../support/browser-session'
import { provisionTestDatabase } from '../support/database'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let server: ReturnType<typeof serve>, baseUrl: string, clock: Date
beforeAll(async () => { database = await provisionTestDatabase('portfolio_exposure') })
beforeEach(async () => {
  clock = new Date('2026-09-05T12:00:00Z')
  const app = createApp({ db: database.db, now: () => clock, marketData: createMarketData({ now: () => clock, timeoutMs: 50, upstream: {
    quote: async symbol => ({ symbol, regularMarketPrice: symbol === 'MISSING' ? null : symbol === 'ZERO' ? 0 : 120, regularMarketPreviousClose: 100, regularMarketTime: new Date(symbol === 'STALE' ? '2026-09-01T10:00:00Z' : '2026-09-05T10:00:00Z'), marketState: 'REGULAR' }),
    chart: async () => ({ quotes: [] }),
  } }), config: {
    jwtSecret: 'synthetic-review-key-with-at-least-32-characters', nodeEnv: 'test', trustProxy: false, webOrigin: 'http://127.0.0.1',
  } })
  server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 })
  await once(server, 'listening'); baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterEach(async () => { server.close(); await once(server, 'close') })
afterAll(async () => { await database?.dispose() })
async function login() {
  const browser = new BrowserSession(baseUrl)
  const credentials = { email: `${randomUUID()}@example.test`, password: 'synthetic-review-password' }
  expect((await browser.post('/api/auth/register', credentials)).status).toBe(200)
  expect((await browser.post('/api/auth/login', credentials)).status).toBe(200)
  await browser.request('/api/auth/me')
  return browser
}
async function create(browser: BrowserSession, extra = {}) {
  const response = await browser.post('/api/diaries', { title: 'Original decision', content: 'Original Markdown', date: '2026-09-05', thesis: 'Original thesis', risk: 'Original risk', execution: 'Original execution', ...extra })
  expect(response.status).toBe(201)
  return response.json()
}

async function positions(browser: BrowserSession, symbols: string[]) {
  return create(browser, { transactions: symbols.map(symbol => ({ symbol, type: 'BUY', quantity: '2', price: '100', tradeDate: '2026-09-01T00:00:00Z' })) })
}

async function seedKnownMarketContext(snapshotDate = '2026-09-04', breadthDate = snapshotDate, stale = false) {
  const sectors = getSectorsUniverse()
  await database.db.insert(marketRotationSnapshots).values(sectors.map((entry, index) => ({
    symbol: entry.symbol, date: snapshotDate, rankScope: 'sectors', groupType: entry.groupType,
    sectorName: entry.sectorName, lastPrice: '100', adjustedClose: '100', rsi14: '55', above20d: true, above50d: true,
    maStatus: 'bullish_stack', rotationRank: index + 1, rankDelta2W: index === 0 ? 2 : index === 1 ? -2 : 0,
    rotationScoreDelta2W: index === 0 ? '2' : index === 1 ? '-2' : '0', signalStatus: 'complete',
  })))
  await database.db.insert(marketBreadthDaily).values({
    universeKey: 'SP500_NDX', date: breadthDate, universeCount: 100, up4Count: 60, down4Count: 20,
    up4Pct: '60.0000', down4Pct: '20.0000', above40dCount: 70, above40dPct: '70.0000', ratio5d: '2.0000', ratio10d: '2.0000',
    regime: 'risk_on', score: 80, coveragePct: stale ? '89.00' : '99.00', isStale: stale,
  })
}
it('returns all cost buckets without depending on quotes or leaking other owners', async () => {
  const browser = await login(), other = await login()
  await positions(browser, ['SOXX','QQQ','AAPL','MU','TLT','BIL','MISSING'])
  const response = await browser.request('/api/stocks/exposure'); expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store')
  const result = await response.json()
  expect(result.exposure.totalValue).toBe(1400)
  for (const key of ['highBetaPct','coreIndexPct','megaCapPct','singleStockPct','defensivePct','cashProxyPct','unknownPct']) expect(result.exposure[key]).toBeCloseTo(100 / 7)
  expect(result).toMatchObject({ marketState: 'unknown', lastUpdated: null, gaps: [], betaAllocation: { suggestedMode: 'unknown', suggestedBetaLevel: null } })
  const empty = await (await other.request('/api/stocks/exposure')).json(); expect(empty.exposure).toMatchObject({ totalValue: 0, unknownPct: 0, concentrationWarning: false })
  expect((await fetch(baseUrl + '/api/stocks/exposure')).status).toBe(401)
  expect((await browser.request('/api/stocks/exposure', { headers: { authorization: 'Bearer invalid' } })).status).toBe(401)
})

it('uses the qualified sectors reader for allocation gaps while preserving owner cost exposure', async () => {
  await seedKnownMarketContext('2026-09-04', '2026-09-03')
  const browser = await login()
  await positions(browser, ['SOXX', 'QQQ', 'BIL'])
  const response = await browser.request('/api/stocks/exposure'); expect(response.status).toBe(200)
  const result = await response.json()
  expect(result.exposure.totalValue).toBe(600)
  expect(result).toMatchObject({
    marketState: 'risk_on', lastUpdated: '2026-09-04T00:00:00.000Z',
    marketStateAsOfDate: '2026-09-03', summaryAsOfDate: '2026-09-04',
    suggestedAllocation: { highBetaTargetPct: 60, coreIndexTargetPct: 30, cashTargetPct: 10 },
    betaAllocation: { suggestedMode: 'aggressive', suggestedBetaLevel: 1.3 },
  })
  expect(result.gaps).toEqual([
    { bucket: 'highBeta', currentPct: expect.closeTo(33.3333, 4), targetPct: 60, gapPct: expect.closeTo(-26.6667, 4), status: 'underweight' },
    { bucket: 'coreIndex', currentPct: expect.closeTo(33.3333, 4), targetPct: 30, gapPct: expect.closeTo(3.3333, 4), status: 'balanced' },
    { bucket: 'cash', currentPct: expect.closeTo(33.3333, 4), targetPct: 10, gapPct: expect.closeTo(23.3333, 4), status: 'overweight' },
  ])
})

it('keeps exposure usable and suppresses target gaps for stale market context', async () => {
  await seedKnownMarketContext('2026-09-03', '2026-09-05', true)
  const browser = await login(); await positions(browser, ['SOXX', 'UNKNOWN'])
  const result = await (await browser.request('/api/stocks/exposure')).json()
  expect(result.exposure.totalValue).toBe(400)
  expect(result.exposure.unknownPct).toBeCloseTo(50, 4)
  expect(result).toMatchObject({ marketState: 'unknown', gaps: [] })
})

it('keeps holdings available when the persisted market reader fails', async () => {
  const browser = await login(); await positions(browser, ['SOXX', 'UNKNOWN'])
  await database.pool.query('alter table market_rotation_snapshot rename to market_rotation_snapshot_failure')
  try {
    const response = await browser.request('/api/stocks/exposure'); expect(response.status).toBe(200)
    const result = await response.json()
    expect(result.exposure.totalValue).toBe(400)
    expect(result.exposure.unknownPct).toBeCloseTo(50, 4)
    expect(result).toMatchObject({ marketState: 'unknown', gaps: [], lastUpdated: null })
  } finally {
    await database.pool.query('alter table market_rotation_snapshot_failure rename to market_rotation_snapshot')
  }
})
