import { createHash, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { request as httpRequest } from 'node:http'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from 'vitest'
import { createApp } from '../../apps/api/src/app'
import { createMarketData } from '../../apps/api/src/market-data'
import { BrowserSession } from '../support/browser-session'
import { provisionTestDatabase } from '../support/database'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let server: ReturnType<typeof serve>, baseUrl: string, clock: Date
beforeAll(async () => { database = await provisionTestDatabase('api_key_http') })
beforeEach(async () => {
  clock = new Date('2026-09-05T12:00:00Z')
  const app = createApp({ db: database.db, now: () => clock, marketData: createMarketData({ now: () => clock, upstream: {
    quote: async symbol => ({ symbol, regularMarketPrice: 120, regularMarketPreviousClose: 100, regularMarketTime: clock, marketState: 'REGULAR' }),
    chart: async () => ({ quotes: [] }),
  } }), config: {
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
  return { browser, email: credentials.email }
}
function mutate(browser: BrowserSession, path: string, body: unknown = {}, method = 'PUT') {
  return browser.request(path, { method, headers: { 'content-type': 'application/json', 'x-csrf-token': browser.cookies.get('csrf-token')! }, body: JSON.stringify(body) })
}
it('returns a secret only once, stores its digest and atomically revokes owned keys', async () => {
 const a = await login(), b = await login()
 const created = await a.browser.post('/api/api-keys', { label: ' Agent ', scope: 'AGENT_WRITE' }); expect(created.status).toBe(200); expect(created.headers.get('cache-control')).toBe('no-store')
 const { key, rawKey } = await created.json(); expect(rawKey).toMatch(/^dva_[0-9a-f]{48}$/); expect(key).toMatchObject({ label: 'Agent', scope: 'AGENT_WRITE', keyPrefix: rawKey.slice(0,12), lastUsedAt: null, revokedAt: null })
 const stored = (await database.pool.query('select * from api_key_credentials where id=$1', [key.id])).rows[0]
 expect(stored.key_hash).toBe(createHash('sha256').update(rawKey).digest('hex')); expect(JSON.stringify(stored)).not.toContain(rawKey)
 const listed = await a.browser.request('/api/api-keys'); expect(listed.headers.get('cache-control')).toBe('no-store'); expect(await listed.json()).toEqual({ keys: [key] })
 expect((await (await b.browser.request('/api/api-keys')).json()).keys).toEqual([])
 expect((await mutate(b.browser, `/api/api-keys/${key.id}`, {}, 'DELETE')).status).toBe(404)
 const revoked = await Promise.all([mutate(a.browser, `/api/api-keys/${key.id}`, {}, 'DELETE'), mutate(a.browser, `/api/api-keys/${key.id}`, {}, 'DELETE')]); expect(revoked.map(r => r.status).sort()).toEqual([200,404])
 expect((await (await a.browser.request('/api/api-keys')).json()).keys[0].revokedAt).toBe(clock.toISOString())
 expect((await a.browser.post('/api/api-keys', { label: 'No CSRF' }, false)).status).toBe(403)
 expect((await a.browser.post('/api/api-keys', { label: 'Escalate', userId: '2' })).status).toBe(400)
 expect((await fetch(`${baseUrl}/api/api-keys`)).status).toBe(401)
})
it('limits credential creation and restores capacity after the window', async () => {
 const a = await login()
 for (let i=0;i<60;i++) expect((await a.browser.post('/api/api-keys', { label: `Agent ${i}` })).status).toBe(200)
 expect((await a.browser.post('/api/api-keys', { label: 'Too many' })).status).toBe(429)
 clock = new Date(clock.getTime() + 61000)
 expect((await a.browser.post('/api/api-keys', { label: 'New window' })).status).toBe(200)
})
it('writes as the key owner, rejects ambiguous identity and never falls back to cookies', async () => {
 const a = await login(), b = await login()
 const { rawKey, key } = await (await a.browser.post('/api/api-keys', { label: 'Research author' })).json()
 const payload = { date: '2026-09-05', title: 'Agent diary', content: 'Synthetic external content' }
 const write = (headers: Record<string,string>, body = payload) => fetch(`${baseUrl}/api/agent/diaries`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
 expect((await write({ 'x-api-key': rawKey, authorization: `Bearer ${rawKey}` })).status).toBe(401)
 expect((await b.browser.request('/api/agent/diaries', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'invalid' }, body: JSON.stringify(payload) })).status).toBe(401)
 const response = await b.browser.request('/api/agent/diaries', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': rawKey }, body: JSON.stringify(payload) })
 expect(response.status).toBe(201); const diary = await response.json(); expect(diary).toMatchObject({ title: 'Agent diary', createdVia: 'API_KEY', createdByLabel: 'Research author' })
 expect((await a.browser.request(`/api/diaries/${diary.id}`)).status).toBe(200)
 expect((await b.browser.request(`/api/diaries/${diary.id}`)).status).toBe(404)
 for (const path of ['/api/api-keys','/api/user/settings','/api/diaries','/api/partners']) expect((await a.browser.request(path, { headers: { 'x-api-key': rawKey } })).status).toBe(401)
 expect((await write({ authorization: `Bearer ${rawKey}` }, { ...payload, date: '2026-09-06' })).status).toBe(201)
 expect((await write({ 'x-api-key': rawKey }, { ...payload, appendToToday: true } as typeof payload)).status).toBe(400)
 expect((await a.browser.post('/api/agent/diaries', payload)).status).toBe(401)
 await mutate(a.browser, `/api/api-keys/${key.id}`, {}, 'DELETE')
 expect((await write({ 'x-api-key': rawKey })).status).toBe(401)
 expect((await a.browser.request('/api/auth/me')).status).toBe(200)
})
it('keeps an already-authenticated request valid across key revocation, then rejects later use', async () => {
 const a = await login()
 const { key, rawKey } = await (await a.browser.post('/api/api-keys', { label: 'Revocation cutoff', scope: 'DIARY_CREATE' })).json()
 const payload = { date: '2026-09-06', title: 'In-flight API key write', content: 'Synthetic authenticated request' }
 const serialized = JSON.stringify(payload)
 const requestBodyPrefix = serialized.slice(0, -1)
 const requestBodySuffix = serialized.slice(-1)
 let resolveResponse!: (result: { status: number; body: string }) => void
 let rejectResponse!: (reason?: unknown) => void
 const response = new Promise<{ status: number; body: string }>((resolve, reject) => { resolveResponse = resolve; rejectResponse = reject })
 const request = httpRequest(new URL(`${baseUrl}/api/agent/diaries`), {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': rawKey },
 }, incoming => {
  let body = ''
  incoming.setEncoding('utf8')
  incoming.on('data', chunk => { body += chunk })
  incoming.on('error', rejectResponse)
  incoming.on('aborted', () => rejectResponse(new Error('streamed request response aborted')))
  incoming.on('end', () => resolveResponse({ status: incoming.statusCode ?? 0, body }))
 })
 request.on('error', rejectResponse)
 const waitFor = async (predicate: () => Promise<boolean>, timeoutMs = 2_000) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
   if (await predicate()) return
   await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error('Timed out waiting for the API-key authentication gate')
 }
 const diaryCount = async () => Number((await database.pool.query('select count(*)::int as count from diaries where title=$1', [payload.title])).rows[0]?.count ?? 0)
 try {
  request.write(requestBodyPrefix)
  await waitFor(async () => (await database.pool.query('select last_used_at from api_key_credentials where id=$1', [key.id])).rows[0]?.last_used_at !== null)
  expect(await diaryCount()).toBe(0)

  expect((await mutate(a.browser, `/api/api-keys/${key.id}`, {}, 'DELETE')).status).toBe(200)
  request.end(requestBodySuffix)
  const inFlight = await response
  expect(inFlight.status).toBe(201)
  expect(JSON.parse(inFlight.body)).toMatchObject({ title: payload.title, createdVia: 'API_KEY' })
  expect(await diaryCount()).toBe(1)

  const later = await fetch(`${baseUrl}/api/agent/diaries`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': rawKey }, body: JSON.stringify({ ...payload, date: '2026-09-07' }) })
  expect(later.status).toBe(401)
  expect(JSON.stringify(await later.json())).toContain('AUTH_TOKEN_INVALID')
  expect(await diaryCount()).toBe(1)
 } finally {
  if (!request.writableEnded && !request.destroyed) request.destroy()
  await response.catch(() => undefined)
 }
})
it('restricts stock research to AGENT_WRITE and shares attributed notes through partner policy', async () => {
 const a = await login(), b = await login()
 const { rawKey: diaryKey } = await (await a.browser.post('/api/api-keys', { label: 'Diary only' })).json()
 const { rawKey: agentKey } = await (await a.browser.post('/api/api-keys', { label: 'Research publisher', scope: 'AGENT_WRITE' })).json()
 const headers = { 'x-api-key': agentKey, 'content-type': 'application/json' }
 for (const path of ['/api/agent/stocks/watchlist','/api/agent/stocks/AAPL/notes']) {
  const method = path.endsWith('/notes') ? 'POST' : 'GET'
  const denied = await fetch(baseUrl + path, { method, headers: { 'x-api-key': diaryKey } }); expect(denied.status).toBe(403); expect(JSON.stringify(await denied.json())).toContain('AUTH_API_KEY_SCOPE_DENIED')
 }
 await b.browser.post('/api/stocks/watchlist', { symbol: 'MSFT' })
 const published = await fetch(baseUrl + '/api/agent/stocks/aapl/notes', { method: 'POST', headers, body: JSON.stringify({ title: 'Agent view', content: 'Attributed research', date: '2026-09-05T00:00:00.123Z' }) })
 expect(published.status).toBe(200); const note = await published.json(); expect(note).toMatchObject({ createdVia: 'AGENT', createdByLabel: 'Research publisher', date: '2026-09-05T00:00:00.123Z' })
 const watchlist = await fetch(baseUrl + '/api/agent/stocks/watchlist', { headers }); expect(watchlist.headers.get('cache-control')).toBe('no-store'); const result = await watchlist.json(); expect(result.watchlist.map((row: { symbol: string }) => row.symbol)).toEqual(['AAPL'])
 expect((await mutate(a.browser, `/api/stocks/AAPL/notes/${note.id}`, { title: 'Web edit' })).status).toBe(403)
 const { link } = await (await b.browser.post('/api/partners', { partnerEmail: a.email })).json()
 await a.browser.post(`/api/partners/${link.id}/accept`, {})
 const path = `/api/stocks/AAPL/notes?partnerId=${link.partner.id}`
 expect((await b.browser.request(path)).status).toBe(403)
 await mutate(a.browser, `/api/partners/${link.id}/sharing`, { shareStockNotes: true })
 expect((await (await b.browser.request(path)).json()).data[0]).toMatchObject({ id: note.id, isOwnedByViewer: false, createdByLabel: 'Research publisher' })
 await mutate(a.browser, `/api/partners/${link.id}/sharing`, { shareStockNotes: false })
 expect((await b.browser.request(path)).status).toBe(403)
 expect((await a.browser.request('/api/agent/stocks/watchlist')).status).toBe(401)
})
it('ingests watched evidence atomically with immutable owner/stock scoped retries', async () => {
 const a = await login(), b = await login()
 const { rawKey } = await (await a.browser.post('/api/api-keys', { label: 'Batch publisher', scope: 'AGENT_WRITE' })).json()
 const batch = (records: unknown[]) => fetch(baseUrl + '/api/agent/stocks/records', { method: 'POST', headers: { 'x-api-key': rawKey, 'content-type': 'application/json' }, body: JSON.stringify({ records }) })
 for (const symbol of ['AAPL','MSFT']) await a.browser.post('/api/stocks/watchlist', { symbol })
 const foreignDiary = await (await b.browser.post('/api/diaries', { date: '2026-09-05', title: 'Private', content: 'Private' })).json()
 const ownDiary = await (await a.browser.post('/api/diaries', { date: '2026-09-05', title: 'Source', content: 'Owned' })).json()
 const record = { symbol: 'aapl', summary: 'Original evidence', sourceType: 'DIARY', idempotencyKey: 'batch-repeat', occurredAt: '2026-09-05T00:00:00.123Z', sourceDiaryId: ownDiary.id, confidence: 0 }
 const results = await Promise.all([batch([record]),batch([record])]); expect(results.map(r => r.status)).toEqual([200,200])
 const bodies = await Promise.all(results.map(r => r.json())); expect(bodies.reduce((n, body) => n + body.created.length,0)).toBe(1); expect(bodies.flatMap(body => body.skipped)).toEqual([{ symbol: 'AAPL', reason: 'ALREADY_EXISTS' }])
 expect((await (await batch([{ ...record, summary: 'Do not overwrite' }])).json()).updated).toEqual([])
 let evidence = await (await a.browser.request('/api/stocks/AAPL/timeline')).json(); expect(evidence.records[0]).toMatchObject({ summary: 'Original evidence', createdVia: 'API_KEY', createdByLabel: 'Batch publisher', confidence: 0, sourceDiaryId: ownDiary.id })
 const mixed = await batch([{ ...record, symbol: 'MSFT' }, { ...record, symbol: 'MISSING' }, { ...record, idempotencyKey: 'foreign', sourceDiaryId: foreignDiary.id }]); const mixedBody = await mixed.json(); expect(mixedBody.created).toHaveLength(1); expect(mixedBody.skipped).toEqual([{ symbol: 'MISSING', reason: 'NOT_IN_WATCHLIST' }, { symbol: 'AAPL', reason: 'SOURCE_DIARY_NOT_OWNED' }])
 expect((await batch([{ ...record, idempotencyKey: 'would-be-valid' }, { ...record, sourceType: 'SEC_FILING' }])).status).toBe(400)
 expect((await batch(Array.from({ length: 101 }, (_, i) => ({ ...record, idempotencyKey: `over-${i}` })))).status).toBe(400)
 expect((await batch([])).status).toBe(400)
 evidence = await (await a.browser.request('/api/stocks/AAPL/timeline')).json(); expect(evidence.records).toHaveLength(1)
 const { rawKey: bKey } = await (await b.browser.post('/api/api-keys', { label: 'Other publisher', scope: 'AGENT_WRITE' })).json(); await b.browser.post('/api/stocks/watchlist', { symbol: 'AAPL' })
 const separate = await fetch(baseUrl + '/api/agent/stocks/records', { method: 'POST', headers: { 'x-api-key': bKey, 'content-type': 'application/json' }, body: JSON.stringify({ records: [{ ...record, sourceDiaryId: foreignDiary.id }] }) }); expect((await separate.json()).created).toHaveLength(1)
 const triggerName = 'synthetic_batch_failure'
 await database.pool.query(`create function ${triggerName}() returns trigger language plpgsql as $$ begin if NEW.idempotency_key = 'force-rollback' then raise exception 'synthetic failure'; end if; return NEW; end $$`)
 await database.pool.query(`create trigger ${triggerName} before insert on stock_timeline_records for each row execute function ${triggerName}()`)
 try { expect((await batch([{ ...record, idempotencyKey: 'before-failure' }, { ...record, idempotencyKey: 'force-rollback' }])).status).toBe(500) }
 finally { await database.pool.query(`drop trigger ${triggerName} on stock_timeline_records`); await database.pool.query(`drop function ${triggerName}()`); }
 expect((await (await a.browser.request('/api/stocks/AAPL/timeline')).json()).records).toHaveLength(1)
})
it('accepts exactly 100 records across the allowed source vocabulary and checks batch scope', async () => {
 const a = await login()
 const { rawKey } = await (await a.browser.post('/api/api-keys', { label: 'Boundary publisher', scope: 'AGENT_WRITE' })).json()
 const { rawKey: deniedKey } = await (await a.browser.post('/api/api-keys', { label: 'Diary only' })).json()
 await a.browser.post('/api/stocks/watchlist', { symbol: 'AAPL' })
 const sources = ['TRADE_BASIC_DIARY','VIDEO_TRANSCRIBE_SUMMARIZE','DIARY','ARTICLE','MANUAL','SYSTEM']
 const records = Array.from({ length: 100 }, (_, i) => ({ symbol: 'AAPL', summary: `Boundary ${i}`, sourceType: sources[i % sources.length], idempotencyKey: `boundary-${i}`, occurredAt: '2026-09-05T00:00:00Z' }))
 const send = (key: string, payload = records) => fetch(baseUrl + '/api/agent/stocks/records', { method: 'POST', headers: { 'x-api-key': key, 'content-type': 'application/json' }, body: JSON.stringify({ records: payload }) })
 expect((await send(deniedKey)).status).toBe(403)
 const accepted = await send(rawKey); expect(accepted.status).toBe(200); const result = await accepted.json(); expect(result.created).toHaveLength(100); expect(new Set(result.created).size).toBe(100); expect(result.skipped).toEqual([])
 const replay = await (await send(rawKey)).json(); expect(replay.created).toEqual([]); expect(replay.skipped).toHaveLength(100)
 const timeline = await (await a.browser.request('/api/stocks/AAPL/timeline?limit=200')).json(); expect(timeline.records).toHaveLength(100); expect(new Set(timeline.records.map((row: { sourceType: string }) => row.sourceType))).toEqual(new Set(sources))
 for (const sourceType of ['MARKET_ROTATION','SEC_FILING','RELATIVE_VALUE','SEASONALITY']) expect((await send(rawKey,[{ ...records[0]!, sourceType }])).status).toBe(400)
})
