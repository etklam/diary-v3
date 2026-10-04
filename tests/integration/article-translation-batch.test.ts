import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import { and, desc, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import { articleTranslationBatchResponseSchema, articleTranslationStatesResponseSchema } from '@diary/contracts'
import { articleTranslationJobs, postTranslations } from '@diary/db'
import { createApp } from '../../apps/api/src/app'
import { BrowserSession } from '../support/browser-session'
import { provisionTestDatabase } from '../support/database'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let server: ReturnType<typeof serve> | undefined
let baseUrl: string

beforeAll(async () => { database = await provisionTestDatabase('article_translation_batch') })
beforeEach(async () => {
  await database.pool.query('delete from posts')
  await database.pool.query("delete from users where email like 'batch-translation-%@example.test'")
  const app = createApp({ db: database.db, config: { jwtSecret: 'synthetic-article-batch-key-32-characters', nodeEnv: 'test', trustProxy: false, webOrigin: 'http://127.0.0.1' } })
  server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 })
  await once(server, 'listening')
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterEach(async () => { if (server) { const closing = server; server = undefined; closing.close(); await once(closing, 'close') } })
afterAll(async () => { await database?.dispose() })

async function login(admin: boolean) {
  const browser = new BrowserSession(baseUrl)
  const email = `batch-translation-${randomUUID()}@example.test`
  const credentials = { email, password: 'synthetic-batch-translation-password' }
  expect((await browser.post('/api/auth/register', credentials)).status).toBe(200)
  if (admin) await database.pool.query("update users set role='ADMIN' where email=$1", [email])
  expect((await browser.post('/api/auth/login', credentials)).status).toBe(200)
  expect((await browser.request('/api/auth/me')).status).toBe(200)
  return browser
}

async function createArticle(browser: BrowserSession, overrides: Record<string, unknown> = {}) {
  const response = await browser.post('/api/blog', {
    title: `Batch article ${randomUUID()}`,
    content: '# 市場觀察\n\n保留立場，資料截至 2026-09-24。',
    category: 'market',
    status: 'PUBLISHED',
    access: 'PUBLIC',
    ...overrides,
  })
  expect(response.status).toBe(200)
  return await response.json() as { id: string; title: string; sourceLocale: 'zh-TW' | 'zh-CN' | 'en' }
}

it('reports one outcome per article and locale, and never approves or publishes', async () => {
  const admin = await login(true)
  const publicArticle = await createArticle(admin)
  const memberArticle = await createArticle(admin, { access: 'MEMBER' })

  // Reading state never calls a provider and never queues anything.
  const states = articleTranslationStatesResponseSchema.parse(await (await admin.request(`/api/admin/article-translations/states?ids=${publicArticle.id},${memberArticle.id}`)).json())
  expect(states.articles.map(article => article.articleId).sort()).toEqual([publicArticle.id, memberArticle.id].sort())
  expect(states.articles[0]!.locales.map(row => row.status)).toEqual(['MISSING', 'MISSING'])
  expect(await database.db.select().from(articleTranslationJobs)).toHaveLength(0)

  // A mixed batch: the public article queues, the MEMBER article is refused by
  // the Edge privacy rule, and each article skips its own source locale.
  const dispatch = await admin.post('/api/admin/article-translations/jobs', {
    articleIds: [publicArticle.id, memberArticle.id],
    targetLocales: ['zh-TW', 'zh-CN', 'en'],
    provider: 'edge',
  })
  expect(dispatch.status).toBe(200)
  const results = articleTranslationBatchResponseSchema.parse(await dispatch.json())
  expect(results.results).toHaveLength(6)
  const outcomeFor = (articleId: string, locale: string) => results.results.find(row => row.articleId === articleId && row.locale === locale)
  expect(outcomeFor(publicArticle.id, 'zh-TW')!.outcome).toBe('SKIPPED_SOURCE_LOCALE')
  expect(outcomeFor(publicArticle.id, 'en')!.outcome).toBe('QUEUED')
  expect(outcomeFor(publicArticle.id, 'en')!.status).toBe('QUEUED')
  expect(outcomeFor(publicArticle.id, 'zh-CN')!.outcome).toBe('QUEUED')
  // A partial batch never reads as "all queued".
  expect(outcomeFor(memberArticle.id, 'en')!.outcome).toBe('PRIVACY_RESTRICTED')
  expect(outcomeFor(memberArticle.id, 'zh-CN')!.outcome).toBe('PRIVACY_RESTRICTED')
  const queued = await database.db.select().from(articleTranslationJobs)
  expect(queued).toHaveLength(2)
  expect(queued.every(job => job.postId === BigInt(publicArticle.id))).toBe(true)
  // Dispatch enqueues only: nothing is reviewed, approved or published.
  expect(await database.db.select().from(postTranslations)).toHaveLength(0)

  // A second dispatch for the same source revision deduplicates instead of
  // queueing the same work twice.
  const again = articleTranslationBatchResponseSchema.parse(await (await admin.post('/api/admin/article-translations/jobs', {
    articleIds: [publicArticle.id], targetLocales: ['en'], provider: 'edge',
  })).json())
  expect(again.results[0]!.outcome).toBe('ALREADY_ACTIVE')
  expect(await database.db.select().from(articleTranslationJobs)).toHaveLength(2)
})

it('keeps a published translation while a retranslation is queued, and enforces admin access', async () => {
  const admin = await login(true)
  const article = await createArticle(admin)
  // A published English translation, as the review flow leaves it.
  await database.db.insert(postTranslations).values({
    postId: BigInt(article.id), locale: 'en', status: 'published',
    draftTitle: 'Published title', draftContent: '# Published\n\nBody.', draftExcerpt: null, draftVersion: 1,
    draftSourceRevision: 1, draftSourceHash: '0'.repeat(32), reviewedDraftVersion: 1, reviewedAt: new Date('2026-09-25T12:00:00.000Z'),
    publishedTitle: 'Published title', publishedContent: '# Published\n\nBody.', publishedExcerpt: null,
    publishedVersion: 1, publishedSourceRevision: 1, publishedSourceHash: '0'.repeat(32), publishedAt: new Date('2026-09-25T12:05:00.000Z'),
  })
  const before = await database.db.select().from(postTranslations).where(and(eq(postTranslations.postId, BigInt(article.id)), eq(postTranslations.locale, 'en')))

  const results = articleTranslationBatchResponseSchema.parse(await (await admin.post('/api/admin/article-translations/jobs', {
    articleIds: [article.id], targetLocales: ['en'], provider: 'edge',
  })).json())
  expect(results.results[0]!.outcome).toBe('QUEUED')
  const after = await database.db.select().from(postTranslations).where(and(eq(postTranslations.postId, BigInt(article.id)), eq(postTranslations.locale, 'en')))
  // The reader keeps the published snapshot until a new draft is reviewed.
  expect(after[0]!.publishedTitle).toBe(before[0]!.publishedTitle)
  expect(after[0]!.publishedContent).toBe(before[0]!.publishedContent)
  expect(after[0]!.publishedVersion).toBe(before[0]!.publishedVersion)
  const [job] = await database.db.select().from(articleTranslationJobs).orderBy(desc(articleTranslationJobs.id)).limit(1)
  expect(job!.status).toBe('queued')

  const member = await login(false)
  expect((await member.request(`/api/admin/article-translations/states?ids=${article.id}`)).status).toBe(403)
  expect((await member.post('/api/admin/article-translations/jobs', { articleIds: [article.id], targetLocales: ['en'], provider: 'edge' })).status).toBe(403)
  const guest = new BrowserSession(baseUrl)
  expect((await guest.request(`/api/admin/article-translations/states?ids=${article.id}`)).status).toBe(401)
  // An AI dispatch with no configured provider refuses every item rather than
  // calling anything.
  const refused = articleTranslationBatchResponseSchema.parse(await (await admin.post('/api/admin/article-translations/jobs', {
    articleIds: [article.id], targetLocales: ['en'], provider: 'ai',
  })).json())
  expect(refused.results[0]!.outcome).toBe('PROVIDER_DISABLED')
})
