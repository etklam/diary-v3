import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from 'vitest'
import { createApp } from '../../apps/api/src/app'
import { BrowserSession } from '../support/browser-session'
import { provisionTestDatabase } from '../support/database'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let server: ReturnType<typeof serve>, baseUrl: string, clock: Date
beforeAll(async () => { database = await provisionTestDatabase('price_alert_http') })
beforeEach(async () => {
  clock = new Date('2026-09-05T12:00:00Z')
  const app = createApp({ db: database.db, now: () => clock, config: {
    jwtSecret: 'synthetic-review-key-with-at-least-32-characters', nodeEnv: 'test', trustProxy: false, webOrigin: 'http://127.0.0.1',
  } })
  server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 })
  await once(server, 'listening'); baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterEach(async () => { server.close(); await once(server, 'close') })
afterAll(async () => { await database?.dispose() })
async function login() {
  const browser = new BrowserSession(baseUrl)
  const credentials = { email: `${randomUUID()}@example.test`, password: 'synthetic-review-password' }
  expect((await browser.post('/api/auth/register', credentials)).status).toBe(200)
  expect((await browser.post('/api/auth/login', credentials)).status).toBe(200)
  await browser.request('/api/auth/me')
  return browser
}
function mutate(browser: BrowserSession, path: string, body: unknown = {}, method = 'PUT') {
  return browser.request(path, { method, headers: { 'content-type': 'application/json', 'x-csrf-token': browser.cookies.get('csrf-token')! }, body: JSON.stringify(body) })
}
it('creates, edits, rearms and deletes owner price alerts with exact thresholds', async () => {
  const owner = await login(), other = await login()
  const response = await owner.post('/api/stocks/alerts', { symbol: 'aapl', type: 'PRICE_ABOVE', threshold: '999999.9999' })
  expect(response.status).toBe(200); const alert = await response.json()
  expect(alert).toMatchObject({ symbol: 'AAPL', threshold: '999999.9999', isTriggered: false, triggeredAt: null })
  expect(alert).not.toHaveProperty('userId')
  expect(await (await other.request('/api/stocks/alerts')).json()).toEqual([])
  expect((await mutate(other, `/api/stocks/alerts/${alert.id}`, { message: 'Not mine' })).status).toBe(404)
  expect((await mutate(other, `/api/stocks/alerts/${alert.id}`, {}, 'DELETE')).status).toBe(404)
  expect((await mutate(owner, `/api/stocks/alerts/${alert.id}`, { threshold: '-1' })).status).toBe(400)
  expect((await mutate(owner, `/api/stocks/alerts/${alert.id}`, { isTriggered: true })).status).toBe(400)
  const timestamp = '2026-01-01T00:00:00.123Z'
  expect((await mutate(owner, `/api/stocks/alerts/${alert.id}`, { isTriggered: true, triggeredAt: timestamp })).status).toBe(200)
  const edited = await mutate(owner, `/api/stocks/alerts/${alert.id}`, { threshold: '0.0001', message: '' })
  expect(edited.status).toBe(200); expect(await edited.json()).toMatchObject({ threshold: '0.0001', isTriggered: true, triggeredAt: timestamp, message: '' })
  const reset = await mutate(owner, `/api/stocks/alerts/${alert.id}`, { isTriggered: false, triggeredAt: null })
  expect(reset.status).toBe(200); expect(await reset.json()).toMatchObject({ isTriggered: false, triggeredAt: null })
  const averageResponse = await owner.post('/api/stocks/alerts', { symbol: 'AAPL', type: 'MOVING_AVG', threshold: '20', movingAverageDirection: 'below' })
  expect(averageResponse.status).toBe(200)
  expect(await averageResponse.json()).toMatchObject({ symbol: 'AAPL', type: 'MOVING_AVG', threshold: '20.0000', movingAverageDirection: 'below', isTriggered: false })
  const percentResponse = await owner.post('/api/stocks/alerts', { symbol: 'AAPL', type: 'CHANGE_PERCENT', threshold: '-5' })
  expect(percentResponse.status).toBe(200)
  expect(await percentResponse.json()).toMatchObject({ symbol: 'AAPL', type: 'CHANGE_PERCENT', threshold: '-5.0000', movingAverageDirection: null, isTriggered: false })
  expect((await owner.post('/api/stocks/alerts', { symbol: 'AAPL', type: 'PRICE_BELOW', threshold: '1' }, false)).status).toBe(403)
  expect((await fetch(`${baseUrl}/api/stocks/alerts`)).status).toBe(401)
  const listed = await owner.request('/api/stocks/alerts'); expect(listed.headers.get('cache-control')).toBe('no-store')
  expect(await listed.json()).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'MOVING_AVG', movingAverageDirection: 'below' }),
    expect.objectContaining({ type: 'CHANGE_PERCENT', threshold: '-5.0000', movingAverageDirection: null }),
  ]))
  expect((await mutate(owner, `/api/stocks/alerts/${alert.id}`, {}, 'DELETE')).status).toBe(200)
  expect((await mutate(owner, `/api/stocks/alerts/${alert.id}`, {}, 'DELETE')).status).toBe(404)
})
it('returns the latest 100 in stable creation/id order, including already-triggered alerts', async () => {
  const owner = await login()
  const first = await (await owner.post('/api/stocks/alerts', { symbol: 'MSFT', type: 'PRICE_BELOW', threshold: '1' })).json()
  await database.pool.query("insert into price_alerts(user_id,symbol,type,threshold,message,created_at,is_triggered,triggered_at) select user_id,'MSFT','PRICE_BELOW',1,'Synthetic '||n,created_at,true,created_at from price_alerts cross join generate_series(1,100) n where id=$1", [first.id])
  const rows = await (await owner.request('/api/stocks/alerts')).json()
  expect(rows).toHaveLength(100); expect(rows.every((row: { isTriggered: boolean }) => row.isTriggered)).toBe(true)
  expect(rows.some((row: { id: string }) => row.id === first.id)).toBe(false)
  expect(rows.map((row: { id: string }) => BigInt(row.id))).toEqual(rows.map((row: { id: string }) => BigInt(row.id)).sort((a: bigint, b: bigint) => a > b ? -1 : 1))
})
