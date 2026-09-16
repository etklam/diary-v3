import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import { createApp } from '../../apps/api/src/app'
import { authUserResponseSchema } from '../../packages/contracts/src/index'
import { diarySummaryListResponseSchema } from '../../packages/contracts/src/diary-summary'
import { schema } from '../../packages/db/src'
import { BrowserSession } from '../support/browser-session'
import { provisionTestDatabase } from '../support/database'

type LoggedQuery = { query: string; params: unknown[] }
type PlanNode = {
  'Node Type': string
  'Relation Name'?: string
  'Index Name'?: string
  'Plan Rows': number
  'Actual Rows': number
  'Actual Loops': number
  'Rows Removed by Filter'?: number
  'Shared Hit Blocks'?: number
  'Shared Read Blocks'?: number
  Filter?: string
  Plans?: PlanNode[]
}
type Explain = { Plan: PlanNode; 'Planning Time': number; 'Execution Time': number }

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let server: ReturnType<typeof serve>
let baseUrl: string
let observedQueries: LoggedQuery[]

beforeAll(async () => { database = await provisionTestDatabase('diary_search_plan') })
beforeEach(async () => {
  observedQueries = []
  const db = drizzle(database.pool, { schema, logger: { logQuery(query, params) { observedQueries.push({ query, params }) } } })
  const app = createApp({ db, config: {
    jwtSecret: 'test-only-diary-search-plan-secret-at-least-32-characters',
    nodeEnv: 'test', trustProxy: false, webOrigin: 'http://127.0.0.1',
  } })
  server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 })
  await once(server, 'listening')
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterEach(async () => { server.close(); await once(server, 'close') })
afterAll(async () => { await database?.dispose() })

async function owner() {
  const browser = new BrowserSession(baseUrl)
  const email = `${randomUUID()}@example.test`
  expect((await browser.post('/api/auth/register', { email, password: 'synthetic-search-plan-password' })).status).toBe(200)
  const login = await browser.post('/api/auth/login', { email, password: 'synthetic-search-plan-password' })
  expect(login.status).toBe(200)
  const account = authUserResponseSchema.parse(await login.json())
  return { browser, userId: account.data.id }
}

function extractWhere(query: string) {
  const lower = query.toLowerCase()
  const start = lower.indexOf(' where ')
  const stops = [' order by ', ' limit ', ' offset '].map(value => lower.indexOf(value, start + 7)).filter(index => index >= 0)
  return query.slice(start + 7, stops.length ? Math.min(...stops) : query.length).replaceAll(/\s+/g, ' ').trim()
}

function planNodes(root: PlanNode) {
  const nodes: Array<Record<string, unknown>> = []
  const visit = (node: PlanNode) => {
    nodes.push({
      node: node['Node Type'], relation: node['Relation Name'], index: node['Index Name'],
      planRows: node['Plan Rows'], actualRows: node['Actual Rows'], loops: node['Actual Loops'],
      rowsRemovedByFilter: node['Rows Removed by Filter'], hits: node['Shared Hit Blocks'], reads: node['Shared Read Blocks'],
      filter: node.Filter?.slice(0, 220),
    })
    for (const child of node.Plans ?? []) visit(child)
  }
  visit(root)
  return nodes
}

function percentile(values: number[], fraction: number) {
  return [...values].sort((left, right) => left - right)[Math.max(0, Math.ceil(values.length * fraction) - 1)]!
}

it('records count and page plans for owner-scoped escaped contains search on the current indexes', { timeout: 120_000 }, async () => {
  const account = await owner()
  const otherUsers = await database.pool.query<{ id: string }>(
    "insert into users(email,password) values ('plan-other@example.test','synthetic') returning id::text as id",
  )
  const ownerId = account.userId
  const otherId = otherUsers.rows[0]!.id

  const seed = async (userId: string, count: number) => database.pool.query(`
    with generated as (
      select n,
        case when n % 1000 = 0 then 'Synthetic needle 投資 note ' || n else 'Synthetic diary ' || n end as title,
        case when n % 1000 = 0 then 'Body has needle and Chinese 投資 details.' else repeat('ordinary trading evidence ', 4) || n end as content,
        case when n % 1000 = 0 then array['needle','research']::text[] else array['general']::text[] end as tags
      from generate_series(1,$2::int) n
    )
    insert into diaries(user_id,title,content,tags,date,summary_excerpt,summary_excerpt_content_hash)
    select $1, title, content, tags, date '2000-01-01' + n,
      left(content,240), md5(content)
    from generated`, [userId, count])
  await seed(ownerId, 10_000)
  await seed(otherId, 30_000)
  const [stock] = (await database.pool.query<{ id: string }>(
    "insert into stocks(symbol,name) values ('F06SYM','Synthetic search symbol') returning id::text as id",
  )).rows
  await database.pool.query(`
    insert into diary_stocks(diary_id,stock_id)
    select id,$2 from diaries where user_id=$1 and date=date '2000-01-01' + 9999`, [ownerId, stock!.id])
  await database.pool.query('analyze diaries')
  await database.pool.query('analyze diary_stocks')
  await database.pool.query('analyze stocks')

  const serverVersion = await database.pool.query<{ version: string }>('select version() as version')
  const indexes = await database.pool.query<{ tablename: string; indexname: string; indexdef: string }>(
    "select tablename,indexname,indexdef from pg_indexes where schemaname='public' and tablename in ('diaries','diary_stocks','stocks') order by tablename,indexname",
  )
  const reports = []
  for (const term of ['needle', 'F06SYM']) {
    observedQueries.length = 0
    const response = await account.browser.request(`/api/diaries/summary?${new URLSearchParams({ search: term, limit: '20', sortBy: 'date-desc' })}`)
    expect(response.status).toBe(200)
    const result = diarySummaryListResponseSchema.parse(await response.json())
    if (term === 'needle') expect(result.pagination.total).toBe(10)
    else expect(result.pagination.total).toBe(1)

    const candidates = observedQueries.filter(({ query }) => {
      const normalized = query.toLowerCase()
      return normalized.includes('from "diaries"') && normalized.includes('"diaries"."user_id"') && normalized.includes('"diaries"."title" ilike')
    })
    const countQuery = candidates.find(({ query }) => query.toLowerCase().startsWith('select count(*)'))
    const pageQuery = candidates.find(({ query }) => query.toLowerCase().includes(' order by '))
    expect(countQuery).toBeDefined()
    expect(pageQuery).toBeDefined()
    expect(extractWhere(countQuery!.query)).toBe(extractWhere(pageQuery!.query))

    const plans: Array<{ kind: string; first: Explain; executionMs: number[] }> = []
    for (const [kind, statement] of [['count', countQuery!], ['page', pageQuery!]] as const) {
      const runs: Explain[] = []
      for (let repetition = 0; repetition < 5; repetition++) {
        const explained = await database.pool.query<{ 'QUERY PLAN': Explain[] }>(
          `explain (analyze, buffers, format json) ${statement.query}`, statement.params,
        )
        runs.push(explained.rows[0]!['QUERY PLAN'][0]!)
      }
      plans.push({ kind, first: runs[0]!, executionMs: runs.map(run => run['Execution Time']) })
    }
    reports.push({ term, total: result.pagination.total, plans: plans.map(plan => ({
      kind: plan.kind,
      p50Ms: percentile(plan.executionMs, 0.5),
      p95Ms: percentile(plan.executionMs, 0.95),
      root: planNodes(plan.first.Plan)[0],
      nodes: planNodes(plan.first.Plan),
    })) })
  }

  console.log('[diary contains-search plan]', JSON.stringify({
    runtime: { node: process.version, postgres: serverVersion.rows[0]!.version, fixture: { ownerRows: 10_000, otherOwnerRows: 30_000, totalDiaryRows: 40_000 }, concurrency: 1, warmExplainRepetitions: 5, coldCache: 'not flushed; plan runs follow the API request' },
    indexes: indexes.rows,
    reports,
  }))
})
