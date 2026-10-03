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

beforeAll(async () => { database = await provisionTestDatabase('goals_http') })
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
  const credentials = { email: `${randomUUID()}@example.test`, password: 'synthetic-goal-password' }
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

it('orders goals by deadline, keeps open-ended goals last and enforces ownership', async () => {
  const owner = await login()
  const other = await login()
  expect(await (await owner.request('/api/goals')).json()).toEqual([])

  const later = await (await owner.post('/api/goals', { content: 'Reach USD 1,000,000 in the account', targetDate: '2027-12-31' })).json()
  const sooner = await (await owner.post('/api/goals', { content: '  Reach 15% YTD this year  ', targetDate: '2026-12-31' })).json()
  const openEnded = await (await owner.post('/api/goals', { content: 'Write a diary entry every trading day', targetDate: null })).json()
  expect(sooner).toMatchObject({ content: 'Reach 15% YTD this year', targetDate: '2026-12-31', status: 'active', achievedDate: null })
  expect(openEnded).toMatchObject({ targetDate: null, status: 'active' })
  expect(sooner.createdAt).toBe(sooner.updatedAt)

  const list = await owner.request('/api/goals')
  expect(list.headers.get('cache-control')).toBe('no-store')
  expect((await list.json()).map((row: { id: string }) => row.id)).toEqual([sooner.id, later.id, openEnded.id])
  expect(await (await other.request('/api/goals')).json()).toEqual([])

  const edited = await mutate(owner, `/api/goals/${openEnded.id}`, { content: 'Write a diary entry every day', targetDate: '2026-10-31' })
  expect(edited.status).toBe(200)
  expect(await edited.json()).toMatchObject({ id: openEnded.id, content: 'Write a diary entry every day', targetDate: '2026-10-31' })
  expect((await (await owner.request('/api/goals')).json()).map((row: { id: string }) => row.id)).toEqual([openEnded.id, sooner.id, later.id])

  expect((await mutate(other, `/api/goals/${sooner.id}`, { content: 'Not mine', targetDate: null })).status).toBe(404)
  expect((await mutate(other, `/api/goals/${sooner.id}`, {}, 'DELETE')).status).toBe(404)
  expect((await owner.post('/api/goals', { content: 'Invalid date', targetDate: '2026-02-30' })).status).toBe(400)
  expect((await owner.post('/api/goals', { content: ' ', targetDate: null })).status).toBe(400)
  expect((await owner.post('/api/goals', { content: 'Missing target date' })).status).toBe(400)
  expect((await owner.post('/api/goals', { content: 'Unknown status', targetDate: null, status: 'abandoned' })).status).toBe(400)
  expect((await owner.post('/api/goals', { content: 'No CSRF', targetDate: null }, false)).status).toBe(403)
  expect((await fetch(`${baseUrl}/api/goals`)).status).toBe(401)

  expect((await mutate(owner, `/api/goals/${sooner.id}`, {}, 'DELETE')).status).toBe(200)
  expect((await mutate(owner, `/api/goals/${sooner.id}`, {}, 'DELETE')).status).toBe(404)
  expect((await (await owner.request('/api/goals')).json()).map((row: { id: string }) => row.id)).toEqual([openEnded.id, later.id])
})

it('derives the achieved date from the status transition and sorts achieved goals last', async () => {
  const owner = await login()
  const goal = await (await owner.post('/api/goals', { content: 'Reach 15% YTD this year', targetDate: '2026-12-31' })).json()
  const open = await (await owner.post('/api/goals', { content: 'Keep reviewing every trade', targetDate: null })).json()

  const achieved = await mutate(owner, `/api/goals/${goal.id}`, { content: goal.content, targetDate: goal.targetDate, status: 'achieved' })
  expect(await achieved.json()).toMatchObject({ status: 'achieved', achievedDate: '2026-09-22' })
  // Achieved goals drop below the active ones.
  expect((await (await owner.request('/api/goals')).json()).map((row: { id: string }) => row.id)).toEqual([open.id, goal.id])

  // Editing the text of an achieved goal must not re-date the achievement.
  const renamed = await mutate(owner, `/api/goals/${goal.id}`, { content: 'Reached 15% YTD', targetDate: goal.targetDate })
  expect(await renamed.json()).toMatchObject({ status: 'achieved', achievedDate: '2026-09-22' })

  const resumed = await mutate(owner, `/api/goals/${goal.id}`, { content: 'Reached 15% YTD', targetDate: goal.targetDate, status: 'active' })
  expect(await resumed.json()).toMatchObject({ status: 'active', achievedDate: null })
  expect((await (await owner.request('/api/goals')).json()).map((row: { id: string }) => row.id)).toEqual([goal.id, open.id])
})
