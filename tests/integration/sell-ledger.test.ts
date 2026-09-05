import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../apps/api/src/app'
import { BrowserSession } from '../support/browser-session'
import { provisionTestDatabase } from '../support/database'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let server: ReturnType<typeof serve>
let baseUrl: string
const fixedNow = new Date('2026-08-30T12:00:00.000Z')

async function registerAndLogin(browser: BrowserSession) {
  const email = `${randomUUID()}@example.test`
  const password = 'test-password-123'
  expect((await browser.post('/api/auth/register', { email, password })).status).toBe(200)
  expect((await browser.post('/api/auth/login', { email, password })).status).toBe(200)
  expect((await browser.request('/api/auth/me')).status).toBe(200)
}

function transaction(type: 'BUY' | 'SELL', quantity: string, price: string, tradeDate: string, symbol = 'AAPL') {
  return { symbol, type, quantity, price, tradeDate, notes: null, strategy: 'breakout', emotion: 'calm' }
}

beforeAll(async () => { database = await provisionTestDatabase('sell_ledger') })
beforeEach(async () => {
  const app = createApp({
    db: database.db,
    now: () => new Date(fixedNow),
    config: {
      jwtSecret: 'test-only-sell-ledger-secret-over-32-characters',
      nodeEnv: 'test', trustProxy: false, webOrigin: 'http://127.0.0.1',
    },
  })
  server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 })
  await once(server, 'listening')
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterEach(async () => {
  server.close()
  await once(server, 'close')
})
afterAll(async () => { await database?.dispose() })

describe('SELL ledger through real HTTP and PostgreSQL', () => {
  it('returns remaining average-cost holdings and observable exact realized P&L', async () => {
    const browser = new BrowserSession(baseUrl)
    await registerAndLogin(browser)
    expect((await browser.post('/api/diaries', {
      title: 'Buy basis', content: '10 at 100', date: '2026-08-01',
      transactions: [transaction('BUY', '10', '100', '2026-08-01T10:00:00.000Z')],
    })).status).toBe(201)
    const sell = await browser.post('/api/diaries', {
      title: 'Partial sale', content: '4 at 125', date: '2026-08-20',
      transactions: [transaction('SELL', '4', '125', '2026-08-20T10:00:00.000Z')],
    })
    expect(sell.status).toBe(201)
    expect((await sell.json()).transactions[0]).toMatchObject({ type: 'SELL', quantity: '4', price: '125' })
    expect(await (await browser.request('/api/stocks/holdings')).json()).toEqual([
      { symbol: 'AAPL', quantity: '6', avgCost: '100', totalCost: '600' },
    ])
    expect(await (await browser.request('/api/stats/recent-trades')).json()).toEqual({ trades: [{
      id: expect.any(String), symbol: 'AAPL', sellDate: '2026-08-20T10:00:00.000Z',
      sellQuantity: '4', realizedPnL: '100', realizedPnLPct: '25',
    }] })
  })

  it('removes a fully sold position and orders same-instant rows by persisted input order', async () => {
    const browser = new BrowserSession(baseUrl)
    await registerAndLogin(browser)
    const valid = await browser.post('/api/diaries', {
      title: 'Same instant close', content: 'Ordered aggregate', date: '2026-08-21',
      transactions: [
        transaction('BUY', '3', '100', '2026-08-21T10:00:00.000Z', 'MSFT'),
        transaction('SELL', '3', '110', '2026-08-21T10:00:00.000Z', 'MSFT'),
      ],
    })
    expect(valid.status).toBe(201)
    expect(await (await browser.request('/api/stocks/holdings')).json()).toEqual([])

    const invalid = await browser.post('/api/diaries', {
      title: 'Reverse same instant', content: 'Must roll back', date: '2026-08-22',
      transactions: [
        transaction('SELL', '1', '110', '2026-08-22T10:00:00.000Z', 'TSLA'),
        transaction('BUY', '1', '100', '2026-08-22T10:00:00.000Z', 'TSLA'),
      ],
    })
    expect(invalid.status).toBe(400)
    expect((await invalid.json()).data.code).toBe('SYS_VALIDATION_ERROR')
    expect((await database.pool.query("SELECT count(*)::int AS count FROM diaries WHERE title = 'Reverse same instant'")).rows[0].count).toBe(0)
  })

  it('serializes concurrent SELL writes so only one can consume the same holding', async () => {
    const browser = new BrowserSession(baseUrl)
    await registerAndLogin(browser)
    await browser.post('/api/diaries', {
      title: 'Concurrent basis', content: '10 available', date: '2026-08-10',
      transactions: [transaction('BUY', '10', '100', '2026-08-10T10:00:00.000Z')],
    })
    const responses = await Promise.all([
      browser.post('/api/diaries', {
        title: 'Sell candidate one', content: '7', date: '2026-08-23',
        transactions: [transaction('SELL', '7', '110', '2026-08-23T10:00:00.000Z')],
      }),
      browser.post('/api/diaries', {
        title: 'Sell candidate two', content: '7', date: '2026-08-24',
        transactions: [transaction('SELL', '7', '120', '2026-08-24T10:00:00.000Z')],
      }),
    ])
    expect(responses.map(response => response.status).sort()).toEqual([201, 400])
    expect(await (await browser.request('/api/stocks/holdings')).json()).toEqual([
      { symbol: 'AAPL', quantity: '3', avgCost: '100', totalCost: '300' },
    ])
    const counts = await database.pool.query(
      `SELECT (SELECT count(*)::int FROM diaries WHERE title LIKE 'Sell candidate%') AS diaries,
              (SELECT count(*)::int FROM transactions t JOIN diaries d ON d.id = t.diary_id
                WHERE t.type = 'SELL' AND d.title LIKE 'Sell candidate%') AS sells`,
    )
    expect(counts.rows[0]).toEqual({ diaries: 1, sells: 1 })
  })

  it('does not let another owner holdings authorize a SELL', async () => {
    const owner = new BrowserSession(baseUrl)
    const other = new BrowserSession(baseUrl)
    await registerAndLogin(owner)
    await registerAndLogin(other)
    await owner.post('/api/diaries', {
      title: 'Private basis', content: 'Owner only', date: '2026-08-11',
      transactions: [transaction('BUY', '5', '100', '2026-08-11T10:00:00.000Z')],
    })
    const response = await other.post('/api/diaries', {
      title: 'Cross-owner sell', content: 'Must fail', date: '2026-08-12',
      transactions: [transaction('SELL', '1', '110', '2026-08-12T10:00:00.000Z')],
    })
    expect(response.status).toBe(400)
    expect(await (await other.request('/api/stocks/holdings')).json()).toEqual([])
  })

  it('blocks deletion of a BUY required by a later SELL, then allows valid chronological removal', async () => {
    const browser = new BrowserSession(baseUrl)
    await registerAndLogin(browser)
    const buyDiary = await (await browser.post('/api/diaries', {
      title: 'Delete protected basis', content: 'Basis', date: '2026-08-13',
      transactions: [transaction('BUY', '5', '100', '2026-08-13T10:00:00.000Z')],
    })).json()
    const sellDiary = await (await browser.post('/api/diaries', {
      title: 'Dependent sale', content: 'Sale', date: '2026-08-14',
      transactions: [transaction('SELL', '2', '110', '2026-08-14T10:00:00.000Z')],
    })).json()
    const csrf = browser.cookies.get('csrf-token')!
    const remove = (id: string) => browser.request(`/api/diaries/${id}`, {
      method: 'DELETE', headers: { 'x-csrf-token': csrf },
    })
    const blocked = await remove(buyDiary.id)
    expect(blocked.status).toBe(400)
    expect((await blocked.json()).data.code).toBe('SYS_VALIDATION_ERROR')
    expect((await remove(sellDiary.id)).status).toBe(200)
    expect((await remove(buyDiary.id)).status).toBe(200)
  })

  it('preserves frozen recent-trade fallback, clamp, cutoff and limit semantics', async () => {
    const browser = new BrowserSession(baseUrl)
    await registerAndLogin(browser)
    await browser.post('/api/diaries', {
      title: 'Recent query ledger', content: 'Two closes', date: '2026-08-15',
      transactions: [
        transaction('BUY', '2', '100', '2026-05-01T10:00:00.000Z'),
        transaction('SELL', '1', '110', '2026-08-25T10:00:00.000Z'),
        transaction('SELL', '1', '90', '2026-08-26T10:00:00.000Z'),
      ],
    })
    const fallback = await browser.request('/api/stats/recent-trades?days=invalid&limit=1')
    expect(fallback.status).toBe(200)
    expect((await fallback.json()).trades).toMatchObject([{ sellDate: '2026-08-26T10:00:00.000Z' }])
    const clamped = await browser.request('/api/stats/recent-trades?days=999&limit=999')
    expect((await clamped.json()).trades).toHaveLength(2)
    expect((await browser.request('/api/stats/recent-trades?days=1')).status).toBe(200)
    expect((await (await browser.request('/api/stats/recent-trades?days=1')).json()).trades).toEqual([])
  })
})
