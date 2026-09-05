import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import bcrypt from 'bcryptjs'
import { createApp } from '../../apps/api/src/app'
import { BrowserSession } from '../support/browser-session'
import { provisionTestDatabase } from '../support/database'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let server: ReturnType<typeof serve>
let baseUrl: string
let revoked: string[]

beforeAll(async () => { database = await provisionTestDatabase('admin_users_http') })
beforeEach(async () => {
  revoked = []
  const app = createApp({
    db: database.db,
    databasePool: database.pool,
    onAccountRevoked: userId => revoked.push(userId),
    config: { jwtSecret: 'synthetic-admin-users-secret-with-at-least-32-characters', nodeEnv: 'test', trustProxy: false, webOrigin: 'http://127.0.0.1' },
  })
  server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 })
  await once(server, 'listening')
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterEach(async () => { server.close(); await once(server, 'close') })
afterAll(async () => { await database?.dispose() })

async function account(role: 'ADMIN' | 'USER' = 'USER', name = 'Synthetic user') {
  const browser = new BrowserSession(baseUrl)
  const credentials = { email: `${randomUUID()}@example.test`, password: 'synthetic-admin-password', name }
  await database.pool.query('insert into users(email,password,name,role) values ($1,$2,$3,$4)', [credentials.email, await bcrypt.hash(credentials.password, 4), name, role])
  expect((await browser.post('/api/auth/login', { email: credentials.email, password: credentials.password })).status).toBe(200)
  const me = await browser.request('/api/auth/me')
  expect(me.status).toBe(200)
  const user = (await me.json()).data
  return { browser, credentials, user: user as { id: string; email: string; role: 'ADMIN' | 'USER' } }
}

function mutate(browser: BrowserSession, path: string, method: 'PUT' | 'DELETE', body?: unknown) {
  const headers = new Headers({ 'x-csrf-token': browser.cookies.get('csrf-token')! })
  if (body !== undefined) headers.set('content-type', 'application/json')
  return browser.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
}

it('enforces fresh admin roles, stable search pagination, self guards and private Diary projections', async () => {
  const admin = await account('ADMIN', 'Admin operator')
  const first = await account('USER', 'Target Alpha')
  const second = await account('USER', 'Target Beta')
  const ordinary = await account('USER', 'Ordinary viewer')

  expect((await ordinary.browser.request('/api/admin/users')).status).toBe(403)
  expect((await fetch(`${baseUrl}/api/admin/users`)).status).toBe(401)
  expect((await admin.browser.request('/api/admin/users/not-an-id')).status).toBe(404)

  await database.pool.query("update users set created_at='2026-01-01T00:00:00.000Z' where id in ($1,$2)", [first.user.id, second.user.id])
  const listed = await admin.browser.request(`/api/admin/users?search=${encodeURIComponent('TARGET')}&limit=10`)
  expect(listed.status).toBe(200)
  const listBody = await listed.json()
  expect(listBody.pagination.limit).toBe(10)
  expect(listBody.data.map((row: { id: string }) => row.id)).toEqual([second.user.id, first.user.id])
  expect(listBody.data.every((row: { diaryCount: number }) => row.diaryCount === 0)).toBe(true)

  expect((await mutate(admin.browser, `/api/admin/users/${admin.user.id}/role`, 'PUT', { role: 'USER' })).status).toBe(403)
  expect((await mutate(admin.browser, `/api/admin/users/${admin.user.id}`, 'DELETE')).status).toBe(403)
  expect((await mutate(admin.browser, `/api/admin/users/${first.user.id}/role`, 'PUT', { role: 'ADMIN' })).status).toBe(200)
  expect((await mutate(admin.browser, `/api/admin/users/${first.user.id}/role`, 'PUT', { role: 'USER' })).status).toBe(200)
  // The access cookie was issued while the account had USER role; the admin
  // boundary still observes a DB role change rather than a stale JWT claim.
  expect((await first.browser.request('/api/admin/users')).status).toBe(403)

  const diary = await first.browser.post('/api/diaries', {
    title: 'Admin projection diary', content: 'Visible thesis body', date: '2026-01-02',
    thesis: 'Visible thesis', reviewDueAt: '2026-01-03T00:00:00.000Z',
  })
  expect(diary.status).toBe(201)
  const diaryId = (await diary.json()).id as string
  await database.pool.query("update diaries set review_status='reviewed', review_outcome='INTACT', review_summary='PRIVATE_SECRET_SUMMARY', review_learning='PRIVATE_SECRET_LEARNING', review_adjustment='PRIVATE_SECRET_ADJUSTMENT', reviewed_at='2026-01-04T00:00:00.000Z' where id=$1", [diaryId])

  const diaries = await admin.browser.request('/api/admin/diaries?limit=10')
  expect(diaries.status).toBe(200)
  const diaryBody = await diaries.json()
  const projected = diaryBody.data.find((row: { id: string }) => row.id === diaryId)
  expect(projected).toMatchObject({ title: 'Admin projection diary', author: { id: first.user.id }, alertCount: 0, transactionCount: 0 })
  expect(JSON.stringify(projected)).not.toContain('PRIVATE_SECRET')
  expect(projected).not.toHaveProperty('reviewOutcome')
  expect(projected).not.toHaveProperty('reviewSummary')
  const stats = await admin.browser.request('/api/admin/stats')
  expect(stats.status).toBe(200)
  const statsBody = await stats.json()
  expect(statsBody.data.users.total).toBeGreaterThanOrEqual(4)
  expect(statsBody.data.diaries.total).toBeGreaterThanOrEqual(1)
  expect(statsBody.data.recentActivity.diaries.some((row: { id: string }) => row.id === diaryId)).toBe(true)
  expect(JSON.stringify(statsBody.data.recentActivity.diaries)).not.toContain('PRIVATE_SECRET')
})

it('deletes account data atomically and revokes HTTP, native, API-key and socket access after commit', async () => {
  const admin = await account('ADMIN', 'Admin operator')
  const target = await account('USER', 'Delete target')
  const survivor = await account('USER', 'Survivor')
  const targetDiary = await target.browser.post('/api/diaries', { title: 'Target data', content: 'Target private body', date: '2026-02-01' })
  expect(targetDiary.status).toBe(201)
  const nativeLogin = await target.browser.post('/api/auth/native/login', { email: target.credentials.email, password: target.credentials.password, deviceName: 'synthetic device' })
  expect(nativeLogin.status).toBe(200)
  const nativeRefresh = (await nativeLogin.json()).data.refreshToken as string
  const keyResponse = await target.browser.post('/api/api-keys', { label: 'Target key', scope: 'AGENT_WRITE' })
  expect(keyResponse.status).toBe(200)
  const rawKey = (await keyResponse.json()).rawKey as string

  const deleted = await mutate(admin.browser, `/api/admin/users/${target.user.id}`, 'DELETE')
  expect(deleted.status).toBe(200)
  expect(revoked).toContain(target.user.id)
  expect((await target.browser.request('/api/auth/me')).status).toBe(401)
  expect((await target.browser.post('/api/auth/native/refresh', { refreshToken: nativeRefresh })).status).toBe(401)
  expect((await fetch(`${baseUrl}/api/api-keys`, { headers: { 'x-api-key': rawKey } })).status).toBe(401)
  expect((await admin.browser.request(`/api/admin/users/${target.user.id}`)).status).toBe(404)
  expect((await database.pool.query('select count(*)::int as count from diaries where user_id=$1', [target.user.id])).rows[0].count).toBe(0)
  expect((await survivor.browser.request('/api/auth/me')).status).toBe(200)
})
