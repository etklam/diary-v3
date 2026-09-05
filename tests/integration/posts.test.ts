import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import { createApp } from '../../apps/api/src/app'
import { BrowserSession } from '../support/browser-session'
import { provisionTestDatabase } from '../support/database'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let server: ReturnType<typeof serve>
let baseUrl: string
let clock: Date

beforeAll(async () => { database = await provisionTestDatabase('posts_http') })
beforeEach(async () => {
  await database.pool.query('delete from posts')
  clock = new Date('2026-09-05T12:00:00.000Z')
  const app = createApp({
    db: database.db,
    now: () => clock,
    config: {
      jwtSecret: 'synthetic-posts-test-key-with-at-least-32-characters',
      nodeEnv: 'test', trustProxy: false, webOrigin: 'http://127.0.0.1',
    },
  })
  server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 })
  await once(server, 'listening')
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterEach(async () => { server.close(); await once(server, 'close') })
afterAll(async () => { await database?.dispose() })

async function login(admin: boolean) {
  const browser = new BrowserSession(baseUrl)
  const credentials = { email: `${randomUUID()}@example.test`, password: 'synthetic-post-password' }
  expect((await browser.post('/api/auth/register', credentials)).status).toBe(200)
  if (admin) await database.pool.query("update users set role='ADMIN' where email=$1", [credentials.email])
  expect((await browser.post('/api/auth/login', credentials)).status).toBe(200)
  expect((await browser.request('/api/auth/me')).status).toBe(200)
  return { browser, email: credentials.email }
}

async function create(browser: BrowserSession, overrides: Record<string, unknown> = {}) {
  const response = await browser.post('/api/blog', {
    title: 'Synthetic article',
    content: '# Body\n\nA safe Markdown body.',
    category: 'market',
    status: 'DRAFT',
    ...overrides,
  })
  const text = await response.text()
  if (response.status !== 200) throw new Error(`post create ${response.status}: ${text}`)
  return JSON.parse(text) as Record<string, any>
}

function mutate(browser: BrowserSession, path: string, body: unknown, method = 'PUT') {
  return browser.request(path, {
    method,
    headers: { 'content-type': 'application/json', 'x-csrf-token': browser.cookies.get('csrf-token')! },
    body: JSON.stringify(body),
  })
}

it('persists an admin draft, reopens long Markdown, and keeps it out of public projections', async () => {
  const { browser, email } = await login(true)
  const content = `# Long draft\n\n${'synthetic paragraph '.repeat(4_900)}`
  const post = await create(browser, { title: 'Private draft', content, excerpt: null, tags: ['alpha', 'beta'] })
  expect(post.status).toBe('DRAFT')
  expect(post.content).toBe(content)
  expect(post.author.email).toBe(email)
  expect(post.excerpt).toContain('synthetic paragraph')

  const reopened = await browser.request(`/api/blog/admin/${post.id}`)
  expect(reopened.status).toBe(200)
  expect((await reopened.json()).content).toBe(content)

  const publicList = await browser.request('/api/blog')
  expect(publicList.status).toBe(200)
  expect((await publicList.json()).data).toEqual([])
  const publicDetail = await browser.request(`/api/blog/${post.slug}`)
  expect(publicDetail.status).toBe(404)
})

it('enforces Admin authorization and keeps public author email private', async () => {
  const ordinary = await login(false)
  expect((await ordinary.browser.request('/api/blog/admin')).status).toBe(403)
  expect((await ordinary.browser.post('/api/blog', { title: 'Nope', content: 'private', category: 'market' })).status).toBe(403)
  const anonymous = new BrowserSession(baseUrl)
  expect((await anonymous.request('/api/blog/admin')).status).toBe(401)

  const { browser } = await login(true)
  const post = await create(browser, { title: 'Public author projection', status: 'PUBLISHED' })
  const list = await (await anonymous.request('/api/blog')).json()
  expect(list.data).toHaveLength(1)
  expect(list.data[0].author).toEqual({ id: expect.any(String), name: null })
  expect(list.data[0].author).not.toHaveProperty('email')
  const detail = await (await anonymous.request(`/api/blog/${post.slug}`)).json()
  expect(detail.author).not.toHaveProperty('email')
  expect(detail.content).toContain('safe Markdown')
})

it('uses the Admin role boundary instead of Diary-style author ownership', async () => {
  const owner = await login(true)
  const post = await create(owner.browser, { title: 'Admin-owned article' })
  const otherAdmin = await login(true)
  const response = await mutate(otherAdmin.browser, `/api/blog/${post.id}`, { title: 'Edited by another admin', content: 'Updated by an authorized administrator.', category: 'market', status: 'DRAFT' })
  expect(response.status).toBe(200)
  expect((await response.json()).title).toBe('Edited by another admin')
})

it('preserves first publishedAt across archive and republish', async () => {
  const { browser } = await login(true)
  const post = await create(browser, { title: 'Lifecycle article' })
  clock = new Date('2026-09-01T00:00:00.000Z')
  const published = await (await browser.post(`/api/blog/admin/${post.id}/publish`, {})).json()
  expect(published.status).toBe('PUBLISHED')
  expect(published.publishedAt).toBe(clock.toISOString())

  clock = new Date('2026-09-02T00:00:00.000Z')
  const updated = await mutate(browser, `/api/blog/${post.id}`, { title: 'Lifecycle article', content: 'edited', category: 'market', status: 'PUBLISHED' })
  expect(updated.status).toBe(200)
  expect((await updated.json()).publishedAt).toBe('2026-09-01T00:00:00.000Z')

  clock = new Date('2026-09-03T00:00:00.000Z')
  const archived = await (await browser.post(`/api/blog/admin/${post.id}/archive`, {})).json()
  expect(archived.status).toBe('ARCHIVED')
  expect(archived.publishedAt).toBe('2026-09-01T00:00:00.000Z')
  expect((await browser.request(`/api/blog/${post.slug}`)).status).toBe(404)

  clock = new Date('2026-09-04T00:00:00.000Z')
  const republished = await (await browser.post(`/api/blog/admin/${post.id}/publish`, {})).json()
  expect(republished.publishedAt).toBe('2026-09-01T00:00:00.000Z')
})

it('matches the measured public full-text boundary and excludes content-only terms', async () => {
  const { browser } = await login(true)
  await create(browser, { title: 'Investment the AI Alphabet', excerpt: 'Longterm investment evidence', content: 'bodyonly', status: 'PUBLISHED' })
  await create(browser, { title: '投資策略', excerpt: 'Café notes', content: 'otherbody', status: 'PUBLISHED' })
  const publicQuery = async (term: string) => (await (await browser.request(`/api/blog?search=${encodeURIComponent(term)}`)).json()).pagination.total
  expect(await publicQuery('investment')).toBe(1)
  expect(await publicQuery('vest')).toBe(0)
  expect(await publicQuery('the')).toBe(0)
  expect(await publicQuery('AI')).toBe(0)
  expect(await publicQuery('投資')).toBe(0)
  expect(await publicQuery('投資策略')).toBe(1)
  expect(await publicQuery('investment 投資')).toBe(1)
  expect(await publicQuery('bodyonly')).toBe(0)
  expect(await publicQuery('alpha*')).toBe(1)
  expect(await publicQuery('cafe')).toBe(1)
})

it('matches every frozen MariaDB boolean probe through the public API', async () => {
  const { browser } = await login(true)
  const fixture = JSON.parse(readFileSync(new URL('../../docs/parity/post-fulltext-boolean-probe.json', import.meta.url), 'utf8')) as {
    rows: [string, string, string][]
    phases: { results: { search: string; hits: { title: string }[] }[] }[]
  }
  for (const [index, [title, excerpt, content]] of fixture.rows.entries()) {
    await create(browser, { title, excerpt: excerpt || null, content: content || 'fixture body', status: 'PUBLISHED', tags: [`probe-${index}`] })
  }
  for (const expected of fixture.phases[0]!.results) {
    const response = await browser.request(`/api/blog?search=${encodeURIComponent(expected.search)}&sortBy=title_asc&limit=50`)
    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.data.map((row: { title: string }) => row.title).sort()).toEqual(expected.hits.map(hit => hit.title).sort())
  }
})

it('applies bulk publish/delete through the admin surface', async () => {
  const { browser } = await login(true)
  const first = await create(browser, { title: 'Bulk one' })
  const second = await create(browser, { title: 'Bulk two' })
  const published = await browser.post('/api/blog/admin/bulk-publish', { ids: [first.id, second.id] })
  expect(published.status).toBe(200)
  expect(await published.json()).toEqual({ count: 2 })
  const deleted = await browser.post('/api/blog/admin/bulk-delete', { ids: [first.id, second.id] })
  expect(deleted.status).toBe(200)
  expect(await deleted.json()).toEqual({ count: 2 })
  expect((await browser.request(`/api/blog/admin/${first.id}`)).status).toBe(404)
})
