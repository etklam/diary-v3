import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import { createApp } from '../../apps/api/src/app'
import { BrowserSession } from '../support/browser-session'
import { provisionTestDatabase } from '../support/database'
import type { PostAdminDetail } from '@diary/contracts'

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
  return JSON.parse(text) as PostAdminDetail
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
  expect(reopened.headers.get('cache-control')).toBe('no-store')
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
  const post = await create(browser, { title: 'Public author projection', status: 'PUBLISHED', access: 'PUBLIC' })
  const write = { title: 'Unauthorized edit', content: 'Must remain rejected.', category: 'market', status: 'PUBLISHED', access: 'MEMBER' }
  expect((await mutate(ordinary.browser, `/api/blog/${post.id}`, write)).status).toBe(403)
  expect((await ordinary.browser.post(`/api/blog/admin/${post.id}/publish`, {})).status).toBe(403)
  expect((await ordinary.browser.post(`/api/blog/admin/${post.id}/archive`, {})).status).toBe(403)
  expect((await mutate(anonymous, `/api/blog/${post.id}`, write)).status).toBe(401)
  expect((await anonymous.post(`/api/blog/admin/${post.id}/publish`, {})).status).toBe(401)
  expect((await anonymous.post(`/api/blog/admin/${post.id}/archive`, {})).status).toBe(401)
  expect((await mutate(ordinary.browser, `/api/blog/${post.id}`, write, 'DELETE')).status).toBe(403)
  expect((await mutate(anonymous, `/api/blog/${post.id}`, write, 'DELETE')).status).toBe(401)
  const list = await (await anonymous.request('/api/blog')).json()
  expect(list.data).toHaveLength(1)
  expect(list.data[0].author).toEqual({ id: expect.any(String), name: null })
  expect(list.data[0].author).not.toHaveProperty('email')
  const detail = await (await anonymous.request(`/api/blog/${post.slug}`)).json()
  expect(detail.access).toBe('PUBLIC')
  expect(detail.author).not.toHaveProperty('email')
  expect(detail.content).toContain('safe Markdown')

  const deletionTarget = await create(browser, { title: 'Admin direct delete' })
  expect((await mutate(browser, `/api/blog/${deletionTarget.id}`, {}, 'DELETE')).status).toBe(200)
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

  const savedArchived = await mutate(browser, `/api/blog/${post.id}`, { title: 'Lifecycle article', content: 'archived edit', category: 'market', status: 'ARCHIVED' })
  expect(savedArchived.status).toBe(200)
  expect(await savedArchived.json()).toMatchObject({ status: 'ARCHIVED', publishedAt: '2026-09-01T00:00:00.000Z', content: 'archived edit' })

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

it('keeps admin search distinct from public full text and enforces CSRF on writes', async () => {
  const { browser, email } = await login(true)
  const post = await create(browser, { title: 'Distinct admin title', status: 'PUBLISHED' })
  await database.pool.query('update users set name=$1 where email=$2', ['Article Searcher', email])
  for (const term of ['Distinct admin title', 'Article Searcher', email]) {
    const result = await browser.request(`/api/blog/admin?search=${encodeURIComponent(term)}`)
    expect(result.status).toBe(200)
    expect(result.headers.get('cache-control')).toBe('no-store')
    expect((await result.json()).data.map((row: { id: string }) => row.id)).toContain(post.id)
  }

  const accepted = await mutate(browser, `/api/blog/${post.id}`, { title: 'Admin write', content: 'accepted', category: 'market', status: 'PUBLISHED' }, 'PUT')
  expect(accepted.status).toBe(200)
  const missingCsrf = await browser.request(`/api/blog/${post.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'No CSRF', content: 'rejected', category: 'market', status: 'PUBLISHED' }) })
  expect(missingCsrf.status).toBe(403)
  expect((await missingCsrf.json()).data.code).toBe('CSRF_FAILED')
})

it('enforces PUBLIC and MEMBER reading access without exposing protected body text', async () => {
  const { browser: admin } = await login(true)
  const sentinel = 'QZK9X7M2'
  const publicPost = await create(admin, { title: 'Access public article', content: 'Public article body', status: 'PUBLISHED', access: 'PUBLIC' })
  const memberPost = await create(admin, { title: 'Access member article', content: `# Protected\n\n${sentinel}`, status: 'PUBLISHED', access: 'MEMBER' })
  const guest = new BrowserSession(baseUrl)

  const listResponse = await guest.request('/api/blog?sortBy=title_asc')
  expect(listResponse.status).toBe(200)
  expect(listResponse.headers.get('cache-control')).toBe('no-store')
  const list = await listResponse.json()
  expect(list.data).toEqual(expect.arrayContaining([
    expect.objectContaining({ slug: publicPost.slug, access: 'PUBLIC', membersOnly: false }),
    expect.objectContaining({ slug: memberPost.slug, access: 'MEMBER', membersOnly: true, excerpt: null }),
  ]))
  expect(JSON.stringify(list)).not.toContain(sentinel)

  const search = await guest.request(`/api/blog?search=${encodeURIComponent(sentinel)}`)
  expect((await search.json()).pagination.total).toBe(0)

  const publicDetail = await guest.request(`/api/blog/${publicPost.slug}`)
  expect(publicDetail.status).toBe(200)
  expect((await publicDetail.json()).content).toContain('Public article body')

  const memberDetail = await guest.request(`/api/blog/${memberPost.slug}`)
  expect(memberDetail.status).toBe(401)
  expect(memberDetail.headers.get('cache-control')).toBe('no-store')
  const memberError = await memberDetail.text()
  expect(memberError).not.toContain(sentinel)

  const metadata = await guest.request(`/api/blog/${memberPost.slug}/metadata`)
  expect(metadata.status).toBe(200)
  const metadataBody = await metadata.json()
  expect(metadataBody).toMatchObject({ slug: memberPost.slug, access: 'MEMBER', membersOnly: true, excerpt: null })
  expect(metadataBody).not.toHaveProperty('content')
  expect(JSON.stringify(metadataBody)).not.toContain(sentinel)

  const member = await login(false)
  const memberPublicDetail = await member.browser.request(`/api/blog/${publicPost.slug}`)
  expect(memberPublicDetail.status).toBe(200)
  expect((await memberPublicDetail.json()).content).toContain('Public article body')
  const authorizedDetail = await member.browser.request(`/api/blog/${memberPost.slug}`)
  expect(authorizedDetail.status).toBe(200)
  expect(authorizedDetail.headers.get('cache-control')).toBe('no-store')
  expect((await authorizedDetail.json()).content).toContain(sentinel)

  const guestAfterAuthorizedRead = await guest.request(`/api/blog/${memberPost.slug}`)
  expect(guestAfterAuthorizedRead.status).toBe(401)
  expect((await guestAfterAuthorizedRead.text())).not.toContain(sentinel)
})

it('keeps derived excerpts private across PUBLIC to MEMBER changes and allows authored teasers', async () => {
  const { browser: admin } = await login(true)
  const sentinel = 'R4V8N2K6'
  const post = await create(admin, { title: 'Visibility transition', content: `Body ${sentinel}`, status: 'PUBLISHED', access: 'PUBLIC' })
  const guest = new BrowserSession(baseUrl)
  expect((await guest.request(`/api/blog/${post.slug}`)).status).toBe(200)

  const updated = await mutate(admin, `/api/blog/${post.id}`, {
    title: post.title,
    content: `Body ${sentinel}`,
    excerpt: post.excerpt,
    category: post.category,
    status: 'PUBLISHED',
    access: 'MEMBER',
  })
  expect(updated.status).toBe(200)
  expect((await updated.json())).toMatchObject({ access: 'MEMBER', excerpt: null, excerptAuthored: false })

  const locked = await guest.request(`/api/blog/${post.slug}`)
  expect(locked.status).toBe(401)
  expect((await guest.request(`/api/blog/${post.slug}/metadata`)).status).toBe(200)
  const metadata = await (await guest.request(`/api/blog/${post.slug}/metadata`)).json()
  expect(metadata.excerpt).toBeNull()
  expect(JSON.stringify(metadata)).not.toContain(sentinel)
  expect((await guest.request(`/api/blog?search=${encodeURIComponent(sentinel)}`)).status).toBe(200)
  expect((await (await guest.request(`/api/blog?search=${encodeURIComponent(sentinel)}`)).json()).pagination.total).toBe(0)

  const teaser = await create(admin, {
    title: 'Authored teaser member article',
    content: `Private ${sentinel}`,
    excerpt: 'A deliberately authored public teaser.',
    status: 'PUBLISHED',
    access: 'MEMBER',
  })
  const teaserMetadata = await (await guest.request(`/api/blog/${teaser.slug}/metadata`)).json()
  expect(teaserMetadata).toMatchObject({ access: 'MEMBER', excerpt: 'A deliberately authored public teaser.' })
  expect(teaserMetadata).not.toHaveProperty('content')
})

it('keeps drafts unavailable to members while allowing authorized admin preview', async () => {
  const { browser: admin } = await login(true)
  const post = await create(admin, { title: 'Preview-only member draft', content: 'Draft body sentinel', access: 'MEMBER' })
  const guest = new BrowserSession(baseUrl)
  const member = await login(false)
  const guestDetail = await guest.request(`/api/blog/${post.slug}`)
  expect(guestDetail.status).toBe(404)
  expect((await guestDetail.text())).not.toContain('Draft body sentinel')
  const memberDetail = await member.browser.request(`/api/blog/${post.slug}`)
  expect(memberDetail.status).toBe(404)
  expect((await memberDetail.text())).not.toContain('Draft body sentinel')
  const memberAdminDetail = await member.browser.request(`/api/blog/admin/${post.id}`)
  expect(memberAdminDetail.status).toBe(403)
  expect((await memberAdminDetail.text())).not.toContain('Draft body sentinel')
  const preview = await admin.request(`/api/blog/admin/${post.id}`)
  expect(preview.status).toBe(200)
  expect((await preview.json()).content).toContain('Draft body sentinel')
})

it('rejects invalid access values at the write boundary', async () => {
  const { browser: admin } = await login(true)
  const response = await admin.post('/api/blog', { title: 'Invalid access', content: 'body', category: 'market', access: 'PREMIUM' })
  expect(response.status).toBe(400)
  expect((await response.json()).data.code).toBe('SYS_VALIDATION_ERROR')
})

it('rejects invalid, expired, and account-revoked sessions before returning a MEMBER body', async () => {
  const { browser: admin } = await login(true)
  const sentinel = 'AUTHENTICATED_BODY_Q7N4'
  const post = await create(admin, { title: 'Session protected article', content: sentinel, status: 'PUBLISHED', access: 'MEMBER' })
  const guest = new BrowserSession(baseUrl)

  const invalid = await guest.request(`/api/blog/${post.slug}`, { headers: { authorization: 'Bearer definitely-invalid' } })
  expect(invalid.status).toBe(401)
  expect((await invalid.text())).not.toContain(sentinel)

  const expiredMember = await login(false)
  const explicitEmpty = await expiredMember.browser.request(`/api/blog/${post.slug}`, { headers: { authorization: '' } })
  expect(explicitEmpty.status).toBe(401)
  expect(await explicitEmpty.text()).not.toContain(sentinel)
  const expiredToken = expiredMember.browser.cookies.get('access-token')!
  clock = new Date(clock.getTime() + 60 * 60 * 1000 + 1_000)
  const expired = await guest.request(`/api/blog/${post.slug}`, { headers: { authorization: `Bearer ${expiredToken}` } })
  expect(expired.status).toBe(401)
  expect((await expired.text())).not.toContain(sentinel)

  const revokedMember = await login(false)
  const revokedToken = revokedMember.browser.cookies.get('access-token')!
  expect((await revokedMember.browser.post('/api/auth/logout-all', {})).status).toBe(200)
  const revoked = await guest.request(`/api/blog/${post.slug}`, { headers: { authorization: `Bearer ${revokedToken}` } })
  expect(revoked.status).toBe(401)
  expect((await revoked.text())).not.toContain(sentinel)
})
