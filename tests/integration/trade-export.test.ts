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
beforeAll(async () => { database = await provisionTestDatabase('trade_export') })
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
async function ledger(browser: BrowserSession, symbol: string, date = '2026-09-01', count = 1) {
  const transactions = Array.from({ length: count }, () => [
    { symbol, type: 'BUY', quantity: '2', price: '100', tradeDate: `${date}T10:00:00Z` },
    { symbol, type: 'SELL', quantity: '1', price: '110.125', tradeDate: `${date}T11:00:00Z` },
  ]).flat()
  expect((await browser.post('/api/diaries', { title: 'Export basis', content: 'Synthetic', date, transactions })).status).toBe(201)
}
const header = 'symbol,sellDate,sellQuantity,sellPrice,avgCostBasis,realizedPnL,realizedPnLPct'

it('exports complete owner closed trades in source field order with exact decimals and symbol filter', async () => {
  const owner = await login(), other = await login()
  await ledger(owner, 'AAPL'); await ledger(owner, 'MSFT', '2026-09-02'); await ledger(other, 'PRIVATE')
  const response = await owner.request('/api/stats/export-trades')
  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8')
  expect(response.headers.get('content-disposition')).toBe('attachment; filename="trades-2026-09-05.csv"')
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(await response.text()).toBe(`${header}\nAAPL,2026-09-01,1,110.125,100,10.13,10.13\nMSFT,2026-09-02,1,110.125,100,10.13,10.13`)
  const filtered = await owner.request('/api/stats/export-trades?symbol=%20aapl%20')
  expect(filtered.headers.get('content-disposition')).toBe('attachment; filename="trades-AAPL-2026-09-05.csv"')
  expect(await filtered.text()).toBe(`${header}\nAAPL,2026-09-01,1,110.125,100,10.13,10.13`)
  expect(await (await owner.request('/api/stats/export-trades?symbol=UNKNOWN')).text()).toBe(header)
})

it('rejects guest and invalid explicit credentials; empty account has only a header', async () => {
  const browser = await login()
  expect((await fetch(baseUrl + '/api/stats/export-trades')).status).toBe(401)
  expect((await browser.request('/api/stats/export-trades', { headers: { authorization: 'Bearer invalid' } })).status).toBe(401)
  expect(await (await browser.request('/api/stats/export-trades')).text()).toBe(header)
  expect((await browser.request('/api/stats/export-trades?userId=1')).status).toBe(400)
})

it('escapes Unicode, quotes and line breaks and neutralizes spreadsheet symbols without truncating larger ledgers', async () => {
  const browser = await login()
  await ledger(browser, '中,\r\n"文'); await ledger(browser, '=1+1', '2026-09-02')
  const csv = await (await browser.request('/api/stats/export-trades')).text()
  expect(csv).toContain('"中,\r\n""文",2026-09-01')
  expect(csv).toContain("'=1+1,2026-09-02")
  for (const date of ['2026-08-01', '2026-08-02', '2026-08-03']) await ledger(browser, 'LARGE', date, 50)
  const large = await (await browser.request('/api/stats/export-trades?symbol=LARGE')).text()
  expect(large.split('\n')).toHaveLength(151)
  expect(large.split('\n')[1]).toContain('LARGE,2026-08-01')
  expect(large.split('\n').at(-1)).toContain('LARGE,2026-08-03')
})
