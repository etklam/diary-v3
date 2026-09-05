import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from 'vitest'
import { authUserResponseSchema } from '@diary/contracts'
import { diaryActivityResponseSchema } from '@diary/contracts/diary-activity'
import { diaries, users } from '@diary/db'
import { eq } from 'drizzle-orm'
import { createApp } from '../../apps/api/src/app'
import { BrowserSession } from '../support/browser-session'
import { provisionTestDatabase } from '../support/database'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let server: ReturnType<typeof serve>, baseUrl: string
beforeAll(async () => { database = await provisionTestDatabase('diary_activity') })
beforeEach(async () => {
  const app = createApp({ db: database.db, config: {
    jwtSecret: 'synthetic-calendar-key-with-32-characters', nodeEnv: 'test', trustProxy: false, webOrigin: 'http://127.0.0.1',
  } })
  server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 })
  await once(server, 'listening'); baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterEach(async () => { server.close(); await once(server, 'close') })
afterAll(async () => { await database?.dispose() })
async function login() {
  const browser = new BrowserSession(baseUrl)
  const credentials = { email: `${randomUUID()}@example.test`, password: 'synthetic-calendar-password' }
  expect((await browser.post('/api/auth/register', credentials)).status).toBe(200)
  const response = await browser.post('/api/auth/login', credentials)
  const account = authUserResponseSchema.parse(await response.json())
  await browser.request('/api/auth/me')
  return { browser, id: BigInt(account.data.id) }
}

it('projects only bounded civil-date activity, exact transaction counts and owner IDs', async () => {
  const a = await login(), b = await login()
  const created = await (await a.browser.post('/api/diaries', {
    title: 'Private title', content: 'Private long content', date: '2026-03-08',
    transactions: [1, 2].map(quantity => ({ symbol: 'AAPL', type: 'BUY', quantity: String(quantity), price: '10', tradeDate: '2026-03-08T07:00:00Z' })),
  })).json()
  await database.db.insert(diaries).values([
    { userId: a.id, title: 'Before', content: 'x', date: '2026-02-28' },
    { userId: a.id, title: 'Last', content: 'x', date: '2026-03-31', reviewSummary: 'Never expose this' },
    { userId: a.id, title: 'After', content: 'x', date: '2026-04-01' },
    { userId: b.id, title: 'Other owner', content: 'x', date: '2026-03-08' },
  ])
  const reminder = await a.browser.post('/api/alerts', {
    diaryId: created.id, message: 'Check decision', triggerAt: '2026-03-09T09:00:00Z',
  })
  expect(reminder.status).toBe(200)
  const dismissed = await (await a.browser.post('/api/alerts', {
    diaryId: created.id, message: 'Completed', triggerAt: '2026-03-10T09:00:00Z',
  })).json()
  expect((await a.browser.request(`/api/alerts/${dismissed.id}/dismiss`, { method: 'PUT', headers: { 'x-csrf-token': a.browser.cookies.get('csrf-token')! } })).status).toBe(200)
  expect((await a.browser.post('/api/alerts', {
    diaryId: created.id, message: 'Future decision', triggerAt: '2027-03-09T09:00:00Z',
  })).status).toBe(200)
  for (const timezone of ['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'America/New_York']) {
    await database.db.update(users).set({ timezone }).where(eq(users.id, a.id))
    const response = await a.browser.request('/api/diaries/activity?dateFrom=2026-03-01&dateTo=2026-03-31')
    expect(response.status).toBe(200)
    const result = diaryActivityResponseSchema.parse(await response.json())
    expect(result.data.map(day => day.date)).toEqual(['2026-03-08', '2026-03-31'])
    expect(result.data[0]).toEqual({ date: '2026-03-08', diaryId: created.id, alertCount: 2, transactionCount: 2 })
    expect(Object.keys(result.data[1]!).sort()).toEqual(['alertCount', 'date', 'diaryId', 'transactionCount'])
  }
  const own = await b.browser.request('/api/diaries/activity?dateFrom=2026-03-01&dateTo=2026-03-31')
  const otherDays = diaryActivityResponseSchema.parse(await own.json()).data
  expect(otherDays).toHaveLength(1)
  expect(otherDays[0]).toMatchObject({ alertCount: 0, transactionCount: 0 })
  expect(otherDays[0]!.diaryId).not.toBe(created.id)
  expect((await fetch(`${baseUrl}/api/diaries/activity?dateFrom=2026-03-01&dateTo=2026-03-31`)).status).toBe(401)
  expect((await a.browser.request('/api/diaries/activity?dateFrom=2026-03-01&dateTo=2026-03-31', { headers: { authorization: 'Bearer invalid' } })).status).toBe(401)
})

it('accepts the 371-day boundary and leap day, rejects reversed or oversized windows', async () => {
  const { browser } = await login()
  for (const [dateFrom, dateTo] of [['2024-02-29', '2024-02-29'], ['2026-01-01', '2027-01-06']]) {
    const response = await browser.request(`/api/diaries/activity?dateFrom=${dateFrom}&dateTo=${dateTo}`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: [], dateFrom, dateTo })
  }
  for (const query of ['', 'dateFrom=2026-01-01', 'dateFrom=2026-01-01&dateTo=2027-01-07', 'dateFrom=2026-03-01&dateTo=2026-02-28', 'dateFrom=2026-02-29&dateTo=2026-03-01']) {
    const response = await browser.request(`/api/diaries/activity?${query}`)
    expect(response.status).toBe(400)
    expect((await response.json()).data.code).toBe('SYS_VALIDATION_ERROR')
  }
})
