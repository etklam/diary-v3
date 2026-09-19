import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { marketRotationSnapshotRuns, marketRotationSnapshots } from '../../packages/db/src'
import { getIndexesUniverse, getSectorsUniverse } from '../../packages/domain/src/market-rotation/universe'
import { marketRotationMonitorResponseSchema } from '../../packages/contracts/src/rotation-monitor'
import { createApp } from '../../apps/api/src/app'
import { createFixtureUpstream } from '../../apps/api/src/market-data/fixture'
import { createMarketData } from '../../apps/api/src/market-data'
import { BrowserSession } from '../support/browser-session'
import { provisionTestDatabase } from '../support/database'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let server: ReturnType<typeof serve>
let baseUrl: string
const requestedSymbols: string[] = []

beforeAll(async () => {
  database = await provisionTestDatabase('rotation_exec_http')
  const now = () => new Date('2026-09-05T00:00:00Z')
  const fixture = createFixtureUpstream()
  const failingIndexes = new Set(getIndexesUniverse().map(entry => entry.symbol))
  const marketData = createMarketData({
    now,
    upstream: {
      ...fixture,
      chart: async (symbol, options, signal) => {
        if (options.interval === '1d') {
          requestedSymbols.push(symbol)
          if (failingIndexes.has(symbol)) throw new Error('controlled provider failure')
        }
        return fixture.chart!(symbol, options, signal)
      },
    },
  })
  const app = createApp({
    db: database.db,
    databasePool: database.pool,
    marketData,
    now,
    config: {
      jwtSecret: 'synthetic-rotation-execution-key-with-32-characters',
      nodeEnv: 'test',
      trustProxy: false,
      webOrigin: 'http://127.0.0.1',
    },
  })
  server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 })
  await once(server, 'listening')
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  server?.close()
  if (server) await once(server, 'close')
  await database?.dispose()
})

async function adminSession() {
  const browser = new BrowserSession(baseUrl)
  const credentials = {
    email: `${randomUUID()}@example.test`,
    password: 'synthetic-rotation-execution-password',
  }
  expect((await browser.post('/api/auth/register', credentials)).status).toBe(200)
  await database.pool.query('update users set role = \'ADMIN\' where email = $1', [credentials.email])
  expect((await browser.post('/api/auth/login', credentials)).status).toBe(200)
  await browser.request('/api/auth/me')
  return browser
}

describe('all-scope rotation execution through HTTP and PostgreSQL', () => {
  it('keeps sectors persisted and readable when the later indexes scope fails', async () => {
    const admin = await adminSession()
    const response = await admin.post('/api/admin/market/rotation-batch', { scope: 'all' })
    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({
      statusCode: 500,
      statusMessage: 'Internal server error',
      data: { code: 'SYS_INTERNAL_ERROR', details: null },
    })

    const sectors = getSectorsUniverse()
    const indexes = getIndexesUniverse()
    expect(requestedSymbols.slice(0, sectors.length)).toEqual(sectors.map(entry => entry.symbol))
    expect(requestedSymbols[sectors.length]).toBe(indexes[0]!.symbol)
    expect(requestedSymbols.slice(sectors.length).every(symbol => symbol === indexes[0]!.symbol)).toBe(true)

    const persistedSectors = await database.db.select().from(marketRotationSnapshots)
      .where(eq(marketRotationSnapshots.rankScope, 'sectors'))
    expect(persistedSectors).toHaveLength(sectors.length)
    expect((await database.db.select().from(marketRotationSnapshots)
      .where(eq(marketRotationSnapshots.rankScope, 'core')))).toHaveLength(0)
    const runs = await database.db.select({ rankScope: marketRotationSnapshotRuns.rankScope, status: marketRotationSnapshotRuns.status })
      .from(marketRotationSnapshotRuns)
    expect(runs.find(row => row.rankScope === 'sectors')?.status).toBe('success')
    expect(runs.find(row => row.rankScope === 'indexes')?.status).toBe('failed')
    expect(runs.some(row => row.rankScope === 'core')).toBe(false)

    const monitor = await fetch(`${baseUrl}/api/market/rotation-monitor?scope=sectors`)
    expect(monitor.status).toBe(200)
    const payload = marketRotationMonitorResponseSchema.parse(await monitor.json())
    expect(payload.rankScope).toBe('sectors')
    expect(payload.rows).toHaveLength(sectors.length)
  })
})
