import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from 'vitest'
import { createApp } from '../../apps/api/src/app'
import { diaryReviewResponseSchema } from '@diary/contracts/review'
import { BrowserSession } from '../support/browser-session'
import { provisionTestDatabase } from '../support/database'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let server: ReturnType<typeof serve>, baseUrl: string, clock: Date
beforeAll(async () => { database = await provisionTestDatabase('diary_review') })
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
async function create(browser: BrowserSession, extra = {}) {
  const response = await browser.post('/api/diaries', { title: 'Original decision', content: 'Original Markdown', date: '2026-09-05', thesis: 'Original thesis', risk: 'Original risk', execution: 'Original execution', ...extra })
  expect(response.status).toBe(201)
  return response.json()
}

it('schedules, clears, completes and revises a review while retaining original reasoning', async () => {
  const browser = await login(), diary = await create(browser)
  const path = `/api/diaries/${diary.id}/review`
  expect((await (await browser.request(path)).json()).reviewStatus).toBe('none')
  const originalBody = { title: diary.title, content: diary.content }
  expect((await update(browser, `/api/diaries/${diary.id}`, { ...originalBody, reviewDueAt: '2026-11-01T06:30:00Z' }, 'PUT')).status).toBe(200)
  expect(await (await browser.request(path)).json()).toMatchObject({ reviewStatus: 'pending', reviewDueAt: '2026-11-01T06:30:00.000Z' })
  await update(browser, `/api/diaries/${diary.id}`, { ...originalBody, reviewDueAt: null }, 'PUT')
  expect((await (await browser.request(path)).json()).reviewStatus).toBe('none')
  const complete = await update(browser, path, { reviewOutcome: 'PARTIAL', reviewSummary: '  Demand improved.  ', reviewLearning: '  ', reviewAdjustment: null })
  expect(complete.status).toBe(200)
  expect(diaryReviewResponseSchema.parse(await complete.json())).toMatchObject({
    reviewStatus: 'reviewed', reviewedAt: clock.toISOString(), reviewOutcome: 'PARTIAL',
    reviewSummary: 'Demand improved.', reviewLearning: null, reviewAdjustment: null,
    thesis: 'Original thesis', risk: 'Original risk', execution: 'Original execution', content: 'Original Markdown',
  })
  clock = new Date(clock.getTime() + 300_000)
  const revised = await update(browser, path, { reviewOutcome: 'INTACT', reviewLearning: 'Keep checking the source.' })
  expect(await revised.json()).toMatchObject({ reviewedAt: clock.toISOString(), reviewSummary: null, reviewLearning: 'Keep checking the source.' })
  await update(browser, `/api/diaries/${diary.id}`, { ...originalBody, reviewDueAt: '2026-12-01T00:00:00Z' }, 'PUT')
  expect((await (await browser.request(path)).json()).reviewStatus).toBe('reviewed')
})

it('rejects blank reflection, invalid outcomes and generic completion bypass without changing stored review', async () => {
  const browser = await login(), diary = await create(browser, { reviewDueAt: '2026-09-10T00:00:00Z' })
  const path = `/api/diaries/${diary.id}/review`
  for (const body of [
    { reviewOutcome: 'INTACT' }, { reviewOutcome: 'INTACT', reviewSummary: ' \n\t' },
    { reviewOutcome: 'unknown', reviewLearning: 'valid text' },
    { reviewOutcome: 'INTACT', reviewSummary: 'x'.repeat(10_001) },
    { reviewOutcome: 'INTACT', reviewSummary: 'valid', reviewedAt: '2000-01-01T00:00:00Z' },
  ]) expect((await update(browser, path, body)).status).toBe(400)
  expect((await update(browser, `/api/diaries/${diary.id}`, { title: diary.title, content: diary.content, reviewStatus: 'reviewed', reviewOutcome: 'INTACT' }, 'PUT')).status).toBe(400)
  expect((await (await browser.request(path)).json())).toMatchObject({ reviewStatus: 'pending', reviewOutcome: null, reviewedAt: null, reviewSummary: null })
})

it('restricts review reads/writes to the owner and preserves CSRF and explicit credential precedence', async () => {
  const owner = await login(), other = await login(), diary = await create(owner)
  const path = `/api/diaries/${diary.id}/review`
  const body = { reviewOutcome: 'INTACT', reviewSummary: 'Owner only' }
  expect((await other.request(path)).status).toBe(404)
  expect((await update(other, path, body)).status).toBe(404)
  expect((await fetch(baseUrl + path)).status).toBe(401)
  expect((await owner.request(path, { headers: { authorization: 'Bearer invalid' } })).status).toBe(401)
  expect((await owner.request(path, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).status).toBe(403)
  expect((await owner.request('/api/diaries/9223372036854775808/review')).status).toBe(400)
})

it('returns canonical transaction context chronologically without owner or unrelated private fields', async () => {
  const browser = await login(), diary = await create(browser, { transactions: [
    { symbol: 'AAPL', type: 'BUY', quantity: '1.25', price: '10.1', tradeDate: '2026-09-05T12:00:00Z' },
    { symbol: 'MSFT', type: 'BUY', quantity: '2', price: '20', tradeDate: '2026-09-04T12:00:00Z' },
  ] })
  const result = diaryReviewResponseSchema.parse(await (await browser.request(`/api/diaries/${diary.id}/review`)).json())
  expect(result.transactions.map(row => row.symbol)).toEqual(['MSFT', 'AAPL'])
  expect(result.transactions[1]).toMatchObject({ quantity: '1.2500', price: '10.1000', notes: null })
  expect(result.transactions[0]).not.toHaveProperty('userId')
  expect(result).not.toHaveProperty('email')
})

it('preserves completed reflection when scheduling or append races completion', async () => {
  for (const append of [false, true]) {
    const browser = await login(), diary = await create(browser, { reviewDueAt: '2026-09-10T00:00:00Z' })
    const path = `/api/diaries/${diary.id}/review`
    const responses = await Promise.all([
      update(browser, path, { reviewOutcome: 'PARTIAL', reviewLearning: 'Retain this completed reflection.' }),
      append
        ? browser.post('/api/diaries', { date: diary.date, title: 'Append title', content: 'Additional evidence', appendToToday: true, reviewDueAt: null })
        : update(browser, `/api/diaries/${diary.id}`, { title: diary.title, content: diary.content, reviewDueAt: null }, 'PUT'),
    ])
    expect(responses.map(response => response.status)).toEqual([200, append ? 201 : 200])
    const result = await (await browser.request(path)).json()
    expect(result).toMatchObject({ reviewStatus: 'reviewed', reviewDueAt: null, reviewOutcome: 'PARTIAL', reviewLearning: 'Retain this completed reflection.', reviewedAt: clock.toISOString(), thesis: 'Original thesis' })
    if (append) expect(result.content).toContain('Additional evidence')
  }
})
