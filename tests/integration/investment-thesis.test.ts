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
beforeAll(async () => { database = await provisionTestDatabase('thesis') })
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
const active = { status: 'ACTIVE', summary: 'Original thesis', whyIOwnIt: 'Original reason', risks: 'Original risk', reviewDueAt: '2026-09-05T12:00:00Z' }
const reflection = { outcome: 'INTACT', portfolioDecision: 'HOLD', whatImproved: 'Evidence improved' }
async function save(browser: BrowserSession, body: unknown = active) {
  const response = await update(browser, '/api/stocks/AAPL/thesis', body, 'PUT')
  expect(response.status).toBe(200)
  return (await response.json()).thesis
}
it('preserves full replacement, activation history, normalization and owner isolation', async () => {
  const browser = await login(), other = await login()
  expect(await (await browser.request('/api/stocks/AAPL/thesis')).json()).toEqual({ thesis: null, reviews: [] })
  const thesis = await save(browser)
  expect(thesis.health).toBe('healthy')
  clock = new Date(clock.getTime() + 1)
  expect((await (await browser.request('/api/stocks/aapl/thesis')).json()).thesis.health).toBe('needs_review')
  const archived = await save(browser, { status: 'ARCHIVED' })
  expect(archived).toMatchObject({ id: thesis.id, summary: null, risks: null, archivedAt: clock.toISOString(), activatedAt: thesis.activatedAt })
  const restored = await save(browser)
  expect(restored).toMatchObject({ id: thesis.id, activatedAt: thesis.activatedAt, archivedAt: null })
  expect(await save(browser, {})).toMatchObject({ status: 'DRAFT', summary: null, whyIOwnIt: null, reviewDueAt: null })
  expect((await (await other.request('/api/stocks/AAPL/thesis')).json()).thesis).toBeNull()
  expect((await other.post('/api/stocks/AAPL/thesis/reviews', reflection)).status).toBe(404)
})
it('snapshots active thesis, preserves old reviews after replacement and derives invalidated health', async () => {
  const browser = await login(), thesis = await save(browser)
  const response = await browser.post('/api/stocks/AAPL/thesis/reviews', { ...reflection, outcome: 'INVALIDATED', invalidationTriggered: true })
  expect(response.status).toBe(200)
  const result = await response.json()
  expect(result.thesis).toMatchObject({ id: thesis.id, health: 'invalidated', latestReviewOutcome: 'INVALIDATED', lastReviewedAt: clock.toISOString() })
  expect(result.review.snapshot).toMatchObject({ summary: active.summary, whyIOwnIt: active.whyIOwnIt, risks: active.risks, reviewDueAt: new Date(active.reviewDueAt).toISOString() })
  await save(browser, { ...active, summary: 'Replacement thesis' })
  const listed = await (await browser.request('/api/stocks/AAPL/thesis?limit=1')).json()
  expect(listed.thesis.summary).toBe('Replacement thesis'); expect(listed.reviews[0]).toEqual(result.review)
  await save(browser, { status: 'ARCHIVED' })
  expect((await browser.post('/api/stocks/AAPL/thesis/reviews', reflection)).status).toBe(409)
})
it('serializes concurrent creation and archive/review without non-active snapshots', async () => {
  const browser = await login()
  const created = await Promise.all([save(browser), save(browser)])
  expect(created[0].id).toBe(created[1].id)
  for (let i = 0; i < 5; i++) {
    await save(browser)
    const [archived, reviewed] = await Promise.all([update(browser, '/api/stocks/AAPL/thesis', { status: 'ARCHIVED' }, 'PUT'), browser.post('/api/stocks/AAPL/thesis/reviews', reflection)])
    expect(archived.status).toBe(200); expect([200, 409]).toContain(reviewed.status)
    if (reviewed.status === 200) expect((await reviewed.json()).review.snapshot).toMatchObject({ status: 'ACTIVE', summary: active.summary })
  }
  expect((await (await browser.request('/api/stocks/AAPL/thesis')).json()).thesis.status).toBe('ARCHIVED')
})
it('rejects activation omissions, empty reflection, invalid query and cookie/Bearer misuse', async () => {
  const browser = await login()
  expect((await update(browser, '/api/stocks/AAPL/thesis', { status: 'ACTIVE' }, 'PUT')).status).toBe(400)
  expect((await browser.post('/api/stocks/AAPL/thesis/reviews', { outcome: 'INTACT', portfolioDecision: 'HOLD' })).status).toBe(400)
  expect((await browser.request('/api/stocks/AAPL/thesis?limit=101')).status).toBe(400)
  expect((await browser.request('/api/stocks/AAPL/thesis', { headers: { authorization: 'Bearer invalid' } })).status).toBe(401)
  expect((await browser.request('/api/stocks/AAPL/thesis', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(active) })).status).toBe(403)
})

it('enforces review owner FK and rolls back a snapshot when updating current state fails', async () => {
  const browser = await login(), other = await login(), thesis = await save(browser), foreign = await save(other)
  await expect(database.pool.query("insert into thesis_reviews (thesis_id,user_id,outcome,portfolio_decision,snapshot_status,what_changed) values ($1,$2,'INTACT','HOLD','ACTIVE','Forged')", [thesis.id, foreign.userId])).rejects.toMatchObject({ code: '23503' })
  await database.pool.query(`CREATE FUNCTION reject_test_thesis_review() RETURNS trigger AS $$ BEGIN IF NEW.id = ${BigInt(thesis.id)} AND NEW.last_reviewed_at IS NOT NULL THEN RAISE EXCEPTION 'Synthetic persistence failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`)
  await database.pool.query('CREATE TRIGGER reject_test_thesis_review BEFORE UPDATE ON investment_theses FOR EACH ROW EXECUTE FUNCTION reject_test_thesis_review()')
  try {
    expect((await browser.post('/api/stocks/AAPL/thesis/reviews', reflection)).status).toBe(500)
    const state = await (await browser.request('/api/stocks/AAPL/thesis')).json()
    expect(state.reviews).toEqual([]); expect(state.thesis.lastReviewedAt).toBeNull(); expect(state.thesis.latestReviewOutcome).toBeNull()
  } finally {
    await database.pool.query('DROP TRIGGER reject_test_thesis_review ON investment_theses')
    await database.pool.query('DROP FUNCTION reject_test_thesis_review()')
  }
})

it('rejects invalid review enums without writes and preserves repeated active snapshots', async () => {
  const browser = await login()
  await save(browser, { ...active, summary: 'Stable thesis', whyIOwnIt: 'Stable reason' })
  for (const body of [
    { outcome: 'NOT_AN_OUTCOME', portfolioDecision: 'HOLD', whatChanged: 'Invalid outcome' },
    { outcome: 'INTACT', portfolioDecision: 'NOT_A_DECISION', whatChanged: 'Invalid decision' },
  ]) expect((await browser.post('/api/stocks/AAPL/thesis/reviews', body)).status).toBe(400)
  const untouched = await (await browser.request('/api/stocks/AAPL/thesis')).json()
  expect(untouched.thesis).toMatchObject({ lastReviewedAt: null, latestReviewOutcome: null })
  expect(untouched.reviews).toEqual([])

  const firstResponse = await browser.post('/api/stocks/AAPL/thesis/reviews', { outcome: 'INTACT', portfolioDecision: 'HOLD', whatChanged: 'First review' })
  const secondResponse = await browser.post('/api/stocks/AAPL/thesis/reviews', { outcome: 'PARTIAL', portfolioDecision: 'REDUCE', whatChanged: 'Second review' })
  expect(firstResponse.status).toBe(200); expect(secondResponse.status).toBe(200)
  const first = await firstResponse.json(), second = await secondResponse.json()
  const listed = await (await browser.request('/api/stocks/AAPL/thesis')).json()
  expect(listed.reviews.map((review: { id: string }) => review.id)).toEqual([second.review.id, first.review.id])
  expect(new Set(listed.reviews.map((review: { id: string }) => review.id)).size).toBe(2)
  expect(listed.reviews.map((review: { snapshot: { status: string; summary: string | null } }) => [review.snapshot.status, review.snapshot.summary])).toEqual([
    ['ACTIVE', 'Stable thesis'], ['ACTIVE', 'Stable thesis'],
  ])
  expect(listed.thesis.latestReviewOutcome).toBe('PARTIAL')
})
