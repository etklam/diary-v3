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
beforeAll(async () => { database = await provisionTestDatabase('notes') })
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
async function create(browser: BrowserSession, body = {}) {
  const response = await browser.post('/api/stocks/aapl/notes', { title: ' Current view ', content: 'Original Markdown', ...body })
  expect(response.status).toBe(200)
  return response.json()
}
it('creates mutable notes atomically with watching and preserves exact long content and source', async () => {
  const browser = await login(), content = '研究\n'.repeat(12500)
  const note = await create(browser, { content })
  expect(note).toMatchObject({ title: 'Current view', content, symbol: 'AAPL', createdVia: 'USER', createdByLabel: null, date: clock.toISOString() })
  const watch = (await (await browser.request('/api/stocks/watchlist')).json()).items[0]
  expect(watch.stock.symbol).toBe('AAPL'); expect(watch.recordCount).toBe(0)
  clock = new Date('2026-09-06T12:00:00Z')
  const changed = await update(browser, `/api/stocks/AAPL/notes/${note.id}`, { title: 'Revised view' }, 'PUT')
  expect(changed.status).toBe(200)
  expect(await changed.json()).toMatchObject({ id: note.id, title: 'Revised view', content, date: note.date, updatedAt: clock.toISOString() })
  expect((await (await browser.request('/api/stocks/AAPL/timeline')).json()).records).toEqual([])
  expect((await update(browser, `/api/stocks/AAPL/notes/${note.id}`, {}, 'DELETE')).status).toBe(200)
  expect((await (await browser.request('/api/stocks/AAPL/notes')).json()).data).toEqual([])
  expect((await (await browser.request('/api/stocks/watchlist')).json()).items[0].id).toBe(watch.id)
})
it('sorts and paginates notes by date and ID, filters origin, and rejects editing agent notes', async () => {
  const browser = await login(), first = await create(browser), second = await create(browser)
  await create(browser, { date: '2020-01-01T00:00:00Z' })
  const list = await (await browser.request('/api/stocks/AAPL/notes?page=1&limit=1')).json()
  expect(list.pagination).toEqual({ page: 1, limit: 1, total: 3, totalPages: 3 })
  expect(list.data[0]).toMatchObject({ id: second.id, isOwnedByViewer: true })
  expect((await (await browser.request('/api/stocks/AAPL/notes?page=2&limit=1')).json()).data[0].id).toBe(first.id)
  await database.pool.query("update stock_notes set created_via = 'AGENT', created_by_label = 'Synthetic analyst' where id = $1", [first.id])
  const agent = await (await browser.request('/api/stocks/AAPL/notes?createdVia=AGENT')).json()
  expect(agent.data).toHaveLength(1); expect(agent.data[0].createdByLabel).toBe('Synthetic analyst')
  for (const method of ['PUT', 'DELETE']) {
    const response = await update(browser, `/api/stocks/AAPL/notes/${first.id}`, { content: 'Forbidden' }, method)
    expect(response.status).toBe(403); expect((await response.json()).data.code).toBe('STOCK_NOTE_ACCESS_DENIED')
  }
  expect((await (await browser.request('/api/stocks/AAPL/notes?page=999999999999')).json()).data).toEqual([])
})
it('enforces owner and symbol binding, strict input and browser credential boundaries', async () => {
  const browser = await login(), other = await login(), note = await create(browser)
  expect((await (await other.request('/api/stocks/AAPL/notes')).json()).data).toEqual([])
  for (const method of ['PUT', 'DELETE']) {
    expect((await update(other, `/api/stocks/AAPL/notes/${note.id}`, { title: 'Forbidden' }, method)).status).toBe(404)
    expect((await update(browser, `/api/stocks/MSFT/notes/${note.id}`, { title: 'Forbidden' }, method)).status).toBe(404)
  }
  for (const body of [{ title: ' ' }, { content: '' }, { content: 'a'.repeat(50001) }, { createdVia: 'AGENT' }, { date: '2026-09-05' }]) expect((await browser.post('/api/stocks/AAPL/notes', { title: 'Valid', content: 'Valid', ...body })).status).toBe(400)
  expect((await update(browser, `/api/stocks/AAPL/notes/${note.id}`, {}, 'PUT')).status).toBe(400)
  expect((await fetch(baseUrl + '/api/stocks/AAPL/notes')).status).toBe(401)
  expect((await browser.request('/api/stocks/AAPL/notes', { headers: { authorization: 'Bearer invalid' } })).status).toBe(401)
  expect((await browser.request('/api/stocks/AAPL/notes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'X', content: 'Y' }) })).status).toBe(403)
  expect((await browser.request('/api/stocks/AAPL/notes?partnerId=1')).status).toBe(403)
})
