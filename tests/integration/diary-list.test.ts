import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { eq } from 'drizzle-orm'
import { serve } from '@hono/node-server'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { diaries, diaryStocks, stocks } from '@diary/db'
import { authUserResponseSchema } from '@diary/contracts'
import { diaryListResponseSchema } from '../../packages/contracts/src/diary-list'
import { createApp } from '../../apps/api/src/app'
import { provisionTestDatabase } from '../support/database'
import { BrowserSession } from '../support/browser-session'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let server: ReturnType<typeof serve>
let baseUrl: string
const now = new Date('2026-09-05T12:00:00Z')
beforeAll(async () => { database = await provisionTestDatabase('diary_list') })
beforeEach(async () => {
  const app = createApp({ db: database.db, now: () => now, config: {
    jwtSecret: 'test-only-diary-list-secret-with-32-characters', nodeEnv: 'test',
    trustProxy: false, webOrigin: 'http://127.0.0.1',
  } })
  server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 })
  await once(server, 'listening')
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterEach(async () => { server.close(); await once(server, 'close') })
afterAll(async () => { await database?.dispose() })

async function owner() {
  const browser = new BrowserSession(baseUrl)
  const credentials = { email: `${randomUUID()}@example.test`, password: 'synthetic-search-password' }
  expect((await browser.post('/api/auth/register', credentials)).status).toBe(200)
  const response = await browser.post('/api/auth/login', credentials)
  expect(response.status).toBe(200)
  const account = authUserResponseSchema.parse(await response.json())
  return { browser, userId: BigInt(account.data.id) }
}
async function page(browser: BrowserSession, query = '') {
  const response = await browser.request(`/api/diaries${query ? `?${query}` : ''}`)
  expect(response.status).toBe(200)
  return diaryListResponseSchema.parse(await response.json())
}

describe('Diary list through HTTP and PostgreSQL ICU', () => {
  it('isolates owners and performs literal mixed-language title/content contains', async () => {
    const a = await owner(), b = await owner()
    await database.db.insert(diaries).values([
      { userId: a.userId, date: '2026-01-01', title: 'Alpha investment', content: '投資策略 mixed' },
      { userId: a.userId, date: '2026-01-02', title: '100%_literal', content: 'path\\segment' },
      { userId: a.userId, date: '2026-01-03', title: '100XYliteral', content: 'Ordinary note' },
      { userId: b.userId, date: '2026-01-01', title: 'Alpha investment secret', content: '投資策略 mixed' },
    ])
    for (const search of ['ALPHA', 'vest', '投資', '策略 MIXED']) {
      const result = await page(a.browser, new URLSearchParams({ search }).toString())
      expect(result.data.map(row => row.title)).toEqual(['Alpha investment'])
      expect(result.pagination.total).toBe(1)
    }
    for (const search of ['%_', '\\segment']) {
      expect((await page(a.browser, new URLSearchParams({ search }).toString())).data.map(row => row.title)).toEqual(['100%_literal'])
    }
    expect((await page(a.browser)).pagination.total).toBe(3)
    expect((await page(b.browser)).pagination.total).toBe(1)
    expect((await fetch(`${baseUrl}/api/diaries`)).status).toBe(401)
    expect((await a.browser.request('/api/diaries', { headers: { authorization: 'Bearer invalid' } })).status).toBe(401)
  })

  it('folds case and accents for title order and uses same-direction ID ties across pages', async () => {
    const { browser, userId } = await owner()
    const inserted = await database.db.insert(diaries).values([
      { userId, date: '2026-01-01', title: 'alpha', content: 'first' },
      { userId, date: '2026-01-02', title: 'Álpha', content: 'second' },
      { userId, date: '2026-01-03', title: 'Alpha', content: 'third' },
      { userId, date: '2026-01-04', title: 'Beta', content: 'fourth' },
    ]).returning({ id: diaries.id })
    const expected = inserted.map(row => row.id.toString())
    for (const [sortBy, ids] of [['title-asc', expected], ['title-desc', [...expected].reverse()]] as const) {
      const first = await page(browser, `sortBy=${sortBy}&limit=2&page=1`)
      const second = await page(browser, `sortBy=${sortBy}&limit=2&page=2`)
      expect([...first.data, ...second.data].map(row => row.id)).toEqual(ids)
      expect(first.pagination).toEqual({ page: 1, limit: 2, total: 4, totalPages: 2 })
    }
    expect((await page(browser, 'sortBy=date-asc')).data.map(row => row.id)).toEqual(expected)
    expect((await page(browser)).data.map(row => row.id)).toEqual([...expected].reverse())
  })

  it('includes date endpoints and only due pending reviews using the captured instant', async () => {
    const { browser, userId } = await owner()
    await database.db.insert(diaries).values([
      { userId, date: '2026-01-01', title: 'Before', content: 'x', reviewStatus: 'pending', reviewDueAt: new Date(now.getTime() - 1) },
      { userId, date: '2026-01-02', title: 'Boundary', content: 'x', reviewStatus: 'pending', reviewDueAt: now },
      { userId, date: '2026-01-03', title: 'Future', content: 'x', reviewStatus: 'pending', reviewDueAt: new Date(now.getTime() + 1) },
      { userId, date: '2026-01-04', title: 'Unscheduled', content: 'x', reviewStatus: 'pending' },
      { userId, date: '2026-01-05', title: 'Reviewed', content: 'x', reviewStatus: 'reviewed', reviewDueAt: now },
      { userId, date: '2026-01-06', title: 'None', content: 'x' },
    ])
    expect((await page(browser, 'reviewStatus=pending&sortBy=date-asc')).data.map(row => row.title)).toEqual(['Before', 'Boundary'])
    expect((await page(browser, 'dateFrom=2026-01-02&dateTo=2026-01-03&sortBy=date-asc')).data.map(row => row.title)).toEqual(['Boundary', 'Future'])
    expect((await page(browser, 'reviewStatus=reviewed')).data.map(row => row.title)).toEqual(['Reviewed'])
    expect((await page(browser, 'reviewStatus=none')).data.map(row => row.title)).toEqual(['None'])
  })

  it('validates canonical filters and reports empty/far-out pages without numeric overflow', async () => {
    const { browser } = await owner()
    const empty = await page(browser)
    expect(empty).toEqual({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } })
    const huge = await page(browser, 'page=9007199254740991&limit=100')
    expect(huge.data).toEqual([])
    expect(huge.pagination.page).toBe(Number.MAX_SAFE_INTEGER)
    for (const query of ['page=0', 'page=1.1', 'limit=101', 'limit=0', 'sortBy=date_desc', 'tag=x', 'tags=x', 'days=3', 'search=%20', 'symbol=%20', 'dateFrom=2026-02-30', 'dateFrom=2026-03-01&dateTo=2026-02-01', 'reviewStatus=unknown']) {
      const response = await browser.request(`/api/diaries?${query}`)
      expect(response.status, query).toBe(400)
      expect((await response.json()).data.code).toBe('SYS_VALIDATION_ERROR')
    }
  })

  it('filters by exact normalized symbol and searches reasoning fields and tags', async () => {
    const a = await owner(), b = await owner()
    const inserted = await database.db.insert(diaries).values([
      { userId: a.userId, date: '2026-02-01', title: 'Thesis note', content: 'plain', thesis: 'AI demand stays intact' },
      { userId: a.userId, date: '2026-02-02', title: 'Risk note', content: 'plain', risk: 'Valuation is stretched' },
      { userId: a.userId, date: '2026-02-03', title: 'Execution note', content: 'plain', execution: 'Add on strength' },
      { userId: a.userId, date: '2026-02-04', title: 'Tagged note', content: 'plain', tags: ['earnings'] },
      { userId: a.userId, date: '2026-02-05', title: 'Symbol note', content: 'plain' },
      { userId: b.userId, date: '2026-02-06', title: 'Other owner', content: 'plain' },
    ]).returning({ id: diaries.id })
    const [stock] = await database.db.insert(stocks).values({ symbol: 'ZZTEST' }).onConflictDoNothing().returning({ id: stocks.id })
    const stockId = stock?.id ?? (await database.db.select({ id: stocks.id }).from(stocks).where(eq(stocks.symbol, 'ZZTEST')))[0]!.id
    await database.db.insert(diaryStocks).values([
      { diaryId: inserted[4]!.id, stockId },
      { diaryId: inserted[5]!.id, stockId },
    ])
    for (const [search, title] of [['demand', 'Thesis note'], ['stretched', 'Risk note'], ['strength', 'Execution note'], ['earnings', 'Tagged note'], ['zztest', 'Symbol note']] as const) {
      const result = await page(a.browser, new URLSearchParams({ search }).toString())
      expect(result.data.map(row => row.title), search).toEqual([title])
    }
    for (const symbol of ['zztest', 'ZZTEST']) {
      const filtered = await page(a.browser, new URLSearchParams({ symbol }).toString())
      expect(filtered.data.map(row => row.title), symbol).toEqual(['Symbol note'])
      expect(filtered.pagination.total).toBe(1)
    }
    expect((await page(a.browser, 'symbol=NOPE')).data).toEqual([])
    expect((await page(a.browser, 'symbol=NOPE')).pagination.total).toBe(0)
  })
})
