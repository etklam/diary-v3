import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import { createApp } from '../../apps/api/src/app'
import { BrowserSession } from '../support/browser-session'
import { provisionTestDatabase } from '../support/database'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let server: ReturnType<typeof serve>
let baseUrl: string
let clock: Date

beforeAll(async () => { database = await provisionTestDatabase('stock_timeline_capture') })
beforeEach(async () => {
  clock = new Date('2026-09-05T12:00:00Z')
  const app = createApp({
    db: database.db,
    now: () => clock,
    config: {
      jwtSecret: 'synthetic-review-key-with-at-least-32-characters',
      nodeEnv: 'test',
      trustProxy: false,
      webOrigin: 'http://127.0.0.1',
    },
  })
  server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 })
  await once(server, 'listening')
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
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

function agentCapture(rawKey: string, records: unknown[]) {
  return fetch(`${baseUrl}/api/agent/stocks/records`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': rawKey },
    body: JSON.stringify({ records }),
  })
}

async function waitForAdvisoryWaiters(expected: number, blockerPid: number) {
  const deadline = Date.now() + 3_000
  while (Date.now() < deadline) {
    const { rows: [row] } = await database.pool.query(`
      select count(*)::int as count
      from pg_locks as locks
      join pg_stat_activity as activity on activity.pid = locks.pid
      where locks.locktype = 'advisory'
        and not locks.granted
        and activity.datname = current_database()
        and $1 = any(pg_blocking_pids(activity.pid))
    `, [blockerPid])
    if ((row?.count ?? 0) >= expected) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error(`Timed out waiting for ${expected} advisory lock waiters`)
}

it('shares immutable owner/stock/key identity between concurrent browser and Agent capture', async () => {
  const owner = await login()
  const other = await login()
  const { rawKey } = await (await owner.post('/api/api-keys', { label: 'Cross-route publisher', scope: 'AGENT_WRITE' })).json()
  await owner.post('/api/stocks/watchlist', { symbol: 'AAPL' })
  const ownerMe = await (await owner.request('/api/auth/me')).json()

  const idempotencyKey = 'cross-route-capture'
  const browserBody = {
    summary: 'Browser original',
    sourceType: 'ARTICLE',
    sourceTitle: 'Browser source',
    sourceUrl: 'https://example.test/browser',
    occurredAt: '2026-09-05T10:00:00Z',
    idempotencyKey,
  }
  const agentBody = {
    symbol: 'aapl',
    summary: 'Agent altered replay',
    sourceType: 'ARTICLE',
    sourceTitle: 'Agent source',
    sourceUrl: 'https://example.test/agent',
    occurredAt: '2026-09-05T11:00:00Z',
    idempotencyKey,
  }
  const blocker = await database.pool.connect()
  await blocker.query('begin')
  const { rows: [blockerRow] } = await blocker.query<{ pid: number }>('select pg_backend_pid() as pid')
  await blocker.query('select pg_advisory_xact_lock(hashtextextended($1, 0::bigint))', [`watchlist:${ownerMe.data.id}`])
  const browserPending = owner.post('/api/stocks/AAPL/evidence', browserBody)
  const agentPending = agentCapture(rawKey, [agentBody])
  try {
    await waitForAdvisoryWaiters(2, blockerRow!.pid)
  } finally {
    await blocker.query('rollback').catch(() => undefined)
    blocker.release()
  }
  const [browserResponse, agentResponse] = await Promise.all([browserPending, agentPending])
  expect(browserResponse.status).toBe(200)
  expect(agentResponse.status).toBe(200)
  const browserRecord = await browserResponse.json()
  const agentResult = await agentResponse.json()
  expect(agentResult.created.length + agentResult.skipped.length).toBe(1)
  expect(agentResult.updated).toEqual([])

  const timeline = await (await owner.request('/api/stocks/AAPL/timeline')).json()
  expect(timeline.records).toHaveLength(1)
  const [persisted] = timeline.records
  expect(persisted.id).toBe(browserRecord.id)
  expect(browserRecord).toEqual(persisted)
  const expectedWinner = agentResult.created.length ? {
    ...agentBody,
    symbol: 'AAPL',
    sourceDiaryId: null,
    sourceExternalId: null,
    sourceExcerpt: null,
    confidence: null,
    metadataJson: null,
    createdVia: 'API_KEY',
    createdByLabel: 'Cross-route publisher',
  } : {
    ...browserBody,
    symbol: 'AAPL',
    sourceDiaryId: null,
    sourceExternalId: null,
    sourceExcerpt: null,
    confidence: null,
    metadataJson: null,
    createdVia: 'WEB',
    createdByLabel: null,
  }
  expect(persisted).toMatchObject({
    symbol: expectedWinner.symbol,
    summary: expectedWinner.summary,
    sourceType: expectedWinner.sourceType,
    sourceTitle: expectedWinner.sourceTitle,
    sourceUrl: expectedWinner.sourceUrl,
    sourceDiaryId: expectedWinner.sourceDiaryId,
    sourceExternalId: expectedWinner.sourceExternalId,
    sourceExcerpt: expectedWinner.sourceExcerpt,
    confidence: expectedWinner.confidence,
    idempotencyKey: expectedWinner.idempotencyKey,
    occurredAt: new Date(expectedWinner.occurredAt).toISOString(),
    createdVia: expectedWinner.createdVia,
    createdByLabel: expectedWinner.createdByLabel,
    metadataJson: expectedWinner.metadataJson,
  })
  if (agentResult.created.length) {
    expect(agentResult.created).toEqual([persisted.id])
    expect(persisted).toMatchObject({ summary: agentBody.summary, createdVia: 'API_KEY', createdByLabel: 'Cross-route publisher' })
  } else {
    expect(agentResult.skipped).toEqual([{ symbol: 'AAPL', reason: 'ALREADY_EXISTS' }])
    expect(persisted).toMatchObject({ summary: browserBody.summary, createdVia: 'WEB', createdByLabel: null })
  }

  const browserReplay = await owner.post('/api/stocks/aapl/evidence', { ...browserBody, summary: 'Browser changed replay' })
  expect(browserReplay.status).toBe(200)
  expect(await browserReplay.json()).toEqual(persisted)
  const agentReplay = await agentCapture(rawKey, [{ ...agentBody, summary: 'Agent changed replay' }])
  expect(await agentReplay.json()).toMatchObject({ created: [], updated: [], skipped: [{ symbol: 'AAPL', reason: 'ALREADY_EXISTS' }] })
  expect((await (await owner.request('/api/stocks/AAPL/timeline')).json()).records).toEqual([persisted])

  const otherRecord = await (await other.post('/api/stocks/AAPL/evidence', { ...browserBody, summary: 'Other owner', sourceTitle: 'Other owner source' })).json()
  const differentStock = await (await owner.post('/api/stocks/MSFT/evidence', { ...browserBody, summary: 'Different stock' })).json()
  expect(otherRecord.id).not.toBe(persisted.id)
  expect(differentStock.id).not.toBe(persisted.id)
})
