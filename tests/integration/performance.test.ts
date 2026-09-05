import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from 'vitest'
import { createApp } from '../../apps/api/src/app'
import { BrowserSession } from '../support/browser-session'
import { provisionTestDatabase } from '../support/database'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let server: ReturnType<typeof serve>, baseUrl: string, clock: Date
beforeAll(async () => { database = await provisionTestDatabase('performance') })
beforeEach(async () => {
  clock = new Date('2026-09-05T12:00:00Z')
  const app = createApp({ db: database.db, now: () => clock, config: {
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
async function createTrades(browser: BrowserSession) {
  const response = await browser.post('/api/diaries', { title: 'Private performance diary', content: 'Private body', date: '2026-01-01', transactions: [
    { symbol: 'AAPL', type: 'BUY', quantity: '2', price: '100', tradeDate: '2026-01-01T00:00:00Z', strategy: 'Growth', emotion: 'Calm' },
    { symbol: 'AAPL', type: 'SELL', quantity: '1', price: '120', tradeDate: '2026-01-31T23:59:59Z' },
    { symbol: 'AAPL', type: 'SELL', quantity: '1', price: '90', tradeDate: '2026-04-01T00:00:00Z', strategy: 'Exit' },
    { symbol: 'MSFT', type: 'BUY', quantity: '1', price: '50', tradeDate: '2026-01-01T00:00:00Z' },
    { symbol: 'MSFT', type: 'SELL', quantity: '1', price: '50', tradeDate: '2026-02-01T00:00:00Z' },
  ] }); expect(response.status).toBe(201)
}
it('uses exact persisted trades for all performance projections and source period fallback', async () => {
  const browser = await login(); await createTrades(browser)
  const response = await browser.request('/api/stats/performance'); expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store'); const result = await response.json()
  expect(result.summary).toMatchObject({ totalClosedTrades: 3, totalRealizedPnL: 10, wins: 1, losses: 1 }); expect(result.summary.winRate).toBeCloseTo(100/3)
  expect(result.periodStats.map((row: {period:string}) => row.period)).toEqual(['2026-01','2026-02','2026-04'])
  expect(result.strategyBreakdown).toEqual([{ name: 'Growth', tradeCount: 1, realizedPnL: 20, winRate: 100 }, { name: 'Exit', tradeCount: 1, realizedPnL: -10, winRate: 0 }])
  expect(result.bestStrategy.name).toBe('Growth'); expect(result.worstStrategy.name).toBe('Exit')
  expect(result.topWins[0]).toMatchObject({ symbol: 'AAPL', realizedPnL: 20, sellDate: '2026-01-31T23:59:59.000Z' }); expect(result.topLosses[0].realizedPnL).toBe(-10)
  expect(result.equityCurve.map((row: {cumPnL:number}) => row.cumPnL)).toEqual([20,20,10]); expect(JSON.stringify(result)).not.toContain('Private')
  expect(await (await browser.request('/api/stats/performance?period=invalid')).json()).toEqual(result)
  const quarter = await (await browser.request('/api/stats/performance?period=quarter&symbol=%20aapl%20')).json(); expect(quarter.periodStats.map((row: {period:string}) => row.period)).toEqual(['2026-Q1','2026-Q2']); expect(quarter.summary.totalClosedTrades).toBe(2)
  const year = await (await browser.request('/api/stats/performance?period=year')).json(); expect(year.periodStats).toEqual([{ period: '2026', realizedPnL: 10, tradeCount: 3, winCount: 1, winRate: (1/3)*100 }])
})

it('keeps source-derived fractional aggregation and rounded fields at the API boundary', async () => {
  const browser = await login()
  const response = await browser.post('/api/diaries', { title: 'Fractional performance fixture', content: 'Synthetic source-derived performance data', date: '2026-01-01', transactions: [
    { symbol: 'FRAC', type: 'BUY', quantity: '0.3', price: '0.1', tradeDate: '2026-01-01T00:00:00Z' },
    { symbol: 'FRAC', type: 'BUY', quantity: '0.2', price: '0.2', tradeDate: '2026-01-02T00:00:00Z' },
    { symbol: 'FRAC', type: 'SELL', quantity: '0.1', price: '0.3', tradeDate: '2026-02-01T00:00:00Z' },
    { symbol: 'FRAC', type: 'SELL', quantity: '0.4', price: '0.1', tradeDate: '2026-03-01T00:00:00Z' },
  ] }); expect(response.status).toBe(201)

  const result = await (await browser.request('/api/stats/performance')).json()
  expect(result.summary).toMatchObject({ totalClosedTrades: 2, totalRealizedPnL: 0, wins: 1, losses: 1, winRate: 50 })
  expect(result.periodStats).toEqual([
    { period: '2026-02', realizedPnL: 0.016, tradeCount: 1, winCount: 1, winRate: 100 },
    { period: '2026-03', realizedPnL: -0.016, tradeCount: 1, winCount: 0, winRate: 0 },
  ])
  expect(result.equityCurve).toEqual([
    { date: '2026-02-01', cumPnL: 0.02 },
    { date: '2026-03-01', cumPnL: 0 },
  ])
  expect(result.topWins[0]).toMatchObject({ symbol: 'FRAC', sellQuantity: 0.1, sellPrice: 0.3, avgCostBasis: 0.14, realizedPnL: 0.016, realizedPnLPct: 114.28571429 })
  expect(result.topLosses[0]).toMatchObject({ symbol: 'FRAC', sellQuantity: 0.4, sellPrice: 0.1, avgCostBasis: 0.14, realizedPnL: -0.016, realizedPnLPct: -28.57142857 })
})

it('keeps all-history response arrays while bounding top-trade payload projections', async () => {
  const browser = await login()
  const transactions = [
    { symbol: 'PAYLOAD', type: 'BUY', quantity: '51', price: '100', tradeDate: '2026-01-01T00:00:00Z', strategy: 'Seed strategy' },
    ...Array.from({ length: 51 }, (_, index) => ({
      symbol: 'PAYLOAD', type: 'SELL', quantity: '1', price: '101',
      tradeDate: new Date(Date.UTC(2026, 0, index + 2)).toISOString(),
      strategy: `Strategy ${index} ${'x'.repeat(80)}`,
    })),
  ]
  const created = await browser.post('/api/diaries', { title: 'Synthetic payload fixture', content: 'Private diary body must not enter performance output', date: '2026-01-01', transactions }); expect(created.status).toBe(201)

  const response = await browser.request('/api/stats/performance'); expect(response.status).toBe(200)
  const payload = await response.text(), payloadBytes = Buffer.byteLength(payload, 'utf8'), result = JSON.parse(payload)
  console.info(`ticket21 representative performance payload: ${payloadBytes} bytes`)
  expect(result.summary).toMatchObject({ totalClosedTrades: 51, totalRealizedPnL: 51, wins: 51, losses: 0, winRate: 100 })
  expect(result.periodStats).toHaveLength(2); expect(result.equityCurve).toHaveLength(51)
  expect(result.symbolBreakdown).toHaveLength(1); expect(result.strategyBreakdown).toHaveLength(51); expect(result.emotionBreakdown).toEqual([])
  expect(result.topWins).toHaveLength(5); expect(result.topLosses).toEqual([])
  expect(Object.keys(result)).toEqual(['summary', 'periodStats', 'equityCurve', 'topWins', 'topLosses', 'symbolBreakdown', 'strategyBreakdown', 'emotionBreakdown', 'bestStrategy', 'worstStrategy'])
  expect(result).not.toHaveProperty('diaries'); expect(result).not.toHaveProperty('content'); expect(result).not.toHaveProperty('transactions'); expect(result).not.toHaveProperty('title')
  expect(payloadBytes).toBeGreaterThan(0)
})

it('isolates owners and empty symbol results, rejects bad credentials and unknown query fields', async () => {
  const browser = await login(), other = await login(); await createTrades(browser)
  const empty = await (await other.request('/api/stats/performance')).json(); expect(empty.summary.totalClosedTrades).toBe(0); expect(empty.summary.sharpe).toBeNull(); expect(empty.strategyBreakdown).toEqual([])
  const unknown = await (await browser.request('/api/stats/performance?symbol=UNKNOWN')).json(); expect(unknown).toEqual(empty)
  expect((await fetch(baseUrl+'/api/stats/performance')).status).toBe(401)
  expect((await browser.request('/api/stats/performance', { headers: { authorization: 'Bearer invalid' } })).status).toBe(401)
  expect((await browser.request('/api/stats/performance?unexpected=1')).status).toBe(400)
})
