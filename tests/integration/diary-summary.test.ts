import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { performance } from 'node:perf_hooks'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { alerts, diaries, diaryStocks, stocks, transactions } from '@diary/db'
import { authUserResponseSchema } from '@diary/contracts'
import { diaryExcerpt } from '@diary/domain'
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

  // Spec §18 benchmark. listDiarySummaries materializes the full `content`
  // column (up to 500,000 chars per row) and builds the 240-char excerpt with
  // diaryExcerpt inside the API process. Measured on the local PG
  // (127.0.0.1:55433), 20 rows x 500k chars, median of 5 GETs:
  //   plain prose            ~63ms   -> full materialization is not the cost
  //   mixed shapes (5 rows whitespace-heavy) ~14.6s
  // The pathological total is excerpt CPU, not SQL: the
  // /^[>#\s]*[-*+]\s+/gm list-marker strip in diaryExcerpt
  // (packages/domain/src/timeline.ts) backtracks quadratically across
  // whitespace runs, ~2.85s per 500k-char body. Fix it there first if
  // real-world p95 shows a problem. A SQL-side left(content, N) bound is NOT
  // a faithful substitute: three fixture shapes (giant code fence, giant
  // link, whitespace run) strip away entirely inside the first N chars, so
  // diaryExcerpt(left(content, N)) diverges from diaryExcerpt(content) for
  // every N in {1000, 2000, 4000, 8000} (asserted below) while only plain
  // prose is prefix-stable. Decision: keep full materialization, no bound.
  it('benchmarks excerpt materialization for a 20-row page of max-size content', { timeout: 120_000 }, async () => {
    const a = await owner()
    const benchStart = performance.now()
    const total = 500_000
    const filler = 'Position review complete and the next checkpoint is scheduled. '
    const body = (head: string) => (head + filler.repeat(Math.ceil(total / filler.length))).slice(0, total)
    const fixtures: Array<{ kind: string; content: string }> = [
      { kind: 'plain', content: body('') },
      { kind: 'fence', content: body('```sql\n' + 'x'.repeat(100_000) + '\n```\n\n') },
      { kind: 'link', content: body(`Report [the full note](https://example.test/${'a'.repeat(100_000)}) and prose follows. `) },
      { kind: 'whitespace', content: body('\n\t '.repeat(33_334)) },
    ]
    const rows = Array.from({ length: 20 }, (_, index) => ({
      userId: a.userId, date: `2026-08-${String(1 + index).padStart(2, '0')}`,
      title: `Bench ${index}`, content: fixtures[index % fixtures.length]!.content,
    }))
    for (let start = 0; start < rows.length; start += 5) {
      await database.db.insert(diaries).values(rows.slice(start, start + 5))
    }
    console.log(`[summary excerpt benchmark] seed insert of 20 x 500k chars: ${(performance.now() - benchStart).toFixed(0)}ms (excluded from measurement)`)

    // Prefix-bound comparison: a `left(content, N)` excerpt is faithful only if
    // diaryExcerpt(slice) === diaryExcerpt(full) for every fixture shape.
    const divergences: Record<number, string[]> = {}
    for (const bound of [1000, 2000, 4000, 8000]) {
      divergences[bound] = fixtures.filter(({ content }) => diaryExcerpt(content.slice(0, bound)) !== diaryExcerpt(content)).map(row => row.kind)
    }
    console.log('[summary excerpt benchmark] diaryExcerpt(left(content, N)) diverges from diaryExcerpt(content):',
      JSON.stringify(divergences))
    // The pathological shapes diverge at every bound; only plain prose is stable.
    expect(divergences[1000]).toEqual(['fence', 'link', 'whitespace'])
    expect(divergences[8000]).toEqual(['fence', 'link', 'whitespace'])
    expect(diaryExcerpt(fixtures[0]!.content.slice(0, 1000))).toBe(diaryExcerpt(fixtures[0]!.content))

    const browser = a.browser
    await summaryPage(browser) // warm-up connection and caches, not measured
    const runs: number[] = []
    for (let run = 0; run < 5; run++) {
      const started = performance.now()
      const page = await summaryPage(browser, 'limit=50')
      runs.push(performance.now() - started)
      expect(page.data).toHaveLength(20)
      expect(page.data.every(item => item.excerpt.length > 0 && item.excerpt.length <= 241)).toBe(true)
    }
    const [median] = runs.slice().sort((x, y) => x - y).slice(2, 3)
    console.log(`[summary excerpt benchmark] GET /api/diaries/summary 20 rows x 500k chars, mixed shapes: median ${median!.toFixed(1)}ms (runs ${runs.map(value => value.toFixed(1)).join(', ')}ms)`)
    // Same page size and body size, plain prose only, isolates the
    // materialization + serialization cost from pathological excerpt CPU.
    await database.db.insert(diaries).values(Array.from({ length: 20 }, (_, index) => ({
      userId: a.userId, date: `2026-09-${String(1 + index).padStart(2, '0')}`,
      title: `Bench plain ${index}`, content: fixtures[0]!.content,
    })))
    const plainRuns: number[] = []
    await summaryPage(browser, 'dateFrom=2026-09-01&dateTo=2026-09-30') // warm-up
    for (let run = 0; run < 5; run++) {
      const started = performance.now()
      const page = await summaryPage(browser, 'dateFrom=2026-09-01&dateTo=2026-09-30')
      plainRuns.push(performance.now() - started)
      expect(page.data).toHaveLength(20)
    }
    const [plainMedian] = plainRuns.slice().sort((x, y) => x - y).slice(2, 3)
    console.log(`[summary excerpt benchmark] GET /api/diaries/summary 20 rows x 500k chars, plain prose: median ${plainMedian!.toFixed(1)}ms (runs ${plainRuns.map(value => value.toFixed(1)).join(', ')}ms)`)
  })
})
