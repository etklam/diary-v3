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
beforeAll(async () => { database = await provisionTestDatabase('portfolio_attention') })
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

async function update(browser: BrowserSession, path: string, body: unknown, method = 'PUT') {
  return browser.request(path, { method, headers: { 'content-type': 'application/json', 'x-csrf-token': browser.cookies.get('csrf-token')! }, body: JSON.stringify(body) })
}
async function attention(browser: BrowserSession, path = '/api/portfolio/attention') {
  const response = await browser.request(path); expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store'); return response.json()
}
it('prioritizes owner facts, removes completed overdue reviews, and keeps aliases equivalent', async () => {
  const browser = await login(), other = await login()
  const diary = await create(browser, { stockSymbols: ['MSFT','AAPL'], reviewDueAt: '2026-09-04T00:00:00Z', transactions: ['AAPL','MISSING'].map(symbol => ({ symbol, type: 'BUY', quantity: '2', price: '100', tradeDate: '2026-09-01T00:00:00Z' })) })
  expect((await update(browser, '/api/stocks/AAPL/thesis', { status: 'ACTIVE', summary: 'Owner thesis', whyIOwnIt: 'Reason', reviewDueAt: '2026-09-03T00:00:00Z' })).status).toBe(200)
  let result = await attention(browser)
  expect(result.coverage).toEqual({ valuationStatus: 'partial', complete: false, priced: 1, total: 2 })
  expect(result.items.map((item: {reason:string}) => item.reason)).toEqual(['overdue_thesis_review','overdue_diary_review','position_concentration','missing_thesis'])
  expect(result.items[1]).toMatchObject({ targetId: diary.id, symbol: 'AAPL', evidence: { title: 'Original decision' } })
  expect(result.items[2].evidence.concentrationPct).toBe(100)
  expect(result.items[0].action).toBe('/stocks/AAPL/thesis')
  expect(await attention(browser, '/api/stocks/attention')).toEqual(result)
  expect((await attention(other)).items).toEqual([])
  await browser.post('/api/stocks/AAPL/thesis/reviews', { outcome: 'INVALIDATED', portfolioDecision: 'EXIT', whatChanged: 'Private thesis reflection' })
  await update(browser, `/api/diaries/${diary.id}/review`, { reviewOutcome: 'PARTIAL', reviewSummary: 'Private diary reflection' }, 'PATCH')
  result = await attention(browser)
  expect(result.items.map((item: {reason:string}) => item.reason)).toEqual(['invalidated_thesis_while_held','position_concentration','missing_thesis'])
  expect(JSON.stringify(result)).not.toContain('Private')
  expect((await browser.request('/api/portfolio/attention?unexpected=1')).status).toBe(400)
  expect((await browser.request('/api/portfolio/attention', { headers: { authorization: 'Bearer invalid' } })).status).toBe(401)
  expect((await fetch(baseUrl+'/api/stocks/attention')).status).toBe(401)
})
it('does not let completed diaries exhaust the 100-candidate window; final list remains capped at 50', async () => {
  const browser = await login(), user = await (await browser.request('/api/auth/me')).json()
  await database.pool.query(`insert into diaries (user_id,date,title,content,review_status,review_due_at,reviewed_at,review_outcome,review_summary)
    select $1,date '2025-01-01' + n,'Completed ' || n,'Private','reviewed',timestamptz '2025-01-01',timestamptz '2025-01-02','INTACT','Private reflection' from generate_series(1,101) n`, [user.data.id])
  await database.pool.query(`insert into diaries (user_id,date,title,content,review_status,review_due_at)
    select $1,date '2026-01-01' + n,'Pending ' || n,'Private','pending',timestamptz '2026-01-01' from generate_series(1,60) n`, [user.data.id])
  const result = await attention(browser); expect(result.items).toHaveLength(50)
  expect(result.items.every((item: {reason:string,evidence:{title:string}}) => item.reason === 'overdue_diary_review' && item.evidence.title.startsWith('Pending'))).toBe(true)
  expect(JSON.stringify(result)).not.toContain('Private')
})
