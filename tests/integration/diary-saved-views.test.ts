import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import { createApp } from '../../apps/api/src/app'
import { diarySavedViewListResponseSchema, diarySavedViewSchema } from '@diary/contracts'
import { BrowserSession } from '../support/browser-session'
import { provisionTestDatabase } from '../support/database'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let server: ReturnType<typeof serve>, baseUrl: string

beforeAll(async () => { database = await provisionTestDatabase('diary_saved_views') })
beforeEach(async () => {
  const app = createApp({ db: database.db, config: {
    jwtSecret: 'synthetic-saved-view-key-with-at-least-32-characters', nodeEnv: 'test', trustProxy: false, webOrigin: 'http://127.0.0.1',
  } })
  server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 })
  await once(server, 'listening'); baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterEach(async () => { server.close(); await once(server, 'close') })
afterAll(async () => { await database?.dispose() })

async function login() {
  const browser = new BrowserSession(baseUrl)
  const credentials = { email: `${randomUUID()}@example.test`, password: 'synthetic-saved-view-password' }
  expect((await browser.post('/api/auth/register', credentials)).status).toBe(200)
  expect((await browser.post('/api/auth/login', credentials)).status).toBe(200)
  await browser.request('/api/auth/me')
  return browser
}

function mutate(browser: BrowserSession, path: string, method: 'PATCH' | 'DELETE' | 'POST', body?: unknown) {
  return browser.request(path, {
    method,
    headers: { 'content-type': 'application/json', 'x-csrf-token': browser.cookies.get('csrf-token')! },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

const query = { search: 'needle', dateFrom: '2026-01-01', dateTo: '2026-12-31', sortBy: 'date-desc' as const }

it('persists owner-scoped views, updates them explicitly, and supports deletion', async () => {
  const owner = await login(), other = await login()
  const created = await owner.post('/api/diaries/saved-views', { name: ' Needs review ', query })
  expect(created.status).toBe(201)
  const view = diarySavedViewSchema.parse(await created.json())
  expect(view.name).toBe('Needs review')
  expect(view.query).toEqual(query)
  expect(diarySavedViewListResponseSchema.parse(await (await owner.request('/api/diaries/saved-views')).json()).views).toHaveLength(1)
  expect(diarySavedViewListResponseSchema.parse(await (await other.request('/api/diaries/saved-views')).json()).views).toEqual([])

  const changed = await mutate(owner, `/api/diaries/saved-views/${view.id}`, 'PATCH', { name: 'Reviewed later', query: { symbol: 'AAPL', sortBy: 'title-asc' } })
  expect(changed.status).toBe(200)
  const next = diarySavedViewSchema.parse(await changed.json())
  expect(next).toMatchObject({ id: view.id, name: 'Reviewed later', version: 1, query: { symbol: 'AAPL', sortBy: 'title-asc' } })
  expect((await mutate(other, `/api/diaries/saved-views/${view.id}`, 'PATCH', { name: 'Private overwrite' })).status).toBe(404)
  expect((await mutate(other, `/api/diaries/saved-views/${view.id}`, 'DELETE')).status).toBe(404)
  expect((await mutate(owner, `/api/diaries/saved-views/${view.id}`, 'DELETE')).status).toBe(200)
  expect(diarySavedViewListResponseSchema.parse(await (await owner.request('/api/diaries/saved-views')).json()).views).toEqual([])
})

it('enforces case-insensitive names, twenty-view limit, strict query validation and CSRF', async () => {
  const owner = await login()
  expect((await owner.post('/api/diaries/saved-views', { name: 'Morning', query: {} })).status).toBe(201)
  expect((await owner.post('/api/diaries/saved-views', { name: ' morning ', query: {} })).status).toBe(409)
  expect((await owner.post('/api/diaries/saved-views', { name: 'Invalid', query: { page: 2 } })).status).toBe(400)
  for (let index = 1; index < 20; index++) expect((await owner.post('/api/diaries/saved-views', { name: `View ${index}`, query: {} })).status).toBe(201)
  expect((await owner.post('/api/diaries/saved-views', { name: 'One too many', query: {} })).status).toBe(400)
  expect((await owner.request('/api/diaries/saved-views', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'No csrf', query: {} }) })).status).toBe(403)
})
