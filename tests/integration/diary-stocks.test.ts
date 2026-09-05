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
beforeAll(async () => { database = await provisionTestDatabase('diary_stocks') })
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
async function create(browser: BrowserSession, extra = {}) {
  const response = await browser.post('/api/diaries', { title: 'Original decision', content: 'Original Markdown', date: '2026-09-05', thesis: 'Original thesis', risk: 'Original risk', execution: 'Original execution', ...extra })
  expect(response.status).toBe(201)
  return response.json()
}

it('normalizes and persists explicit company contexts through all diary reads and replacement', async () => {
  const browser = await login(), diary = await create(browser, { stockSymbols: [' aapl ', 'MSFT', 'AAPL'] })
  expect(diary.stockSymbols).toEqual(['AAPL', 'MSFT'])
  for (const path of [`/api/diaries/${diary.id}`, '/api/diaries/by-date?date=2026-09-05']) expect((await (await browser.request(path)).json()).stockSymbols).toEqual(['AAPL', 'MSFT'])
  expect((await (await browser.request('/api/diaries')).json()).data[0].stockSymbols).toEqual(['AAPL', 'MSFT'])
  const body = { title: diary.title, content: diary.content }
  expect((await update(browser, `/api/diaries/${diary.id}`, body, 'PUT')).status).toBe(200)
  expect((await (await browser.request(`/api/diaries/${diary.id}`)).json()).stockSymbols).toEqual(['AAPL', 'MSFT'])
  const replaced = await update(browser, `/api/diaries/${diary.id}`, { ...body, stockSymbols: ['NVDA'] }, 'PUT')
  expect((await replaced.json()).stockSymbols).toEqual(['NVDA'])
  expect((await (await update(browser, `/api/diaries/${diary.id}`, { ...body, stockSymbols: [] }, 'PUT')).json()).stockSymbols).toEqual([])
})

it('unions concurrent appends without losing content or duplicate company links', async () => {
  const browser = await login(), diary = await create(browser, { stockSymbols: ['AAPL'] })
  const results = await Promise.all(['MSFT', 'NVDA'].map(symbol => browser.post('/api/diaries', {
    title: 'Append', content: `Evidence ${symbol}`, date: diary.date, appendToToday: true, stockSymbols: [symbol, 'AAPL'],
  })))
  expect(results.map(response => response.status)).toEqual([201, 201])
  const result = await (await browser.request(`/api/diaries/${diary.id}`)).json()
  expect([...result.stockSymbols].sort()).toEqual(['AAPL', 'MSFT', 'NVDA'])
  expect(result.content).toContain('Evidence MSFT'); expect(result.content).toContain('Evidence NVDA')
})

it('keeps shared company identities private at the diary link and cascades only deleted diary contexts', async () => {
  const owner = await login(), other = await login()
  const first = await create(owner, { stockSymbols: ['AAPL'] }), second = await create(other, { stockSymbols: ['AAPL'] })
  expect((await other.request(`/api/diaries/${first.id}`)).status).toBe(404)
  expect((await update(other, `/api/diaries/${first.id}`, { title: 'Forbidden', content: 'Forbidden', stockSymbols: ['PRIVATE'] }, 'PUT')).status).toBe(404)
  expect((await owner.request(`/api/diaries/${first.id}`, { method: 'DELETE', headers: { 'x-csrf-token': owner.cookies.get('csrf-token')! } })).status).toBe(200)
  expect((await (await other.request(`/api/diaries/${second.id}`)).json()).stockSymbols).toEqual(['AAPL'])
  const links = await database.pool.query('select diary_id from diary_stocks where diary_id = $1', [first.id])
  expect(links.rowCount).toBe(0)
})

it('rejects invalid/oversized company lists and rolls back links with a diary conflict', async () => {
  const browser = await login(), diary = await create(browser, { stockSymbols: ['AAPL'] })
  const body = { title: diary.title, content: diary.content }
  for (const stockSymbols of [['^GSPC'], ['=1+1'], [''], Array.from({length: 11}, (_, i) => `SYM${i}`)]) {
    expect((await update(browser, `/api/diaries/${diary.id}`, { ...body, stockSymbols }, 'PUT')).status).toBe(400)
  }
  await create(browser, { date: '2026-09-06' })
  expect((await update(browser, `/api/diaries/${diary.id}`, { ...body, date: '2026-09-06', stockSymbols: ['NVDA'] }, 'PUT')).status).toBe(409)
  expect((await (await browser.request(`/api/diaries/${diary.id}`)).json()).stockSymbols).toEqual(['AAPL'])
})
