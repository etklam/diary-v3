import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from 'vitest'
import { authUserResponseSchema } from '@diary/contracts'
import { activityTimelineResponseSchema } from '@diary/contracts/activity-timeline'
import { diaries, investmentTheses, stocks, thesisReviews, users } from '@diary/db'
import { eq } from 'drizzle-orm'
import { createApp } from '../../apps/api/src/app'
import { BrowserSession } from '../support/browser-session'
import { provisionTestDatabase } from '../support/database'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let server: ReturnType<typeof serve>, baseUrl: string
beforeAll(async () => { database = await provisionTestDatabase('activity_timeline') })
beforeEach(async () => {
  const app = createApp({ db: database.db, config: {
    jwtSecret: 'synthetic-timeline-key-with-32-characters', nodeEnv: 'test', trustProxy: false, webOrigin: 'http://127.0.0.1',
  } })
  server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 })
  await once(server, 'listening'); baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterEach(async () => { server.close(); await once(server, 'close') })
afterAll(async () => { await database?.dispose() })

async function login() {
  const browser = new BrowserSession(baseUrl)
  const credentials = { email: `${randomUUID()}@example.test`, password: 'synthetic-timeline-password' }
  expect((await browser.post('/api/auth/register', credentials)).status).toBe(200)
  const response = await browser.post('/api/auth/login', credentials)
  const account = authUserResponseSchema.parse(await response.json())
  await browser.request('/api/auth/me')
  return { browser, id: BigInt(account.data.id) }
}

async function read(browser: BrowserSession, query = '') {
  const response = await browser.request(`/api/timeline${query}`)
  expect(response.status).toBe(200)
  return activityTimelineResponseSchema.parse(await response.json())
}

it('merges diaries, trades and both review kinds into one ordered feed', async () => {
  const owner = await login(), other = await login()
  await database.db.update(users).set({ timezone: 'Asia/Taipei' }).where(eq(users.id, owner.id))

  const opened = await owner.browser.post('/api/diaries', {
    title: 'Opened the position', content: 'First entry.', date: '2026-05-05',
    transactions: [{ symbol: 'AAPL', type: 'BUY', quantity: '20', price: '170', tradeDate: '2026-05-05T06:00:00Z' }],
  })
  expect(opened.status).toBe(201)

  // A diary on the 10th whose trade was booked on the 12th: the trade has to
  // appear on the 12th, which is the gap the diary-anchored feed could not show.
  const response = await owner.browser.post('/api/diaries', {
    title: 'Scaled into the position', content: 'The original reasoning, at length.',
    date: '2026-05-10', tags: ['research', 'longterm'], stockSymbols: ['AAPL'],
    transactions: [
      { symbol: 'AAPL', type: 'BUY', quantity: '10', price: '180.5', tradeDate: '2026-05-12T01:30:00Z', notes: 'Added on the pullback.', strategy: 'pullback' },
      { symbol: 'AAPL', type: 'SELL', quantity: '4', price: '191', tradeDate: '2026-05-10T06:00:00Z' },
    ],
  })
  expect(response.status).toBe(201)
  const diary = await response.json()

  await database.db.insert(diaries).values({
    userId: owner.id, title: 'An earlier judgment', content: 'Earlier reasoning.', date: '2026-05-01',
    reviewStatus: 'reviewed', reviewedAt: new Date('2026-05-14T02:00:00Z'), reviewOutcome: 'PARTIAL',
    reviewSummary: 'Never expose this', reviewLearning: 'Never expose this either',
  })
  await database.db.insert(diaries).values({
    userId: other.id, title: 'Another owner', content: 'x', date: '2026-05-11',
  })

  const [stock] = await database.db.insert(stocks).values({ symbol: 'NVDA' }).returning()
  const [thesis] = await database.db.insert(investmentTheses).values({
    userId: owner.id, stockId: stock!.id, status: 'ACTIVE', summary: 'Compute demand', whyIOwnIt: 'Durable lead',
  }).returning()
  await database.db.insert(thesisReviews).values({
    thesisId: thesis!.id, userId: owner.id, reviewedAt: new Date('2026-05-13T08:00:00Z'),
    outcome: 'INTACT', portfolioDecision: 'HOLD', whatImproved: 'Never expose this',
    invalidationTriggered: false, snapshotStatus: 'ACTIVE',
  })

  const result = await read(owner.browser, '?limit=100')
  expect(result.pagination.total).toBe(8)
  // Within a day the feed reads diary, then trades, then reviews.
  expect(result.data.map(event => [event.date, event.kind])).toEqual([
    ['2026-05-14', 'REVIEW'],
    ['2026-05-13', 'THESIS_REVIEW'],
    ['2026-05-12', 'TRADE'],
    ['2026-05-10', 'DIARY'],
    ['2026-05-10', 'TRADE'],
    ['2026-05-05', 'DIARY'],
    ['2026-05-05', 'TRADE'],
    ['2026-05-01', 'DIARY'],
  ])

  // No private reflection text on the wire, for either review kind.
  expect(JSON.stringify(result)).not.toContain('Never expose this')
  expect(JSON.stringify(result)).not.toContain('reviewSummary')

  const trade = result.data.find(event => event.kind === 'TRADE' && event.date === '2026-05-12')
  expect(trade).toMatchObject({
    kind: 'TRADE', symbol: 'AAPL', type: 'BUY', quantity: '10', price: '180.5',
    strategy: 'pullback', notesExcerpt: 'Added on the pullback.',
    // The originating diary stays reachable, with its own date for context.
    diaryId: diary.id, diaryTitle: 'Scaled into the position', diaryDate: '2026-05-10',
    occurredAt: '2026-05-12T01:30:00.000Z',
  })

  const diaryEvent = result.data.find(event => event.kind === 'DIARY' && event.date === '2026-05-10')
  expect(diaryEvent).toMatchObject({
    kind: 'DIARY', id: `DIARY:${diary.id}`, diaryId: diary.id, occurredAt: null,
    excerpt: 'The original reasoning, at length.', tags: ['research', 'longterm'],
    stockSymbols: ['AAPL'], transactionCount: 2, alertCount: 0, createdVia: 'WEB',
  })

  const review = result.data.find(event => event.kind === 'REVIEW')
  expect(review).toMatchObject({
    kind: 'REVIEW', title: 'An earlier judgment', outcome: 'PARTIAL',
    // The review sits on the day it was completed; the judgment it closes keeps its own date.
    date: '2026-05-14', diaryDate: '2026-05-01', occurredAt: '2026-05-14T02:00:00.000Z',
  })

  expect(result.data.find(event => event.kind === 'THESIS_REVIEW')).toMatchObject({
    kind: 'THESIS_REVIEW', symbol: 'NVDA', outcome: 'INTACT',
    portfolioDecision: 'HOLD', invalidationTriggered: false,
  })

  // Another account's records never enter this feed.
  const otherResult = await read(other.browser)
  expect(otherResult.pagination.total).toBe(1)
  expect(otherResult.data[0]).toMatchObject({ kind: 'DIARY', title: 'Another owner' })
})

it('resolves each event date in the account timezone', async () => {
  const owner = await login()
  await owner.browser.post('/api/diaries', {
    title: 'Booked near midnight', content: 'x', date: '2026-06-01',
    transactions: [{ symbol: 'MSFT', type: 'BUY', quantity: '1', price: '400', tradeDate: '2026-06-01T23:30:00Z' }],
  })
  for (const [timezone, expected] of [
    ['Etc/UTC', '2026-06-01'],
    ['Asia/Taipei', '2026-06-02'],
    ['Pacific/Pago_Pago', '2026-06-01'],
  ] as const) {
    await database.db.update(users).set({ timezone }).where(eq(users.id, owner.id))
    const result = await read(owner.browser, '?group=trade')
    expect(result.data.map(event => event.date)).toEqual([expected])
  }
})

it('filters by reading group and by a range each kind resolves on its own date', async () => {
  const owner = await login()
  await database.db.update(users).set({ timezone: 'Etc/UTC' }).where(eq(users.id, owner.id))
  await owner.browser.post('/api/diaries', {
    title: 'Opening judgment', content: 'x', date: '2026-07-01',
    transactions: [{ symbol: 'AMD', type: 'BUY', quantity: '2', price: '150', tradeDate: '2026-07-20T12:00:00Z' }],
  })
  await database.db.insert(diaries).values({
    userId: owner.id, title: 'Closed out', content: 'x', date: '2026-07-02',
    reviewStatus: 'reviewed', reviewedAt: new Date('2026-07-25T12:00:00Z'), reviewOutcome: 'INTACT',
  })

  expect((await read(owner.browser, '?group=diary')).data.map(event => event.kind)).toEqual(['DIARY', 'DIARY'])
  expect((await read(owner.browser, '?group=trade')).data.map(event => event.kind)).toEqual(['TRADE'])
  expect((await read(owner.browser, '?group=review')).data.map(event => event.kind)).toEqual(['REVIEW'])

  // The window is applied to each event's own date, so it selects the trade and
  // the review without selecting the July 1 and July 2 diaries they belong to.
  const window = await read(owner.browser, '?dateFrom=2026-07-15&dateTo=2026-07-31')
  expect(window.data.map(event => [event.date, event.kind])).toEqual([
    ['2026-07-25', 'REVIEW'], ['2026-07-20', 'TRADE'],
  ])
  expect(window.pagination.total).toBe(2)
})

it('pages a stable order and rejects an invalid query', async () => {
  const owner = await login()
  for (let day = 1; day <= 5; day += 1) {
    expect((await owner.browser.post('/api/diaries', {
      title: `August ${day}`, content: 'x', date: `2026-08-0${day}`,
    })).status).toBe(201)
  }
  const first = await read(owner.browser, '?page=1&limit=2')
  const second = await read(owner.browser, '?page=2&limit=2')
  const third = await read(owner.browser, '?page=3&limit=2')
  expect(first.pagination).toEqual({ page: 1, limit: 2, total: 5, totalPages: 3 })
  expect(first.data.map(event => event.date)).toEqual(['2026-08-05', '2026-08-04'])
  expect(second.data.map(event => event.date)).toEqual(['2026-08-03', '2026-08-02'])
  expect(third.data.map(event => event.date)).toEqual(['2026-08-01'])
  // No id is served twice across page boundaries.
  const ids = [...first.data, ...second.data, ...third.data].map(event => event.id)
  expect(new Set(ids).size).toBe(5)

  const beyond = await read(owner.browser, '?page=9&limit=2')
  expect(beyond.data).toEqual([])
  expect(beyond.pagination.total).toBe(5)

  for (const query of ['?limit=101', '?dateFrom=2026-03-01&dateTo=2026-02-28', '?group=alerts', '?page=0']) {
    const response = await owner.browser.request(`/api/timeline${query}`)
    expect(response.status).toBe(400)
    expect((await response.json()).data.code).toBe('SYS_VALIDATION_ERROR')
  }
  expect((await fetch(`${baseUrl}/api/timeline`)).status).toBe(401)
})
