import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../apps/api/src/app'
import { BrowserSession } from '../support/browser-session'
import { provisionTestDatabase } from '../support/database'
import { schema } from '@diary/db'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let server: ReturnType<typeof serve>
let baseUrl: string
let observedQueries: Array<{ query: string; params: unknown[] }>

async function login(browser: BrowserSession) {
  const email = `${randomUUID()}@example.test`
  expect((await browser.post('/api/auth/register', {
    email, password: 'test-password-123', name: 'Diary editor',
  })).status).toBe(200)
  expect((await browser.post('/api/auth/login', { email, password: 'test-password-123' })).status).toBe(200)
  expect((await browser.request('/api/auth/me')).status).toBe(200)
}

function mutation(browser: BrowserSession, method: 'PUT' | 'DELETE', path: string, body?: unknown) {
  const headers = new Headers({ 'x-csrf-token': browser.cookies.get('csrf-token')! })
  if (body !== undefined) headers.set('content-type', 'application/json')
  return browser.request(path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

beforeAll(async () => { database = await provisionTestDatabase('diary_editor') })
beforeEach(async () => {
  observedQueries = []
  const db = drizzle(database.pool, { schema, logger: { logQuery(query, params) { observedQueries.push({ query, params }) } } })
  const app = createApp({
    db,
    config: {
      jwtSecret: 'test-only-diary-editor-secret-over-32-characters',
      nodeEnv: 'test',
      trustProxy: false,
      webOrigin: 'http://127.0.0.1',
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

describe('diary editor through real HTTP and PostgreSQL', () => {
  it('does not lock or replay the owner ledger for text-only updates and preserves explicit clearing', async () => {
    const browser = new BrowserSession(baseUrl)
    await login(browser)
    const traded = await (await browser.post('/api/diaries', {
      title: 'Text-only trade fixture', content: 'Original text', date: '2026-10-08',
      transactions: [{ symbol: 'AAPL', type: 'BUY', quantity: '2', price: '10', tradeDate: '2026-10-08T10:00:00.000Z' }],
    })).json()
    const empty = await (await browser.post('/api/diaries', {
      title: 'Text-only empty fixture', content: 'Original text', date: '2026-10-09',
    })).json()
    const transactionRows = async (diaryId: string) => (await database.pool.query(
      'SELECT id::text, symbol, type, quantity::text, price::text, trade_date::text FROM transactions WHERE diary_id = $1 ORDER BY id',
      [diaryId],
    )).rows
    const before = await transactionRows(traded.id)
    const fullLedgerReads = () => observedQueries.filter(({ query }) => {
      const normalized = query.toLowerCase().replaceAll(/\s+/g, ' ')
      if (!normalized.includes('from "transactions" where')) return false
      const predicate = normalized.split('from "transactions" where', 2)[1]?.split(' order by', 1)[0] ?? ''
      return predicate.includes('"transactions"."user_id"') && !predicate.includes('"transactions"."diary_id"')
    })
    const ledgerLocks = () => observedQueries.filter(({ query, params }) =>
      query.includes('pg_advisory_xact_lock') && params.includes(`ledger:${traded.userId}`),
    )

    observedQueries.length = 0
    const textUpdate = await mutation(browser, 'PUT', `/api/diaries/${traded.id}`, {
      title: 'Text-only trade fixture', content: 'Text changed; transactions omitted',
    })
    expect(textUpdate.status).toBe(200)
    expect(fullLedgerReads()).toHaveLength(0)
    expect(ledgerLocks()).toHaveLength(0)
    expect(await transactionRows(traded.id)).toEqual(before)

    observedQueries.length = 0
    const emptyUpdate = await mutation(browser, 'PUT', `/api/diaries/${empty.id}`, {
      title: 'Text-only empty fixture', content: 'Empty ledger stays empty',
    })
    expect(emptyUpdate.status).toBe(200)
    expect(fullLedgerReads()).toHaveLength(0)
    expect(ledgerLocks()).toHaveLength(0)
    expect(await transactionRows(empty.id)).toEqual([])

    observedQueries.length = 0
    const clear = await mutation(browser, 'PUT', `/api/diaries/${traded.id}`, {
      title: 'Text-only trade fixture', content: 'Explicit clear', transactions: [],
    })
    expect(clear.status).toBe(200)
    expect(ledgerLocks()).toHaveLength(1)
    expect(await transactionRows(traded.id)).toEqual([])
    expect((await browser.request(`/api/diaries/${traded.id}`).then(response => response.json())).transactions).toEqual([])
  })

  it('round-trips Markdown, structured text and lossless normalized tags', async () => {
    const browser = new BrowserSession(baseUrl)
    await login(browser)
    const content = '# Thesis\n\n- **Wait** for evidence.\n\n<script>stored as text</script>'
    const response = await browser.post('/api/diaries', {
      title: '  Breakout decision  ',
      content,
      date: '2026-10-01',
      tags: [' conviction ', 'macro,fx', 'conviction'],
      thesis: 'Demand is accelerating.',
      risk: 'False breakout.',
      execution: 'Scale in above confirmation.',
    })
    expect(response.status).toBe(201)
    const created = await response.json()
    expect(created).toMatchObject({
      title: 'Breakout decision',
      content,
      tags: ['conviction', 'macro,fx'],
      tagsString: 'conviction,macro,fx',
      thesis: 'Demand is accelerating.',
      risk: 'False breakout.',
      execution: 'Scale in above confirmation.',
    })

    const detail = await browser.request(`/api/diaries/${created.id}`)
    expect(detail.status).toBe(200)
    expect(await detail.json()).toMatchObject(created)
    const stored = await database.pool.query('SELECT tags FROM diaries WHERE id = $1', [created.id])
    expect(stored.rows[0].tags).toEqual(['conviction', 'macro,fx'])
  })

  it('uses full PUT while preserving omitted optional fields and clearing explicit values', async () => {
    const browser = new BrowserSession(baseUrl)
    await login(browser)
    const created = await (await browser.post('/api/diaries', {
      title: 'Before', content: 'Before content', date: '2026-10-02',
      tags: ['keep'], thesis: 'Keep initially', risk: 'Clear later', execution: 'Also clear',
    })).json()

    const preservedResponse = await mutation(browser, 'PUT', `/api/diaries/${created.id}`, {
      title: 'After', content: 'After content', thesis: 'Updated thesis',
    })
    expect(preservedResponse.status).toBe(200)
    expect(await preservedResponse.json()).toMatchObject({
      title: 'After', content: 'After content', date: '2026-10-02', tags: ['keep'],
      thesis: 'Updated thesis', risk: 'Clear later', execution: 'Also clear',
    })

    const clearedResponse = await mutation(browser, 'PUT', `/api/diaries/${created.id}`, {
      title: 'Cleared', content: 'Required full body remains present', date: '2026-10-03',
      tags: [], thesis: null, risk: null, execution: null,
    })
    expect(clearedResponse.status).toBe(200)
    expect(await clearedResponse.json()).toMatchObject({
      title: 'Cleared', date: '2026-10-03', tags: [], tagsString: null,
      thesis: null, risk: null, execution: null,
    })
  })

  it('enforces per-owner daily uniqueness and hides update/delete existence from another owner', async () => {
    const owner = new BrowserSession(baseUrl)
    const other = new BrowserSession(baseUrl)
    await login(owner)
    await login(other)
    const first = await (await owner.post('/api/diaries', {
      title: 'First', content: 'First', date: '2026-10-04',
    })).json()
    await owner.post('/api/diaries', { title: 'Second', content: 'Second', date: '2026-10-05' })

    const collision = await mutation(owner, 'PUT', `/api/diaries/${first.id}`, {
      title: 'Collision', content: 'Must roll back', date: '2026-10-05',
    })
    expect(collision.status).toBe(409)
    expect((await collision.json()).data.code).toBe('DIARY_ALREADY_EXISTS')
    expect(await (await owner.request(`/api/diaries/${first.id}`)).json()).toMatchObject({
      title: 'First', date: '2026-10-04',
    })

    expect((await mutation(other, 'PUT', `/api/diaries/${first.id}`, {
      title: 'Stolen', content: 'Stolen',
    })).status).toBe(404)
    expect((await mutation(other, 'DELETE', `/api/diaries/${first.id}`)).status).toBe(404)
    expect((await mutation(owner, 'DELETE', `/api/diaries/${first.id}`)).status).toBe(200)
    expect((await owner.request(`/api/diaries/${first.id}`)).status).toBe(404)
  })

  it('accepts the content boundary and atomically rejects oversized or invalid relation payloads', async () => {
    const browser = new BrowserSession(baseUrl)
    await login(browser)
    const accepted = await browser.post('/api/diaries', {
      title: 'Long form', content: 'x'.repeat(500_000), date: '2026-10-06',
    })
    expect(accepted.status).toBe(201)
    const diary = await accepted.json()

    const oversized = await mutation(browser, 'PUT', `/api/diaries/${diary.id}`, {
      title: 'Must not write', content: 'x'.repeat(500_001),
    })
    expect(oversized.status).toBe(400)
    const relations = await mutation(browser, 'PUT', `/api/diaries/${diary.id}`, {
      title: 'Must not discard relations', content: 'Changed', alerts: [{ message: 'Invalid reminder', triggerAt: 'invalid' }],
    })
    expect(relations.status).toBe(400)
    expect(await (await browser.request(`/api/diaries/${diary.id}`)).json()).toMatchObject({
      title: 'Long form', content: 'x'.repeat(500_000),
    })

    const createWithRelations = await browser.post('/api/diaries', {
      title: 'Invalid reminder', content: 'Invalid reminder', date: '2026-10-07', alerts: [{ message: '', triggerAt: '2026-10-07T09:00:00Z' }],
    })
    expect(createWithRelations.status).toBe(400)
    expect((await createWithRelations.json()).data.code).toBe('SYS_VALIDATION_ERROR')
  })
})
