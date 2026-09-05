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

function tx(type: 'BUY' | 'SELL', quantity: string, tradeDate: string, overrides: Record<string, unknown> = {}) {
  return { symbol: 'AAPL', type, quantity, price: '100', tradeDate, notes: null, strategy: null, emotion: null, ...overrides }
}

function update(browser: BrowserSession, id: string, body: unknown) {
  return browser.request(`/api/diaries/${id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'x-csrf-token': browser.cookies.get('csrf-token')! },
    body: JSON.stringify(body),
  })
}

beforeAll(async () => { database = await provisionTestDatabase('ledger_corrections') })
beforeEach(async () => {
  const app = createApp({
    db: database.db,
    config: {
      jwtSecret: 'test-only-ledger-corrections-secret-over-32-characters',
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

describe('projected chronological ledger corrections', () => {
  it('updates stable IDs, deletes omitted rows and inserts new rows atomically', async () => {
    const browser = new BrowserSession(baseUrl)
    await registerAndLogin(browser)
    const diary = await (await browser.post('/api/diaries', {
      title: 'Original rows', content: 'Before correction', date: '2026-04-01',
      transactions: [
        tx('BUY', '5', '2026-04-01T10:00:00.000Z'),
        tx('BUY', '2', '2026-04-01T11:00:00.000Z', { symbol: 'MSFT' }),
      ],
    })).json()
    const keptId = diary.transactions[0].id
    const deletedId = diary.transactions[1].id
    const response = await update(browser, diary.id, {
      title: 'Corrected rows', content: 'After correction',
      transactions: [
        { ...tx('BUY', '6', '2026-04-01T09:00:00.000Z', { price: '110' }), id: keptId },
        tx('SELL', '1', '2026-04-02T10:00:00.000Z', { price: '125' }),
      ],
    })
    expect(response.status).toBe(200)
    const corrected = await response.json()
    expect(corrected.transactions).toHaveLength(2)
    expect(corrected.transactions[0]).toMatchObject({ id: keptId, type: 'BUY', quantity: '6', price: '110' })
    expect(corrected.transactions[1]).toMatchObject({ type: 'SELL', quantity: '1', price: '125' })
    expect(corrected.transactions.some((row: { id: string }) => row.id === deletedId)).toBe(false)
    expect(await (await browser.request('/api/stocks/holdings')).json()).toEqual([
      { symbol: 'AAPL', quantity: '5', avgCost: '110', totalCost: '550' },
    ])
  })

  it('rejects a transaction ID from another Diary or owner without changing either aggregate', async () => {
    const owner = new BrowserSession(baseUrl)
    const other = new BrowserSession(baseUrl)
    await registerAndLogin(owner)
    await registerAndLogin(other)
    const ownDiary = await (await owner.post('/api/diaries', {
      title: 'Own diary', content: 'Own', date: '2026-04-03',
      transactions: [tx('BUY', '2', '2026-04-03T10:00:00.000Z')],
    })).json()
    const sameOwnerDiary = await (await owner.post('/api/diaries', {
      title: 'Same owner other diary', content: 'Separate aggregate', date: '2026-04-04',
      transactions: [tx('BUY', '3', '2026-04-04T10:00:00.000Z', { symbol: 'MSFT' })],
    })).json()
    const otherDiary = await (await other.post('/api/diaries', {
      title: 'Other diary', content: 'Other', date: '2026-04-03',
      transactions: [tx('BUY', '9', '2026-04-03T10:00:00.000Z')],
    })).json()
    for (const stolenId of [sameOwnerDiary.transactions[0].id, otherDiary.transactions[0].id]) {
      const response = await update(owner, ownDiary.id, {
        title: 'Must roll back', content: 'Must roll back',
        transactions: [{ ...tx('BUY', '99', '2026-04-03T10:00:00.000Z'), id: stolenId }],
      })
      expect(response.status).toBe(400)
      expect((await response.json()).data.code).toBe('SYS_VALIDATION_ERROR')
    }
    const duplicate = await update(owner, ownDiary.id, {
      title: 'Duplicate ID', content: 'Must fail at the contract',
      transactions: [
        { ...tx('BUY', '2', '2026-04-03T10:00:00.000Z'), id: ownDiary.transactions[0].id },
        { ...tx('BUY', '2', '2026-04-03T11:00:00.000Z'), id: ownDiary.transactions[0].id },
      ],
    })
    expect(duplicate.status).toBe(400)
    expect((await duplicate.json()).data.code).toBe('SYS_VALIDATION_ERROR')
    expect(await (await owner.request(`/api/diaries/${ownDiary.id}`)).json()).toMatchObject({
      title: 'Own diary', transactions: ownDiary.transactions,
    })
    expect(await (await other.request(`/api/diaries/${otherDiary.id}`)).json()).toMatchObject({
      title: 'Other diary', transactions: otherDiary.transactions,
    })
  })

  it('rejects removing or reducing historical BUY rows required by a later SELL', async () => {
    const browser = new BrowserSession(baseUrl)
    await registerAndLogin(browser)
    const buyDiary = await (await browser.post('/api/diaries', {
      title: 'Historical basis', content: '10 bought', date: '2026-04-04',
      transactions: [tx('BUY', '10', '2026-04-04T10:00:00.000Z')],
    })).json()
    await browser.post('/api/diaries', {
      title: 'Later sale', content: '8 sold', date: '2026-04-05',
      transactions: [tx('SELL', '8', '2026-04-05T10:00:00.000Z', { price: '120' })],
    })
    for (const transactions of [
      [],
      [{ ...tx('BUY', '7', '2026-04-04T10:00:00.000Z'), id: buyDiary.transactions[0].id }],
    ]) {
      const response = await update(browser, buyDiary.id, {
        title: 'Invalid correction', content: 'Must roll back', transactions,
      })
      expect(response.status).toBe(400)
      expect((await response.json()).data.code).toBe('SYS_VALIDATION_ERROR')
    }
    expect(await (await browser.request(`/api/diaries/${buyDiary.id}`)).json()).toMatchObject({
      title: 'Historical basis', transactions: buyDiary.transactions,
    })
  })

  it('rolls transaction changes back when a later Diary scalar update fails', async () => {
    const browser = new BrowserSession(baseUrl)
    await registerAndLogin(browser)
    const first = await (await browser.post('/api/diaries', {
      title: 'Rollback source', content: 'Original', date: '2026-04-06',
      transactions: [tx('BUY', '1', '2026-04-06T10:00:00.000Z')],
    })).json()
    await browser.post('/api/diaries', { title: 'Occupied date', content: 'Conflict', date: '2026-04-07' })
    const response = await update(browser, first.id, {
      title: 'Would partially write', content: 'Would partially write', date: '2026-04-07',
      transactions: [{ ...tx('BUY', '9', '2026-04-06T10:00:00.000Z'), id: first.transactions[0].id }],
    })
    expect(response.status).toBe(409)
    expect(await (await browser.request(`/api/diaries/${first.id}`)).json()).toMatchObject({
      title: 'Rollback source', date: '2026-04-06', transactions: first.transactions,
    })
  })

  it('serializes a historical reduction against a concurrent SELL and leaves a valid ledger', async () => {
    const browser = new BrowserSession(baseUrl)
    await registerAndLogin(browser)
    const basis = await (await browser.post('/api/diaries', {
      title: 'Concurrent correction basis', content: '10 bought', date: '2026-04-08',
      transactions: [tx('BUY', '10', '2026-04-08T10:00:00.000Z')],
    })).json()
    const responses = await Promise.all([
      update(browser, basis.id, {
        title: 'Reduced basis', content: '5 bought',
        transactions: [{ ...tx('BUY', '5', '2026-04-08T10:00:00.000Z'), id: basis.transactions[0].id }],
      }),
      browser.post('/api/diaries', {
        title: 'Concurrent sale', content: '7 sold', date: '2026-04-09',
        transactions: [tx('SELL', '7', '2026-04-09T10:00:00.000Z', { price: '120' })],
      }),
    ])
    const statuses = responses.map(response => response.status)
    expect(statuses.filter(status => status === 400)).toHaveLength(1)
    expect(statuses.some(status => status === 200 || status === 201)).toBe(true)
    const holdings = await (await browser.request('/api/stocks/holdings')).json()
    expect([
      [{ symbol: 'AAPL', quantity: '5', avgCost: '100', totalCost: '500' }],
      [{ symbol: 'AAPL', quantity: '3', avgCost: '100', totalCost: '300' }],
    ]).toContainEqual(holdings)
  })

  it('validates equal-instant corrections in eventual persisted ID order', async () => {
    const browser = new BrowserSession(baseUrl)
    await registerAndLogin(browser)
    const basis = await (await browser.post('/api/diaries', {
      title: 'Early ID basis', content: 'Basis', date: '2026-04-10',
      transactions: [tx('BUY', '1', '2026-04-10T10:00:00.000Z')],
    })).json()
    await browser.post('/api/diaries', {
      title: 'Later ID sell', content: 'Sell', date: '2026-04-11',
      transactions: [tx('SELL', '1', '2026-04-11T10:00:00.000Z')],
    })
    const valid = await update(browser, basis.id, {
      title: 'Equal instant remains valid', content: 'ID is the tie-breaker',
      transactions: [{ ...tx('BUY', '1', '2026-04-11T10:00:00.000Z'), id: basis.transactions[0].id }],
    })
    expect(valid.status).toBe(200)

    const combined = await (await browser.post('/api/diaries', {
      title: 'Replacement ordering', content: 'Initial round trip', date: '2026-04-12',
      transactions: [
        tx('BUY', '1', '2026-04-12T09:00:00.000Z', { symbol: 'MSFT' }),
        tx('SELL', '1', '2026-04-12T11:00:00.000Z', { symbol: 'MSFT' }),
      ],
    })).json()
    const invalid = await update(browser, combined.id, {
      title: 'Must reject eventual order', content: 'No fake payload ordering',
      transactions: [
        tx('BUY', '1', '2026-04-12T10:00:00.000Z', { symbol: 'MSFT' }),
        { ...tx('SELL', '1', '2026-04-12T10:00:00.000Z', { symbol: 'MSFT' }), id: combined.transactions[1].id },
      ],
    })
    expect(invalid.status).toBe(400)
    expect(await (await browser.request(`/api/diaries/${combined.id}`)).json()).toMatchObject({
      title: 'Replacement ordering', transactions: combined.transactions,
    })
  })
})
