import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import bcrypt from 'bcryptjs'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import { adminGuruResponseSchema, type AdminGuruInput } from '@diary/contracts'
import { createApp } from '../../apps/api/src/app'
import { BrowserSession } from '../support/browser-session'
import { provisionTestDatabase } from '../support/database'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let server: ReturnType<typeof serve>
let baseUrl: string
let clock: Date
let nextCik = 300000

beforeAll(async () => { database = await provisionTestDatabase('admin_gurus_http') })
beforeEach(async () => {
  clock = new Date('2026-10-06T08:00:00.000Z')
  const app = createApp({
    db: database.db, databasePool: database.pool, now: () => clock,
    config: { jwtSecret: 'synthetic-admin-gurus-secret-with-at-least-32-characters', nodeEnv: 'test', trustProxy: false, webOrigin: 'http://127.0.0.1' },
  })
  server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 })
  await once(server, 'listening')
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterEach(async () => { server.close(); await once(server, 'close') })
afterAll(async () => { await database?.dispose() })

async function account(role: 'ADMIN' | 'USER' = 'ADMIN') {
  const browser = new BrowserSession(baseUrl)
  const email = `${randomUUID()}@example.test`
  const password = 'synthetic-admin-password'
  const result = await database.pool.query('insert into users(email,password,role) values ($1,$2,$3) returning id', [email, await bcrypt.hash(password, 4), role])
  expect((await browser.post('/api/auth/login', { email, password })).status).toBe(200)
  expect((await browser.request('/api/auth/me')).status).toBe(200)
  return { browser, id: String(result.rows[0].id) }
}

function input(slug = `synthetic-${randomUUID()}`, cik = String(nextCik++)): AdminGuruInput {
  return {
    profile: {
      name: 'Synthetic Investor', managerName: 'Synthetic Fund', slug,
      description: 'Editorial biography', investmentPhilosophy: 'Editorial investment approach',
      styleTags: ['Value', 'Quality'], managerType: 'Hedge Fund', website: 'https://example.test/fund',
      country: 'US', imageUrl: 'https://example.test/guru.png', securityNotes: 'Editorial class mapping note',
      featured: false, active: true, directoryOrder: 0,
    },
    manager: { cik },
  }
}

function update(browser: BrowserSession, id: string, body: unknown) {
  return browser.request(`/api/admin/gurus/${id}`, {
    method: 'PUT', headers: { 'content-type': 'application/json', 'x-csrf-token': browser.cookies.get('csrf-token')! },
    body: JSON.stringify(body),
  })
}

async function created(browser: BrowserSession, body: AdminGuruInput) {
  const response = await browser.post('/api/admin/gurus', body)
  expect(response.status).toBe(201)
  expect(response.headers.get('cache-control')).toBe('no-store')
  return adminGuruResponseSchema.parse(await response.json()).data
}

it('creates separated identity and editorial records, edits all fields, and paginates literal search with visibility filters', async () => {
  const { browser } = await account()
  const firstInput = input(`alpha-${randomUUID()}`, '123456')
  const first = await created(browser, firstInput)
  expect(first.manager.cik).toBe('0000123456')
  expect(first.profile).toEqual(firstInput.profile)
  expect(first.createdAt).toBe(clock.toISOString())
  expect(first.manager).not.toHaveProperty('managerName')
  expect(first.profile).not.toHaveProperty('cik')
  const second = await created(browser, input(`beta-${randomUUID()}`, '123457'))
  const firstPage = await browser.request('/api/admin/gurus?search=sYnThEtIc%20FuNd&limit=1&page=1')
  expect(firstPage.status).toBe(200)
  const list = await firstPage.json()
  expect(list.pagination).toEqual({ page: 1, limit: 1, total: 2, totalPages: 2 })
  expect(list.data.map((row: { id: string }) => row.id)).toEqual([second.id])
  expect((await (await browser.request('/api/admin/gurus?search=SYNTHETIC%20FUND&limit=1&page=2')).json()).data[0].id).toBe(first.id)
  expect((await (await browser.request('/api/admin/gurus?search=%25')).json()).data).toEqual([])

  clock = new Date('2026-10-06T09:00:00.000Z')
  const edit = input(first.profile.slug, '123458')
  edit.profile = { ...edit.profile, name: 'Edited Investor', managerName: 'Edited Fund', description: null, investmentPhilosophy: null, styleTags: ['Growth'], managerType: null, website: null, country: 'GB', imageUrl: null, securityNotes: null, featured: true, active: false }
  const changed = await update(browser, first.id, edit)
  expect(changed.status).toBe(200)
  const saved = adminGuruResponseSchema.parse(await changed.json()).data
  expect(saved.profile).toEqual(edit.profile)
  expect(saved.createdAt).toBe(first.createdAt)
  expect(saved.manager.id).toBe(first.manager.id)
  expect(saved.updatedAt).toBe(clock.toISOString())
  expect(saved.manager.cik).toBe('0000123458')
  expect(saved.manager.updatedAt).toBe(clock.toISOString())
  expect((await (await browser.request(`/api/admin/gurus/${first.id}`)).json()).data).toEqual(saved)
  const filtered = await browser.request('/api/admin/gurus?active=false&featured=true&search=123458')
  expect((await filtered.json()).data.map((row: { id: string }) => row.id)).toEqual([first.id])
  expect((await (await browser.request('/api/admin/gurus?active=true&featured=true')).json()).data).toEqual([])
})

it('returns validation and not-found errors and observes current ADMIN authorization on every endpoint', async () => {
  const admin = await account()
  const ordinary = await account('USER')
  const guru = await created(admin.browser, input())
  for (const path of ['/api/admin/gurus', `/api/admin/gurus/${guru.id}`]) {
    expect((await fetch(`${baseUrl}${path}`)).status).toBe(401)
    expect((await ordinary.browser.request(path)).status).toBe(403)
  }
  expect((await ordinary.browser.post('/api/admin/gurus', input())).status).toBe(403)
  expect((await update(ordinary.browser, guru.id, input())).status).toBe(403)
  expect((await admin.browser.post('/api/admin/gurus', input(), false)).status).toBe(403)

  const valid = input()
  for (const body of [
    { ...valid, manager: { cik: '0' } },
    { ...valid, manager: { cik: '12345678901' } },
    { ...valid, manager: { cik: 'not-a-cik' } },
    { ...valid, profile: { ...valid.profile, slug: 'Invalid--Slug' } },
    { ...valid, profile: { ...valid.profile, slug: 'consensus' } },
    { ...valid, profile: { ...valid.profile, name: ' ' } },
    { ...valid, profile: { ...valid.profile, website: 'javascript:alert(1)' } },
    { ...valid, profile: { ...valid.profile, country: 'usa' } },
    { ...valid, profile: { ...valid.profile, styleTags: ['Value', 'value'] } },
    { ...valid, profile: { ...valid.profile, reportedValue: '2000000' } },
    { ...valid, prompt: 'untrusted prompt' },
  ]) {
    const response = await admin.browser.post('/api/admin/gurus', body)
    expect(response.status).toBe(400)
    expect((await response.json()).data.code).toBe('SYS_VALIDATION_ERROR')
  }
  for (const query of ['active=yes', 'featured=0', 'page=0', 'limit=51', 'unknown=true']) {
    expect((await admin.browser.request(`/api/admin/gurus?${query}`)).status).toBe(400)
  }
  for (const id of ['not-an-id', '9223372036854775808']) {
    expect((await admin.browser.request(`/api/admin/gurus/${id}`)).status).toBe(400)
  }
  const missing = '9223372036854775807'
  expect((await admin.browser.request(`/api/admin/gurus/${missing}`)).status).toBe(404)
  expect((await update(admin.browser, missing, valid)).status).toBe(404)
  await database.pool.query("update users set role='USER' where id=$1", [admin.id])
  expect((await admin.browser.request('/api/admin/gurus')).status).toBe(403)
  expect((await admin.browser.request(`/api/admin/gurus/${guru.id}`)).status).toBe(403)
  expect((await admin.browser.post('/api/admin/gurus', input())).status).toBe(403)
  expect((await update(admin.browser, guru.id, valid)).status).toBe(403)
})

it('maps slug and canonical CIK conflicts safely, rolls back both tables, and tolerates concurrent creates', async () => {
  const { browser } = await account()
  const first = await created(browser, input(`conflict-${randomUUID()}`, '200001'))
  const second = await created(browser, input(`conflict-${randomUUID()}`, '200002'))
  const before = await database.pool.query('select (select count(*)::int from gurus) as gurus, (select count(*)::int from institutional_managers) as managers')
  const slugConflict = await browser.post('/api/admin/gurus', input(first.profile.slug, '200003'))
  expect(slugConflict.status).toBe(409)
  expect((await slugConflict.json()).data.code).toBe('GURU_SLUG_CONFLICT')
  const cikConflict = await browser.post('/api/admin/gurus', input(undefined, '0000200001'))
  expect(cikConflict.status).toBe(409)
  expect((await cikConflict.json()).data.code).toBe('GURU_CIK_CONFLICT')
  expect((await database.pool.query('select (select count(*)::int from gurus) as gurus, (select count(*)::int from institutional_managers) as managers')).rows).toEqual(before.rows)

  const updateSlugConflict = await update(browser, second.id, input(first.profile.slug, '200004'))
  expect(updateSlugConflict.status).toBe(409)
  expect((await updateSlugConflict.json()).data.code).toBe('GURU_SLUG_CONFLICT')
  expect((await (await browser.request(`/api/admin/gurus/${second.id}`)).json()).data).toEqual(second)
  const updateCikConflict = await update(browser, second.id, input(second.profile.slug, first.manager.cik))
  expect(updateCikConflict.status).toBe(409)
  expect((await updateCikConflict.json()).data.code).toBe('GURU_CIK_CONFLICT')
  expect((await (await browser.request(`/api/admin/gurus/${second.id}`)).json()).data).toEqual(second)

  const sameSlug = `concurrent-${randomUUID()}`
  const responses = await Promise.all([
    browser.post('/api/admin/gurus', input(sameSlug, '200005')),
    browser.post('/api/admin/gurus', input(sameSlug, '200006')),
  ])
  expect(responses.map(response => response.status).sort()).toEqual([201, 409])
  const rejected = responses.find(response => response.status === 409)!
  expect((await rejected.json()).data.code).toBe('GURU_SLUG_CONFLICT')
  const cikResponses = await Promise.all([
    browser.post('/api/admin/gurus', input(undefined, '200007')),
    browser.post('/api/admin/gurus', input(undefined, '0000200007')),
  ])
  expect(cikResponses.map(response => response.status).sort()).toEqual([201, 409])
  expect((await cikResponses.find(response => response.status === 409)!.json()).data.code).toBe('GURU_CIK_CONFLICT')
  expect((await database.pool.query('select count(*)::int as count from institutional_managers m left join gurus g on g.manager_id=m.id where g.id is null')).rows[0].count).toBe(0)
})

it('enforces canonical identities, unique manager bindings, valid slugs and references at the PostgreSQL boundary', async () => {
  const { browser } = await account()
  const guru = await created(browser, input())
  for (const cik of ['0', '0000000000', '123', 'ABCDEFGHIJ']) {
    await expect(database.pool.query('insert into institutional_managers(cik) values ($1)', [cik])).rejects.toMatchObject({ code: '23514' })
  }
  await expect(database.pool.query('update gurus set slug=$1 where id=$2', ['consensus', guru.id])).rejects.toMatchObject({ code: '23514' })
  await expect(database.pool.query('insert into gurus(manager_id,slug,name,manager_name) values ($1,$2,$3,$4)', [guru.manager.id, `duplicate-${randomUUID()}`, 'Other', 'Other'])).rejects.toMatchObject({ code: '23505', constraint: 'gurus_manager_unique' })
  await expect(database.pool.query('delete from institutional_managers where id=$1', [guru.manager.id])).rejects.toMatchObject({ code: '23503' })
})
