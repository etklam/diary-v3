import { mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createApp } from '../../apps/api/src/app'
import { schema } from '../../packages/db/src'
import { BrowserSession } from '../support/browser-session'
import { provisionTestDatabase } from '../support/database'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
beforeAll(async () => { database = await provisionTestDatabase('integrated_library') })
afterAll(async () => { await database?.dispose() })
for (const count of [1_000, 10_000]) it(`measures bounded library reads for ${count} synthetic diaries`, async () => {
  const queries: { query: string; params: unknown[] }[] = []
  const db = drizzle(database.pool, { schema, logger: { logQuery(query, params) { queries.push({ query, params }) } } })
  const app = createApp({ db, config: { jwtSecret: 'synthetic-library-measurement-secret-32-characters', nodeEnv: 'test', trustProxy: false, webOrigin: 'http://127.0.0.1' } })
  const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 }); await once(server, 'listening')
  try {
    const browser = new BrowserSession(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)
    const credentials = { email: `${randomUUID()}@example.test`, password: 'synthetic-library-password' }
    expect((await browser.post('/api/auth/register', credentials)).status).toBe(200)
    const login = await browser.post('/api/auth/login', credentials)
    const owner = (await login.json()).data.id
    await database.pool.query(`insert into diaries(user_id,title,content,tags,date,summary_excerpt,summary_excerpt_content_hash)
      select $1, 'Synthetic diary ' || n, body, array['research'], date '1980-01-01'+n, left(body,240), md5(body)
      from (select n, case when n % 100 = 0 then repeat('x',35000)||'needle 投資 😀'||repeat('y',14987) else 'ordinary synthetic content '||n end body from generate_series(1,$2::int)n) seeded`, [owner, count])
    await database.pool.query('analyze diaries')
    const reports = []
    for (const [name, path] of [['full-picker-page', '/api/diaries?limit=20'], ['summary-picker-page', '/api/diaries/summary?limit=20'], ['search', '/api/diaries/summary?limit=20&search=needle']] as const) {
      const samples: number[] = []; let bytes = 0, statements = 0
      let captured: typeof queries = []
      for (let sample = -1; sample < 5; sample++) {
        queries.length = 0
        const start = performance.now(), response = await browser.request(path, name === 'search' ? { headers: { 'X-Diary-Search-Snippet': '1' } } : {}), body = await response.text()
        const elapsed = performance.now() - start
        expect(response.status).toBe(200)
        const data = JSON.parse(body)
        expect(data.data.length).toBeLessThanOrEqual(20)
        if (name === 'search') {
          expect(data.pagination.total).toBe(count / 100)
          expect(data.data.every((row: { searchSnippet?: unknown }) => row.searchSnippet != null)).toBe(true)
        }
        if (sample >= 0) samples.push(elapsed)
        bytes = Buffer.byteLength(body); statements = queries.length; captured = [...queries]
      }
      samples.sort((a,b) => a-b)
      const plans = []
      if (name === 'search') for (const statement of captured.filter(row => row.query.includes('from "diaries"') && row.query.includes(' ilike '))) {
        const plan = await database.pool.query(`explain (analyze,buffers,format json) ${statement.query}`, statement.params)
        plans.push(plan.rows[0]['QUERY PLAN'])
      }
      reports.push({ name, path, requests: 1, sqlStatements: statements, payloadBytes: bytes, p50Ms: samples[2], p95Ms: samples[4], plans })
    }
    const directory = '.scratch/trade-basic-integrated-improvements/evidence'
    await mkdir(directory, {recursive:true})
    await writeFile(`${directory}/library-${count}.json`, JSON.stringify({node:process.version,fixture:{diaries:count,longBodyCharacters:50000},warmup:1,samples:5,reports}, null, 2))
  } finally { server.close(); await once(server,'close') }
})
