import { mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import { drizzle } from 'drizzle-orm/node-postgres'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createApp } from '../../apps/api/src/app'
import { createMarketData } from '../../apps/api/src/market-data'
import { diaries, schema, transactions, users } from '@diary/db'
import { BrowserSession } from '../support/browser-session'
import { provisionTestDatabase } from '../support/database'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
const clock = new Date('2026-09-05T12:00:00.000Z')
const config = {
  jwtSecret: 'synthetic-integrated-portfolio-secret-32-characters',
  nodeEnv: 'test' as const,
  trustProxy: false,
  webOrigin: 'http://127.0.0.1',
}

beforeAll(async () => { database = await provisionTestDatabase('integrated_portfolio') })
afterAll(async () => { await database?.dispose() })

type Observation = {
  queries: string[]
  quoteCalls: Map<string, number>
  server: ReturnType<typeof serve>
  baseUrl: string
}

async function startObservedApp(): Promise<Observation> {
  const queries: string[] = []
  const quoteCalls = new Map<string, number>()
  const db = drizzle(database.pool, { schema, logger: { logQuery(query) { queries.push(query) } } })
  const marketData = createMarketData({
    now: () => clock,
    timeoutMs: 100,
    upstream: {
      quote: async symbol => {
        quoteCalls.set(symbol, (quoteCalls.get(symbol) ?? 0) + 1)
        return {
          symbol,
          regularMarketPrice: 120,
          regularMarketPreviousClose: 100,
          regularMarketTime: clock,
          marketState: 'REGULAR',
        }
      },
      chart: async () => ({ quotes: [] }),
    },
  })
  const app = createApp({ db, now: () => clock, marketData, config })
  const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 })
  await once(server, 'listening')
  return { queries, quoteCalls, server, baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}` }
}

async function close(server: ReturnType<typeof serve>) {
  server.close()
  await once(server, 'close')
}

function sessionAt(baseUrl: string, cookies: ReadonlyMap<string, string>) {
  const browser = new BrowserSession(baseUrl)
  for (const [key, value] of cookies) browser.cookies.set(key, value)
  return browser
}

async function register(baseUrl: string) {
  const browser = new BrowserSession(baseUrl)
  const email = `${randomUUID()}@example.test`
  const credentials = { email, password: 'synthetic-integrated-password' }
  expect((await browser.post('/api/auth/register', credentials)).status).toBe(200)
  expect((await browser.post('/api/auth/login', credentials)).status).toBe(200)
  expect((await browser.request('/api/auth/me')).status).toBe(200)
  const [user] = await database.db.select({ id: users.id }).from(users).where(eq(users.email, email))
  if (!user) throw new Error('Synthetic owner was not created')
  return { browser, userId: user.id }
}

async function seedLedger(userId: bigint, holdingCount: number, transactionCount: number) {
  const [diary] = await database.db.insert(diaries).values({
    userId,
    title: `${holdingCount} holding portfolio`,
    content: 'Synthetic integrated portfolio fixture',
    date: holdingCount === 20 ? '2026-08-20' : '2026-08-21',
  }).returning({ id: diaries.id })
  if (!diary) throw new Error('Synthetic diary was not created')
  const perHolding = transactionCount / holdingCount
  const rows = Array.from({ length: transactionCount }, (_, index) => {
    const symbolIndex = Math.floor(index / perHolding)
    const withinSymbol = index % perHolding
    const buy = withinSymbol % 2 === 0
    return {
      diaryId: diary.id,
      userId,
      symbol: `S${symbolIndex.toString().padStart(3, '0')}`,
      type: buy ? 'BUY' as const : 'SELL' as const,
      quantity: buy ? '2' : '1',
      price: buy ? '100' : '110',
      tradeDate: new Date(Date.UTC(2026, 7, 20, 0, 0, index)),
    }
  })
  for (let start = 0; start < rows.length; start += 1_000) {
    await database.db.insert(transactions).values(rows.slice(start, start + 1_000))
  }
}

function fullLedgerReadCount(queries: readonly string[]) {
  return queries.filter(query => {
    const normalized = query.toLowerCase().replaceAll(/\s+/g, ' ')
    const from = normalized.indexOf('from "transactions" where')
    if (from < 0) return false
    const predicate = normalized.slice(from + 'from "transactions" where'.length).split(' order by', 1)[0] ?? ''
    return predicate.includes('"transactions"."user_id"') && !predicate.includes('"transactions"."diary_id"')
  }).length
}

const baselinePaths = [
  '/api/stocks/holdings',
  '/api/portfolio/attention',
  '/api/stocks/portfolio',
  '/api/stocks/exposure',
  '/api/stats/recent-trades?days=30&limit=50',
] as const
const integratedPaths = ['/api/portfolio/ledger', '/api/portfolio/overview'] as const

async function sample(browser: BrowserSession, paths: readonly string[]) {
  const started = performance.now()
  const responses = await Promise.all(paths.map(path => browser.request(path)))
  for (const response of responses) expect(response.status).toBe(200)
  const texts = await Promise.all(responses.map(response => response.text()))
  const elapsedMs = performance.now() - started
  return { elapsedMs, bytes: texts.reduce((total, text) => total + Buffer.byteLength(text), 0), bodies: texts.map(text => JSON.parse(text)) }
}

function median(values: readonly number[]) {
  const ordered = [...values].sort((left, right) => left - right)
  return ordered[Math.floor(ordered.length / 2)]!
}

it.each([
  { holdings: 20, transactions: 1_000 },
  { holdings: 100, transactions: 10_000 },
])('preserves five-endpoint payloads with two ledger replays for $holdings holdings and $transactions transactions', async fixture => {
  const bootstrap = await startObservedApp()
  const owner = await register(bootstrap.baseUrl)
  await seedLedger(owner.userId, fixture.holdings, fixture.transactions)
  const cookies = new Map(owner.browser.cookies)
  await close(bootstrap.server)

  const baseline = await startObservedApp()
  const baselineBrowser = sessionAt(baseline.baseUrl, cookies)
  await sample(baselineBrowser, baselinePaths)
  baseline.queries.length = 0
  const baselineSamples = []
  for (let index = 0; index < 5; index++) baselineSamples.push(await sample(baselineBrowser, baselinePaths))
  await close(baseline.server)

  const integrated = await startObservedApp()
  const integratedBrowser = sessionAt(integrated.baseUrl, cookies)
  await sample(integratedBrowser, integratedPaths)
  integrated.queries.length = 0
  const integratedSamples = []
  for (let index = 0; index < 5; index++) integratedSamples.push(await sample(integratedBrowser, integratedPaths))
  await close(integrated.server)

  const [holdings, attention, valuation, exposure, recent] = baselineSamples[0]!.bodies
  const [ledger, overview] = integratedSamples[0]!.bodies
  expect(ledger).toMatchObject({ holdings, recent, exposure: { status: 'ready', data: exposure } })
  expect(overview).toMatchObject({
    valuation: { status: 'ready', data: valuation },
    attention: { status: 'ready', data: attention },
  })
  expect(fullLedgerReadCount(baseline.queries)).toBe(25)
  expect(fullLedgerReadCount(integrated.queries)).toBe(10)
  expect([...baseline.quoteCalls.values()].reduce((sum, count) => sum + count, 0)).toBe(fixture.holdings)
  expect([...integrated.quoteCalls.values()].reduce((sum, count) => sum + count, 0)).toBe(fixture.holdings)

  const evidence = {
    ...fixture,
    baseline: { requestsPerLoad: 5, ledgerReplaysPerLoad: 5, medianMs: median(baselineSamples.map(entry => entry.elapsedMs)), p95Ms: Math.max(...baselineSamples.map(entry => entry.elapsedMs)), payloadBytes: baselineSamples[0]!.bytes, sqlStatementsPerLoad: baseline.queries.length / 5, upstreamQuoteCallsIncludingWarmup: fixture.holdings },
    integrated: { requestsPerLoad: 2, ledgerReplaysPerLoad: 2, medianMs: median(integratedSamples.map(entry => entry.elapsedMs)), p95Ms: Math.max(...integratedSamples.map(entry => entry.elapsedMs)), payloadBytes: integratedSamples[0]!.bytes, sqlStatementsPerLoad: integrated.queries.length / 5, upstreamQuoteCallsIncludingWarmup: fixture.holdings },
  }
  console.info('integrated portfolio evidence', evidence)
  const directory = '.scratch/trade-basic-integrated-improvements/evidence'
  await mkdir(directory, { recursive: true })
  await writeFile(`${directory}/portfolio-${fixture.holdings}.json`, JSON.stringify(evidence, null, 2))
}, 120_000)
