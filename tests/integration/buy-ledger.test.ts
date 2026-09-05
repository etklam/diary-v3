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

async function registerAndLogin(browser: BrowserSession) {
  const email = `${randomUUID()}@example.test`
  const password = 'test-password-123'
  expect((await browser.post('/api/auth/register', { email, password })).status).toBe(200)
  expect((await browser.post('/api/auth/login', { email, password })).status).toBe(200)
  expect((await browser.request('/api/auth/me')).status).toBe(200)
}

function buy(overrides: Record<string, unknown> = {}) {
  return {
    symbol: 'aapl', type: 'BUY', quantity: '1', price: '1',
    tradeDate: '2026-08-03T09:30:00.000Z', notes: null, strategy: null, emotion: null,
    ...overrides,
  }
}

beforeAll(async () => { database = await provisionTestDatabase('buy_ledger') })
beforeEach(async () => {
  const app = createApp({
    db: database.db,
    config: {
      jwtSecret: 'test-only-buy-ledger-secret-over-32-characters',
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

describe('BUY ledger through real HTTP and PostgreSQL', () => {
  it('atomically persists normalized BUY rows and reopens them chronologically', async () => {
    const browser = new BrowserSession(baseUrl)
    await registerAndLogin(browser)
    const response = await browser.post('/api/diaries', {
      title: 'Two buys', content: 'Exact decimal ledger', date: '2026-08-03',
      transactions: [
        buy({ symbol: ' msft ', quantity: '2.0000', price: '2', tradeDate: '2026-08-03T11:00:00.000Z' }),
        buy({ symbol: 'msft', quantity: '1', price: '1', tradeDate: '2026-08-03T10:00:00.000Z' }),
      ],
    })
    expect(response.status).toBe(201)
    const created = await response.json()
    expect(created.transactions.map((row: { tradeDate: string }) => row.tradeDate)).toEqual([
      '2026-08-03T10:00:00.000Z', '2026-08-03T11:00:00.000Z',
    ])
    expect(created.transactions[0]).toMatchObject({
      symbol: 'MSFT', type: 'BUY', quantity: '1', price: '1', diaryId: created.id, userId: created.userId,
    })

    const reopened = await browser.request(`/api/diaries/${created.id}`)
    expect(reopened.status).toBe(200)
    expect((await reopened.json()).transactions).toEqual(created.transactions)
    const listed = await browser.request('/api/diaries?dateFrom=2026-08-03&dateTo=2026-08-03')
    expect(listed.status).toBe(200)
    expect((await listed.json()).data[0].transactions).toEqual(created.transactions)
    const persisted = await database.pool.query(
      'SELECT quantity::text, price::text FROM transactions WHERE diary_id = $1 ORDER BY trade_date, id',
      [created.id],
    )
    expect(persisted.rows).toEqual([
      { quantity: '1.0000', price: '1.0000' },
      { quantity: '2.0000', price: '2.0000' },
    ])
  })

  it('calculates single, repeated-average and large BUY holdings without floating-point math', async () => {
    const browser = new BrowserSession(baseUrl)
    await registerAndLogin(browser)
    expect((await browser.post('/api/diaries', {
      title: 'Precision fixtures', content: 'Three symbols', date: '2026-08-04',
      transactions: [
        buy({ symbol: 'repeat', quantity: '1', price: '1' }),
        buy({ symbol: 'repeat', quantity: '2', price: '2', tradeDate: '2026-08-03T09:31:00.000Z' }),
        buy({ symbol: 'single', quantity: '2.5', price: '100.25', tradeDate: '2026-08-03T09:32:00.000Z' }),
        buy({ symbol: 'large', quantity: '99999999999.9999', price: '99999999999.9999', tradeDate: '2026-08-03T09:33:00.000Z' }),
      ],
    })).status).toBe(201)

    const response = await browser.request('/api/stocks/holdings')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([
      { symbol: 'REPEAT', quantity: '3', avgCost: '1.66666667', totalCost: '5' },
      { symbol: 'SINGLE', quantity: '2.5', avgCost: '100.25', totalCost: '250.625' },
      { symbol: 'LARGE', quantity: '99999999999.9999', avgCost: '99999999999.9999', totalCost: '9999999999999980000000.00000001' },
    ])
  })

  it('keeps no-trade diaries valid and owner holdings isolated', async () => {
    const owner = new BrowserSession(baseUrl)
    const other = new BrowserSession(baseUrl)
    await registerAndLogin(owner)
    await registerAndLogin(other)
    expect((await owner.post('/api/diaries', {
      title: 'No trades', content: 'Still valid', date: '2026-08-05',
    })).status).toBe(201)
    expect(await (await owner.request('/api/stocks/holdings')).json()).toEqual([])
    expect((await other.post('/api/diaries', {
      title: 'Other owner', content: 'Private holding', date: '2026-08-05', transactions: [buy()],
    })).status).toBe(201)
    expect(await (await owner.request('/api/stocks/holdings')).json()).toEqual([])
    expect(await (await other.request('/api/stocks/holdings')).json()).toHaveLength(1)
  })

  it('rejects lossy or oversized decimals before atomically writing the diary', async () => {
    const browser = new BrowserSession(baseUrl)
    await registerAndLogin(browser)
    const invalidTransactions = [
      buy({ quantity: '1.00001' }),
      buy({ price: '100000000000' }),
    ]
    for (const [index, transaction] of invalidTransactions.entries()) {
      const response = await browser.post('/api/diaries', {
        title: 'Must roll back', content: 'No partial aggregate', date: `2026-08-${10 + index}`,
        transactions: [buy(), transaction],
      })
      expect(response.status).toBe(400)
      expect((await response.json()).data.code).toBe('SYS_VALIDATION_ERROR')
    }
    const count = await database.pool.query(
      `SELECT (SELECT count(*)::int FROM diaries WHERE title = 'Must roll back') AS diaries,
              (SELECT count(*)::int FROM transactions WHERE diary_id IN
                (SELECT id FROM diaries WHERE title = 'Must roll back')) AS transactions`,
    )
    expect(count.rows[0]).toEqual({ diaries: 0, transactions: 0 })
  })

  it('enforces the composite Diary owner relationship in PostgreSQL', async () => {
    const owner = new BrowserSession(baseUrl)
    const other = new BrowserSession(baseUrl)
    await registerAndLogin(owner)
    await registerAndLogin(other)
    const diary = await (await owner.post('/api/diaries', {
      title: 'Owned aggregate', content: 'Owner A', date: '2026-08-20',
    })).json()
    const otherDiary = await (await other.post('/api/diaries', {
      title: 'Other aggregate', content: 'Owner B', date: '2026-08-20',
    })).json()

    await expect(database.pool.query(
      `INSERT INTO transactions (diary_id, user_id, symbol, type, quantity, price, trade_date)
       VALUES ($1, $2, 'AAPL', 'BUY', 1, 1, '2026-08-20T10:00:00Z')`,
      [diary.id, otherDiary.userId],
    )).rejects.toMatchObject({ code: '23503', constraint: 'transactions_diary_owner_fkey' })
  })

  it('appends BUY rows in the same locked aggregate write', async () => {
    const browser = new BrowserSession(baseUrl)
    await registerAndLogin(browser)
    const initial = await (await browser.post('/api/diaries', {
      title: 'Append ledger', content: 'First', date: '2026-08-21', transactions: [buy({ price: '10' })],
    })).json()
    const appended = await browser.post('/api/diaries', {
      title: 'Ignored title', content: 'Second', date: '2026-08-21', appendToToday: true,
      transactions: [buy({ quantity: '2', price: '20', tradeDate: '2026-08-21T10:00:00.000Z' })],
    })
    expect(appended.status).toBe(201)
    expect(await appended.json()).toMatchObject({ id: initial.id, transactions: [{ price: '10' }, { price: '20' }] })
    expect(await (await browser.request('/api/stocks/holdings')).json()).toEqual([
      { symbol: 'AAPL', quantity: '3', avgCost: '16.66666667', totalCost: '50' },
    ])
  })

  it('serializes concurrent BUY appends without dropping a ledger row', async () => {
    const browser = new BrowserSession(baseUrl)
    await registerAndLogin(browser)
    expect((await browser.post('/api/diaries', {
      title: 'Concurrent buys', content: 'Base', date: '2026-08-22',
    })).status).toBe(201)
    const [first, second] = await Promise.all([
      browser.post('/api/diaries', {
        title: 'Ignored one', content: 'One', date: '2026-08-22', appendToToday: true,
        transactions: [buy({ quantity: '1', price: '11', tradeDate: '2026-08-22T10:00:00.000Z' })],
      }),
      browser.post('/api/diaries', {
        title: 'Ignored two', content: 'Two', date: '2026-08-22', appendToToday: true,
        transactions: [buy({ quantity: '2', price: '13', tradeDate: '2026-08-22T11:00:00.000Z' })],
      }),
    ])
    expect([first.status, second.status]).toEqual([201, 201])
    expect(await (await browser.request('/api/stocks/holdings')).json()).toEqual([
      { symbol: 'AAPL', quantity: '3', avgCost: '12.33333333', totalCost: '37' },
    ])
    const rows = await database.pool.query(
      `SELECT count(*)::int AS count FROM transactions t
       JOIN diaries d ON d.id = t.diary_id WHERE d.date = '2026-08-22'`,
    )
    expect(rows.rows[0].count).toBe(2)
  })

  it('keeps the winning Diary and its BUY as one aggregate under concurrent creation', async () => {
    const browser = new BrowserSession(baseUrl)
    await registerAndLogin(browser)
    const responses = await Promise.all([
      browser.post('/api/diaries', {
        title: 'Candidate one', content: 'One', date: '2026-08-23',
        transactions: [buy({ symbol: 'ONE', price: '11' })],
      }),
      browser.post('/api/diaries', {
        title: 'Candidate two', content: 'Two', date: '2026-08-23',
        transactions: [buy({ symbol: 'TWO', price: '22' })],
      }),
    ])
    expect(responses.map(response => response.status).sort()).toEqual([201, 409])
    const aggregate = await database.pool.query(
      `SELECT d.title, t.symbol, t.price::text
       FROM diaries d JOIN transactions t ON (t.diary_id, t.user_id) = (d.id, d.user_id)
       WHERE d.date = '2026-08-23'`,
    )
    expect(aggregate.rows).toHaveLength(1)
    expect([
      { title: 'Candidate one', symbol: 'ONE', price: '11.0000' },
      { title: 'Candidate two', symbol: 'TWO', price: '22.0000' },
    ]).toContainEqual(aggregate.rows[0])
  })
})
