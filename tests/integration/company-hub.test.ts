import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from 'vitest'
import { createApp } from '../../apps/api/src/app'
import { createMarketData } from '../../apps/api/src/market-data'
import { BrowserSession } from '../support/browser-session'
import { provisionTestDatabase } from '../support/database'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let server: ReturnType<typeof serve>, baseUrl: string, clock: Date
beforeAll(async () => { database = await provisionTestDatabase('company_hub') })
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
async function hub(browser: BrowserSession, symbol = 'AAPL') {
  const response = await browser.request(`/api/stocks/${symbol}/hub`); expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store'); return response.json()
}
it('projects held, closed, research-only and untracked states with cost concentration', async () => {
  const browser = await login()
  expect((await hub(browser)).position.state).toBe('untracked')
  await browser.post('/api/stocks/watchlist', { symbol: 'AAPL' })
  expect((await hub(browser)).position.state).toBe('research_only')
  const response = await browser.post('/api/diaries', { date: '2026-09-05', title: 'Transaction context', content: 'Private body', transactions: [
    { symbol: 'AAPL', type: 'BUY', quantity: '2', price: '100', tradeDate: '2026-09-01T00:00:00Z' },
    { symbol: 'MSFT', type: 'BUY', quantity: '2', price: '300', tradeDate: '2026-09-01T00:00:00Z' },
  ] }); expect(response.status).toBe(201)
  let result = await hub(browser)
  expect(result.position).toMatchObject({ state: 'held', quantity: 2, averageCost: 100, totalCost: 200, price: 120, marketValue: 240, concentrationPct: 25, concentrationBasis: 'cost_basis', quoteStatus: 'priced' })
  expect(result.relatedDiaries).toEqual([{ id: (await response.json()).id, date: '2026-09-05', title: 'Transaction context', transactionCount: 1, relation: 'transaction' }])
  expect(JSON.stringify(result)).not.toContain('Private body')
  expect((await browser.post('/api/diaries', { date: '2026-09-06', title: 'Exit', content: 'Synthetic', transactions: [{ symbol: 'AAPL', type: 'SELL', quantity: '2', price: '110', tradeDate: '2026-09-06T00:00:00Z' }] })).status).toBe(201)
  result = await hub(browser); expect(result.position).toMatchObject({ state: 'closed', quantity: 0, totalCost: 0, marketValue: null, concentrationBasis: 'unavailable' })
})
it('bounds each owner research collection and gives explicit context precedence over transactions', async () => {
  const browser = await login(), other = await login()
  for (let day = 1; day <= 11; day++) {
    expect((await browser.post('/api/diaries', { date: `2026-01-${String(day).padStart(2, '0')}`, title: `Context ${day}`, content: 'Private diary content', stockSymbols: ['AAPL'], transactions: day === 11 ? [{ symbol: 'AAPL', type: 'BUY', quantity: '1', price: '100', tradeDate: '2026-01-11T00:00:00Z' }] : [] })).status).toBe(201)
    expect((await browser.post('/api/stocks/AAPL/notes', { title: `Note ${day}`, content: 'Owner note', date: `2026-01-${String(day).padStart(2, '0')}T00:00:00Z` })).status).toBe(200)
    expect((await browser.post('/api/stocks/AAPL/evidence', { sourceType: 'MANUAL', summary: `Evidence ${day}`, occurredAt: `2026-01-${String(day).padStart(2, '0')}T00:00:00Z` })).status).toBe(200)
  }
  await other.post('/api/stocks/AAPL/notes', { title: 'Foreign note', content: 'Foreign private data' })
  await other.post('/api/diaries', { date: '2099-01-01', title: 'Foreign diary', content: 'Foreign private data', stockSymbols: ['AAPL'] })
  const headers = { 'content-type': 'application/json', 'x-csrf-token': browser.cookies.get('csrf-token')! }
  expect((await browser.request('/api/stocks/AAPL/thesis', { method: 'PUT', headers, body: JSON.stringify({ status: 'ACTIVE', summary: 'Owner current view', whyIOwnIt: 'Reason' }) })).status).toBe(200)
  for (let i = 0; i < 11; i++) expect((await browser.post('/api/stocks/AAPL/thesis/reviews', { outcome: 'PARTIAL', portfolioDecision: 'REDUCE', whatChanged: `Owner reflection ${i}` })).status).toBe(200)
  const result = await hub(browser)
  for (const key of ['notes', 'evidence', 'relatedDiaries', 'reviews']) expect(result[key]).toHaveLength(10)
  expect(result.relatedDiaries[0]).toMatchObject({ title: 'Context 11', relation: 'explicit_context', transactionCount: 1 })
  expect(result.notes[0]).toMatchObject({ title: 'Note 11', source: 'owner', sourceName: null })
  expect(result.evidence[0].summary).toBe('Evidence 11'); expect(result.latestReview.whatChanged).toBe('Owner reflection 10')
  expect(JSON.stringify(result)).not.toContain('Foreign'); expect(JSON.stringify(result.relatedDiaries)).not.toContain('Private diary content')
  expect((await hub(other)).thesis).toBeNull(); expect((await hub(other)).reviews).toEqual([])
})
it('retains research during missing quotes and rejects guest or invalid credentials', async () => {
  const browser = await login()
  await browser.post('/api/stocks/MISSING/notes', { title: 'Research survives', content: 'Synthetic' })
  const result = await hub(browser, 'MISSING'); expect(result.notes[0].title).toBe('Research survives'); expect(result.position).toMatchObject({ price: null, marketValue: null, quoteStatus: 'missing' })
  expect((await hub(browser, 'ZERO')).position).toMatchObject({ price: 0, quoteStatus: 'priced' })
  expect((await fetch(baseUrl + '/api/stocks/AAPL/hub')).status).toBe(401)
  expect((await browser.request('/api/stocks/AAPL/hub', { headers: { authorization: 'Bearer invalid' } })).status).toBe(401)
  expect((await browser.request('/api/stocks/INVALID%20SYMBOL/hub')).status).toBe(400)
})
