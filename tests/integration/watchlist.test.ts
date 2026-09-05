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
beforeAll(async () => { database = await provisionTestDatabase('watchlist') })
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
async function add(browser: BrowserSession, symbol: string) {
  const response = await browser.post('/api/stocks/watchlist', { symbol })
  expect(response.status).toBe(200)
  return response.json()
}
async function list(browser: BrowserSession) {
  const response = await browser.request('/api/stocks/watchlist')
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('no-store')
  return (await response.json()).items
}

it('reuses canonical diary stocks and restores duplicates without changing identity or order', async () => {
  const browser = await login()
  expect((await browser.post('/api/diaries', { title: 'Company context', content: 'Research', date: '2026-09-05', stockSymbols: ['AAPL'] })).status).toBe(201)
  const first = await add(browser, ' aapl '), second = await add(browser, 'msft')
  expect(first).toMatchObject({ symbol: 'AAPL', status: 'WATCHING', sortOrder: 0 })
  expect(second.sortOrder).toBe(1)
  expect(await add(browser, 'AAPL')).toEqual(first)
  expect((await database.pool.query("select id from stocks where symbol = 'AAPL'")).rowCount).toBe(1)
  expect((await update(browser, `/api/stocks/watchlist/${first.id}`, { sortOrder: 7 })).status).toBe(200)
  expect((await list(browser)).map((item: { id: string }) => item.id)).toEqual([second.id, first.id])
  expect((await browser.request(`/api/stocks/watchlist/${first.id}`, { method: 'DELETE', headers: { 'x-csrf-token': browser.cookies.get('csrf-token')! } })).status).toBe(200)
  expect((await list(browser)).map((item: { id: string }) => item.id)).toEqual([second.id])
  expect(await add(browser, 'aapl')).toMatchObject({ id: first.id, sortOrder: 7, status: 'WATCHING' })
  expect((await list(browser))[1]).toMatchObject({ stock: { symbol: 'AAPL', name: null }, recordCount: 0, latestRecord: null })
})

it('serializes concurrent creates and gives duplicates one owner row', async () => {
  const browser = await login()
  const symbols = ['NVDA', 'BRK.B', '2330.TW', 'NVDA', 'BRK.B']
  const result = await Promise.all(symbols.map(symbol => add(browser, symbol)))
  expect(result[0].id).toBe(result[3].id); expect(result[1].id).toBe(result[4].id)
  const items = await list(browser)
  expect(items).toHaveLength(3)
  expect(items.map((item: { sortOrder: number }) => item.sortOrder)).toEqual([0, 1, 2])
})

it('enforces owner privacy, invalid Bearer fail-closed, CSRF and strict payloads', async () => {
  const browser = await login(), other = await login(), item = await add(browser, 'AAPL')
  expect(await list(other)).toEqual([])
  const otherItem = await add(other, 'AAPL')
  expect(otherItem.id).not.toBe(item.id)
  for (const method of ['PATCH', 'DELETE']) {
    const result = await update(other, `/api/stocks/watchlist/${item.id}`, { status: 'ARCHIVED' }, method)
    expect(result.status).toBe(404)
    expect((await result.json()).data.code).toBe('WATCHLIST_ITEM_NOT_FOUND')
  }
  expect((await fetch(baseUrl + '/api/stocks/watchlist')).status).toBe(401)
  expect((await browser.request('/api/stocks/watchlist', { headers: { authorization: 'Bearer invalid' } })).status).toBe(401)
  expect((await browser.request('/api/stocks/watchlist', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ symbol: 'NVDA' }) })).status).toBe(403)
  for (const symbol of ['', '^GSPC', 'A B', 'BRK-B', 'A'.repeat(33)]) expect((await browser.post('/api/stocks/watchlist', { symbol })).status).toBe(400)
  for (const body of [{}, { sortOrder: -1 }, { sortOrder: 10001 }, { sortOrder: 0.1 }, { status: 'HOLDING' }, { symbol: 'MSFT' }]) expect((await update(browser, `/api/stocks/watchlist/${item.id}`, body)).status).toBe(400)
  expect((await update(browser, '/api/stocks/watchlist/0', { status: 'ARCHIVED' })).status).toBe(400)
  expect((await update(browser, `/api/stocks/watchlist/${item.id}`, { status: 'ARCHIVED' })).status).toBe(200)
  expect(await list(browser)).toEqual([])
  expect((await update(browser, `/api/stocks/watchlist/${item.id}`, { status: 'WATCHING', sortOrder: 0 })).status).toBe(200)
  expect(await list(browser)).toHaveLength(1)
})

it('returns the first 100 watching entries with deterministic ID ties and keeps archived rows persistent', async () => {
  const browser = await login()
  const items = []
  for (let i = 0; i < 102; i++) items.push(await add(browser, `SYM${i}`))
  expect((await list(browser)).map((item: { id: string }) => item.id)).toEqual(items.slice(0, 100).map(item => item.id))
  expect((await update(browser, `/api/stocks/watchlist/${items[101].id}`, { sortOrder: 0 })).status).toBe(200)
  expect((await list(browser)).slice(0, 3).map((item: { id: string }) => item.id)).toEqual([items[0].id, items[101].id, items[1].id])
  expect((await update(browser, `/api/stocks/watchlist/${items[0].id}`, { status: 'ARCHIVED' })).status).toBe(200)
  expect((await list(browser))[0].id).toBe(items[101].id)
  expect((await database.pool.query('select status from stock_watchlists where id = $1', [items[0].id])).rows[0].status).toBe('ARCHIVED')
})
