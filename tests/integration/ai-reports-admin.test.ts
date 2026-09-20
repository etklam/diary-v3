import { once } from 'node:events'
import { randomUUID } from 'node:crypto'
import { serve } from '@hono/node-server'
import type { AddressInfo } from 'node:net'
import bcrypt from 'bcryptjs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { aiAdminAuditEvents, aiProviderConfigVersions, aiReportAttempts, aiReports, aiUsageBuckets, users } from '@diary/db'
import { createApp } from '../../apps/api/src/app'
import type { AiTransport } from '../../apps/api/src/ai-reports/outbound-policy'
import { BrowserSession } from '../support/browser-session'
import { provisionTestDatabase } from '../support/database'

const keyring = Buffer.alloc(32, 7).toString('base64')
const emptyAnalysis = JSON.stringify({
  summary: [],
  decisionReview: [],
  positionReview: [],
  marketReflection: [],
  disciplineChecks: [],
  nextPeriodFocus: [],
  limitations: ['Synthetic fixture'],
})

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let server: ReturnType<typeof serve>
let baseUrl: string
const transportCalls: Array<{ path: string; body: unknown }> = []
let cachedAdmin: BrowserSession | null = null

const fixtureTransport: AiTransport = async request => {
  transportCalls.push({ path: request.path, body: request.body })
  return {
    status: 200,
    retryAfter: null,
    body: JSON.stringify({
      id: 'fixture-request',
      choices: [{ finish_reason: 'stop', message: { content: emptyAnalysis } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }),
  }
}

const failingTransport: AiTransport = async request => {
  transportCalls.push({ path: request.path, body: request.body })
  throw new Error('synthetic provider failure')
}

beforeAll(async () => {
  process.env.AI_ENCRYPTION_ACTIVE_KEY = 'fixture'
  process.env.AI_ENCRYPTION_KEYS = JSON.stringify({ fixture: keyring })
  database = await provisionTestDatabase('ai_reports_admin')
  const now = () => new Date('2026-09-05T12:00:00.000Z')
  const app = createApp({
    db: database.db,
    databasePool: database.pool,
    now,
    aiTransport: fixtureTransport,
    config: { jwtSecret: 'synthetic-review-key-with-at-least-32-characters', nodeEnv: 'test', trustProxy: false, webOrigin: 'http://127.0.0.1' },
  })
  server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 })
  await once(server, 'listening')
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  server?.close()
  if (server) await once(server, 'close')
  await database?.dispose()
  delete process.env.AI_ENCRYPTION_ACTIVE_KEY
  delete process.env.AI_ENCRYPTION_KEYS
})

async function login(admin: boolean, url = baseUrl) {
  if (admin && url === baseUrl && cachedAdmin) return cachedAdmin
  const browser = new BrowserSession(url)
  const email = `${randomUUID()}@example.test`
  const password = 'synthetic-admin-password'
  await database.pool.query('insert into users(email,password,role) values ($1,$2,$3)', [email, await bcrypt.hash(password, 4), admin ? 'ADMIN' : 'USER'])
  const response = await browser.post('/api/auth/login', { email, password })
  expect(response.status).toBe(200)
  expect((await browser.request('/api/auth/me')).status).toBe(200)
  if (admin && url === baseUrl) cachedAdmin = browser
  return browser
}

async function put(browser: BrowserSession, path: string, body: unknown) {
  const headers = new Headers({ 'content-type': 'application/json' })
  const csrf = browser.cookies.get('csrf-token')
  if (csrf) headers.set('x-csrf-token', csrf)
  return browser.request(path, { method: 'PUT', headers, body: JSON.stringify(body) })
}

const providerDraft = (expectedRevision: number, overrides: Record<string, unknown> = {}) => ({
  displayName: 'Synthetic provider',
  providerType: 'deepseek',
  protocol: 'chat_completions',
  baseUrl: 'https://api.deepseek.com',
  model: 'fixture-model',
  thinking: 'disabled',
  maxInputTokens: 32_000,
  maxOutputTokens: 4_000,
  timeoutMs: 120_000,
  monthlyBudgetCents: 1_000,
  recipientName: 'Synthetic recipient',
  disclosureVersion: 'v1',
  disclosureText: 'Synthetic journal disclosure',
  pricingCurrency: 'USD',
  pricingVersion: 'fixture-price-v1',
  inputPricePerMillionCents: null,
  outputPricePerMillionCents: null,
  reservationCostCents: 5,
  apiKeyAction: 'replace',
  apiKey: 'fixture-secret',
  expectedRevision,
  ...overrides,
})

describe('AI admin lifecycle with disposable PostgreSQL', () => {
  it('rechecks the DB role and keeps provider keys write-only across a recipient change', async () => {
    const user = await login(false)
    expect((await user.request('/api/admin/ai/settings')).status).toBe(403)

    const admin = await login(true)
    const draft = await put(admin, '/api/admin/ai/settings/draft', providerDraft(0))
    expect(draft.status).toBe(200)
    const body = await draft.json() as { revision: number; hasApiKey: boolean; disclosureText: string }
    expect(body).toMatchObject({ revision: 1, hasApiKey: true, disclosureText: 'Synthetic journal disclosure' })
    expect(JSON.stringify(body)).not.toContain('fixture-secret')

    const changedRecipient = await put(admin, '/api/admin/ai/settings/draft', providerDraft(1, {
      recipientName: 'Changed recipient',
      apiKeyAction: 'keep',
      apiKey: undefined,
    }))
    expect(changedRecipient.status).toBe(200)
    expect(await changedRecipient.json()).toMatchObject({ hasApiKey: false, recipientRevision: 2 })

    const rows = await database.db.select({ encryptedApiKey: aiProviderConfigVersions.encryptedApiKey })
      .from(aiProviderConfigVersions).where(eq(aiProviderConfigVersions.revision, 2)).limit(1)
    expect(rows[0]?.encryptedApiKey).toBeNull()
  })

  it('validates monthly synthetic periods and charges a successful admin test', async () => {
    const admin = await login(true)
    expect((await admin.request('/api/admin/ai/settings')).status).toBe(200)
    const draft = await put(admin, '/api/admin/ai/settings/draft', providerDraft(2, { apiKeyAction: 'replace', apiKey: 'fixture-secret' }))
    expect(draft.status).toBe(200)
    const tested = await admin.post('/api/admin/ai/settings/test', { expectedRevision: 3 })
    expect(tested.status).toBe(200)
    const published = await admin.post('/api/admin/ai/settings/publish', { expectedRevision: 3 })
    expect(published.status).toBe(200)
    const afterPublish = await admin.request('/api/admin/ai/settings')
    expect(afterPublish.status).toBe(200)
    expect((await afterPublish.json()) as unknown).toMatchObject({ provider: { revision: 3, status: 'published' } })

    const promptTest = await admin.post('/api/admin/ai/prompts/monthly/test', { expectedRevision: 1 })
    expect(promptTest.status).toBe(200)
    const chatBodies = transportCalls.filter(call => call.path === 'chat/completions').map(call => call.body as { messages?: Array<{ content: string }> })
    expect(chatBodies.some(body => body.messages?.some(message => message.content.includes('2026-01-01') && message.content.includes('2026-02-01')))).toBe(true)

    const month = await database.db.select().from(aiUsageBuckets).where(and(eq(aiUsageBuckets.scope, 'global'), eq(aiUsageBuckets.bucketMonth, '2026-09-01'))).limit(1)
    expect(month[0]).toMatchObject({ consumed: 2, estimatedCostCents: 10 })
    const attempts = await database.db.select().from(aiReportAttempts).where(eq(aiReportAttempts.pricingCurrency, 'USD'))
    expect(attempts.length).toBeGreaterThanOrEqual(2)
    expect(attempts.every(attempt => attempt.status === 'succeeded')).toBe(true)
  })

  it('reads the latest prompt revision after publish and uses it for the next edit', async () => {
    const admin = await login(true)
    const first = await admin.post('/api/admin/ai/prompts/weekly/draft', { expectedRevision: 1, template: 'First {{period_label}} review in {{locale}}.' })
    expect(first.status).toBe(200)
    const second = await admin.post('/api/admin/ai/prompts/weekly/draft', { expectedRevision: 2, template: 'Second {{period_label}} review in {{locale}}.' })
    expect(second.status).toBe(200)
    const tested = await admin.post('/api/admin/ai/prompts/weekly/test', { expectedRevision: 3 })
    expect(tested.status).toBe(200)
    const published = await admin.post('/api/admin/ai/prompts/weekly/publish', { expectedRevision: 3 })
    expect(published.status).toBe(200)

    const settings = await admin.request('/api/admin/ai/settings')
    expect(settings.status).toBe(200)
    expect((await settings.json()) as unknown).toMatchObject({ prompts: { weekly: { revision: 3, status: 'published' } } })
    const next = await admin.post('/api/admin/ai/prompts/weekly/draft', { expectedRevision: 3, template: 'Next {{period_label}} review in {{locale}}.' })
    expect(next.status).toBe(200)
    expect((await next.json()) as unknown).toMatchObject({ revision: 4, status: 'draft' })
  })

  it('settles a failed synthetic test as unknown usage while retaining its reservation bound', async () => {
    const admin = await login(true)
    const settings = await admin.request('/api/admin/ai/settings')
    const settingsBody = await settings.json() as { provider: { revision: number; status: string } }
    expect(settingsBody.provider).toMatchObject({ revision: 3, status: 'published' })
    const draft = await put(admin, '/api/admin/ai/settings/draft', providerDraft(settingsBody.provider.revision, { apiKeyAction: 'replace', apiKey: 'fixture-secret' }))
    expect(draft.status).toBe(200)
    const attempt = await database.db.select({ id: aiReportAttempts.id, status: aiReportAttempts.status }).from(aiReportAttempts).orderBy(aiReportAttempts.id).limit(1)
    expect(attempt[0]).toBeTruthy()
    const before = await database.db.select().from(aiUsageBuckets).where(and(eq(aiUsageBuckets.scope, 'global'), eq(aiUsageBuckets.bucketMonth, '2026-09-01'))).limit(1)
    expect(before[0]?.estimatedCostCents).toBe(15)

    const failingApp = createApp({
      db: database.db,
      databasePool: database.pool,
      now: () => new Date('2026-09-05T12:00:00.000Z'),
      aiTransport: failingTransport,
      config: { jwtSecret: 'synthetic-review-key-with-at-least-32-characters', nodeEnv: 'test', trustProxy: false, webOrigin: 'http://127.0.0.1' },
    })
    const failingServer = serve({ fetch: failingApp.fetch, hostname: '127.0.0.1', port: 0 })
    await once(failingServer, 'listening')
    const failingBaseUrl = `http://127.0.0.1:${(failingServer.address() as AddressInfo).port}`
    try {
      const failingAdmin = await login(true, failingBaseUrl)
      const response = await failingAdmin.post('/api/admin/ai/settings/test', { expectedRevision: settingsBody.provider.revision + 1 })
      expect(response.status).toBe(502)
    } finally {
      failingServer.close()
      await once(failingServer, 'close')
    }
    const latestAttempt = await database.db.select({ id: aiReportAttempts.id, status: aiReportAttempts.status }).from(aiReportAttempts).orderBy(aiReportAttempts.id).limit(10)
    expect(latestAttempt.at(-1)?.status).toBe('unknown')
    const after = await database.db.select().from(aiUsageBuckets).where(and(eq(aiUsageBuckets.scope, 'global'), eq(aiUsageBuckets.bucketMonth, '2026-09-01'))).limit(1)
    expect(after[0]).toMatchObject({ consumed: 4, estimatedCostCents: 20, unknown: 4 })
  })

  it('cancels pending work and releases both quota reservations when generation is disabled', async () => {
    const admin = await login(true)
    const [owner] = await database.db.insert(users).values({ email: `${randomUUID()}@example.test`, password: 'synthetic' }).returning({ id: users.id })
    const [report] = await database.db.insert(aiReports).values({
      userId: owner!.id,
      reportType: 'weekly',
      periodStart: '2026-09-01',
      periodEndExclusive: '2026-09-08',
      timezone: 'UTC',
      locale: 'en',
      revision: 1,
      inputSnapshotHash: 'a'.repeat(64),
      coverageJson: '{}',
      metricsJson: '[]',
      recipientRevision: 1,
      idempotencyKeyHash: 'b'.repeat(64),
      normalizedRequestHash: 'c'.repeat(64),
      status: 'queued',
      reservationBucketMonth: '2026-09-01',
      reservationCostCents: 5,
    }).returning({ id: aiReports.id })
    await database.db.insert(aiUsageBuckets).values({ scope: 'user', userId: owner!.id, bucketMonth: '2026-09-01', reserved: 1 })
    await database.db.update(aiUsageBuckets).set({ reserved: 1, reservedCostCents: 5 }).where(and(eq(aiUsageBuckets.scope, 'global'), eq(aiUsageBuckets.bucketMonth, '2026-09-01')))

    const enabled = await put(admin, '/api/admin/ai/runtime', { generationEnabled: true })
    expect(enabled.status).toBe(200)
    const disabled = await put(admin, '/api/admin/ai/runtime', { generationEnabled: false })
    expect(disabled.status).toBe(200)
    const cancelled = await database.db.select().from(aiReports).where(eq(aiReports.id, report!.id)).limit(1)
    expect(cancelled[0]).toMatchObject({ status: 'cancelled', errorCode: 'AI_CONFIG_CHANGED' })
    const userBucket = await database.db.select().from(aiUsageBuckets).where(and(eq(aiUsageBuckets.scope, 'user'), eq(aiUsageBuckets.userId, owner!.id))).limit(1)
    expect(userBucket[0]).toMatchObject({ reserved: 0, released: 1 })
    const globalBucket = await database.db.select().from(aiUsageBuckets).where(and(eq(aiUsageBuckets.scope, 'global'), eq(aiUsageBuckets.bucketMonth, '2026-09-01'))).limit(1)
    expect(globalBucket[0]).toMatchObject({ reservedCostCents: 0, released: 1 })
    const audit = await database.db.select().from(aiAdminAuditEvents).where(eq(aiAdminAuditEvents.action, 'runtime.generation.disabled'))
    expect(audit.length).toBeGreaterThan(0)
  })

  it('rejects a reservation below the declared full token-price bound', async () => {
    const admin = await login(true)
    const latest = await database.pool.query('select coalesce(max(revision), 0)::int as revision from ai_provider_config_version')
    const draft = await put(admin, '/api/admin/ai/settings/draft', providerDraft(Number(latest.rows[0].revision), {
      inputPricePerMillionCents: 1_000_000,
      outputPricePerMillionCents: 1_000_000,
      reservationCostCents: 5,
    }))
    expect(draft.status).toBe(400)
  })

  it('invalidates a successful provider test when the draft is edited before publish', async () => {
    const admin = await login(true)
    const latest = await database.pool.query('select coalesce(max(revision), 0)::int as revision from ai_provider_config_version')
    const firstDraftRevision = Number(latest.rows[0].revision) + 1
    const draft = await put(admin, '/api/admin/ai/settings/draft', providerDraft(firstDraftRevision - 1))
    expect(draft.status).toBe(200)
    const tested = await admin.post('/api/admin/ai/settings/test', { expectedRevision: firstDraftRevision })
    expect(tested.status).toBe(200)

    const edited = await put(admin, '/api/admin/ai/settings/draft', providerDraft(firstDraftRevision, { displayName: 'Edited after test', apiKeyAction: 'keep', apiKey: undefined }))
    expect(edited.status).toBe(200)
    const stalePublish = await admin.post('/api/admin/ai/settings/publish', { expectedRevision: firstDraftRevision + 1 })
    expect(stalePublish.status).toBe(409)
  })

  it('rejects a new currency when the current month already has usage before publication', async () => {
    const admin = await login(true)
    const currentRuntime = await database.pool.query('select active_provider_config_id from ai_runtime_state where singleton=$1', ['default'])
    const activeProviderId = currentRuntime.rows[0].active_provider_config_id
    expect(activeProviderId).not.toBeNull()
    await database.pool.query('update ai_runtime_state set active_provider_config_id=null where singleton=$1', ['default'])
    try {
      const latest = await database.pool.query('select coalesce(max(revision), 0)::int as revision from ai_provider_config_version')
      const draft = await put(admin, '/api/admin/ai/settings/draft', providerDraft(Number(latest.rows[0].revision), {
        pricingCurrency: 'CNY',
        pricingVersion: 'fixture-price-cny',
      }))
      expect(draft.status).toBe(409)
    } finally {
      await database.pool.query('update ai_runtime_state set active_provider_config_id=$1 where singleton=$2', [activeProviderId, 'default'])
    }
  })

  it('enforces the two-call cap across concurrent manual capability tests', async () => {
    const latest = await database.pool.query('select coalesce(max(revision), 0)::int as revision from ai_provider_config_version')
    const expectedRevision = Number(latest.rows[0].revision)
    const setupAdmin = await login(true)
    const enabled = await put(setupAdmin, '/api/admin/ai/runtime', { generationEnabled: true })
    expect(enabled.status).toBe(200)

    let started = 0
    let resolveStartedTwo!: () => void
    const startedTwo = new Promise<void>(resolve => { resolveStartedTwo = resolve })
    const release: Array<() => void> = []
    const barrierTransport: AiTransport = async () => {
      started += 1
      if (started >= 2) resolveStartedTwo()
      if (started <= 2) await new Promise<void>(resolve => release.push(resolve))
      return {
        status: 200,
        retryAfter: null,
        body: JSON.stringify({
          id: `barrier-${started}`,
          choices: [{ finish_reason: 'stop', message: { content: emptyAnalysis } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      }
    }
    const barrierApp = createApp({
      db: database.db,
      databasePool: database.pool,
      now: () => new Date('2026-09-05T12:00:00.000Z'),
      aiTransport: barrierTransport,
      config: { jwtSecret: 'synthetic-review-key-with-at-least-32-characters', nodeEnv: 'test', trustProxy: false, webOrigin: 'http://127.0.0.1' },
    })
    const barrierServer = serve({ fetch: barrierApp.fetch, hostname: '127.0.0.1', port: 0 })
    await once(barrierServer, 'listening')
    const barrierBaseUrl = `http://127.0.0.1:${(barrierServer.address() as AddressInfo).port}`
    const pending: Array<Promise<unknown>> = []
    try {
      const firstAdmin = await login(true, barrierBaseUrl)
      const secondAdmin = await login(true, barrierBaseUrl)
      const first = firstAdmin.post('/api/admin/ai/settings/test', { expectedRevision })
      const second = secondAdmin.post('/api/admin/ai/settings/test', { expectedRevision })
      pending.push(first, second)
      await Promise.race([
        startedTwo,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('manual test barrier timed out')), 3_000)),
      ])
      const third = await firstAdmin.post('/api/admin/ai/settings/test', { expectedRevision })
      expect(third.status).toBe(429)
      release.forEach(resolve => resolve())
      expect((await first).status).toBe(200)
      expect((await second).status).toBe(200)
      expect(started).toBe(2)
    } finally {
      release.forEach(resolve => resolve())
      await Promise.allSettled(pending)
      barrierServer.close()
      await once(barrierServer, 'close')
    }
  })
})
