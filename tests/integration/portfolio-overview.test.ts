import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../apps/api/src/app'
import { createMarketData } from '../../apps/api/src/market-data'
import { schema } from '@diary/db'
import { BrowserSession } from '../support/browser-session'
import { provisionTestDatabase } from '../support/database'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let server: ReturnType<typeof serve>
let baseUrl: string
let clock: Date
let observedQueries: Array<{ query: string; params: unknown[] }>
let quoteCalls: Map<string, number>

beforeAll(async () => { database = await provisionTestDatabase('portfolio_overview') })
beforeEach(async () => {
  clock = new Date('2026-09-05T12:00:00.000Z')
  observedQueries = []
  quoteCalls = new Map()
  const db = drizzle(database.pool, { schema, logger: { logQuery(query, params) { observedQueries.push({ query, params }) } } })
  const marketData = createMarketData({
    now: () => clock,
    timeoutMs: 100,
    upstream: {
      quote: async symbol => {
        quoteCalls.set(symbol, (quoteCalls.get(symbol) ?? 0) + 1)
        return {
          symbol,
          regularMarketPrice: symbol === 'MISSING' ? null : 120,
          regularMarketPreviousClose: 100,
          regularMarketTime: new Date(symbol === 'STALE' ? '2026-09-01T10:00:00.000Z' : clock),
          marketState: 'REGULAR',
        }
      },
      chart: async () => ({ quotes: [] }),
    },
  })
  const app = createApp({ db, now: () => clock, marketData, config: {
    jwtSecret: 'synthetic-overview-secret-with-at-least-32-characters',
    nodeEnv: 'test', trustProxy: false, webOrigin: 'http://127.0.0.1',
  } })
  server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 })
  await once(server, 'listening')
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterEach(async () => { server.close(); await once(server, 'close') })
afterAll(async () => { await database?.dispose() })

async function login() {
  const browser = new BrowserSession(baseUrl)
  const credentials = { email: `${randomUUID()}@example.test`, password: 'synthetic-overview-password' }
  expect((await browser.post('/api/auth/register', credentials)).status).toBe(200)
  expect((await browser.post('/api/auth/login', credentials)).status).toBe(200)
  expect((await browser.request('/api/auth/me')).status).toBe(200)
  return browser
}

async function createDiary(browser: BrowserSession, date: string, symbols: string[] = [], extra: Record<string, unknown> = {}) {
  const response = await browser.post('/api/diaries', {
    title: `Overview ${date}`, content: 'Synthetic overview fixture', date,
    ...extra,
    ...(symbols.length ? { transactions: symbols.map(symbol => ({ symbol, type: 'BUY', quantity: '2', price: '100', tradeDate: `${date}T10:00:00.000Z` })) } : {}),
  })
  expect(response.status).toBe(201)
  return response.json()
}

async function overview(browser: BrowserSession) {
  const response = await browser.request('/api/portfolio/overview')
  return { response, body: await response.json() }
}

function fullLedgerReads() {
  return observedQueries.filter(({ query }) => {
    const normalized = query.toLowerCase().replaceAll(/\s+/g, ' ')
    const from = normalized.indexOf('from "transactions" where')
    if (from < 0) return false
    const predicate = normalized.slice(from + 'from "transactions" where'.length).split(' order by', 1)[0] ?? ''
    return predicate.includes('"transactions"."user_id"') && !predicate.includes('"transactions"."diary_id"')
  })
}

function update(browser: BrowserSession, id: string, body: unknown) {
  return browser.request(`/api/diaries/${id}`, {
    method: 'PUT',
    headers: new Headers({ 'content-type': 'application/json', 'x-csrf-token': browser.cookies.get('csrf-token')! }),
    body: JSON.stringify(body),
  })
}

describe('Overview portfolio composition through real HTTP and PostgreSQL', () => {
  it('replays once per owner under parallel account loads and rereads mutations', async () => {
    const first = await login()
    const second = await login()
    const firstDiary = await createDiary(first, '2026-09-01', ['AAPL'])
    await createDiary(second, '2026-09-02', ['MSFT'])

    observedQueries.length = 0
    const [firstResult, secondResult] = await Promise.all([overview(first), overview(second)])
    expect(firstResult.response.status).toBe(200)
    expect(secondResult.response.status).toBe(200)
    expect(firstResult.body.valuation).toMatchObject({ status: 'ready', data: { holdings: [{ symbol: 'AAPL', quantity: 2 }] } })
    expect(firstResult.body.attention.data.items.some((item: { reason: string; targetId: string }) => item.reason === 'missing_thesis' && item.targetId === 'AAPL')).toBe(true)
    expect(secondResult.body.valuation).toMatchObject({ status: 'ready', data: { holdings: [{ symbol: 'MSFT', quantity: 2 }] } })
    expect(secondResult.body.attention.data.items.some((item: { reason: string; targetId: string }) => item.reason === 'missing_thesis' && item.targetId === 'MSFT')).toBe(true)
    expect(fullLedgerReads()).toHaveLength(2)
    expect(quoteCalls).toEqual(new Map([['AAPL', 1], ['MSFT', 1]]))

    observedQueries.length = 0
    const firstRow = firstDiary.transactions[0]
    const changed = await update(first, firstDiary.id, {
      title: firstDiary.title, content: 'Updated quantity',
      transactions: [{
        id: firstRow.id, symbol: firstRow.symbol, type: firstRow.type, quantity: '7', price: firstRow.price,
        tradeDate: firstRow.tradeDate, notes: firstRow.notes, strategy: firstRow.strategy, emotion: firstRow.emotion,
      }],
    })
    expect(changed.status).toBe(200)
    observedQueries.length = 0
    const reloaded = await overview(first)
    expect(reloaded.body.valuation).toMatchObject({ status: 'ready', data: { holdings: [{ symbol: 'AAPL', quantity: 7 }] } })
    expect(fullLedgerReads()).toHaveLength(1)
  })

  it('keeps empty, partial, and stale quote states inside a successful composed response', async () => {
    const empty = await login()
    const emptyResult = await overview(empty)
    expect(emptyResult.response.status).toBe(200)
    expect(emptyResult.body).toMatchObject({
      valuation: { status: 'ready', data: { valuation: { valuationStatus: 'empty', totalHoldings: 0 } } },
      attention: { status: 'ready', data: { coverage: { valuationStatus: 'empty', complete: true, total: 0 } } },
    })

    const owner = await login()
    await createDiary(owner, '2026-09-03', ['AAPL', 'MISSING', 'STALE'])
    const partial = await overview(owner)
    expect(partial.response.status).toBe(200)
    expect(partial.body.valuation).toMatchObject({
      status: 'ready',
      data: { valuation: { valuationStatus: 'partial', totalHoldings: 3, staleQuoteCount: 1 }, quoteErrors: ['MISSING'] },
    })
    expect(partial.body.attention).toMatchObject({ status: 'ready', data: { coverage: { complete: false, priced: 2, total: 3 } } })
  })

  it('reports a section failure without discarding valuation and succeeds on retry after correction', async () => {
    const browser = await login()
    const longTitle = 'Valid long Diary title '.repeat(14)
    const diary = await createDiary(browser, '2026-09-04', [], {
      title: longTitle, reviewDueAt: '2026-09-01T00:00:00.000Z',
    })
    const failed = await overview(browser)
    expect(failed.response.status).toBe(200)
    expect(failed.body.valuation).toMatchObject({ status: 'ready', data: { valuation: { valuationStatus: 'empty' } } })
    expect(failed.body.attention).toMatchObject({ status: 'failed', error: { code: 'SYS_INTERNAL_ERROR', requestId: expect.any(String) } })

    const updated = await update(browser, diary.id, { title: 'Retry attention', content: diary.content })
    expect(updated.status).toBe(200)
    const retried = await overview(browser)
    expect(retried.body.valuation).toMatchObject({ status: 'ready', data: { valuation: { valuationStatus: 'empty' } } })
    expect(retried.body.attention).toMatchObject({ status: 'ready', data: { items: [{ reason: 'overdue_diary_review' }] } })
  })
})
