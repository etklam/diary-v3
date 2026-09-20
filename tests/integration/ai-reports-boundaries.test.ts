import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import bcrypt from 'bcryptjs'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { aiCapabilitiesSchema } from '@diary/contracts'
import { createApp } from '../../apps/api/src/app'
import { BrowserSession } from '../support/browser-session'
import { provisionTestDatabase } from '../support/database'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let server: ReturnType<typeof serve>
let baseUrl: string
const transport = vi.fn(async () => { throw new Error('Unexpected provider call') })
beforeAll(async () => {
  database = await provisionTestDatabase('ai_boundaries')
  const app = createApp({ db: database.db, databasePool: database.pool, aiTransport: transport,
    config: { jwtSecret: 'synthetic-ai-boundaries-secret-at-least-32-characters', nodeEnv: 'test', trustProxy: false, webOrigin: 'http://127.0.0.1' } })
  server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 })
  await once(server, 'listening')
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(async () => { if (server) { server.close(); await once(server, 'close') }; await database?.dispose() })

async function account(role: 'USER' | 'ADMIN' = 'USER') {
  const browser = new BrowserSession(baseUrl)
  const email = `${randomUUID()}@example.test`
  const password = 'synthetic-ai-password'
  const result = await database.pool.query('insert into users(email,password,role) values ($1,$2,$3) returning id', [email, await bcrypt.hash(password, 4), role])
  expect((await browser.post('/api/auth/login', { email, password })).status).toBe(200)
  expect((await browser.request('/api/auth/me')).status).toBe(200)
  return { browser, id: result.rows[0].id }
}

it('denies anonymous and ordinary admin access and defaults generation to disabled without provider calls', async () => {
  for (const path of ['/api/ai/capabilities', '/api/ai/consent', '/api/ai/reports', '/api/admin/ai/settings', '/api/admin/ai/usage', '/api/admin/ai/audit']) {
    expect((await fetch(`${baseUrl}${path}`)).status).toBe(401)
  }
  const { browser } = await account()
  const capabilities = await browser.request('/api/ai/capabilities')
  expect(capabilities.headers.get('cache-control')).toContain('no-store')
  expect(aiCapabilitiesSchema.parse(await capabilities.json())).toMatchObject({ enabled: false, canGenerate: false })
  expect(await (await browser.request('/api/ai/consent')).json()).toBeNull()
  expect((await browser.request('/api/ai/reports')).status).toBe(403)
  expect((await browser.post('/api/ai/reports/preview', { periodType: 'weekly', periodStart: '2026-09-14' })).status).toBe(403)
  for (const path of ['/api/admin/ai/settings', '/api/admin/ai/prompts', '/api/admin/ai/access', '/api/admin/ai/usage', '/api/admin/ai/audit']) {
    expect((await browser.request(path)).status).toBe(403)
  }
  expect(transport).not.toHaveBeenCalled()
})

it('does not allow agent API keys to submit or read private AI reports', async () => {
  const { browser } = await account()
  const created = await browser.post('/api/api-keys', { label: 'Synthetic AI boundary', scope: 'AGENT_WRITE' })
  expect(created.status).toBe(200)
  const credential = await created.json()
  const headers = { 'x-api-key': credential.rawKey as string, 'content-type': 'application/json', 'Idempotency-Key': randomUUID() }
  expect((await fetch(`${baseUrl}/api/ai/reports`, { headers })).status).toBe(401)
  expect((await fetch(`${baseUrl}/api/ai/reports`, { method: 'POST', headers, body: JSON.stringify({ periodType: 'weekly', periodStart: '2026-09-14', confirmedRecipientRevision: 1, previewFingerprint: 'a'.repeat(64) }) })).status).toBe(401)
  expect(transport).not.toHaveBeenCalled()
})

it('rejects privileged fields and missing idempotency keys before a job can be created', async () => {
  const { browser } = await account()
  const input = { periodType: 'weekly', periodStart: '2026-09-14', confirmedRecipientRevision: 1, previewFingerprint: 'a'.repeat(64) }
  expect((await browser.post('/api/ai/reports', input)).status).toBe(400)
  for (const field of ['userId', 'model', 'apiKey', 'baseUrl', 'prompt', 'sourceIds', 'schedule']) {
    const response = await browser.request('/api/ai/reports', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': browser.cookies.get('csrf-token')!, 'Idempotency-Key': randomUUID() }, body: JSON.stringify({ ...input, [field]: 'untrusted' }) })
    expect(response.status).toBe(400)
  }
  expect((await database.pool.query('select count(*)::int as count from ai_report')).rows[0].count).toBe(0)
  expect(transport).not.toHaveBeenCalled()
})

it('requires CSRF for cookie mutations and observes current admin role after login', async () => {
  const { browser, id } = await account('ADMIN')
  expect((await browser.request('/api/admin/ai/settings')).status).toBe(200)
  const response = await browser.request('/api/admin/ai/runtime', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ generationEnabled: true }) })
  expect(response.status).toBe(403)
  await database.pool.query("update users set role='USER' where id=$1", [id])
  expect((await browser.request('/api/admin/ai/settings')).status).toBe(403)
  expect(transport).not.toHaveBeenCalled()
})

it('returns safe domain errors for empty, invalid, future and oversized local previews', async () => {
  const { browser, id } = await account()
  await database.pool.query('insert into ai_user_access(user_id,enabled) values ($1,true)', [id])
  for (const [periodStart, expectedCode] of [['2026-01-05', 'AI_REPORT_NO_DATA'], ['2026-01-06', 'AI_REPORT_INVALID_PERIOD'], ['2099-01-05', 'AI_REPORT_FUTURE_PERIOD']]) {
    const response = await browser.post('/api/ai/reports/preview', { periodType: 'weekly', periodStart })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ data: { code: expectedCode } })
  }
  await database.pool.query('insert into diaries(user_id,title,content,date) values ($1,$2,$3,$4)', [id, 'Synthetic large diary', 'x'.repeat(40_000), '2026-01-05'])
  const oversized = await browser.post('/api/ai/reports/preview', { periodType: 'weekly', periodStart: '2026-01-05' })
  expect(oversized.status).toBe(413)
  expect(await oversized.json()).toMatchObject({ data: { code: 'AI_REPORT_CONTEXT_TOO_LARGE' } })
  expect(transport).not.toHaveBeenCalled()
})
