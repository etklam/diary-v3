import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { alerts, diaries, diaryStocks, stocks, transactions } from '@diary/db'
import { authUserResponseSchema } from '@diary/contracts'
import { diaryListResponseSchema } from '../../packages/contracts/src/diary-list'
import { diarySummaryListResponseSchema } from '../../packages/contracts/src/diary-summary'
import { createApp } from '../../apps/api/src/app'
import { provisionTestDatabase } from '../support/database'
import { BrowserSession } from '../support/browser-session'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let server: ReturnType<typeof serve>
let baseUrl: string
const now = new Date('2026-09-05T12:00:00Z')
beforeAll(async () => { database = await provisionTestDatabase('diary_summary') })
beforeEach(async () => {
  const app = createApp({ db: database.db, now: () => now, config: {
    jwtSecret: 'test-only-diary-summary-secret-with-32ch', nodeEnv: 'test',
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
  const credentials = { email: `${randomUUID()}@example.test`, password: 'synthetic-summary-password' }
  expect((await browser.post('/api/auth/register', credentials)).status).toBe(200)
  const response = await browser.post('/api/auth/login', credentials)
  expect(response.status).toBe(200)
  const account = authUserResponseSchema.parse(await response.json())
  return { browser, userId: BigInt(account.data.id) }
}
async function summaryPage(browser: BrowserSession, query = '') {
  const response = await browser.request(`/api/diaries/summary${query ? `?${query}` : ''}`)
  expect(response.status).toBe(200)
  return diarySummaryListResponseSchema.parse(await response.json())
}

const PROSE = 'Evidence accumulates slowly and the thesis needs the next report. '

// Heavy markdown body: >20,000 characters with a heading, a code fence and two
// links so the excerpt generation is exercised against real structure.
function heavyContent(seed: string, needle?: string) {
  return [
    `## Decision ${seed}`,
    '',
    '```sql',
    'select 1; -- this fence must never reach the excerpt',
    '```',
    '',
    `Reference [the report](https://example.test/${seed}) and https://cdn.example.test/${seed}.png`,
    '',
    ...(needle ? [`${needle} marks the searchable body.`] : []),
    '',
    PROSE.repeat(380),
  ].join('\n')
}

async function seedHeavyFixture(userId: bigint) {
  const rows = Array.from({ length: 52 }, (_, index) => ({
    userId, date: new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10),
    title: `Summary ${index}`,
    content: heavyContent(String(index), index === 10 ? 'summaryneedle' : undefined),
    tags: index === 0 ? ['research', 'evidence', 'long-term', 'extra-a', 'extra-b'] : [],
    reviewStatus: index === 0 ? 'reviewed' as const : index <= 2 ? 'pending' as const : 'none' as const,
    reviewDueAt: index === 0 ? null : index === 1 ? new Date(now.getTime() - 1000) : index === 2 ? new Date(now.getTime() + 1000) : null,
    reviewOutcome: index === 0 ? 'PARTIAL' as const : null,
    reviewSummary: index === 0 ? 'Private review summary' : null,
    reviewLearning: index === 0 ? 'Private review learning' : null,
    reviewAdjustment: index === 0 ? 'Private review adjustment' : null,
  }))
  const inserted = await database.db.insert(diaries).values(rows).returning({ id: diaries.id })
  await database.db.insert(transactions).values(
    [0, 1].flatMap(index => Array.from({ length: 12 }, () => ({
      diaryId: inserted[index]!.id, userId, symbol: 'AAPL', type: 'BUY' as const,
      quantity: '1', price: '10', tradeDate: new Date('2026-01-01T00:00:00Z'),
    }))),
  )
  await database.db.insert(alerts).values(
    [0, 1, 2, 3, 4].flatMap(index => [
      { diaryId: inserted[index]!.id, message: `Check decision ${index}`, triggerAt: new Date('2026-02-01T09:00:00Z'), isDismissed: index === 0 },
      { diaryId: inserted[index]!.id, message: `Follow up ${index}`, triggerAt: new Date('2026-02-02T09:00:00Z') },
      { diaryId: inserted[index]!.id, message: `Revisit ${index}`, triggerAt: new Date('2026-02-03T09:00:00Z') },
    ]),
  )
  const [stock] = await database.db.insert(stocks).values({ symbol: 'ZZSUM' }).onConflictDoNothing().returning({ id: stocks.id })
  const stockId = stock?.id ?? (await database.db.select({ id: stocks.id }).from(stocks).where(eq(stocks.symbol, 'ZZSUM')))[0]!.id
  await database.db.insert(diaryStocks).values({ diaryId: inserted[0]!.id, stockId })
  return inserted.map(row => row.id.toString())
}

const SUMMARY_KEYS = ['alertCount', 'createdVia', 'date', 'excerpt', 'id', 'reviewDueAt', 'reviewOutcome', 'reviewStatus', 'stockSymbols', 'tags', 'title', 'transactionCount'].sort()

describe('Diary summary discovery feed', () => {
  it('returns bounded summaries with SQL-aggregated counts and no full-graph fields', async () => {
    const a = await owner()
    const ids = await seedHeavyFixture(a.userId)
    const result = await summaryPage(a.browser, 'limit=50&sortBy=date-asc')
    expect(result.pagination).toEqual({ page: 1, limit: 50, total: 52, totalPages: 2 })
    expect(result.data).toHaveLength(50)
    for (const item of result.data) {
      expect(Object.keys(item).sort()).toEqual(SUMMARY_KEYS)
      expect(item.excerpt.length).toBeLessThan(300)
      expect(item.excerpt).not.toContain('```')
      expect(item.excerpt).not.toContain('](')
      expect(item.excerpt).not.toContain('https://')
      expect(item.excerpt).not.toContain('never reach the excerpt')
      expect(item.tags.length).toBeLessThanOrEqual(3)
      expect(item.stockSymbols.length).toBeLessThanOrEqual(10)
    }
    const byTitle = new Map(result.data.map(item => [item.title, item]))
    const reviewed = byTitle.get('Summary 0')!
    expect(reviewed.id).toBe(ids[0])
    expect(reviewed.excerpt).toMatch(/^Decision 0 Reference the report and /)
    expect(reviewed.tags).toEqual(['research', 'evidence', 'long-term'])
    expect(reviewed.stockSymbols).toEqual(['ZZSUM'])
    expect(reviewed.transactionCount).toBe(12)
    expect(reviewed.alertCount).toBe(2)
    expect(reviewed.reviewStatus).toBe('reviewed')
    expect(reviewed.reviewOutcome).toBe('PARTIAL')
    expect(reviewed.createdVia).toBe('WEB')
    expect(byTitle.get('Summary 1')).toMatchObject({ transactionCount: 12, alertCount: 3, reviewStatus: 'pending', reviewDueAt: '2026-09-05T11:59:59.000Z', reviewOutcome: null })
    expect(byTitle.get('Summary 2')).toMatchObject({ transactionCount: 0, alertCount: 3, reviewStatus: 'pending' })
    expect(byTitle.get('Summary 3')).toMatchObject({ transactionCount: 0, alertCount: 3, reviewStatus: 'none' })
    // The whole summary page stays byte-bounded even with 20k+ character bodies.
    const payloadBytes = Buffer.byteLength(JSON.stringify(result))
    expect(payloadBytes).toBeLessThan(100_000)
    const rest = await summaryPage(a.browser, 'limit=50&page=2&sortBy=date-asc')
    expect(rest.pagination).toEqual({ page: 2, limit: 50, total: 52, totalPages: 2 })
    expect(rest.data).toHaveLength(2)
    // Full-graph field names never appear anywhere in the payload.
    const raw = JSON.stringify([result, rest])
    for (const forbidden of ['content', 'thesis', 'risk', 'execution', 'reviewSummary', 'reviewLearning', 'reviewAdjustment', 'reviewedAt', 'transactions', 'alerts', 'tradePlans', 'tradePlanSummary', 'userId', 'createdAt', 'updatedAt', 'createdByLabel', 'tagsString']) {
      expect(raw, forbidden).not.toContain(`"${forbidden}":`)
    }
    expect((await fetch(`${baseUrl}/api/diaries/summary`)).status).toBe(401)
    expect((await a.browser.request('/api/diaries/summary', { headers: { authorization: 'Bearer invalid' } })).status).toBe(401)
  })

  it('matches list filter, search, sort and review-status semantics on the summary endpoint', async () => {
    const a = await owner(), b = await owner()
    await seedHeavyFixture(a.userId)
    await database.db.insert(diaries).values({ userId: b.userId, date: '2026-01-01', title: 'Other owner', content: 'summaryneedle elsewhere' })
    const needle = await summaryPage(a.browser, new URLSearchParams({ search: 'summaryneedle' }).toString())
    expect(needle.pagination.total).toBe(1)
    expect(needle.data.map(row => row.title)).toEqual(['Summary 10'])
    for (const symbol of ['zzsum', 'ZZSUM']) {
      const filtered = await summaryPage(a.browser, new URLSearchParams({ symbol }).toString())
      expect(filtered.data.map(row => row.title)).toEqual(['Summary 0'])
      expect(filtered.pagination.total).toBe(1)
    }
    expect((await summaryPage(a.browser, 'dateFrom=2026-01-01&dateTo=2026-01-02')).data.map(row => row.title)).toEqual(['Summary 1', 'Summary 0'])
    expect((await summaryPage(a.browser, 'sortBy=date-asc')).data[0]!.title).toBe('Summary 0')
    // reviewStatus=pending keeps the due-at-or-before filter taken from `now`.
    expect((await summaryPage(a.browser, 'reviewStatus=pending')).data.map(row => row.title)).toEqual(['Summary 1'])
    expect((await summaryPage(a.browser, 'reviewStatus=reviewed')).data.map(row => row.title)).toEqual(['Summary 0'])
    const invalid = await a.browser.request('/api/diaries/summary?page=0')
    expect(invalid.status).toBe(400)
    expect((await invalid.json()).data.code).toBe('SYS_VALIDATION_ERROR')
    const other = await summaryPage(b.browser)
    expect(other.pagination.total).toBe(1)
    expect(other.data[0]!.title).toBe('Other owner')
  })

  it('keeps GET /api/diaries on the full-fidelity response for backward compatibility', async () => {
    const a = await owner()
    await seedHeavyFixture(a.userId)
    const oldest = diaryListResponseSchema.parse(await (await a.browser.request('/api/diaries?limit=1&sortBy=date-asc')).json())
    expect(oldest.pagination.total).toBe(52)
    const diary = oldest.data[0]!
    expect(diary.title).toBe('Summary 0')
    expect(diary.content).toBeTruthy()
    expect(diary.content!.length).toBeGreaterThan(20_000)
    expect(diary.reviewSummary).toBe('Private review summary')
    expect(diary.reviewLearning).toBe('Private review learning')
    expect(diary.reviewAdjustment).toBe('Private review adjustment')
    expect(diary.transactions).toHaveLength(12)
    expect(diary.alerts).toHaveLength(3)
    expect(diary.stockSymbols).toEqual(['ZZSUM'])
    expect(diary.userId).toBe(a.userId.toString())
  })
})
