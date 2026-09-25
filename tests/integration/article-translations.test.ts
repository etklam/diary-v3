import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import { desc, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { articleTranslationAiProfiles, articleTranslationAiSettings, articleTranslationJobs, articleTranslationRuntime, postTranslations, posts, type Database } from '@diary/db'
import type { AiTransport } from '../../apps/api/src/ai-reports/outbound-policy'
import { runArticleTranslationOnce, runArticleTranslationWorker } from '../../apps/api/src/article-translations/worker'
import { createApp } from '../../apps/api/src/app'
import { encryptAiSecret } from '../../apps/api/src/ai-reports/secrets'
import { BrowserSession } from '../support/browser-session'
import { provisionTestDatabase } from '../support/database'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let server: ReturnType<typeof serve> | undefined
let baseUrl: string
let clock: Date
let previousEncryptionActiveKey: string | undefined
let previousEncryptionKeys: string | undefined
let previousAllowedAiBaseUrls: string | undefined

beforeAll(async () => {
  previousEncryptionActiveKey = process.env.AI_ENCRYPTION_ACTIVE_KEY
  previousEncryptionKeys = process.env.AI_ENCRYPTION_KEYS
  previousAllowedAiBaseUrls = process.env.AI_ALLOWED_BASE_URLS
  process.env.AI_ENCRYPTION_ACTIVE_KEY = 'article-translation-test'
  process.env.AI_ENCRYPTION_KEYS = JSON.stringify({ 'article-translation-test': Buffer.alloc(32, 9).toString('base64') })
  process.env.AI_ALLOWED_BASE_URLS = 'https://unrelated.example.test/v1'
  database = await provisionTestDatabase('article_translations')
})
beforeEach(async () => {
  await database.pool.query('delete from posts')
  await database.pool.query("update article_translation_ai_settings set default_profile_id=null, revision=revision+1 where singleton='default'")
  await database.pool.query('delete from article_translation_ai_profile')
  await database.pool.query("delete from users where email like 'translation-%@example.test'")
  await database.pool.query("update article_translation_runtime set worker_id=null, worker_heartbeat_at=null, active_job_id=null, active_lease_token=null, active_lease_expires_at=null, edge_failure_count=0, edge_disabled_until=null, edge_last_error_code=null, edge_last_failure_at=null where singleton='default'")
  clock = new Date('2026-09-25T12:00:00.000Z')
  const app = createApp({ db: database.db, now: () => clock, config: { jwtSecret: 'synthetic-article-translations-key-32chars', nodeEnv: 'test', trustProxy: false, webOrigin: 'http://127.0.0.1' } })
  server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 })
  await once(server, 'listening')
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(async () => {
  await database?.dispose()
  if (previousEncryptionActiveKey === undefined) delete process.env.AI_ENCRYPTION_ACTIVE_KEY
  else process.env.AI_ENCRYPTION_ACTIVE_KEY = previousEncryptionActiveKey
  if (previousEncryptionKeys === undefined) delete process.env.AI_ENCRYPTION_KEYS
  else process.env.AI_ENCRYPTION_KEYS = previousEncryptionKeys
  if (previousAllowedAiBaseUrls === undefined) delete process.env.AI_ALLOWED_BASE_URLS
  else process.env.AI_ALLOWED_BASE_URLS = previousAllowedAiBaseUrls
})
afterEach(async () => {
  if (server) { const closing = server; server = undefined; closing.close(); await once(closing, 'close') }
})

async function login(admin: boolean) {
  const browser = new BrowserSession(baseUrl)
  const email = `translation-${randomUUID()}@example.test`
  const credentials = { email, password: 'synthetic-translation-password' }
  expect((await browser.post('/api/auth/register', credentials)).status).toBe(200)
  if (admin) await database.pool.query("update users set role='ADMIN' where email=$1", [email])
  expect((await browser.post('/api/auth/login', credentials)).status).toBe(200)
  expect((await browser.request('/api/auth/me')).status).toBe(200)
  return browser
}

async function createArticle(browser: BrowserSession, overrides: Record<string, unknown> = {}) {
  const response = await browser.post('/api/blog', {
    title: `Synthetic article ${randomUUID()}`,
    content: '# 市場觀察\n\nSOXX +15.4% 保留立場。價格 614.61，資料截至 2026-09-24。',
    category: 'market',
    status: 'PUBLISHED',
    access: 'PUBLIC',
    ...overrides,
  })
  const text = await response.text()
  if (response.status !== 200) throw new Error(`article create ${response.status}: ${text}`)
  return JSON.parse(text) as { id: string; slug: string; title: string; content: string; excerpt: string | null; sourceLocale: 'zh-TW' | 'zh-CN' | 'en'; status: string; access: string; autoTranslateEnabled: boolean; autoTranslateLocales: ('zh-TW' | 'zh-CN' | 'en')[]; autoTranslateProvider: 'edge' | 'ai' }
}

function edgeMock(transform: (block: string) => string = block => block) {
  const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
    const blocks = JSON.parse(String(init?.body)) as string[]
    return Response.json(blocks.map(block => ({ translations: [{ text: transform(block) }] })))
  })
  return fetchImpl
}

function wrappedDatabaseError(code: string, secret?: string) {
  const message = secret ? `Synthetic query failure\nquery: UPDATE post_translations\nparams: ${secret}` : 'Synthetic query failure'
  const error = new Error(message)
  Object.assign(error, { cause: { code } })
  if (secret) error.stack = `DrizzleQueryError: ${message}\n    at syntheticQuery (/tmp/database-fixture.ts:1:1)`
  return error
}

function databaseFailingOnTransaction(callNumber: number, error: Error) {
  let calls = 0
  const db = new Proxy(database.db, {
    get(target, property) {
      const value = Reflect.get(target, property, target)
      if (property === 'transaction' && typeof value === 'function') {
        return (...args: unknown[]) => {
          calls += 1
          if (calls === callNumber) throw error
          return Reflect.apply(value, target, args)
        }
      }
      return typeof value === 'function' ? value.bind(target) : value
    },
  }) as Database
  return { db, transactionCalls: () => calls }
}

function databaseFailingOnSelect(error: Error) {
  const db = new Proxy(database.db, {
    get(target, property) {
      const value = Reflect.get(target, property, target)
      if (property === 'select') return () => { throw error }
      return typeof value === 'function' ? value.bind(target) : value
    },
  }) as Database
  return db
}

function databaseFailingOnSelectFrom(table: unknown, error: Error) {
  const wrapQuery = (query: object, shouldFail: boolean): object => new Proxy(query, {
    get(target, property) {
      if (property === 'then' && shouldFail) {
        return (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.reject(error).then(resolve, reject)
      }
      const value = Reflect.get(target, property, target)
      if (typeof value !== 'function') return value
      return (...args: unknown[]) => {
        const next: unknown = Reflect.apply(value, target, args)
        if (typeof next !== 'object' || next === null) return next
        return wrapQuery(next, shouldFail || (property === 'from' && args[0] === table))
      }
    },
  })
  return new Proxy(database.db, {
    get(target, property) {
      const value = Reflect.get(target, property, target)
      if (property === 'select' && typeof value === 'function') {
        return (...args: unknown[]) => wrapQuery(Reflect.apply(value, target, args), false)
      }
      return typeof value === 'function' ? value.bind(target) : value
    },
  }) as Database
}

async function mutate(browser: BrowserSession, path: string, body: unknown, method = 'POST') {
  return browser.request(path, { method, headers: { 'content-type': 'application/json', 'x-csrf-token': browser.cookies.get('csrf-token')! }, body: JSON.stringify(body) })
}

async function persistAiProfile(name = 'Synthetic provider', baseUrl = 'https://compatible.example.test/v1', model = 'synthetic-config-test') {
  const [profile] = await database.db.insert(articleTranslationAiProfiles).values({
    name, enabled: true, baseUrl, model, encryptedApiKey: encryptAiSecret('synthetic-article-translation-key', 'article-translation-api-key'),
    translationPrompt: 'Preserve source facts and translate only the supplied article content.',
    revision: 1,
  }).returning()
  if (!profile) throw new Error('Synthetic AI provider profile was not created')
  await database.db.insert(articleTranslationAiSettings).values({ singleton: 'default', defaultProfileId: profile.id })
    .onConflictDoUpdate({ target: articleTranslationAiSettings.singleton, set: { defaultProfileId: profile.id, revision: 1 } })
  return profile
}

it('deduplicates Admin jobs, reviews a draft, publishes it, localizes lists, and falls back honestly', async () => {
  const admin = await login(true)
  const ordinary = await login(false)
  const post = await createArticle(admin)
  expect((await ordinary.request(`/api/blog/admin/${post.id}/translations`)).status).toBe(403)
  expect((await new BrowserSession(baseUrl).request(`/api/blog/admin/${post.id}/translations`)).status).toBe(401)

  const requests = await Promise.all(Array.from({ length: 8 }, () => admin.post(`/api/blog/admin/${post.id}/translations/jobs`, { targetLocales: ['en'], provider: 'edge' })))
  expect(requests.every(response => response.status === 200)).toBe(true)
  const ids = await Promise.all(requests.map(async response => (await response.json()).jobs[0].id))
  expect(new Set(ids).size).toBe(1)
  expect(await database.db.select().from(articleTranslationJobs).where(eq(articleTranslationJobs.postId, BigInt(post.id)))).toHaveLength(1)

  const fetchImpl = edgeMock(block => block.replace('Synthetic article', 'English article').replace('市場觀察', 'Market review').replace('保留立場', 'keep the view'))
  expect(await runArticleTranslationOnce({ db: database.db, now: () => clock, edgeProviderOptions: { fetchImpl, sleep: async () => undefined } })).toMatchObject({ status: 'succeeded' })
  const queuedDraft = await (await admin.request(`/api/blog/admin/${post.id}/translations`)).json()
  expect(queuedDraft.translations.find((item: { locale: string }) => item.locale === 'en')).toMatchObject({ status: 'NEEDS_REVIEW', draftProvider: 'edge', draftIsCurrent: true, publishedContent: null })
  expect(fetchImpl).toHaveBeenCalledTimes(1)

  expect((await mutate(admin, `/api/blog/admin/${post.id}/translations/en/review`, {})).status).toBe(200)
  expect((await mutate(admin, `/api/blog/admin/${post.id}/translations/en/publish`, {})).status).toBe(200)
  const reader = await (await admin.request(`/api/blog/${post.slug}?lang=en`)).json()
  expect(reader).toMatchObject({ requestedLocale: 'en', resolvedLocale: 'en', sourceLocale: 'zh-TW', isFallback: false, availableLocales: ['zh-TW', 'en'] })
  expect(reader.content).toContain('Market review')
  expect(reader.content).toContain('SOXX +15.4%')

  const list = await (await new BrowserSession(baseUrl).request('/api/blog?lang=en')).json()
  expect(list.data[0]).toMatchObject({ slug: post.slug, title: expect.not.stringContaining(post.title), resolvedLocale: 'en' })
  const fallback = await (await admin.request(`/api/blog/${post.slug}?lang=zh-CN`)).json()
  expect(fallback).toMatchObject({ requestedLocale: 'zh-CN', resolvedLocale: 'zh-TW', isFallback: true, fallbackReason: 'translation_unavailable', title: post.title })
  expect(fetchImpl).toHaveBeenCalledTimes(1)

  expect((await mutate(admin, `/api/blog/admin/${post.id}/translations/en/unpublish`, {})).status).toBe(200)
  const unpublished = await (await admin.request(`/api/blog/${post.slug}?lang=en`)).json()
  expect(unpublished).toMatchObject({ requestedLocale: 'en', resolvedLocale: 'zh-TW', isFallback: true })
  await admin.post(`/api/blog/admin/${post.id}/translations/en/retranslate`, { provider: 'edge' })
  const unpublishedRetry = await (await admin.request(`/api/blog/admin/${post.id}/translations`)).json()
  expect(unpublishedRetry.translations.find((item: { locale: string }) => item.locale === 'en')).toMatchObject({ status: 'UNPUBLISHED', latestJob: { status: 'QUEUED' } })
})

it('queues independent automatic drafts after publishing without publishing machine output', async () => {
  const admin = await login(true)
  const post = await createArticle(admin, {
    autoTranslateEnabled: true,
    autoTranslateLocales: ['en', 'zh-CN'],
    autoTranslateProvider: 'edge',
  })
  const jobs = await database.db.select().from(articleTranslationJobs).where(eq(articleTranslationJobs.postId, BigInt(post.id)))
  expect(jobs.map(job => [job.targetLocale, job.status])).toEqual([['en', 'queued'], ['zh-CN', 'queued']])
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    if (new URL(String(input)).searchParams.get('to') === 'zh-Hans') return new Response('', { status: 503 })
    const blocks = JSON.parse(String(init?.body)) as string[]
    return Response.json(blocks.map(block => ({ translations: [{ text: `English: ${block}` }] })))
  })
  const options = { db: database.db, now: () => clock, edgeProviderOptions: { fetchImpl, sleep: async () => undefined } }
  expect((await runArticleTranslationOnce(options)).status).toBe('succeeded')
  expect((await runArticleTranslationOnce(options)).status).toBe('failed')
  const latest = await admin.request(`/api/blog/admin/${post.id}/translations`)
  const status = (await latest.json()).translations.map((item: { locale: string; status: string }) => [item.locale, item.status])
  expect(status).toEqual([['zh-CN', 'FAILED'], ['en', 'NEEDS_REVIEW']])
  const [english] = await database.db.select().from(postTranslations).where(eq(postTranslations.postId, BigInt(post.id)))
  expect(english).toMatchObject({ locale: 'en', status: 'pending_review', publishedVersion: 0, publishedContent: null })
  const reader = await (await admin.request(`/api/blog/${post.slug}?lang=en`)).json()
  expect(reader).toMatchObject({ requestedLocale: 'en', resolvedLocale: 'zh-TW', isFallback: true, title: post.title })
})

it('keeps a published article live when automatic settings lookup fails', async () => {
  const admin = await login(true)
  const secret = `SYNTHETIC-AUTO-SETTINGS-${randomUUID()} PRIVATE_ARTICLE_TEXT_SENTINEL`
  const logs: Array<{ message: string; context: Record<string, unknown> }> = []
  const error = wrappedDatabaseError('57P03', secret)
  const app = createApp({
    db: databaseFailingOnSelectFrom(articleTranslationAiSettings, error),
    now: () => clock,
    config: { jwtSecret: 'synthetic-article-translations-key-32chars', nodeEnv: 'test', trustProxy: false, webOrigin: 'http://127.0.0.1' },
    logger: { error(message, context) { logs.push({ message, context }) } },
  })
  const cookie = [...admin.cookies].map(([key, value]) => `${key}=${value}`).join('; ')
  const response = await app.request('http://localhost/api/blog', {
    method: 'POST',
    headers: { cookie, 'x-csrf-token': admin.cookies.get('csrf-token')!, 'content-type': 'application/json' },
    body: JSON.stringify({
      title: secret,
      content: `# ${secret}`,
      category: 'market',
      status: 'PUBLISHED',
      access: 'PUBLIC',
      autoTranslateEnabled: true,
      autoTranslateLocales: ['en'],
      autoTranslateProvider: 'ai',
    }),
  })
  const published = await response.json()

  expect(response.status).toBe(200)
  expect(published).toMatchObject({
    status: 'PUBLISHED',
    automaticTranslationAdmission: { status: 'not_queued', reason: 'settings_unavailable', resumeAt: null },
  })
  expect(await database.db.select().from(posts).where(eq(posts.id, BigInt(published.id)))).toHaveLength(1)
  expect(await database.db.select().from(articleTranslationJobs).where(eq(articleTranslationJobs.postId, BigInt(published.id)))).toHaveLength(0)
  expect(logs).toHaveLength(1)
  expect(logs[0]?.context).toMatchObject({ operation: 'article_translation_enqueue', stage: 'admission', provider: 'ai', errorCode: '57P03' })
  expect(JSON.stringify(logs[0]?.context)).not.toContain(secret)
})

it('does not auto-queue while the Edge circuit is open and reports its resume time', async () => {
  const admin = await login(true)
  const resumeAt = new Date(clock.getTime() + 30 * 60_000)
  await database.db.update(articleTranslationRuntime).set({ edgeDisabledUntil: resumeAt }).where(eq(articleTranslationRuntime.singleton, 'default'))

  const post = await createArticle(admin, {
    autoTranslateEnabled: true,
    autoTranslateLocales: ['en'],
    autoTranslateProvider: 'edge',
  })

  expect(post).toMatchObject({
    status: 'PUBLISHED',
    automaticTranslationAdmission: { status: 'not_queued', reason: 'provider_circuit_open', resumeAt: resumeAt.toISOString() },
  })
  expect(await database.db.select().from(articleTranslationJobs).where(eq(articleTranslationJobs.postId, BigInt(post.id)))).toHaveLength(0)
  const manual = await admin.post(`/api/blog/admin/${post.id}/translations/jobs`, { targetLocales: ['en'], provider: 'edge' })
  expect(manual.status).toBe(409)
  expect((await manual.json()).data.code).toBe('ARTICLE_TRANSLATION_PROVIDER_DISABLED')
})

it('stores multiple OpenAI-compatible provider profiles encrypted and pins queued jobs to the selected profile', async () => {
  const admin = await login(true)
  const ordinary = await login(false)
  const path = '/api/admin/article-translations/ai-providers'
  const defaultPath = `${path}/default`
  expect((await ordinary.request(path)).status).toBe(403)
  const secretA = 'synthetic-provider-a-key-never-sent-live'
  const secretB = 'synthetic-provider-b-key-never-sent-live'
  const values = {
    enabled: true,
    model: 'synthetic-translation-model',
    timeoutMs: 10_000,
    prompt: 'Keep the supplied terms consistent and preserve every financial value exactly as written.',
    promptVersion: 'test-translation-v1',
    maxTokens: 1_000,
    maxCallsPerJob: 4,
    tokenBudgetPerJob: 8_000,
    allowMemberArticles: false,
  }
  expect((await mutate(ordinary, path, { ...values, name: 'Unauthorized provider', baseUrl: 'https://provider.example.test/v1', apiKey: secretA })).status).toBe(403)
  const savedA = await mutate(admin, path, { ...values, name: 'Provider A', baseUrl: 'https://provider-a.example.test/v1', apiKey: secretA })
  const savedB = await mutate(admin, path, { ...values, name: 'Provider B', baseUrl: 'https://provider-b.example.test/v1', apiKey: secretB })
  expect(savedA.status).toBe(200)
  expect(savedB.status).toBe(200)
  const providerA = await savedA.json()
  const providerB = await savedB.json()
  expect(providerA).toMatchObject({ name: 'Provider A', enabled: true, secretConfigured: true, model: 'synthetic-translation-model' })
  expect(JSON.stringify(providerA)).not.toContain(secretA)
  const stored = await database.db.select().from(articleTranslationAiProfiles).orderBy(articleTranslationAiProfiles.id)
  expect(stored).toHaveLength(2)
  expect(stored[0]?.encryptedApiKey).not.toBe(secretA)
  expect(stored[0]?.encryptedApiKey).toMatch(/^v1\./)
  expect(stored[1]?.encryptedApiKey).not.toBe(secretB)
  expect((await mutate(admin, defaultPath, { providerId: providerA.id }, 'PUT')).status).toBe(200)

  const post = await createArticle(admin)
  expect((await admin.post(`/api/blog/admin/${post.id}/translations/jobs`, { targetLocales: ['en'], provider: 'ai' })).status).toBe(200)
  const firstJob = (await database.db.select().from(articleTranslationJobs).where(eq(articleTranslationJobs.postId, BigInt(post.id))))[0]!
  expect(firstJob.aiProfileId).toBe(BigInt(providerA.id))
  expect(firstJob.providerProfileName).toBe('Provider A')
  expect((await mutate(admin, defaultPath, { providerId: providerB.id }, 'PUT')).status).toBe(200)
  expect((await admin.post(`/api/blog/admin/${post.id}/translations/jobs`, { targetLocales: ['en'], provider: 'ai' })).status).toBe(200)
  const jobs = await database.db.select().from(articleTranslationJobs).where(eq(articleTranslationJobs.postId, BigInt(post.id))).orderBy(articleTranslationJobs.id)
  expect(jobs.map(job => job.aiProfileId)).toEqual([BigInt(providerA.id), BigInt(providerB.id)])
  const transport: AiTransport = async request => {
    const body = request.body as { messages: Array<{ role: string; content: string }> }
    const user = JSON.parse(body.messages.find(message => message.role === 'user')!.content) as { blocks: string[] }
    return {
      status: 200,
      retryAfter: null,
      body: JSON.stringify({
        choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ translations: user.blocks.map(block => block.replace('市場觀察', 'Market review')) }) } }],
        usage: { prompt_tokens: 80, completion_tokens: 40 },
      }),
    }
  }
  const outbound: string[] = []
  const recordingTransport: AiTransport = async request => {
    outbound.push(request.baseUrl)
    return transport(request)
  }
  expect((await runArticleTranslationOnce({ db: database.db, now: () => clock, aiTransport: recordingTransport })).status).toBe('succeeded')
  expect((await runArticleTranslationOnce({ db: database.db, now: () => clock, aiTransport: recordingTransport })).status).toBe('succeeded')
  expect(outbound[0]).toBe('https://provider-a.example.test/v1')
  expect(outbound[1]).toBe('https://provider-b.example.test/v1')
  const [translation] = await database.db.select().from(postTranslations).where(eq(postTranslations.postId, BigInt(post.id)))
  expect(translation).toMatchObject({ locale: 'en', status: 'pending_review', draftProvider: 'ai', draftModel: 'synthetic-translation-model', draftPromptVersion: 'test-translation-v1' })
  expect(translation?.draftContent).toContain('Market review')
  expect(translation?.publishedContent).toBeNull()
})

it('keeps member article translations behind the parent access check and blocks Edge before outbound calls', async () => {
  const admin = await login(true)
  const guest = new BrowserSession(baseUrl)
  const member = await login(false)
  const sentinel = `MEMBER-${randomUUID()}`
  const post = await createArticle(admin, { title: 'Synthetic member article', content: `# Private\n\n${sentinel}`, access: 'MEMBER' })
  const invalidAutomaticEdge = await mutate(admin, `/api/blog/${post.id}`, {
    title: post.title, content: post.content, category: 'market', status: 'PUBLISHED', access: 'MEMBER',
    autoTranslateEnabled: true, autoTranslateLocales: ['en'], autoTranslateProvider: 'edge',
  }, 'PUT')
  expect(invalidAutomaticEdge.status).toBe(409)
  const fetchImpl = edgeMock()
  const edgeRequest = await admin.post(`/api/blog/admin/${post.id}/translations/jobs`, { targetLocales: ['en'], provider: 'edge' })
  expect(edgeRequest.status).toBe(409)
  expect(fetchImpl).not.toHaveBeenCalled()

  expect((await mutate(admin, `/api/blog/admin/${post.id}/translations/en`, { title: 'Member article in English', excerpt: `Private English ${sentinel}`, content: `# Private English\n\n${sentinel}` }, 'PUT')).status).toBe(200)
  expect((await mutate(admin, `/api/blog/admin/${post.id}/translations/en/review`, {})).status).toBe(200)
  expect((await mutate(admin, `/api/blog/admin/${post.id}/translations/en/publish`, {})).status).toBe(200)
  const blocked = await guest.request(`/api/blog/${post.slug}?lang=en`)
  expect(blocked.status).toBe(401)
  expect(await blocked.text()).not.toContain(sentinel)
  const metadata = await (await guest.request(`/api/blog/${post.slug}/metadata?lang=en`)).json()
  expect(metadata.excerpt).toBeNull()
  expect(JSON.stringify(metadata)).not.toContain(sentinel)
  const allowed = await (await member.request(`/api/blog/${post.slug}?lang=en`)).json()
  expect(allowed).toMatchObject({ requestedLocale: 'en', resolvedLocale: 'en', access: 'MEMBER' })
  expect(allowed.content).toContain(sentinel)
})

it('deduplicates only jobs for the same source revision, provider, and AI config', async () => {
  const admin = await login(true)
  const post = await createArticle(admin)
  const queueEdge = () => admin.post(`/api/blog/admin/${post.id}/translations/jobs`, { targetLocales: ['en'], provider: 'edge' })
  const first = await (await queueEdge()).json()
  const duplicate = await (await queueEdge()).json()
  expect(duplicate.jobs[0].id).toBe(first.jobs[0].id)

  await persistAiProfile()
  const aiResponse = await admin.post(`/api/blog/admin/${post.id}/translations/jobs`, { targetLocales: ['en'], provider: 'ai' })
  const ai = await aiResponse.json()
  expect(ai.jobs[0].id).not.toBe(first.jobs[0].id)

  await database.db.update(posts).set({ content: `${post.content}\n\nUpdated synthetic source.` }).where(eq(posts.id, BigInt(post.id)))
  const updated = await (await queueEdge()).json()
  const updatedDuplicate = await (await queueEdge()).json()
  expect(updated.jobs[0].id).not.toBe(first.jobs[0].id)
  expect(updatedDuplicate.jobs[0].id).toBe(updated.jobs[0].id)
  expect(await database.db.select().from(articleTranslationJobs).where(eq(articleTranslationJobs.postId, BigInt(post.id)))).toHaveLength(3)
})

it('rejects manual drafts that change Markdown structure or immutable financial values', async () => {
  const admin = await login(true)
  const sourceContent = '# 市場觀察\n\nSOXX +15.4% 保留立場。價格 614.61，資料截至 2026-09-24。$r = 2$'
  const post = await createArticle(admin, { title: 'AMD analysis', content: sourceContent })
  const path = `/api/blog/admin/${post.id}/translations/en`
  const valid = {
    title: 'AMD market review',
    excerpt: 'Market review SOXX +15.4% hold the view. Price 614.61, data as of 2026-09-24. $r = 2$',
    content: '# Market review\n\nSOXX +15.4% hold the view. Price 614.61, data as of 2026-09-24. $r = 2$',
  }
  expect((await mutate(admin, path, valid, 'PUT')).status).toBe(200)
  expect((await mutate(admin, path, { ...valid, content: valid.content.replace('+15.4%', '+15.5%') }, 'PUT')).status).toBe(400)
  expect((await mutate(admin, path, { ...valid, content: valid.content.replace('$r = 2$', '$r = 3$') }, 'PUT')).status).toBe(400)
  expect((await mutate(admin, path, { ...valid, content: valid.content.replace('# Market review\n\n', '') }, 'PUT')).status).toBe(400)
  const [translation] = await database.db.select().from(postTranslations).where(eq(postTranslations.postId, BigInt(post.id)))
  expect(translation?.draftContent).toBe(valid.content)
})

it('keeps a current reviewable draft visible when a later provider job fails', async () => {
  const admin = await login(true)
  const post = await createArticle(admin)
  await admin.post(`/api/blog/admin/${post.id}/translations/jobs`, { targetLocales: ['en'], provider: 'edge' })
  const edgeMockFetch = edgeMock(block => block.replace('市場觀察', 'Market review').replace('保留立場', 'hold the view'))
  expect((await runArticleTranslationOnce({ db: database.db, now: () => clock, edgeProviderOptions: { fetchImpl: edgeMockFetch } })).status).toBe('succeeded')

  await persistAiProfile()
  const queued = await admin.post(`/api/blog/admin/${post.id}/translations/jobs`, { targetLocales: ['en'], provider: 'ai' })
  expect(queued.status).toBe(200)
  const queuedResponse = await queued.json()
  const jobId = BigInt(queuedResponse.jobs[0].id)
  await database.db.update(articleTranslationJobs).set({ status: 'failed', error: 'TRANSLATION_PROVIDER_UNAVAILABLE', progress: 100, finishedAt: clock, updatedAt: clock }).where(eq(articleTranslationJobs.id, jobId))

  const response = await (await admin.request(`/api/blog/admin/${post.id}/translations`)).json()
  expect(response.translations.find((item: { locale: string }) => item.locale === 'en')).toMatchObject({
    status: 'NEEDS_REVIEW', draftIsCurrent: true,
    latestJob: { provider: 'ai', status: 'FAILED', error: 'TRANSLATION_PROVIDER_UNAVAILABLE' },
  })
})

it('preserves a published snapshot on retranslation and fences late results after source changes', async () => {
  const admin = await login(true)
  const post = await createArticle(admin)
  const firstFetch = edgeMock(block => block.replace('市場觀察', 'First market view'))
  await admin.post(`/api/blog/admin/${post.id}/translations/jobs`, { targetLocales: ['en'], provider: 'edge' })
  expect((await runArticleTranslationOnce({ db: database.db, now: () => clock, edgeProviderOptions: { fetchImpl: firstFetch } })).status).toBe('succeeded')
  await mutate(admin, `/api/blog/admin/${post.id}/translations/en/review`, {})
  await mutate(admin, `/api/blog/admin/${post.id}/translations/en/publish`, {})
  const publishedBefore = (await database.db.select().from(postTranslations).where(eq(postTranslations.postId, BigInt(post.id))))[0]!
  const readerBefore = await (await admin.request(`/api/blog/${post.slug}?lang=en`)).json()

  await admin.post(`/api/blog/admin/${post.id}/translations/en/retranslate`, { provider: 'edge' })
  const retranslationState = await (await admin.request(`/api/blog/admin/${post.id}/translations`)).json()
  expect(retranslationState.translations.find((item: { locale: string }) => item.locale === 'en')).toMatchObject({ status: 'QUEUED', latestJob: { status: 'QUEUED' } })
  const retranslateFetch = edgeMock(block => block.replace('市場觀察', 'Second market view'))
  expect((await runArticleTranslationOnce({ db: database.db, now: () => clock, edgeProviderOptions: { fetchImpl: retranslateFetch } })).status).toBe('succeeded')
  const duringReview = await (await admin.request(`/api/blog/${post.slug}?lang=en`)).json()
  const preserved = (await database.db.select().from(postTranslations).where(eq(postTranslations.postId, BigInt(post.id))))[0]!
  expect(duringReview.content).toBe(readerBefore.content)
  expect(preserved.publishedContent).toBe(publishedBefore.publishedContent)
  expect(preserved.draftContent).not.toBe(preserved.publishedContent)

  await mutate(admin, `/api/blog/admin/${post.id}/translations/en/review`, {})
  await mutate(admin, `/api/blog/admin/${post.id}/translations/en/publish`, {})
  const [secondPublished] = await database.db.select().from(postTranslations).where(eq(postTranslations.postId, BigInt(post.id)))
  await admin.post(`/api/blog/admin/${post.id}/translations/en/retranslate`, { provider: 'edge' })
  const staleFetch = edgeMock(block => block.replace('市場觀察', 'Late old source result'))
  staleFetch.mockImplementationOnce(async (_input: string | URL | Request, init?: RequestInit) => {
    await database.db.update(posts).set({ content: 'Changed synthetic source after translation dispatch.' }).where(eq(posts.id, BigInt(post.id)))
    const blocks = JSON.parse(String(init?.body)) as string[]
    return Response.json(blocks.map(block => ({ translations: [{ text: block.replace('市場觀察', 'Late old source result') }] })))
  })
  expect((await runArticleTranslationOnce({ db: database.db, now: () => clock, edgeProviderOptions: { fetchImpl: staleFetch } })).status).toBe('stale')
  const [latestJob] = await database.db.select().from(articleTranslationJobs).where(eq(articleTranslationJobs.postId, BigInt(post.id))).orderBy(desc(articleTranslationJobs.id)).limit(1)
  expect(latestJob?.status).toBe('stale')
  expect(latestJob?.resultJson).toBeTruthy()
  const [staleTranslation] = await database.db.select().from(postTranslations).where(eq(postTranslations.postId, BigInt(post.id)))
  expect(staleTranslation?.publishedContent).toBe(secondPublished?.publishedContent)
  const fallback = await (await admin.request(`/api/blog/${post.slug}?lang=en`)).json()
  expect(fallback).toMatchObject({ isFallback: true, fallbackReason: 'translation_stale', resolvedLocale: 'zh-TW' })
})

it('recovers an expired Edge lease after worker restart and marks source edits stale', async () => {
  const admin = await login(true)
  const post = await createArticle(admin)
  await admin.post(`/api/blog/admin/${post.id}/translations/jobs`, { targetLocales: ['en'], provider: 'edge' })
  const [job] = await database.db.select().from(articleTranslationJobs).where(eq(articleTranslationJobs.postId, BigInt(post.id)))
  const oldTime = new Date(clock.getTime() - 120_000)
  await database.db.update(articleTranslationJobs).set({ status: 'running', retryCount: 0, leaseToken: 'expired-fixture-token', workerId: 'crashed-worker', leaseExpiresAt: oldTime, heartbeatAt: oldTime, startedAt: oldTime }).where(eq(articleTranslationJobs.id, job!.id))
  await database.db.update(articleTranslationRuntime).set({ activeJobId: job!.id, activeLeaseToken: 'expired-fixture-token', activeLeaseExpiresAt: oldTime, workerId: 'crashed-worker', workerHeartbeatAt: oldTime }).where(eq(articleTranslationRuntime.singleton, 'default'))
  const fetchImpl = edgeMock(block => block.replace('市場觀察', 'Recovered view'))
  expect((await runArticleTranslationOnce({ db: database.db, now: () => clock, edgeProviderOptions: { fetchImpl, sleep: async () => undefined } })).status).toBe('succeeded')
  const [finished] = await database.db.select().from(articleTranslationJobs).where(eq(articleTranslationJobs.id, job!.id))
  expect(finished).toMatchObject({ status: 'succeeded', retryCount: 1, progress: 100 })

  await mutate(admin, `/api/blog/${post.id}`, { title: post.title, content: 'A changed synthetic article body.', category: 'market', status: 'PUBLISHED', access: 'PUBLIC' }, 'PUT')
  const [translation] = await database.db.select().from(postTranslations).where(eq(postTranslations.postId, BigInt(post.id)))
  expect(translation?.status).toBe('stale')
  const staleRequest = await (await admin.request(`/api/blog/${post.slug}?lang=en`)).json()
  expect(staleRequest).toMatchObject({ isFallback: true, fallbackReason: 'translation_stale' })
})

it('retries a wrapped deadlock during result persistence without repeating the provider request', async () => {
  const admin = await login(true)
  const post = await createArticle(admin)
  await admin.post(`/api/blog/admin/${post.id}/translations/jobs`, { targetLocales: ['en'], provider: 'edge' })
  const fetchImpl = edgeMock(block => block.replace('市場觀察', 'Retried market view'))
  const faulty = databaseFailingOnTransaction(2, wrappedDatabaseError('40P01'))

  const result = await runArticleTranslationOnce({
    db: faulty.db,
    now: () => clock,
    edgeProviderOptions: { fetchImpl, sleep: async () => undefined },
  })

  expect(result.status).toBe('succeeded')
  expect(faulty.transactionCalls()).toBe(4)
  expect(fetchImpl).toHaveBeenCalledTimes(1)
})

it('keeps the worker loop alive after a wrapped recoverable database error', async () => {
  const controller = new AbortController()
  const logs: Array<{ message: string; context: Record<string, unknown> }> = []
  const faulty = databaseFailingOnTransaction(1, wrappedDatabaseError('57P03'))

  await runArticleTranslationWorker({
    db: faulty.db,
    signal: controller.signal,
    pollMs: 250,
    logger: { error(message, context) { logs.push({ message, context }); controller.abort() } },
  })

  expect(faulty.transactionCalls()).toBe(1)
  expect(logs).toHaveLength(1)
  expect(logs[0]?.context).toMatchObject({ stage: 'claim_job', errorCode: '57P03' })
})

it('logs only safe stack frames and never records SQL parameters', async () => {
  const secret = `SYNTHETIC-ARTICLE-${randomUUID()} PRIVATE_ARTICLE_TEXT_SENTINEL PRIVATE_DIARY_TEXT_SENTINEL TOKEN_SENTINEL`
  const faulty = databaseFailingOnTransaction(1, wrappedDatabaseError('23505', secret))
  const logs: Array<{ message: string; context: Record<string, unknown> }> = []

  await expect(runArticleTranslationOnce({
    db: faulty.db,
    now: () => clock,
    logger: { error(message, context) { logs.push({ message, context }) } },
  })).rejects.toThrow('Synthetic query failure')

  expect(logs).toHaveLength(1)
  expect(logs[0]?.context).toMatchObject({ stage: 'claim_job', errorCode: '23505' })
  expect(JSON.stringify(logs[0]?.context)).not.toContain(secret)
  expect(JSON.stringify(logs[0]?.context)).toContain('syntheticQuery')
})

it('logs unexpected API failures with request metadata and safe database diagnostics', async () => {
  const secret = `SYNTHETIC-API-${randomUUID()}`
  const logs: Array<{ message: string; context: Record<string, unknown> }> = []
  const app = createApp({
    db: databaseFailingOnSelect(wrappedDatabaseError('42P01', secret)),
    now: () => clock,
    config: { jwtSecret: 'synthetic-article-translations-key-32chars', nodeEnv: 'test', trustProxy: false, webOrigin: 'http://127.0.0.1' },
    logger: { error(message, context) { logs.push({ message, context }) } },
  })

  const response = await app.request('http://localhost/api/blog/synthetic-article')

  expect(response.status).toBe(500)
  expect(logs).toHaveLength(1)
  expect(logs[0]?.context).toMatchObject({ operation: 'http_request', method: 'GET', path: '/api/blog/synthetic-article', databaseCode: '42P01' })
  expect(logs[0]?.context.requestId).toEqual(expect.any(String))
  expect(JSON.stringify(logs[0]?.context)).not.toContain(secret)
})

it('logs automatic enqueue failures without article content', async () => {
  const admin = await login(true)
  const secret = `SYNTHETIC-AUTO-TRANSLATE-${randomUUID()} PRIVATE_ARTICLE_TEXT_SENTINEL PRIVATE_DIARY_TEXT_SENTINEL TOKEN_SENTINEL`
  const faulty = databaseFailingOnTransaction(2, wrappedDatabaseError('23505', secret))
  const logs: Array<{ message: string; context: Record<string, unknown> }> = []
  const app = createApp({
    db: faulty.db,
    now: () => clock,
    config: { jwtSecret: 'synthetic-article-translations-key-32chars', nodeEnv: 'test', trustProxy: false, webOrigin: 'http://127.0.0.1' },
    logger: { error(message, context) { logs.push({ message, context }) } },
  })
  const cookie = [...admin.cookies].map(([key, value]) => `${key}=${value}`).join('; ')
  const response = await app.request('http://localhost/api/blog', {
    method: 'POST',
    headers: { cookie, 'x-csrf-token': admin.cookies.get('csrf-token')!, 'content-type': 'application/json' },
    body: JSON.stringify({
      title: secret,
      content: `# Synthetic article\n\n${secret}`,
      category: 'market',
      status: 'PUBLISHED',
      access: 'PUBLIC',
      autoTranslateEnabled: true,
      autoTranslateLocales: ['en'],
      autoTranslateProvider: 'edge',
    }),
  })
  const body = await response.json()

  expect(response.status).toBe(200)
  expect(body.id).toBeDefined()
  expect(body.automaticTranslationAdmission).toMatchObject({ status: 'not_queued', reason: 'queue_unavailable', resumeAt: null })
  expect(logs).toHaveLength(1)
  expect(logs[0]?.context).toMatchObject({ operation: 'article_translation_enqueue', stage: 'enqueue', targetLocale: 'en', provider: 'edge' })
  expect(logs[0]?.context.requestId).toEqual(expect.any(String))
  expect(logs[0]?.context.postId).toEqual(expect.any(String))
  expect(JSON.stringify(logs[0]?.context)).not.toContain(secret)
})

it('treats a replaced lease as stale instead of a provider failure', async () => {
  const admin = await login(true)
  const post = await createArticle(admin)
  await admin.post(`/api/blog/admin/${post.id}/translations/jobs`, { targetLocales: ['en'], provider: 'edge' })
  const [job] = await database.db.select().from(articleTranslationJobs).where(eq(articleTranslationJobs.postId, BigInt(post.id)))
  const replacementToken = 'replacement-lease-token'
  const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
    await database.db.update(articleTranslationJobs).set({ leaseToken: replacementToken, workerId: 'replacement-worker' }).where(eq(articleTranslationJobs.id, job!.id))
    await database.db.update(articleTranslationRuntime).set({ activeLeaseToken: replacementToken, workerId: 'replacement-worker' }).where(eq(articleTranslationRuntime.singleton, 'default'))
    const blocks = JSON.parse(String(init?.body)) as string[]
    return Response.json(blocks.map(block => ({ translations: [{ text: block }] })))
  })
  const logs: Array<{ message: string; context: Record<string, unknown> }> = []

  const result = await runArticleTranslationOnce({
    db: database.db,
    now: () => clock,
    edgeProviderOptions: { fetchImpl, sleep: async () => undefined },
    logger: { error(message, context) { logs.push({ message, context }) } },
  })

  expect(result.status).toBe('stale')
  expect(fetchImpl).toHaveBeenCalledTimes(1)
  expect(logs.some(log => log.context.stage === 'provider_failure')).toBe(false)
  const [current] = await database.db.select().from(articleTranslationJobs).where(eq(articleTranslationJobs.id, job!.id))
  expect(current).toMatchObject({ status: 'running', leaseToken: replacementToken, workerId: 'replacement-worker' })
})

it('fences an overlapping worker after an AI lease expires during provider work', async () => {
  const admin = await login(true)
  const post = await createArticle(admin)
  await persistAiProfile()
  await admin.post(`/api/blog/admin/${post.id}/translations/jobs`, { targetLocales: ['en'], provider: 'ai' })
  const [job] = await database.db.select().from(articleTranslationJobs).where(eq(articleTranslationJobs.postId, BigInt(post.id)))
  let notifyProviderEntered!: () => void
  let releaseProvider!: () => void
  const providerEntered = new Promise<void>(resolve => { notifyProviderEntered = resolve })
  const providerGate = new Promise<void>(resolve => { releaseProvider = resolve })
  const transport = vi.fn(async (request: Parameters<AiTransport>[0]) => {
    notifyProviderEntered()
    await providerGate
    const body = request.body as { messages: Array<{ role: string; content: string }> }
    const user = JSON.parse(body.messages.find(message => message.role === 'user')!.content) as { blocks: string[] }
    return {
      status: 200,
      retryAfter: null,
      body: JSON.stringify({
        choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ translations: user.blocks }) } }],
        usage: { prompt_tokens: 20, completion_tokens: 10 },
      }),
    }
  })
  const options = { db: database.db, now: () => clock, aiTransport: transport, heartbeatMs: 60_000 }
  const originalWorker = runArticleTranslationOnce({ ...options, workerId: 'synthetic-original-worker' })
  try {
    await Promise.race([
      providerEntered,
      originalWorker.then(() => { throw new Error('Worker completed before the provider entered') }),
    ])
    const oldTime = new Date(clock.getTime() - 10_000)
    await database.db.update(articleTranslationJobs).set({ leaseExpiresAt: oldTime, heartbeatAt: oldTime }).where(eq(articleTranslationJobs.id, job!.id))
    await database.db.update(articleTranslationRuntime).set({ activeLeaseExpiresAt: oldTime, workerHeartbeatAt: oldTime }).where(eq(articleTranslationRuntime.singleton, 'default'))
    const callsBeforeRecovery = transport.mock.calls.length
    const recoveryWorker = await runArticleTranslationOnce({ ...options, workerId: 'synthetic-recovery-worker' })
    const callsAfterRecovery = transport.mock.calls.length
    const [expired] = await database.db.select().from(articleTranslationJobs).where(eq(articleTranslationJobs.id, job!.id))
    expect(recoveryWorker.status).toBe('idle')
    expect(callsAfterRecovery).toBe(callsBeforeRecovery)
    expect(expired).toMatchObject({ status: 'failed', error: 'AI_PROVIDER_OUTCOME_UNKNOWN' })
  } finally {
    releaseProvider()
  }

  expect(await originalWorker).toMatchObject({ status: 'stale', errorCode: 'ARTICLE_TRANSLATION_LEASE_LOST' })
})
