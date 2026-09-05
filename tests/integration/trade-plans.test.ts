import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import { tradePlanListResponseSchema, tradePlanResponseSchema } from '@diary/contracts/trade-plan'
import { tradePlans } from '@diary/db'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import { createApp } from '../../apps/api/src/app'
import { BrowserSession } from '../support/browser-session'
import { provisionTestDatabase } from '../support/database'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let server: ReturnType<typeof serve>
let baseUrl: string
let clock: Date

beforeAll(async () => { database = await provisionTestDatabase('trade_plans') })
beforeEach(async () => {
  clock = new Date('2026-09-05T12:00:00Z')
  const app = createApp({ db: database.db, now: () => clock, config: {
    jwtSecret: 'synthetic-trade-plan-key-with-32-characters', nodeEnv: 'test', trustProxy: false,
    webOrigin: 'http://127.0.0.1',
  } })
  server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 })
  await once(server, 'listening')
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterEach(async () => { server.close(); await once(server, 'close') })
afterAll(async () => { await database?.dispose() })

async function login() {
  const browser = new BrowserSession(baseUrl)
  const credentials = { email: `${randomUUID()}@example.test`, password: 'synthetic-plan-password' }
  expect((await browser.post('/api/auth/register', credentials)).status).toBe(200)
  expect((await browser.post('/api/auth/login', credentials)).status).toBe(200)
  await browser.request('/api/auth/me')
  return browser
}

async function createDiary(browser: BrowserSession, date = '2026-09-05') {
  const response = await browser.post('/api/diaries', { title: `Diary ${date}`, content: 'Decision context', date })
  expect(response.status).toBe(201)
  return response.json()
}

function mutate(browser: BrowserSession, path: string, method: 'PUT' | 'DELETE', body?: unknown) {
  return browser.request(path, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      'x-csrf-token': browser.cookies.get('csrf-token')!,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

it('round-trips every plan field and projects the owner Diary context', async () => {
  const browser = await login()
  const diary = await createDiary(browser)
  const response = await browser.post('/api/trade-plans', {
    diaryId: diary.id, symbol: 'aapl', setupType: ' Pullback ',
    entryPrice: '000180.120000', entryZoneLow: '179.000001', entryZoneHigh: '185.123456',
    stopLoss: 174.5, targetPrice: '205', maxPositionSize: '12000.10',
    invalidationCondition: ' Close below support ', notes: ' Wait for volume ', status: 'active',
  })
  expect(response.status).toBe(200)
  const plan = tradePlanResponseSchema.parse(await response.json())
  expect(plan).toMatchObject({
    userId: diary.userId, diaryId: diary.id, symbol: 'AAPL', setupType: 'Pullback',
    entryPrice: '180.12', entryZoneLow: '179.000001', entryZoneHigh: '185.123456',
    stopLoss: '174.5', targetPrice: '205', maxPositionSize: '12000.1',
    invalidationCondition: 'Close below support', notes: 'Wait for volume', status: 'active',
    diary: { id: diary.id, title: diary.title, date: diary.date, transactionCount: 0 },
  })
  expect(tradePlanResponseSchema.parse(await (await browser.request(`/api/trade-plans/${plan.id}`)).json())).toEqual(plan)

  const detail = await (await browser.request(`/api/diaries/${diary.id}`)).json()
  expect(detail.tradePlans).toEqual([expect.objectContaining({ id: plan.id, symbol: 'AAPL', status: 'active' })])
  const list = await (await browser.request('/api/diaries')).json()
  expect(list.data[0].tradePlanSummary).toEqual({ total: 1, statuses: [{ status: 'active', count: 1 }] })
  const review = await (await browser.request(`/api/diaries/${diary.id}/review`)).json()
  expect(review.tradePlans).toEqual([expect.objectContaining({ id: plan.id, entryPrice: '180.12' })])
})

it('validates entry zones against locked persisted state and never defaults status on partial PUT', async () => {
  const browser = await login()
  const plan = await (await browser.post('/api/trade-plans', {
    symbol: 'MSFT', entryZoneLow: '100.000001', entryZoneHigh: '200.000001', status: 'active',
  })).json()

  const invalidHigh = await mutate(browser, `/api/trade-plans/${plan.id}`, 'PUT', { entryZoneHigh: '100' })
  expect(invalidHigh.status).toBe(400)
  expect((await invalidHigh.json()).data.details).toEqual(expect.arrayContaining([
    expect.objectContaining({ field: 'entryZoneHigh' }),
  ]))
  const invalidLow = await mutate(browser, `/api/trade-plans/${plan.id}`, 'PUT', { entryZoneLow: '200.000002' })
  expect(invalidLow.status).toBe(400)

  const updated = tradePlanResponseSchema.parse(await (await mutate(
    browser, `/api/trade-plans/${plan.id}`, 'PUT', { notes: 'Only this field changes' },
  )).json())
  expect(updated).toMatchObject({ status: 'active', entryZoneLow: '100.000001', entryZoneHigh: '200.000001' })
})

it('rejects precision loss, invalid lifecycle values and unknown query keys before persistence', async () => {
  const browser = await login()
  for (const body of [
    { symbol: 'AAPL', entryPrice: '1234567890123.000001' },
    { symbol: 'AAPL', entryPrice: '1.0000001' },
    { symbol: 'AAPL', maxPositionSize: '1.001' },
    { symbol: 'AAPL', status: 'pending' },
    { symbol: 'AA-PL' },
  ]) expect((await browser.post('/api/trade-plans', body)).status).toBe(400)
  expect((await browser.request('/api/trade-plans?unknown=true')).status).toBe(400)
  expect((await (await browser.request('/api/trade-plans')).json()).pagination.total).toBe(0)
})

it('keeps plans owner-scoped and enforces the same-owner Diary invariant in API and database', async () => {
  const owner = await login(), other = await login()
  const ownerDiary = await createDiary(owner), otherDiary = await createDiary(other, '2026-09-06')
  const plan = await (await owner.post('/api/trade-plans', { symbol: 'NVDA', diaryId: ownerDiary.id })).json()

  expect((await other.request(`/api/trade-plans/${plan.id}`)).status).toBe(404)
  expect((await mutate(other, `/api/trade-plans/${plan.id}`, 'PUT', { status: 'closed' })).status).toBe(404)
  expect((await mutate(other, `/api/trade-plans/${plan.id}`, 'DELETE')).status).toBe(404)
  expect((await owner.post('/api/trade-plans', { symbol: 'NVDA', diaryId: otherDiary.id })).status).toBe(404)
  expect((await mutate(owner, `/api/trade-plans/${plan.id}`, 'PUT', { diaryId: otherDiary.id })).status).toBe(404)

  await expect(database.db.insert(tradePlans).values({
    userId: BigInt(ownerDiary.userId), diaryId: BigInt(otherDiary.id), symbol: 'FAIL',
  })).rejects.toMatchObject({ cause: expect.objectContaining({ code: '23503' }) })
})

it('filters, paginates and sorts plans deterministically, then unlinks on Diary deletion', async () => {
  const browser = await login(), diary = await createDiary(browser)
  const first = await (await browser.post('/api/trade-plans', { symbol: 'MSFT', diaryId: diary.id, status: 'draft' })).json()
  clock = new Date(clock.getTime() + 1_000)
  await browser.post('/api/trade-plans', { symbol: 'AAPL', status: 'active' })
  clock = new Date(clock.getTime() + 1_000)
  await browser.post('/api/trade-plans', { symbol: 'AAPL.US', status: 'active' })

  const filtered = tradePlanListResponseSchema.parse(await (
    await browser.request('/api/trade-plans?status=active&symbol=aapl&sortBy=symbol-asc&page=1&limit=1')
  ).json())
  expect(filtered.data.map(row => row.symbol)).toEqual(['AAPL'])
  expect(filtered.pagination).toEqual({ page: 1, limit: 1, total: 2, totalPages: 2 })
  const secondPage = tradePlanListResponseSchema.parse(await (
    await browser.request('/api/trade-plans?status=active&symbol=AAPL&sortBy=symbol-asc&page=2&limit=1')
  ).json())
  expect(secondPage.data.map(row => row.symbol)).toEqual(['AAPL.US'])

  expect((await mutate(browser, `/api/diaries/${diary.id}`, 'DELETE')).status).toBe(200)
  const unlinked = tradePlanResponseSchema.parse(await (await browser.request(`/api/trade-plans/${first.id}`)).json())
  expect(unlinked).toMatchObject({ diaryId: null, diary: null })
  expect((await mutate(browser, `/api/trade-plans/${first.id}`, 'DELETE')).status).toBe(200)
  expect((await browser.request(`/api/trade-plans/${first.id}`)).status).toBe(404)
})
