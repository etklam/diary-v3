import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { io, type Socket } from 'socket.io-client'
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest'
import { createApiRuntime } from '../../apps/api/src/runtime'
import { createAuthSessionService } from '../../apps/api/src/auth-session'
import { createSocketServer } from '../../apps/api/src/socket-server'
import { BrowserSession } from '../support/browser-session'
import { provisionTestDatabase } from '../support/database'
let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let runtime: ReturnType<typeof createSocketServer> | undefined
const sockets: Socket[] = []
beforeAll(async () => { database = await provisionTestDatabase('socket_auth') })
afterEach(async () => { sockets.splice(0).forEach(socket => socket.disconnect()); await runtime?.close() })
afterAll(async () => { await database?.dispose() })
function event(socket: Socket, name: string) { return new Promise<unknown[]>(resolve => socket.once(name, (...args: unknown[]) => resolve(args))) }
for (const operation of ['logout-all', 'password'] as const) it(`disconnects real JWT sockets after committed ${operation} and rejects old-token reconnect`, async () => {
  const jwtSecret = 'synthetic-socket-auth-secret-at-least-32-characters'
  const auth = createAuthSessionService({ db: database.db, jwtSecret, fail: (_status, _code, message) => { throw new Error(message) } })
  const integrated = createApiRuntime({ db: database.db, config: { jwtSecret, nodeEnv: 'test', trustProxy: false, webOrigin: 'http://127.0.0.1' } })
  runtime = integrated.sockets
  const server = integrated.server
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`, browser = new BrowserSession(baseUrl)
  const credentials = { email: `socket-${randomUUID()}@example.test`, password: 'synthetic-socket-password' }
  expect((await browser.post('/api/auth/register', credentials)).status).toBe(200)
  expect((await browser.post('/api/auth/login', credentials)).status).toBe(200)
  await browser.request('/api/auth/me')
  const accessToken = browser.cookies.get('access-token')!
  const verified = await auth.authenticateSocketAccess(accessToken)
  expect(verified.expiresAt.getTime()).toBeGreaterThan(Date.now())
  const client = io(baseUrl, { autoConnect: false, reconnection: false, transports: ['websocket'], auth: { token: accessToken } }); sockets.push(client)
  const connected = event(client, 'connection:success'); client.connect(); expect((await connected)[0]).toMatchObject({ userId: verified.id })
  const diaryResponse = await browser.post('/api/diaries', { title: 'Socket reminder', content: 'Synthetic', date: '2026-03-02', alerts: [{ message: 'Whole series', triggerAt: '2026-03-02T09:00:00Z', recurringMode: 'WEEK' }] })
  expect(diaryResponse.status).toBe(201)
  const diary = await diaryResponse.json()
  const dueResponse = await browser.post('/api/alerts', { diaryId: diary.id, message: 'Upcoming foreground hint', triggerAt: new Date(Date.now() + 30_000).toISOString() })
  expect(dueResponse.status).toBe(200)
  const due = await dueResponse.json(), hint = event(client, 'alert:triggered')
  await integrated.pusher.checkAndPushAlerts()
  expect((await hint)[0]).toMatchObject({ id: due.id, message: due.message, diary: { id: diary.id } })
  const singleDismissal = event(client, 'alert:dismissed'); client.emit('alert:dismiss', due.id); await singleDismissal
  const dismissal = event(client, 'alert:dismissed'); client.emit('alert:dismiss', diary.alerts[0].id)
  expect((await dismissal)[0]).toEqual({ alertId: diary.alerts[0].id })
  const persisted = await (await browser.request(`/api/diaries/${diary.id}`)).json()
  expect(persisted.alerts.length).toBeGreaterThan(1)
  expect(persisted.alerts.every((row: { isDismissed: boolean }) => row.isDismissed)).toBe(true)
  if (operation === 'password') {
    const bad = await browser.request('/api/user/password', { method: 'PUT', headers: { 'content-type': 'application/json', 'x-csrf-token': browser.cookies.get('csrf-token')! }, body: JSON.stringify({ currentPassword: 'wrong-password', newPassword: 'new-synthetic-password' }) })
    expect(bad.status).toBe(401); expect(client.connected).toBe(true)
  }
  const disconnected = event(client, 'disconnect')
  const result = operation === 'logout-all' ? await browser.post('/api/auth/logout-all', {}) : await browser.request('/api/user/password', { method: 'PUT', headers: { 'content-type': 'application/json', 'x-csrf-token': browser.cookies.get('csrf-token')! }, body: JSON.stringify({ currentPassword: credentials.password, newPassword: 'new-synthetic-password' }) })
  expect(result.status).toBe(200); await disconnected
  await expect(auth.authenticateSocketAccess(accessToken)).rejects.toThrow('Invalid token')
  const rejected = event(client, 'connect_error'); client.connect(); await rejected; expect(client.connected).toBe(false)
})

it('skips stale provider fallback then commits a fresh price trigger before its Socket.IO hint', async () => {
  const { createMarketData } = await import('../../apps/api/src/market-data/index')
  let unavailable = false
  const marketData = createMarketData({ upstream: {
    quote: async symbol => { if (unavailable) throw new Error('Synthetic provider outage'); return { symbol, regularMarketPrice: 100 } },
    chart: async () => ({ quotes: [] }),
  } })
  await marketData.quote('AAPL')
  const integrated = createApiRuntime({ db: database.db, marketData, config: { jwtSecret: 'synthetic-price-socket-secret-at-least-32-characters', nodeEnv: 'test', trustProxy: false, webOrigin: 'http://127.0.0.1' } })
  runtime = integrated.sockets
  integrated.server.listen(0, '127.0.0.1'); await once(integrated.server, 'listening')
  const baseUrl = `http://127.0.0.1:${(integrated.server.address() as AddressInfo).port}`, browser = new BrowserSession(baseUrl)
  const credentials = { email: `price-socket-${randomUUID()}@example.test`, password: 'synthetic-price-password' }
  await browser.post('/api/auth/register', credentials); await browser.post('/api/auth/login', credentials); await browser.request('/api/auth/me')
  const created = await browser.post('/api/stocks/alerts', { symbol: 'AAPL', type: 'PRICE_ABOVE', threshold: '90' }); expect(created.status).toBe(200); const alert = await created.json()
  const client = io(baseUrl, { autoConnect: false, reconnection: false, transports: ['websocket'], auth: { token: browser.cookies.get('access-token')! } }); sockets.push(client)
  const ready = event(client, 'connect'); client.connect(); await ready
  unavailable = true; await integrated.priceChecker.checkPriceAlerts()
  expect((await (await browser.request('/api/stocks/alerts')).json())[0].isTriggered).toBe(false)
  unavailable = false
  const incoming = event(client, 'price-alert:triggered')
  await integrated.priceChecker.checkPriceAlerts()
  expect((await incoming)[0]).toMatchObject({ id: alert.id, symbol: 'AAPL', type: 'PRICE_ABOVE', threshold: 90, currentPrice: 100 })
  expect((await (await browser.request('/api/stocks/alerts')).json())[0]).toMatchObject({ id: alert.id, isTriggered: true, triggeredAt: expect.any(String) })
  await integrated.close()
})
