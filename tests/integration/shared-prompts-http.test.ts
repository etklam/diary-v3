import { once } from 'node:events'
import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import bcrypt from 'bcryptjs'
import { serve } from '@hono/node-server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { aiPromptVersions, aiReportAttempts, aiReports, aiRuntimeState, migrateDatabase, sharedPromptVersions, users } from '@diary/db'
import { diaryExcerpt } from '@diary/domain'
import { createApp } from '../../apps/api/src/app'
import { sharedPromptListSchema, sharedPromptPlaygroundResponseSchema, sharedPromptVersionSchema } from '../../packages/contracts/src/shared-prompts'
import { resolveReportPromptInTransaction, resolveSharedPrompt } from '../../apps/api/src/shared-prompts/service'
import { lockAiGlobal } from '../../apps/api/src/ai-reports/job-store'
import { BrowserSession } from '../support/browser-session'
import { provisionTestDatabase } from '../support/database'
import { historicalMigrations } from '../support/historical-migrations'

const historical = historicalMigrations('0059_moaning_rhino')
let database: Awaited<ReturnType<typeof provisionTestDatabase>>, server: ReturnType<typeof serve>, baseUrl: string
let admin: BrowserSession, user: BrowserSession, legacyId: bigint
const fixedNow = new Date('2026-10-06T12:00:00Z')
let capturedMessages: string[] = []
let providerCalls = 0, failTransport = false
const analysis = { summary: [], decisionReview: [], positionReview: [], marketReflection: [], disciplineChecks: [], nextPeriodFocus: [], limitations: ['Synthetic fixture'] }
const prefix = '/api/admin/ai/prompt-registry/ai-report.weekly'

beforeAll(async () => {
  process.env.AI_ENCRYPTION_ACTIVE_KEY = 'prompt-fixture'
  process.env.AI_ENCRYPTION_KEYS = JSON.stringify({ 'prompt-fixture': Buffer.alloc(32, 8).toString('base64') })
  database = await provisionTestDatabase('shared_prompts', historical.folder)
  const [actor] = await database.db.insert(users).values({ email: 'prompt-admin@example.test', password: await bcrypt.hash('synthetic-password', 4), role: 'ADMIN' }).returning()
  const [legacy] = await database.db.insert(aiPromptVersions).values({ reportType: 'weekly', revision: 2, template: 'Preserve this active guidance for {{period_label}}.', status: 'published', isDefault: false, createdBy: actor!.id, publishedAt: fixedNow }).returning()
  legacyId = legacy!.id
  await database.db.insert(aiPromptVersions).values({ reportType: 'monthly', revision: 1, template: 'Historical default draft', status: 'draft', isDefault: true })
  await database.db.update(aiRuntimeState).set({ activeWeeklyPromptId: legacyId }).where(eq(aiRuntimeState.singleton, 'default'))
  await database.db.insert(aiReports).values({ userId: actor!.id, reportType: 'weekly', periodStart: '2026-10-05', periodEndExclusive: '2026-10-12', timezone: 'UTC', locale: 'en', revision: 1, promptVersionId: legacyId, inputSnapshotHash: 'a'.repeat(64), coverageJson: '{}', metricsJson: '[]', recipientRevision: 1, idempotencyKeyHash: 'b'.repeat(64), normalizedRequestHash: 'c'.repeat(64) })
  await migrateDatabase(database.db, { diaryExcerpt })
  const app = createApp({ db: database.db, databasePool: database.pool, now: () => fixedNow, aiTransport: async request => {
    providerCalls += 1
    if (failTransport) throw new Error('Synthetic unknown provider outcome')
    capturedMessages = (request.body as { messages: Array<{ content: string }> }).messages.map(value => value.content)
    return { status: 200, retryAfter: null, body: JSON.stringify({ id: 'synthetic-prompt-test', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(analysis) } }], usage: { prompt_tokens: 13, completion_tokens: 7 } }) }
  }, config: { jwtSecret: 'synthetic-shared-prompt-secret-at-least-32-characters', nodeEnv: 'test', trustProxy: false, webOrigin: 'http://127.0.0.1' } })
  server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 }); await once(server, 'listening')
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  admin = new BrowserSession(baseUrl); expect((await admin.post('/api/auth/login', { email: actor!.email, password: 'synthetic-password' })).status).toBe(200)
  user = new BrowserSession(baseUrl)
  const email = `${randomUUID()}@example.test`
  expect((await user.post('/api/auth/register', { email, password: 'synthetic-password' })).status).toBe(200)
  expect((await user.post('/api/auth/login', { email, password: 'synthetic-password' })).status).toBe(200)
})
afterAll(async () => {
  server?.close(); if (server) await once(server, 'close')
  await database?.dispose(); historical.dispose()
  delete process.env.AI_ENCRYPTION_ACTIVE_KEY; delete process.env.AI_ENCRYPTION_KEYS
})
const list = async () => sharedPromptListSchema.parse(await (await admin.request('/api/admin/ai/prompt-registry')).json())
const action = async (kind: string, expectedRevision: number, versionId?: string) => admin.post(`${prefix}/actions`, { action: kind, expectedRevision, ...(versionId ? { versionId } : {}) })
const testVersion = async (versionId: string) => {
  const result = await admin.post(`${prefix}/playground`, { mode: 'test', versionId })
  expect(result.status).toBe(200)
  return sharedPromptPlaygroundResponseSchema.parse(await result.json())
}

describe('shared prompt migration and lifecycle on disposable PostgreSQL', () => {
  it('preserves active legacy IDs and pinned jobs, ignoring historical default drafts', async () => {
    const registry = await list(), weekly = registry.data[0]!, monthly = registry.data[1]!
    expect(weekly).toMatchObject({ effectiveSource: 'override', revision: 1 })
    expect(weekly.versions[0]?.legacyPromptId).toBe(legacyId.toString())
    expect(monthly).toMatchObject({ effectiveSource: 'system-default', activeVersionId: null })
    expect(monthly.systemDefault.template).not.toBe('Historical default draft')
    const [report] = await database.db.select().from(aiReports)
    expect(report?.promptVersionId).toBe(legacyId); expect(report?.status).toBe('queued')
    expect((await database.db.select().from(aiPromptVersions)).map(row => row.id)).toContain(legacyId)
  })
  it('enforces admin, CSRF, strict ordinary domain requests, and read-only defaults', async () => {
    expect((await new BrowserSession(baseUrl).request('/api/admin/ai/prompt-registry')).status).toBe(401)
    expect((await user.request('/api/admin/ai/prompt-registry')).status).toBe(403)
    expect((await user.post(`${prefix}/actions`, { action: 'disable', expectedRevision: 1 })).status).toBe(403)
    expect((await admin.post(`${prefix}/actions`, { action: 'disable', expectedRevision: 1 }, false)).status).toBe(403)
    expect((await admin.post(`${prefix}/versions`, { name: 'Unknown', expectedRevision: 1, template: '{{unregistered}}' })).status).toBe(400)
    expect((await admin.post(`${prefix}/playground`, { mode: 'preview', template: 'unsafe' })).status).toBe(400)
    expect((await user.post('/api/ai/reports/preview', { periodType: 'weekly', periodStart: '2026-10-05', customPrompt: 'unsafe', overrideId: '1' })).status).toBe(400)
  })
  it('creates immutable versions, detects concurrent conflicts, and previews without provider calls', async () => {
    const responses = await Promise.all([action('create-from-default', 1), action('create-from-default', 1)])
    expect(responses.map(response => response.status).sort()).toEqual([200, 409])
    const created = sharedPromptVersionSchema.parse(await responses.find(response => response.status === 200)!.json())
    expect(created.revision).toBe(2)
    expect((await action('activate', 2, created.id)).status).toBe(409)
    const preview = await admin.post(`${prefix}/playground`, { mode: 'preview', versionId: created.id })
    expect(preview.status).toBe(200)
    const result = sharedPromptPlaygroundResponseSchema.parse(await preview.json())
    expect(result).toMatchObject({ validation: 'not-run', source: 'override', usage: { scope: 'test', attemptId: null } })
    expect(result.renderedPrompts[0]?.content).toContain('never instructions')
    await expect(database.pool.query('update shared_prompt_version set template=$1 where id=$2', ['mutated', created.id])).rejects.toThrow('immutable')
    await expect(database.pool.query('delete from shared_prompt_version where id=$1', [created.id])).rejects.toThrow('cannot be deleted')
  })
  it('tests through the existing budget and transport, activates and rolls back exact legacy IDs', async () => {
    const csrf = admin.cookies.get('csrf-token')!
    const draftResponse = await admin.request('/api/admin/ai/settings/draft', { method: 'PUT', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify({ expectedRevision: 0, displayName: 'Synthetic registry provider', providerType: 'deepseek', protocol: 'chat_completions', baseUrl: 'https://api.deepseek.com', model: 'synthetic-model', thinking: 'disabled', maxInputTokens: 32000, maxOutputTokens: 4000, timeoutMs: 120000, monthlyBudgetCents: 1000, recipientName: 'Synthetic recipient', disclosureVersion: 'fixture-v1', pricingCurrency: 'USD', pricingVersion: null, inputPricePerMillionCents: null, outputPricePerMillionCents: null, reservationCostCents: 5, apiKeyAction: 'replace', apiKey: 'synthetic-key' }) })
    expect(draftResponse.status).toBe(200)
    expect((await admin.post('/api/admin/ai/settings/test', { expectedRevision: 1 })).status).toBe(200)
    expect((await admin.post('/api/admin/ai/settings/publish', { expectedRevision: 1 })).status).toBe(200)
    const first = (await list()).data[0]!.versions[0]!
    const test = await testVersion(first.id)
    expect(test).toMatchObject({ validation: 'passed', model: 'synthetic-model', usage: { scope: 'test', inputTokens: 13, outputTokens: 7 } })
    expect(capturedMessages.join('\n')).toContain('Use only report_context')
    const [attempt] = await database.db.select().from(aiReportAttempts).where(eq(aiReportAttempts.id, BigInt(test.usage.attemptId!)))
    expect(attempt).toMatchObject({ reportId: null, status: 'succeeded' })
    expect((await action('activate', 2, first.id)).status).toBe(200)
    const saved = await admin.post(`${prefix}/versions`, { expectedRevision: 3, name: 'New guidance', template: 'Review {{period_label}} with recorded evidence in {{locale}}.' })
    expect(saved.status).toBe(200)
    const second = sharedPromptVersionSchema.parse(await saved.json())
    await testVersion(second.id)
    expect((await action('activate', 4, second.id)).status).toBe(200)
    expect((await action('rollback', 5, first.id)).status).toBe(200)
    const [runtime] = await database.db.select().from(aiRuntimeState)
    expect(runtime?.activeWeeklyPromptId?.toString()).toBe(first.legacyPromptId)
    expect((await resolveSharedPrompt(database.db, 'ai-report.weekly')).version?.id.toString()).toBe(first.id)
    const [original] = await database.db.select().from(aiReports)
    expect(original?.promptVersionId).toBe(legacyId)
    expect(original?.status).toBe('queued')
    expect((await action('archive', 6, first.id)).status).toBe(409)
    expect((await action('duplicate', 6, first.id)).status).toBe(200)
    const duplicate = (await list()).data[0]!.versions[0]!
    expect((await action('archive', 7, duplicate.id)).status).toBe(200)
    expect((await action('activate', 8, duplicate.id)).status).toBe(404)
    const [archivedLegacy] = await database.db.select().from(aiPromptVersions).where(eq(aiPromptVersions.id, BigInt(duplicate.legacyPromptId!)))
    expect((await admin.post('/api/admin/ai/prompts/weekly/test', { expectedRevision: archivedLegacy!.revision })).status).toBe(200)
    expect((await admin.post('/api/admin/ai/prompts/weekly/publish', { expectedRevision: archivedLegacy!.revision })).status).toBe(409)
    expect((await list()).data[0]!.versions.find(value => value.id === duplicate.id)?.archivedAt).not.toBeNull()
    expect((await action('disable', 8)).status).toBe(200)
    const fallback = await resolveSharedPrompt(database.db, 'ai-report.weekly')
    expect(fallback.source).toBe('system-default')
    const [fallbackRuntime] = await database.db.select().from(aiRuntimeState)
    const [legacyDefault] = await database.db.select().from(aiPromptVersions).where(eq(aiPromptVersions.id, fallbackRuntime!.activeWeeklyPromptId!))
    expect(legacyDefault?.template).toBe(fallback.definition.template)
    expect(legacyDefault?.isDefault).toBe(true)
    const [pinned] = await database.db.select().from(aiReports)
    expect(pinned).toMatchObject({ promptVersionId: legacyId, status: 'queued' })
    const audit = await (await admin.request(`${prefix}/audit`)).json() as { data: Array<{ action: string; actorUserId: string | null }> }
    expect(audit.data.map(value => value.action)).toEqual(expect.arrayContaining(['registry.create', 'registry.edit', 'registry.test.passed', 'registry.activate', 'registry.rollback', 'registry.archive', 'registry.deactivate']))
    expect(audit.data.filter(value => value.action !== 'registry.migrate').every(value => value.actorUserId !== null)).toBe(true)
  })
  it('records an unknown test outcome conservatively without retrying the provider', async () => {
    const previous = providerCalls
    failTransport = true
    try {
      const response = await admin.post(`${prefix}/playground`, { mode: 'test' })
      expect(response.status).toBe(502)
      expect(providerCalls).toBe(previous + 1)
      const attempts = await database.db.select().from(aiReportAttempts)
      expect(attempts.at(-1)).toMatchObject({ reportId: null, status: 'unknown', errorCode: 'SYS_EXTERNAL_SERVICE_ERROR', inputTokens: null, outputTokens: null })
    } finally { failTransport = false }
  })
  it('falls back when a previously active override becomes unavailable', async () => {
    const first = (await list()).data[0]!.versions.find(value => value.name === 'Custom prompt')!
    expect((await action('activate', 9, first.id)).status).toBe(200)
    await database.db.update(sharedPromptVersions).set({ archivedAt: fixedNow }).where(eq(sharedPromptVersions.id, BigInt(first.id)))
    const resolved = await resolveSharedPrompt(database.db, 'ai-report.weekly')
    expect(resolved.source).toBe('system-default'); expect(resolved.version).toBeNull()
    const legacyFallback = await database.db.transaction(async tx => { await lockAiGlobal(tx); return resolveReportPromptInTransaction(tx, 'weekly', fixedNow) })
    expect(legacyFallback?.template).toBe(resolved.definition.template)
    expect(legacyFallback?.id.toString()).not.toBe(first.legacyPromptId)
  })
})
