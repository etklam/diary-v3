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
beforeAll(async () => { database = await provisionTestDatabase('evidence') })
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
function update(browser: BrowserSession, path: string, body: unknown, method = 'PATCH') {
  return browser.request(path, { method, headers: { 'content-type': 'application/json', 'x-csrf-token': browser.cookies.get('csrf-token')! }, body: JSON.stringify(body) })
}
const input = { summary: 'Original evidence', sourceType: 'ARTICLE', occurredAt: '2026-09-05T10:00:00Z', idempotencyKey: 'capture-1', sourceTitle: 'Synthetic source', sourceUrl: 'https://example.test/article' }
async function capture(browser: BrowserSession, symbol = 'AAPL', body: unknown = input) {
  const response = await browser.post(`/api/stocks/${symbol}/evidence`, body)
  expect(response.status).toBe(200)
  return response.json()
}
it('captures atomically, restores watching and returns immutable original on concurrent retry', async () => {
  const browser = await login()
  const results = await Promise.all(Array.from({ length: 4 }, () => capture(browser)))
  expect(new Set(results.map(row => row.id)).size).toBe(1)
  const first = results[0]
  expect(first).toMatchObject({ symbol: 'AAPL', summary: input.summary, createdVia: 'WEB', sourceDiaryId: null })
  expect(await capture(browser, 'aapl', { ...input, summary: 'Do not overwrite' })).toEqual(first)
  const watch = (await (await browser.request('/api/stocks/watchlist')).json()).items[0]
  expect(watch).toMatchObject({ recordCount: 1, latestRecord: { id: first.id, summary: input.summary } })
  await update(browser, `/api/stocks/watchlist/${watch.id}`, { status: 'ARCHIVED' })
  await capture(browser)
  expect((await (await browser.request('/api/stocks/watchlist')).json()).items[0].id).toBe(watch.id)
  expect((await capture(browser, 'MSFT')).id).not.toBe(first.id)
})
it('orders timeline and watchlist projections by event time then ID with owner isolation', async () => {
  const browser = await login(), other = await login()
  const a = await capture(browser), b = await capture(browser, 'AAPL', { ...input, summary: 'Latest tie', idempotencyKey: 'capture-2' })
  await capture(browser, 'AAPL', { ...input, summary: 'Older', occurredAt: '2020-01-01T00:00:00Z', idempotencyKey: 'capture-3' })
  const foreign = await capture(other, 'AAPL', { ...input, summary: 'Private foreign', occurredAt: '2030-01-01T00:00:00Z' })
  expect(foreign.id).not.toBe(a.id)
  const records = (await (await browser.request('/api/stocks/AAPL/timeline?limit=2')).json()).records
  expect(records.map((row: { id: string }) => row.id)).toEqual([b.id, a.id])
  const watch = (await (await browser.request('/api/stocks/watchlist')).json()).items[0]
  expect(watch).toMatchObject({ recordCount: 3, latestRecord: { id: b.id, summary: 'Latest tie' } })
  expect((await (await browser.request('/api/stocks/timeline')).json()).records).toHaveLength(3)
  expect((await (await browser.request('/api/stocks/UNKNOWN/timeline')).json()).records).toEqual([])
})
it('rejects forged links, invalid sources and URLs, malformed limits, unauthenticated and CSRF writes', async () => {
  const browser = await login()
  for (const body of [{ ...input, sourceDiaryId: '1' }, { ...input, sourceType: 'UNKNOWN' }, { ...input, summary: ' ' }, { ...input, sourceUrl: 'javascript:alert(1)' }, { ...input, occurredAt: '2026-09-05' }]) expect((await browser.post('/api/stocks/AAPL/evidence', body)).status).toBe(400)
  for (const query of ['limit=201', 'limit=0', 'page=1']) expect((await browser.request('/api/stocks/timeline?' + query)).status).toBe(400)
  expect((await browser.post('/api/stocks/INVALID-SYM/evidence', input)).status).toBe(400)
  expect((await fetch(baseUrl + '/api/stocks/timeline')).status).toBe(401)
  expect((await browser.request('/api/stocks/timeline', { headers: { authorization: 'Bearer invalid' } })).status).toBe(401)
  expect((await browser.request('/api/stocks/AAPL/evidence', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })).status).toBe(403)
  expect((await (await browser.request('/api/stocks/watchlist')).json()).items).toEqual([])
})
it('enforces immutable content and same-owner diary linkage while allowing source deletion to unlink', async () => {
  const browser = await login(), other = await login()
  const diaryBody = { title: 'Source', content: 'Original diary text', date: '2026-09-05' }
  const diary = await (await browser.post('/api/diaries', diaryBody)).json()
  const foreign = await (await other.post('/api/diaries', diaryBody)).json()
  const captured = await capture(browser)
  const { rows: [base] } = await database.pool.query('select user_id, stock_id from stock_timeline_records where id = $1', [captured.id])
  const insert = (diaryId: string, key: string) => database.pool.query("insert into stock_timeline_records (user_id,stock_id,summary,source_type,source_diary_id,idempotency_key,occurred_at) values ($1,$2,'Frozen source excerpt','DIARY',$3,$4,now()) returning id", [base.user_id, base.stock_id, diaryId, key])
  await expect(insert(foreign.id, 'forged')).rejects.toMatchObject({ code: '23503' })
  const linked = (await insert(diary.id, 'linked')).rows[0]
  await expect(database.pool.query("update stock_timeline_records set summary = 'Changed' where id = $1", [linked.id])).rejects.toMatchObject({ code: '23514' })
  await expect(database.pool.query('update stock_timeline_records set source_diary_id = null where id = $1', [linked.id])).rejects.toMatchObject({ code: '23514' })
  expect((await update(browser, `/api/diaries/${diary.id}`, { title: 'Changed diary', content: 'Updated diary' }, 'PUT')).status).toBe(200)
  expect((await database.pool.query('select summary from stock_timeline_records where id = $1', [linked.id])).rows[0].summary).toBe('Frozen source excerpt')
  expect((await browser.request(`/api/diaries/${diary.id}`, { method: 'DELETE', headers: { 'x-csrf-token': browser.cookies.get('csrf-token')! } })).status).toBe(200)
  expect((await database.pool.query('select source_diary_id,summary from stock_timeline_records where id = $1', [linked.id])).rows[0]).toEqual({ source_diary_id: null, summary: 'Frozen source excerpt' })
})
