import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { io, type Socket } from 'socket.io-client'
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest'
import { createMarketData } from '../../apps/api/src/market-data'
import { createApiRuntime } from '../../apps/api/src/runtime'
import { BrowserSession } from '../support/browser-session'
import { provisionTestDatabase } from '../support/database'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let runtime: ReturnType<typeof createApiRuntime> | undefined
const sockets: Socket[] = []

beforeAll(async () => { database = await provisionTestDatabase('price_alert_runtime') })
afterEach(async () => {
  sockets.splice(0).forEach(socket => socket.disconnect())
  await runtime?.close()
  runtime = undefined
})
afterAll(async () => { await database?.dispose() })

function collectEvents(socket: Socket, count: number) {
  return new Promise<Record<string, unknown>[]>((resolve, reject) => {
    const events: Record<string, unknown>[] = []
    const timer = setTimeout(() => {
      socket.off('price-alert:triggered', onEvent)
      reject(new Error(`Timed out waiting for ${count} price alert events`))
    }, 3_000)
    function onEvent(payload: Record<string, unknown>) {
      events.push(payload)
      if (events.length !== count) return
      clearTimeout(timer)
      socket.off('price-alert:triggered', onEvent)
      resolve(events)
    }
    socket.on('price-alert:triggered', onEvent)
  })
}

it('keeps all four conditions pending on stale/missing data, then emits owner hints after fresh recovery', async () => {
  const clock = new Date('2026-09-08T20:00:00Z')
  let quoteAvailable = true
  let historyAvailable = true
  const history = Array.from({ length: 200 }, (_, index) => ({
    date: new Date(clock.getTime() - (index + 1) * 86_400_000),
    close: 100,
  }))
  const marketData = createMarketData({
    now: () => clock,
    upstream: {
      quote: async symbol => {
        if (!quoteAvailable) throw new Error('Synthetic quote outage')
        return { symbol, regularMarketPrice: 100, regularMarketPreviousClose: 100, regularMarketTime: clock }
      },
      chart: async () => {
        if (!historyAvailable) throw new Error('Synthetic history outage')
        return { quotes: history }
      },
    },
  })
  // Seed a cache entry so the first outage exercises the provider's stale fallback path.
  await marketData.quote('AAPL')
  runtime = createApiRuntime({
    db: database.db,
    marketData,
    now: () => clock,
    config: { jwtSecret: 'synthetic-price-runtime-secret-at-least-32-characters', nodeEnv: 'test', trustProxy: false, webOrigin: 'http://127.0.0.1' },
  })
  runtime.server.listen(0, '127.0.0.1')
  await once(runtime.server, 'listening')
  const baseUrl = `http://127.0.0.1:${(runtime.server.address() as AddressInfo).port}`
  const browser = new BrowserSession(baseUrl)
  const credentials = { email: `price-runtime-${randomUUID()}@example.test`, password: 'synthetic-price-runtime-password' }
  expect((await browser.post('/api/auth/register', credentials)).status).toBe(200)
  expect((await browser.post('/api/auth/login', credentials)).status).toBe(200)
  await browser.request('/api/auth/me')
  const bodies = [
    { symbol: 'AAPL', type: 'PRICE_ABOVE', threshold: '100', message: 'Fresh price above' },
    { symbol: 'AAPL', type: 'PRICE_BELOW', threshold: '100', message: 'Fresh price below' },
    { symbol: 'AAPL', type: 'CHANGE_PERCENT', threshold: '0', message: 'Fresh percent' },
    { symbol: 'AAPL', type: 'MOVING_AVG', threshold: '20', movingAverageDirection: 'above', message: 'Fresh average' },
  ] as const
  const created = []
  for (const body of bodies) {
    const response = await browser.post('/api/stocks/alerts', body)
    expect(response.status).toBe(200)
    created.push(await response.json() as { id: string; type: string })
  }
  const client = io(baseUrl, { autoConnect: false, reconnection: false, transports: ['websocket'], auth: { token: browser.cookies.get('access-token')! } })
  sockets.push(client)
  const connected = new Promise<void>(resolve => client.once('connect', () => resolve()))
  client.connect()
  await connected

  quoteAvailable = false
  await runtime.priceChecker.checkPriceAlerts()
  expect((await (await browser.request('/api/stocks/alerts')).json()).every((row: { isTriggered: boolean }) => !row.isTriggered)).toBe(true)

  quoteAvailable = true
  historyAvailable = false
  const nonAverageEvents = collectEvents(client, 3)
  await runtime.priceChecker.checkPriceAlerts()
  const partialPayloads = await nonAverageEvents
  expect(partialPayloads.map(payload => payload.type).sort()).toEqual(['CHANGE_PERCENT', 'PRICE_ABOVE', 'PRICE_BELOW'])
  expect(partialPayloads).toEqual(expect.arrayContaining([
    expect.objectContaining({ thresholdUnit: 'price', message: 'Fresh price above', currentPrice: 100 }),
    expect.objectContaining({ thresholdUnit: 'price', message: 'Fresh price below', currentPrice: 100 }),
    expect.objectContaining({ thresholdUnit: 'percent', message: 'Fresh percent', threshold: 0, currentPrice: 100 }),
  ]))
  const partialRows = await (await browser.request('/api/stocks/alerts')).json() as { id: string; type: string; isTriggered: boolean }[]
  expect(partialRows.filter(row => row.type !== 'MOVING_AVG').every(row => row.isTriggered)).toBe(true)
  expect(partialRows.find(row => row.type === 'MOVING_AVG')?.isTriggered).toBe(false)

  historyAvailable = true
  const averageEvent = collectEvents(client, 1)
  await runtime.priceChecker.checkPriceAlerts()
  expect(await averageEvent).toEqual([expect.objectContaining({ id: created[3]?.id, type: 'MOVING_AVG', threshold: 20, thresholdUnit: 'period', movingAverageDirection: 'above', message: 'Fresh average', currentPrice: 100 })])
  const finalRows = await (await browser.request('/api/stocks/alerts')).json() as { isTriggered: boolean }[]
  expect(finalRows).toHaveLength(4)
  expect(finalRows.every(row => row.isTriggered)).toBe(true)
})
