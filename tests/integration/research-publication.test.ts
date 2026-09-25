import { createHash, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { posts, researchArticleLinks, researchEvidenceSnapshots, researchInstrumentProfiles, researchMethodProfiles, researchRevisions, researchRuns } from '@diary/db'
import { createApp } from '../../apps/api/src/app'
import { BrowserSession } from '../support/browser-session'
import { provisionTestDatabase } from '../support/database'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let server: ReturnType<typeof serve>
let browser: BrowserSession
let actorId: bigint
const now = new Date('2026-09-24T22:00:00.000Z')
const hash = (value: string) => createHash('sha256').update(value).digest('hex')

beforeAll(async () => {
  database = await provisionTestDatabase('research_publication')
  const app = createApp({ db: database.db, now: () => now, config: { jwtSecret: 'synthetic-research-publication-key-with-32-characters', nodeEnv: 'test', trustProxy: false, webOrigin: 'http://127.0.0.1' } })
  server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 })
  await once(server, 'listening')
  browser = new BrowserSession(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)
  const credentials = { email: 'research-publication@example.test', password: 'synthetic-research-password' }
  expect((await browser.post('/api/auth/register', credentials)).status).toBe(200)
  const result = await database.pool.query("update users set role='ADMIN' where email=$1 returning id::text", [credentials.email])
  actorId = BigInt(result.rows[0].id)
  expect((await browser.post('/api/auth/login', credentials)).status).toBe(200)
  expect((await browser.request('/api/auth/me')).status).toBe(200)
})
afterAll(async () => {
  if (server) { server.close(); await once(server, 'close') }
  await database?.dispose()
})

async function createPost() {
  const response = await browser.post('/api/blog', { title: `Synthetic research ${randomUUID()}`, content: 'Synthetic research body.', category: 'technical', status: 'DRAFT', access: 'MEMBER' })
  expect(response.status).toBe(200)
  return await response.json() as { id: string; title: string; content: string; slug: string }
}
async function seedResearch() {
  const post = await createPost()
  const [method] = await database.db.insert(researchMethodProfiles).values({ methodKey: `fixture-${randomUUID().slice(0, 8)}`, version: '1.0.0', title: 'Synthetic publication fixture', status: 'COMPLETE' }).returning()
  const [instrument] = await database.db.insert(researchInstrumentProfiles).values({ methodProfileId: method!.id, symbol: 'SOXX', name: 'Synthetic instrument', exchange: 'NASDAQ', currency: 'USD', assetType: 'ETF' }).returning()
  const [run] = await database.db.insert(researchRuns).values({ requesterId: actorId, methodProfileId: method!.id, instrumentProfileId: instrument!.id, executionStatus: 'DRAFT_READY', dispatchStatus: 'SUCCEEDED', quality: 'LIMITED', reviewStatus: 'APPROVED', referenceSession: '2026-09-24', asOf: now, currentRevision: 1, linkedPostId: BigInt(post.id), evidenceHash: hash('synthetic-evidence') }).returning()
  const manifest = { synthetic: true, referenceSession: '2026-09-24', asOf: now.toISOString(), displayTimezone: 'Asia/Hong_Kong', exchangeTimezone: 'America/New_York', calendarVersion: 'synthetic-calendar', normalizationVersion: 'synthetic-v1', targetSessions: 400, rowCount: 400, closeRows: 400, completeOhlcRows: 150, volumeRows: 21, missingSessions: [], warnings: ['Synthetic fixture; never publish.'], sourceIds: ['SYNTHETIC_SOURCE'] }
  await database.db.insert(researchEvidenceSnapshots).values({ runId: run!.id, version: 1, manifestJson: JSON.stringify(manifest), contentHash: hash('synthetic-evidence'), quality: 'LIMITED' })
  const [revision] = await database.db.insert(researchRevisions).values({ runId: run!.id, revision: 1, titleHash: hash(post.title), bodyHash: hash(post.content), structuredJson: JSON.stringify({ synthetic: true, title: post.title, qa: [] }), content: post.content, reviewStatus: 'APPROVED', approvedBy: actorId, approvedBySnapshot: actorId, approvedAt: now, createdBy: actorId }).returning()
  await database.db.insert(researchArticleLinks).values({ postId: BigInt(post.id), runId: run!.id, revisionId: revision!.id, titleHash: hash(post.title), bodyHash: hash(post.content), evidenceHash: hash('synthetic-evidence'), referenceSession: '2026-09-24' })
  return { post, runId: run!.id }
}
function edit(post: Awaited<ReturnType<typeof createPost>>, changes: Record<string, unknown> = {}) {
  return browser.request(`/api/blog/${post.id}`, { method: 'PUT', headers: { 'content-type': 'application/json', 'x-csrf-token': browser.cookies.get('csrf-token')! }, body: JSON.stringify({ title: post.title, content: post.content, category: 'technical', status: 'PUBLISHED', access: 'PUBLIC', ...changes }) })
}

it('denies synthetic research through single, bulk and PUT publication and rolls back the whole bulk write', async () => {
  const { post } = await seedResearch()
  const ordinary = await createPost()
  expect((await browser.post(`/api/blog/admin/${post.id}/publish`, {})).status).toBe(409)
  expect((await edit(post)).status).toBe(409)
  expect((await browser.post('/api/blog/admin/bulk-publish', { ids: [ordinary.id, post.id] })).status).toBe(409)
  const rows = await database.pool.query('select status,access from posts where id=any($1::bigint[])', [[ordinary.id, post.id]])
  expect(rows.rows).toEqual([{ status: 'DRAFT', access: 'MEMBER' }, { status: 'DRAFT', access: 'MEMBER' }])
  expect((await browser.request(`/api/blog/${post.slug}`)).status).toBe(404)
})

it('atomically drafts a changed research article and invalidates approval even when PUBLISHED is requested', async () => {
  const { post, runId } = await seedResearch()
  // Fault injection models an existing published record; this does not use the publication flow.
  await database.db.update(posts).set({ status: 'PUBLISHED', publishedAt: now }).where(eq(posts.id, BigInt(post.id)))
  const response = await edit(post, { title: 'Changed synthetic research', content: 'Changed synthetic body.' })
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ status: 'DRAFT', access: 'PUBLIC' })
  const [run] = await database.db.select().from(researchRuns).where(eq(researchRuns.id, runId))
  expect(run).toMatchObject({ reviewStatus: 'CHANGES_REQUIRED', version: 2 })
  expect((await browser.post(`/api/blog/admin/${post.id}/publish`, {})).status).toBe(409)
  const link = await database.db.select().from(researchArticleLinks).where(eq(researchArticleLinks.postId, BigInt(post.id)))
  expect(link).toHaveLength(1)
})

it('serializes concurrent edit and publish without exposing the changed research revision', async () => {
  const { post } = await seedResearch()
  const [changed, published] = await Promise.all([
    edit(post, { content: 'Concurrent synthetic edit.' }),
    browser.post(`/api/blog/admin/${post.id}/publish`, {}),
  ])
  expect(changed.status).toBe(200)
  expect(published.status).toBe(409)
  const [row] = await database.db.select().from(posts).where(eq(posts.id, BigInt(post.id)))
  expect(row).toMatchObject({ status: 'DRAFT', content: 'Concurrent synthetic edit.' })
})

it('preserves ordinary create-as-published and Public/Member behavior', async () => {
  const created = await browser.post('/api/blog', { title: `Ordinary synthetic ${randomUUID()}`, content: 'Local article regression fixture.', category: 'market', status: 'PUBLISHED', access: 'PUBLIC' })
  expect(created.status).toBe(200)
  const post = await created.json() as Awaited<ReturnType<typeof createPost>>
  expect((await browser.request(`/api/blog/${post.slug}`)).status).toBe(200)
  expect((await edit(post, { access: 'MEMBER' })).status).toBe(200)
})
