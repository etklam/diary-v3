import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import { createApp } from '../../apps/api/src/app'
import { BrowserSession } from '../support/browser-session'
import { provisionTestDatabase } from '../support/database'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let server: ReturnType<typeof serve>
let baseUrl: string

beforeAll(async () => { database = await provisionTestDatabase('achievements_http') })
beforeEach(async () => {
  const app = createApp({
    db: database.db,
    now: () => new Date('2026-09-22T12:00:00Z'),
    config: { jwtSecret: 'synthetic-review-key-with-at-least-32-characters', nodeEnv: 'test', trustProxy: false, webOrigin: 'http://127.0.0.1' },
  })
  server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 })
  await once(server, 'listening')
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterEach(async () => { server.close(); await once(server, 'close') })
afterAll(async () => { await database?.dispose() })

async function login() {
  const browser = new BrowserSession(baseUrl)
  const credentials = { email: `${randomUUID()}@example.test`, password: 'synthetic-achievement-password' }
  expect((await browser.post('/api/auth/register', credentials)).status).toBe(200)
  expect((await browser.post('/api/auth/login', credentials)).status).toBe(200)
  await browser.request('/api/auth/me')
  return browser
}

function mutate(browser: BrowserSession, path: string, body: unknown = {}, method = 'PUT') {
  return browser.request(path, {
    method,
    headers: { 'content-type': 'application/json', 'x-csrf-token': browser.cookies.get('csrf-token')! },
    body: JSON.stringify(body),
  })
}

it('persists civil-date milestones in newest-first order and enforces ownership', async () => {
  const owner = await login()
  const other = await login()
  expect(await (await owner.request('/api/achievements')).json()).toEqual([])

  const first = await (await owner.post('/api/achievements', { date: '2026-09-22', content: '  First reached USD 100,000 in the account  ' })).json()
  const sameDate = await (await owner.post('/api/achievements', { date: '2026-09-22', content: 'Recorded the milestone in my journal' })).json()
  const older = await (await owner.post('/api/achievements', { date: '2025-12-31', content: 'Started tracking the account consistently' })).json()
  expect(first).toMatchObject({ date: '2026-09-22', content: 'First reached USD 100,000 in the account' })
  expect(first.createdAt).toBe(first.updatedAt)

  const list = await owner.request('/api/achievements')
  expect(list.headers.get('cache-control')).toBe('no-store')
  expect((await list.json()).map((row: { id: string }) => row.id)).toEqual([sameDate.id, first.id, older.id])
  expect(await (await other.request('/api/achievements')).json()).toEqual([])

  const edited = await mutate(owner, `/api/achievements/${first.id}`, { date: '2026-09-23', content: 'Updated milestone' })
  expect(edited.status).toBe(200)
  expect(await edited.json()).toMatchObject({ id: first.id, date: '2026-09-23', content: 'Updated milestone' })
  expect((await (await owner.request('/api/achievements')).json()).map((row: { id: string }) => row.id)).toEqual([first.id, sameDate.id, older.id])

  expect((await mutate(other, `/api/achievements/${first.id}`, { date: '2026-09-24', content: 'Not mine' })).status).toBe(404)
  expect((await mutate(other, `/api/achievements/${first.id}`, {}, 'DELETE')).status).toBe(404)
  expect((await owner.post('/api/achievements', { date: '2026-02-30', content: 'Invalid date' })).status).toBe(400)
  expect((await owner.post('/api/achievements', { date: '2026-09-22', content: ' ' })).status).toBe(400)
  expect((await owner.post('/api/achievements', { date: '2026-09-22', content: 'No CSRF' }, false)).status).toBe(403)
  expect((await fetch(`${baseUrl}/api/achievements`)).status).toBe(401)

  expect((await mutate(owner, `/api/achievements/${first.id}`, {}, 'DELETE')).status).toBe(200)
  expect((await mutate(owner, `/api/achievements/${first.id}`, {}, 'DELETE')).status).toBe(404)
  expect((await (await owner.request('/api/achievements')).json()).map((row: { id: string }) => row.id)).toEqual([sameDate.id, older.id])
})
