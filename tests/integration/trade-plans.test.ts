import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import { tradePlanListResponseSchema, tradePlanResponseSchema } from '@diary/contracts/trade-plan'
import { tradePlanExecutionComparisonSchema } from '@diary/contracts/trade-plan-execution'
import { tradePlans, transactions } from '@diary/db'
import { eq } from 'drizzle-orm'
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

async function writeExecution(browser: BrowserSession, path: string, method: 'POST' | 'PUT', body: unknown) {
  return browser.request(path, {
    method,
    headers: { 'content-type': 'application/json', 'x-csrf-token': browser.cookies.get('csrf-token')! },
    body: JSON.stringify(body),
  })
}

it('compares manually linked transactions with an immutable baseline and protects concurrent edits', async () => {
  const browser = await login()
  const diary = await createDiary(browser, '2026-09-05')
  const created = await browser.post('/api/diaries', {
    title: 'Execution evidence', content: 'Synthetic fills', date: '2026-09-06',
    transactions: [
      { symbol: 'AAPL', type: 'BUY', quantity: '10', price: '100', tradeDate: '2026-09-06T09:00:00Z' },
      { symbol: 'AAPL', type: 'BUY', quantity: '5', price: '110', tradeDate: '2026-09-06T10:00:00Z' },
      { symbol: 'AAPL', type: 'SELL', quantity: '2', price: '120', tradeDate: '2026-09-06T11:00:00Z' },
    ],
  })
  expect(created.status).toBe(201)
  const evidenceDiary = await created.json()
  const transactions = evidenceDiary.transactions as Array<{ id: string; type: string }>
  const plan = await (await browser.post('/api/trade-plans', {
    diaryId: diary.id, symbol: 'AAPL', entryPrice: '100', entryZoneLow: '100', entryZoneHigh: '105', maxPositionSize: '20',
  })).json()

  clock = new Date('2026-09-10T12:00:00Z')
  const baselineResponse = await writeExecution(browser, `/api/trade-plans/${plan.id}/execution-baseline`, 'POST', { expectedPlanUpdatedAt: plan.updatedAt, expectedBaselineVersion: null, expectedExecutionRevision: null })
  expect(baselineResponse.status).toBe(200)
  const baseline = tradePlanExecutionComparisonSchema.parse(await baselineResponse.json())
  expect(baseline).toMatchObject({ baseline: { version: 1, snapshot: { maxPositionSizeUnit: 'unknown' } }, executionRevision: 1, comparisonStatus: 'unavailable' })

  const selectedIds = transactions.filter(row => row.type === 'BUY').map(row => row.id)
  const linkedResponse = await writeExecution(browser, `/api/trade-plans/${plan.id}/execution`, 'PUT', {
    transactionIds: selectedIds, expectedExecutionRevision: baseline.executionRevision, baselineVersion: baseline.baseline?.version, deviationReason: 'Synthetic test fill',
  })
  expect(linkedResponse.status).toBe(200)
  const linked = tradePlanExecutionComparisonSchema.parse(await linkedResponse.json())
  expect(linked).toMatchObject({ comparisonStatus: 'ready', comparisonTiming: 'retrospective', executionRevision: 2, buyQuantity: '15', averageExecutionPrice: '103.333333', entryPriceDelta: '3.333333', entryZoneRelation: 'inside' })
  expect(linked.selectedTransactions).toHaveLength(2)

  expect(linked.selectedTransactions.every(transaction => transaction.snapshot && transaction.current)).toBe(true)

  const stale = await writeExecution(browser, `/api/trade-plans/${plan.id}/execution`, 'PUT', {
    transactionIds: [], expectedExecutionRevision: baseline.executionRevision, baselineVersion: baseline.baseline?.version,
  })
  expect(stale.status).toBe(409)
  const current = tradePlanExecutionComparisonSchema.parse(await (await browser.request(`/api/trade-plans/${plan.id}/execution`)).json())
  expect(current.executionRevision).toBe(2)
})

it('keeps baseline history and immutable selected snapshots through changed and deleted fills', async () => {
  const browser = await login()
  const evidence = await (await browser.post('/api/diaries', {
    title: 'Immutable execution evidence', content: 'Synthetic fill', date: '2026-09-01',
    transactions: [{ symbol: 'AAPL', type: 'BUY', quantity: '1', price: '100', tradeDate: '2026-09-01T09:00:00Z' }],
  })).json()
  const transactionId = evidence.transactions[0].id as string
  const plan = await (await browser.post('/api/trade-plans', { symbol: 'AAPL', entryPrice: '100' })).json()

  clock = new Date('2026-09-02T12:00:00Z')
  const first = tradePlanExecutionComparisonSchema.parse(await (await writeExecution(browser, `/api/trade-plans/${plan.id}/execution-baseline`, 'POST', {
    expectedPlanUpdatedAt: plan.updatedAt, expectedBaselineVersion: null, expectedExecutionRevision: null,
  })).json())
  expect(first.baselineHistory).toHaveLength(1)
  expect((await writeExecution(browser, `/api/trade-plans/${plan.id}/execution-baseline`, 'POST', {
    expectedPlanUpdatedAt: plan.updatedAt, expectedBaselineVersion: null, expectedExecutionRevision: null,
  })).status).toBe(409)

  clock = new Date('2026-09-03T12:00:00Z')
  const changedPlan = await mutate(browser, `/api/trade-plans/${plan.id}`, 'PUT', { entryPrice: '101' })
  expect(changedPlan.status).toBe(200)
  const latestPlan = await changedPlan.json()
  const second = tradePlanExecutionComparisonSchema.parse(await (await writeExecution(browser, `/api/trade-plans/${plan.id}/execution-baseline`, 'POST', {
    expectedPlanUpdatedAt: latestPlan.updatedAt, expectedBaselineVersion: 1, expectedExecutionRevision: 1,
  })).json())
  expect(second.baseline?.version).toBe(2)
  expect(second.baselineHistory.map(item => item.version)).toEqual([2, 1])

  const linked = tradePlanExecutionComparisonSchema.parse(await (await writeExecution(browser, `/api/trade-plans/${plan.id}/execution`, 'PUT', {
    transactionIds: [transactionId], baselineVersion: 2, expectedExecutionRevision: second.executionRevision,
  })).json())
  const relationId = linked.selectedTransactions[0]!.relationId
  await database.db.update(transactions).set({ price: '102' }).where(eq(transactions.id, BigInt(transactionId)))
  const changed = tradePlanExecutionComparisonSchema.parse(await (await writeExecution(browser, `/api/trade-plans/${plan.id}/execution`, 'PUT', {
    transactionIds: [transactionId], baselineVersion: 2, expectedExecutionRevision: linked.executionRevision, deviationReason: 'Changed fill',
  })).json())
  expect(changed.selectedTransactions[0]).toMatchObject({ selectionStatus: 'changed', snapshot: { price: '100' }, current: { price: '102' } })
  expect((await writeExecution(browser, `/api/trade-plans/${plan.id}/execution`, 'PUT', {
    transactionIds: [transactionId], removeRelationIds: [relationId], baselineVersion: 2, expectedExecutionRevision: changed.executionRevision,
  })).status).toBe(409)

  await database.db.delete(transactions).where(eq(transactions.id, BigInt(transactionId)))
  const missing = tradePlanExecutionComparisonSchema.parse(await (await browser.request(`/api/trade-plans/${plan.id}/execution`)).json())
  expect(missing).toMatchObject({ comparisonTiming: 'retrospective', invalidatedSelectionCount: 1, comparisonStatus: 'conflict' })
  expect(missing.selectedTransactions[0]).toMatchObject({ relationId, transactionId: null, selectionStatus: 'missing', snapshot: { id: transactionId, price: '100' } })
  const stillMissing = tradePlanExecutionComparisonSchema.parse(await (await writeExecution(browser, `/api/trade-plans/${plan.id}/execution`, 'PUT', {
    transactionIds: [], baselineVersion: 2, expectedExecutionRevision: missing.executionRevision, deviationReason: 'Keep missing evidence',
  })).json())
  expect(stillMissing.selectedTransactions[0]?.selectionStatus).toBe('missing')
  const removed = tradePlanExecutionComparisonSchema.parse(await (await writeExecution(browser, `/api/trade-plans/${plan.id}/execution`, 'PUT', {
    transactionIds: [], removeRelationIds: [relationId], baselineVersion: 2, expectedExecutionRevision: stillMissing.executionRevision,
  })).json())
  expect(removed.selectedTransactions).toHaveLength(0)
})

it('keeps same-owner transaction links exclusive and rejects cross-symbol selection', async () => {
  const browser = await login()
  const diary = await createDiary(browser, '2026-09-07')
  const created = await browser.post('/api/diaries', {
    title: 'Exclusive fills', content: 'Synthetic fills', date: '2026-09-08',
    transactions: [{ symbol: 'MSFT', type: 'BUY', quantity: '1', price: '20', tradeDate: '2026-09-08T09:00:00Z' }],
  })
  const evidence = await created.json()
  const transactionId = evidence.transactions[0].id as string
  const first = await (await browser.post('/api/trade-plans', { diaryId: diary.id, symbol: 'MSFT', entryPrice: '20' })).json()
  const second = await (await browser.post('/api/trade-plans', { symbol: 'MSFT', entryPrice: '20' })).json()
  const firstBaseline = tradePlanExecutionComparisonSchema.parse(await (await writeExecution(browser, `/api/trade-plans/${first.id}/execution-baseline`, 'POST', { expectedPlanUpdatedAt: first.updatedAt, expectedBaselineVersion: null, expectedExecutionRevision: null })).json())
  const firstLinked = await writeExecution(browser, `/api/trade-plans/${first.id}/execution`, 'PUT', { transactionIds: [transactionId], expectedExecutionRevision: firstBaseline.executionRevision, baselineVersion: 1 })
  expect(firstLinked.status).toBe(200)
  const secondBaseline = tradePlanExecutionComparisonSchema.parse(await (await writeExecution(browser, `/api/trade-plans/${second.id}/execution-baseline`, 'POST', { expectedPlanUpdatedAt: second.updatedAt, expectedBaselineVersion: null, expectedExecutionRevision: null })).json())
  expect((await writeExecution(browser, `/api/trade-plans/${second.id}/execution`, 'PUT', { transactionIds: [transactionId], expectedExecutionRevision: secondBaseline.executionRevision, baselineVersion: 1 })).status).toBe(409)
  const wrongSymbol = await (await browser.post('/api/trade-plans', { symbol: 'AAPL' })).json()
  const wrongBaseline = tradePlanExecutionComparisonSchema.parse(await (await writeExecution(browser, `/api/trade-plans/${wrongSymbol.id}/execution-baseline`, 'POST', { expectedPlanUpdatedAt: wrongSymbol.updatedAt, expectedBaselineVersion: null, expectedExecutionRevision: null })).json())
  expect((await writeExecution(browser, `/api/trade-plans/${wrongSymbol.id}/execution`, 'PUT', { transactionIds: [transactionId], expectedExecutionRevision: wrongBaseline.executionRevision, baselineVersion: 1 })).status).toBe(409)
})
