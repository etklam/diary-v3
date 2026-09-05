import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from 'vitest'
import { createApp } from '../../apps/api/src/app'
import { MarketDataError, createMarketData } from '../../apps/api/src/market-data'
import { BrowserSession } from '../support/browser-session'
import { provisionTestDatabase } from '../support/database'

let providerFailure = false
let chartGate: (() => Promise<void>) | undefined
let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let server: ReturnType<typeof serve>, baseUrl: string, clock: Date
beforeAll(async () => { database = await provisionTestDatabase('etf_admin_http') })
beforeEach(async () => {
  providerFailure = false
  chartGate = undefined
  clock = new Date('2026-09-05T12:00:00Z')
  const app = createApp({ db: database.db, now: () => clock, marketData: createMarketData({ now: () => clock, upstream: {
    quote: async symbol => { if (symbol === 'INVALID') throw new MarketDataError('synthetic missing', 'not-found'); return ({ symbol, regularMarketPrice: 120, regularMarketPreviousClose: 100, regularMarketTime: clock, marketState: 'REGULAR' }) },
    chart: async () => { await chartGate?.(); if (providerFailure) throw new MarketDataError('synthetic missing', 'not-found'); return { quotes: [{ date: new Date('2026-02-01Z'), close: 102, volume: 5000000000 }, { date: new Date('2026-01-01Z'), close: 100 }] } },
  } }), config: {
    jwtSecret: 'synthetic-review-key-with-at-least-32-characters', nodeEnv: 'test', trustProxy: false, webOrigin: 'http://127.0.0.1',
  } })
  server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 })
  await once(server, 'listening'); baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterEach(async () => { server.close(); await once(server, 'close') })
afterAll(async () => { await database?.dispose() })
async function login(admin = false) {
  const browser = new BrowserSession(baseUrl)
  const credentials = { email: `${randomUUID()}@example.test`, password: 'synthetic-review-password' }
  expect((await browser.post('/api/auth/register', credentials)).status).toBe(200)
  if (admin) await database.pool.query("update users set role='ADMIN' where email=$1", [credentials.email])
  expect((await browser.post('/api/auth/login', credentials)).status).toBe(200)
  await browser.request('/api/auth/me')
  return { browser, email: credentials.email }
}
function mutate(browser: BrowserSession, path: string, body: unknown = {}, method = 'PUT') {
  return browser.request(path, { method, headers: { 'content-type': 'application/json', 'x-csrf-token': browser.cookies.get('csrf-token')! }, body: JSON.stringify(body) })
}
it('admin catalog seeds, initializes idempotently and deletes only ETF relations', async () => {
 const { browser } = await login(true)
 const first = await browser.post('/api/admin/etf/seed', {}); expect(first.status).toBe(200); expect(await first.json()).toEqual({ success: true, added: 24, skipped: 0, total: 24 })
 expect(await (await browser.post('/api/admin/etf/seed', {})).json()).toEqual({ success: true, added: 0, skipped: 24, total: 24 })
 const listed = await browser.request('/api/admin/etf'); expect(listed.headers.get('cache-control')).toBe('no-store'); const rows = await listed.json(); expect(rows).toHaveLength(24)
 const spy = rows.find((row: { symbol: string }) => row.symbol === 'SPY')
 const path = `/api/admin/etf/${spy.id}/initialize`
 const results = await Promise.all([browser.post(path, {}), browser.post(path, {})]); const bodies = await Promise.all(results.map(r => r.json())); expect(bodies.map(r => r.added).sort()).toEqual([0,2]); expect(bodies[0]).toMatchObject({ success: true, total: 2, symbol: 'SPY', dateRange: { from: '2026-01-01', to: '2026-02-01' } })
 providerFailure = true; expect((await browser.post(path, {})).status).toBe(502)
 expect((await (await browser.request('/api/admin/etf')).json()).find((row: { id: string }) => row.id === spy.id).priceCount).toBe(2)
 const owner = (await database.pool.query('select id from users limit 1')).rows[0].id
 await database.pool.query('insert into etf_watchlists(user_id,etf_id) values ($1,$2)', [owner,spy.id])
 const removed = await mutate(browser, `/api/admin/etf/${spy.id}`, {}, 'DELETE'); expect(await removed.json()).toEqual({ success: true, deletedPrices: 2, deletedWatchlists: 1 })
 expect((await browser.post(path, {})).status).toBe(404)
 expect((await database.pool.query('select count(*)::int as count from stocks')).rows[0].count).toBe(0)
})
it('rejects ordinary users and keys, normalizes input and resolves concurrent duplicates', async () => {
 const user = await login(), admin = await login(true)
 expect((await user.browser.request('/api/admin/etf')).status).toBe(403)
 expect((await user.browser.post('/api/admin/etf/seed', {})).status).toBe(403)
 expect((await fetch(baseUrl + '/api/admin/etf')).status).toBe(401)
 const { rawKey } = await (await admin.browser.post('/api/api-keys', { label: 'Admin owned key', scope: 'AGENT_WRITE' })).json()
 expect((await admin.browser.request('/api/admin/etf', { headers: { 'x-api-key': rawKey } })).status).toBe(401)
 const requests = await Promise.all([admin.browser.post('/api/admin/etf', { symbol: ' new ', name: ' Name ', skipValidation: true }),admin.browser.post('/api/admin/etf', { symbol: 'NEW', skipValidation: true })])
 expect(requests.map(r => r.status).sort()).toEqual([200,409]); expect((await requests.find(r => r.status === 200)!.json()).symbol).toBe('NEW')
 expect((await admin.browser.post('/api/admin/etf', { symbol: 'GOOD' })).status).toBe(200)
 expect((await admin.browser.post('/api/admin/etf', { symbol: 'NO-CSRF' }, false)).status).toBe(403)
})
it('does not resurrect a catalog entry deleted while history is in flight', async () => {
 const { browser } = await login(true)
 const etf = await (await browser.post('/api/admin/etf', { symbol: 'RACE', skipValidation: true })).json()
 let entered!: () => void, release!: () => void
 const started = new Promise<void>(resolve => { entered = resolve }), gate = new Promise<void>(resolve => { release = resolve })
 chartGate = async () => { entered(); await gate }
 const initialize = browser.post(`/api/admin/etf/${etf.id}/initialize`, {})
 try {
  await started
  expect((await mutate(browser, `/api/admin/etf/${etf.id}`, {}, 'DELETE')).status).toBe(200)
 } finally { release() }
 expect((await initialize).status).toBe(404)
 expect((await database.pool.query('select count(*)::int as count from etf_prices where etf_id=$1', [etf.id])).rows[0].count).toBe(0)
})
it('rolls back price insertion failures and distinguishes invalid symbols from provider failure', async () => {
 const { browser } = await login(true)
 expect((await browser.post('/api/admin/etf', { symbol: 'INVALID' })).status).toBe(400)
 const etf = await (await browser.post('/api/admin/etf', { symbol: 'ROLLBACK', skipValidation: true })).json()
 await database.pool.query("create function synthetic_etf_failure() returns trigger language plpgsql as $$ begin if NEW.date = '2026-02-01' then raise exception 'synthetic failure'; end if; return NEW; end $$")
 await database.pool.query('create trigger synthetic_etf_failure before insert on etf_prices for each row execute function synthetic_etf_failure()')
 try { expect((await browser.post(`/api/admin/etf/${etf.id}/initialize`, {})).status).toBe(500) }
 finally { await database.pool.query('drop trigger synthetic_etf_failure on etf_prices'); await database.pool.query('drop function synthetic_etf_failure()') }
 expect((await database.pool.query('select count(*)::int as count from etf_prices where etf_id=$1', [etf.id])).rows[0].count).toBe(0)
 expect((await (await browser.post(`/api/admin/etf/${etf.id}/initialize`, {})).json()).added).toBe(2)
 providerFailure = true
 const missing = await (await browser.post('/api/admin/etf', { symbol: 'NOHISTORY', skipValidation: true })).json()
 expect((await browser.post(`/api/admin/etf/${missing.id}/initialize`, {})).status).toBe(502)
})
