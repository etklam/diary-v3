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
beforeAll(async () => { database = await provisionTestDatabase('discipline_http') })
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
it('round-trips owner content and signed partial order with random fallback and private boundaries', async () => {
  const owner = await login(), other = await login()
  expect(await (await owner.request('/api/discipline')).json()).toEqual([])
  const fallback = await (await owner.request('/api/discipline/random')).json()
  expect(fallback.isCustom).toBe(false); expect(['寫日記是提升交易心態的最好方法', '明天又是新的一天，持續寫日記吧', '明天見']).toContain(fallback.content)
  const a = await (await owner.post('/api/discipline', { content: '  Principle A  ' })).json()
  const b = await (await owner.post('/api/discipline', { content: 'Principle B' })).json()
  expect(a).toMatchObject({ content: 'Principle A', order: 0, createdAt: clock.toISOString() }); expect(a).not.toHaveProperty('userId')
  expect(b.order).toBe(1)
  const edited = await mutate(owner, `/api/discipline/${a.id}`, { content: 'Edited principle' }); expect(edited.status).toBe(200)
  expect(await edited.json()).toMatchObject({ content: 'Edited principle', order: 0, createdAt: a.createdAt })
  const reordered = await mutate(owner, '/api/discipline/reorder', [{ id: b.id, order: -2 }], 'PATCH')
  expect(reordered.status).toBe(200); expect((await reordered.json()).map((row: { id: string }) => row.id)).toEqual([b.id, a.id])
  const random = await (await owner.request('/api/discipline/random')).json(); expect(random.isCustom).toBe(true); expect(['Edited principle', 'Principle B']).toContain(random.content)
  const list = await owner.request('/api/discipline'); expect(list.headers.get('cache-control')).toBe('no-store')
  expect(await (await other.request('/api/discipline')).json()).toEqual([])
  for (const method of ['PUT', 'DELETE']) expect((await mutate(other, `/api/discipline/${a.id}`, { content: 'Not mine' }, method)).status).toBe(404)
  expect((await mutate(owner, '/api/discipline/reorder', [{ id: a.id, order: 1 }, { id: a.id, order: 2 }], 'PATCH')).status).toBe(400)
  expect((await owner.post('/api/discipline', { content: ' ' })).status).toBe(400)
  expect((await owner.post('/api/discipline', { content: 'No CSRF' }, false)).status).toBe(403)
  expect((await fetch(`${baseUrl}/api/discipline`)).status).toBe(401)
  expect((await mutate(owner, `/api/discipline/${a.id}`, {}, 'DELETE')).status).toBe(200)
  expect((await mutate(owner, `/api/discipline/${a.id}`, {}, 'DELETE')).status).toBe(404)
  expect(await (await owner.request('/api/discipline/random')).json()).toEqual({ content: 'Principle B', isCustom: true })
})
it('serializes concurrent appends and rejects a mixed-owner reorder without changing any rows', async () => {
  const owner = await login(), other = await login()
  const results = await Promise.all(Array.from({ length: 6 }, (_, i) => owner.post('/api/discipline', { content: `Concurrent ${i}` })))
  expect(results.every(response => response.status === 200)).toBe(true)
  const rows = await (await owner.request('/api/discipline')).json()
  expect(rows.map((row: { order: number }) => row.order)).toEqual([0, 1, 2, 3, 4, 5])
  const foreign = await (await other.post('/api/discipline', { content: 'Foreign principle' })).json()
  expect((await mutate(owner, '/api/discipline/reorder', [{ id: rows[0].id, order: 99 }, { id: foreign.id, order: 0 }], 'PATCH')).status).toBe(404)
  expect(await (await owner.request('/api/discipline')).json()).toEqual(rows)
  const tied = await mutate(owner, '/api/discipline/reorder', rows.map((row: { id: string }) => ({ id: row.id, order: 0 })), 'PATCH')
  expect(tied.status).toBe(200)
  const tiedRows = await tied.json(); expect(tiedRows.map((row: { id: string }) => row.id)).toEqual(rows.map((row: { id: string }) => row.id))
  await mutate(owner, '/api/discipline/reorder', [{ id: rows[0].id, order: 2147483647 }], 'PATCH')
  expect((await owner.post('/api/discipline', { content: 'Would overflow' })).status).toBe(400)
  expect(await (await owner.request('/api/discipline')).json()).toHaveLength(6)
})
it('rolls back earlier reorder updates when a later database write fails', async () => {
  const owner = await login()
  const a = await (await owner.post('/api/discipline', { content: 'Rollback A' })).json()
  const b = await (await owner.post('/api/discipline', { content: 'Rollback B' })).json()
  await database.pool.query("CREATE FUNCTION synthetic_discipline_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.display_order = 999 THEN RAISE EXCEPTION 'Synthetic write failure'; END IF; RETURN NEW; END $$")
  await database.pool.query('CREATE TRIGGER synthetic_discipline_failure BEFORE UPDATE ON disciplines FOR EACH ROW EXECUTE FUNCTION synthetic_discipline_failure()')
  try {
    const response = await mutate(owner, '/api/discipline/reorder', [{ id: a.id, order: 88 }, { id: b.id, order: 999 }], 'PATCH')
    expect(response.status).toBe(500)
    expect(await (await owner.request('/api/discipline')).json()).toEqual([a, b])
  } finally {
    await database.pool.query('DROP TRIGGER synthetic_discipline_failure ON disciplines')
    await database.pool.query('DROP FUNCTION synthetic_discipline_failure()')
 }
})

it('keeps a long collection reachable and serializes reorder against delete', async () => {
 const owner = await login()
 const created = await Promise.all(Array.from({ length: 128 }, (_, index) => owner.post('/api/discipline', { content: `Long collection principle ${index}` })))
 expect(created.every(response => response.status === 200)).toBe(true)
 const rows = await (await owner.request('/api/discipline')).json()
 expect(rows).toHaveLength(128)
 expect(rows.map((row: { order: number }) => row.order)).toEqual(Array.from({ length: 128 }, (_, index) => index))
 const victim = rows[64] as { id: string }
 const reorder = mutate(owner, '/api/discipline/reorder', rows.map((row: { id: string }, order: number) => ({ id: row.id, order })), 'PATCH')
 const remove = mutate(owner, `/api/discipline/${victim.id}`, {}, 'DELETE')
 const [reordered, removed] = await Promise.all([reorder, remove])
 expect(removed.status).toBe(200)
 expect([200, 404]).toContain(reordered.status)
 const after = await (await owner.request('/api/discipline')).json()
 expect(after).toHaveLength(127)
 expect(after.some((row: { id: string }) => row.id === victim.id)).toBe(false)
 expect(new Set(after.map((row: { id: string }) => row.id)).size).toBe(127)
 expect(after.map((row: { order: number }) => row.order)).toEqual(Array.from({ length: 128 }, (_, index) => index).filter(index => index !== 64))
})
