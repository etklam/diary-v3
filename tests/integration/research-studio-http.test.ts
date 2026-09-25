import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../apps/api/src/app'
import { ResearchStudioService, runResearchOnce } from '../../apps/api/src/research-studio/service'
import { BrowserSession } from '../support/browser-session'
import { createSyntheticResearchFixture } from '../support/research-fixtures'
import { provisionTestDatabase } from '../support/database'

const jwtSecret = 'synthetic-research-studio-http-test-secret'
const fixedNow = () => new Date('2026-09-25T12:00:00.000Z')

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let server: ReturnType<typeof serve>
let baseUrl = ''
let fixture: ReturnType<typeof createSyntheticResearchFixture>
let previousEncryptionActiveKey: string | undefined
let previousEncryptionKeys: string | undefined

beforeAll(async () => {
  previousEncryptionActiveKey = process.env.AI_ENCRYPTION_ACTIVE_KEY
  previousEncryptionKeys = process.env.AI_ENCRYPTION_KEYS
  process.env.AI_ENCRYPTION_ACTIVE_KEY = 'research-http-fixture'
  process.env.AI_ENCRYPTION_KEYS = JSON.stringify({ 'research-http-fixture': Buffer.alloc(32, 13).toString('base64') })
  database = await provisionTestDatabase('research_studio_http')
})

beforeEach(async () => {
  fixture = createSyntheticResearchFixture()
  const app = createApp({
    db: database.db,
    now: fixedNow,
    researchEvidenceProvider: fixture.evidenceProvider,
    researchLatestCompletedSession: fixture.latestCompletedSession,
    researchTransport: fixture.transport,
    allowSyntheticEvidence: true,
    config: { jwtSecret, nodeEnv: 'test', trustProxy: false, webOrigin: 'http://127.0.0.1' },
  })
  server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 })
  await once(server, 'listening')
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterEach(async () => {
  server.close()
  await once(server, 'close')
})

afterAll(async () => {
  await database?.dispose()
  if (previousEncryptionActiveKey === undefined) delete process.env.AI_ENCRYPTION_ACTIVE_KEY
  else process.env.AI_ENCRYPTION_ACTIVE_KEY = previousEncryptionActiveKey
  if (previousEncryptionKeys === undefined) delete process.env.AI_ENCRYPTION_KEYS
  else process.env.AI_ENCRYPTION_KEYS = previousEncryptionKeys
})

async function login(admin = false) {
  const browser = new BrowserSession(baseUrl)
  const credentials = { email: `${randomUUID()}@example.test`, password: 'synthetic-research-password' }
  expect((await browser.post('/api/auth/register', credentials)).status).toBe(200)
  if (admin) await database.pool.query("update users set role='ADMIN' where email=$1", [credentials.email])
  expect((await browser.post('/api/auth/login', credentials)).status).toBe(200)
  expect((await browser.request('/api/auth/me')).status).toBe(200)
  return browser
}

function mutate(browser: BrowserSession, path: string, body: unknown = {}, method = 'PUT') {
  return browser.request(path, {
    method,
    headers: { 'content-type': 'application/json', 'x-csrf-token': browser.cookies.get('csrf-token')! },
    body: JSON.stringify(body),
  })
}

function reviewedSyntheticQa(value: unknown) {
  return (value as Array<Record<string, unknown>>).map(gate => {
    const gateId = gate.gateId
    if (gateId === 'G07') return { ...gate, status: 'PASS', evidence: ['Reviewed the synthetic section 9 claim; no current trade-plan conclusion is asserted.'], reason: null, remediation: null, reviewerId: null, reviewedAt: null }
    if (gateId === 'G08') return { ...gate, status: 'PASS', evidence: ['Reviewed the synthetic section 7 claim; no current event date or time is asserted.'], reason: null, remediation: null, reviewerId: null, reviewedAt: null }
    if (gateId === 'G09') return { ...gate, status: 'PASS', evidence: ['All claims are explicitly synthetic and contain no unsupported source citations.'], reason: null, remediation: null, reviewerId: null, reviewedAt: null }
    if (gateId === 'G10') return { ...gate, status: 'PASS', evidence: ['The ten synthetic sections and eight answers remain consistent and make no current-market claim.'], reason: null, remediation: null, reviewerId: null, reviewedAt: null }
    return { ...gate, reviewerId: null, reviewedAt: null }
  })
}

describe('Research Studio HTTP routes', () => {
  it('requires an administrator for methods, settings, runs, and mutations', async () => {
    expect((await fetch(`${baseUrl}/api/admin/research/methods`)).status).toBe(401)
    const member = await login()
    expect((await member.request('/api/admin/research/methods')).status).toBe(403)
    expect((await member.request('/api/admin/research/settings')).status).toBe(403)
    expect((await member.request('/api/admin/research/runs')).status).toBe(403)
    expect((await member.post('/api/admin/research/runs', { symbol: 'SOXX', synthetic: true })).status).toBe(403)
  })

  it('loads configured profiles, prepares synthetic evidence, generates, revises, approves, and hands off an unpublished member draft', async () => {
    const admin = await login(true)
    const methodsResponse = await admin.request('/api/admin/research/methods')
    expect(methodsResponse.status).toBe(200)
    const methods = await methodsResponse.json() as Array<{ id: string; key: string; status: string }>
    const method = methods.find(item => item.key === 'us-equity-swing-report')
    expect(method).toMatchObject({ status: 'COMPLETE' })

    const instrumentsResponse = await admin.request(`/api/admin/research/instruments?methodProfileId=${method!.id}`)
    expect(instrumentsResponse.status).toBe(200)
    const instruments = await instrumentsResponse.json() as Array<{ id: string; symbol: string }>
    const instrument = instruments.find(item => item.symbol === 'SOXX')
    expect(instrument).toBeDefined()

    const settingsResponse = await admin.request('/api/admin/research/settings')
    expect(settingsResponse.status).toBe(200)
    const settings = await settingsResponse.json() as {
      runtime: { revision: number; budget: { limit: number } }
      provider: null | Record<string, unknown>
      sources: Array<{ sourceId: string; use: Record<string, { status: string; conditions: string[]; basis: string | null; checkedAt: string | null }> }>
      search: { status: string; configured: boolean }
    }
    expect(settings.provider).toBeNull()
    expect(settings.sources.length).toBeGreaterThan(0)
    expect(Object.keys(settings.sources[0]!.use).sort()).toEqual([
      'automatedFetch', 'evidenceStorage', 'llmInference', 'publicationOfAnalysisAndExcerpts', 'rawDataRedistribution',
    ].sort())
    expect(settings.sources[0]!.use.rawDataRedistribution).toHaveProperty('conditions')
    expect(settings.sources[0]!.use.rawDataRedistribution).toHaveProperty('basis')
    expect(settings.sources[0]!.use.rawDataRedistribution).toHaveProperty('checkedAt')
    expect(['SEARCH_NOT_CONFIGURED', 'SEARCH_BUDGET_NOT_CONFIGURED', 'SEARCH_QUOTA_EXCEEDED', 'READY']).toContain(settings.search.status)

    const providerResponse = await mutate(admin, '/api/admin/research/provider', {
      expectedRevision: 0,
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'openrouter/free',
      maxInputTokens: 64000,
      maxOutputTokens: 6000,
      timeoutMs: 45000,
      apiKey: 'synthetic-research-fixture-key',
    })
    expect(providerResponse.status).toBe(200)
    const provider = await providerResponse.json() as Record<string, unknown>
    expect(provider.hasSecret).toBe(true)
    expect(provider).not.toHaveProperty('apiKey')
    expect(provider).not.toHaveProperty('encryptedApiKey')
    expect(provider).not.toHaveProperty('secretRef')

    const runtimeResponse = await mutate(admin, '/api/admin/research/runtime', {
      expectedRevision: settings.runtime.revision,
      featureEnabled: true,
      generationEnabled: true,
    })
    expect(runtimeResponse.status).toBe(200)
    const runtime = await runtimeResponse.json() as { revision: number; featureEnabled: boolean; generationEnabled: boolean }
    expect(runtime).toMatchObject({ featureEnabled: true, generationEnabled: true })
    expect(runtime.revision).toBeGreaterThan(settings.runtime.revision)

    const prepare = await admin.post('/api/admin/research/runs', {
      methodProfileId: method!.id,
      instrumentProfileId: instrument!.id,
      displayTimezone: 'America/New_York',
      asOf: '2026-09-05T23:30:00.000Z',
      synthetic: true,
    })
    expect(prepare.status).toBe(200)
    const run = await prepare.json() as {
      id: string; version: number; quality: string; executionStatus: string; method: { status: string }
      evidence: { manifest: { synthetic: boolean }; candidates: { search: { status: string } }; sources: Array<{ sourceId: string; use: Record<string, { status: string; conditions: string[]; basis: string | null; checkedAt: string | null }> }> }
    }
    expect(run.method.status).toBe('COMPLETE')
    expect(run.quality).toBe('LIMITED')
    expect(run.executionStatus).toBe('BLOCKED')
    expect(run.evidence.manifest.synthetic).toBe(true)
    expect(run.evidence.candidates.search.status).toBe('SEARCH_NOT_CONFIGURED')
    expect(run.evidence.sources.length).toBeGreaterThan(0)
    expect(Object.keys(run.evidence.sources[0]!.use)).toHaveLength(5)

    const listResponse = await admin.request('/api/admin/research/runs?page=1&limit=20')
    expect(listResponse.status).toBe(200)
    expect((await listResponse.json() as { data: Array<{ id: string }> }).data.some(item => item.id === run.id)).toBe(true)

    const generation = await admin.post(`/api/admin/research/runs/${run.id}/generate`, { expectedVersion: run.version, idempotencyKey: 'synthetic-http-generation-01' })
    expect(generation.status).toBe(202)
    expect(fixture.transportCalls).toBe(0)
    const worker = new ResearchStudioService({
      db: database.db,
      now: fixedNow,
      evidenceProvider: fixture.evidenceProvider,
      latestCompletedSession: fixture.latestCompletedSession,
      transport: fixture.transport,
      allowSyntheticEvidence: true,
      workerId: 'synthetic-http-research-worker',
    })
    const workerResult = await runResearchOnce(worker)
    const generatedResponse = await admin.request(`/api/admin/research/runs/${run.id}`)
    expect(generatedResponse.status).toBe(200)
    const generated = await generatedResponse.json() as {
      version: number; currentRevision: number; dispatchStatus: string; executionStatus: string
      attempts: Array<{ dispatchStatus: string; diagnostics: string | null }>
      revisions: Array<{ revision: number; bodyHash: string; content: string; structured: Record<string, unknown>; reviewStatus: string }>
    }
    expect(fixture.transportCalls, JSON.stringify({ workerResult, executionStatus: generated.executionStatus, dispatchStatus: generated.dispatchStatus, attempts: generated.attempts.map(({ dispatchStatus, diagnostics }) => ({ dispatchStatus, diagnostics })) })).toBe(1)
    expect(generated).toMatchObject({ currentRevision: 1, dispatchStatus: 'SUCCEEDED' })
    const generatedRevision = generated.revisions[0]!
    const { qa, ...draft } = generatedRevision.structured
    expect(Array.isArray(qa)).toBe(true)
    const revisedContent = generatedRevision.content.replace('Synthetic section 2', 'Reviewed synthetic section 2')
    const revisionStructured = { ...draft, title: 'Reviewed synthetic SOXX research' }
    const revisionResponse = await admin.post(`/api/admin/research/runs/${run.id}/revisions`, {
      expectedVersion: generated.version,
      expectedRevision: generatedRevision.revision,
      structured: revisionStructured,
      content: revisedContent,
      qa,
    })
    expect(revisionResponse.status).toBe(200)
    const revision = await revisionResponse.json() as { revision: number; bodyHash: string; content: string }
    expect(revision).toMatchObject({ revision: 2, content: revisedContent })
    expect(revision.bodyHash).not.toBe(generatedRevision.bodyHash)
    const history = await (await admin.request(`/api/admin/research/runs/${run.id}`)).json() as { version: number; revisions: Array<{ revision: number; bodyHash: string; content: string }> }
    expect(history.revisions.find(item => item.revision === 1)?.content).toBe(generatedRevision.content)

    const manualQa = reviewedSyntheticQa(qa)
    const qaReviewResponse = await admin.post(`/api/admin/research/runs/${run.id}/revisions`, {
      expectedVersion: history.version,
      expectedRevision: revision.revision,
      structured: revisionStructured,
      content: revisedContent,
      qa: manualQa,
    })
    expect(qaReviewResponse.status).toBe(200)
    const qaRevision = await qaReviewResponse.json() as { revision: number; bodyHash: string; structured: { qa: Array<{ gateId: string; status: string; reviewerId: string | null; reviewedAt: string | null }> } }
    expect(qaRevision).toMatchObject({ revision: 3, bodyHash: revision.bodyHash })
    expect(qaRevision.structured.qa.filter(gate => ['G07', 'G08', 'G09', 'G10'].includes(gate.gateId)).every(gate => gate.reviewerId !== null && gate.reviewedAt !== null)).toBe(true)
    expect(qaRevision.structured.qa.find(gate => gate.gateId === 'G07')?.status).toBe('PASS')
    expect(qaRevision.structured.qa.find(gate => gate.gateId === 'G09')?.status).toBe('PASS')
    const reviewedHistory = await (await admin.request(`/api/admin/research/runs/${run.id}`)).json() as { version: number }

    const approval = await admin.post(`/api/admin/research/runs/${run.id}/approve`, { expectedVersion: reviewedHistory.version, revision: qaRevision.revision, bodyHash: qaRevision.bodyHash })
    expect(approval.status).toBe(200)
    const approved = await approval.json() as { version: number; reviewStatus: string; revisions: Array<{ revision: number; reviewStatus: string; bodyHash: string }> }
    expect(approved.reviewStatus).toBe('APPROVED')
    expect(approved.revisions.find(item => item.revision === qaRevision.revision)).toMatchObject({ reviewStatus: 'APPROVED', bodyHash: qaRevision.bodyHash })

    const handoff = await admin.post(`/api/admin/research/runs/${run.id}/handoff`, {
      expectedVersion: approved.version,
      revision: qaRevision.revision,
      bodyHash: qaRevision.bodyHash,
      access: 'MEMBER',
      category: 'technical',
      tags: ['synthetic', 'research'],
    })
    expect(handoff.status).toBe(200)
    const article = await handoff.json() as { postId: string; created: boolean; status: string; access: string }
    expect(article).toMatchObject({ created: true, status: 'DRAFT', access: 'MEMBER' })
    const postResponse = await admin.request(`/api/blog/admin/${article.postId}`)
    expect(postResponse.status).toBe(200)
    const post = await postResponse.json() as { slug: string; content: string; excerpt: string | null; excerptAuthored: boolean; status: string; access: string }
    expect(post).toMatchObject({ content: revisedContent, excerpt: null, excerptAuthored: false, status: 'DRAFT', access: 'MEMBER' })

    const editedContent = `${revisedContent}\n\nEdited through the linked article editor.`
    const postEdit = await mutate(admin, `/api/blog/${article.postId}`, {
      title: 'Edited synthetic SOXX draft',
      content: editedContent,
      category: 'technical',
      tags: 'synthetic,research',
      status: 'DRAFT',
      access: 'MEMBER',
    })
    expect(postEdit.status).toBe(200)
    expect(await postEdit.json()).toMatchObject({ title: 'Edited synthetic SOXX draft', content: editedContent, excerpt: null, excerptAuthored: false, status: 'DRAFT', access: 'MEMBER' })

    const editedRun = await (await admin.request(`/api/admin/research/runs/${run.id}`)).json() as { version: number }
    const importResponse = await admin.post(`/api/admin/research/runs/${run.id}/import-article-revision`, { expectedVersion: editedRun.version })
    expect(importResponse.status).toBe(200)
    const imported = await importResponse.json() as { revision: number; bodyHash: string; content: string; structured: { title: string; qa: Array<{ gateId: string; status: string; reviewerId: string | null; reviewedAt: string | null }> } }
    expect(imported).toMatchObject({ revision: 4, content: editedContent, structured: { title: 'Edited synthetic SOXX draft' } })
    expect(imported.structured.qa.filter(gate => ['G07', 'G08', 'G09', 'G10'].includes(gate.gateId)).every(gate => gate.status === 'NOT_CHECKED' && gate.reviewerId === null && gate.reviewedAt === null)).toBe(true)

    const importedRun = await (await admin.request(`/api/admin/research/runs/${run.id}`)).json() as { version: number }
    const reReviewResponse = await admin.post(`/api/admin/research/runs/${run.id}/revisions`, {
      expectedVersion: importedRun.version,
      expectedRevision: imported.revision,
      structured: (({ qa: _qa, ...draft }) => draft)(imported.structured),
      content: imported.content,
      qa: reviewedSyntheticQa(imported.structured.qa),
    })
    expect(reReviewResponse.status).toBe(200)
    const reReviewed = await reReviewResponse.json() as { revision: number; bodyHash: string }
    expect(reReviewed).toMatchObject({ revision: 5, bodyHash: imported.bodyHash })
    const reReviewedRun = await (await admin.request(`/api/admin/research/runs/${run.id}`)).json() as { version: number }
    const reApproval = await admin.post(`/api/admin/research/runs/${run.id}/approve`, { expectedVersion: reReviewedRun.version, revision: reReviewed.revision, bodyHash: reReviewed.bodyHash })
    expect(reApproval.status).toBe(200)
    const reApproved = await reApproval.json() as { version: number }
    const reHandoff = await admin.post(`/api/admin/research/runs/${run.id}/handoff`, {
      expectedVersion: reApproved.version,
      revision: reReviewed.revision,
      bodyHash: reReviewed.bodyHash,
      access: 'MEMBER',
      category: 'technical',
      tags: ['synthetic', 'research'],
    })
    expect(reHandoff.status).toBe(200)
    expect(await reHandoff.json()).toMatchObject({ postId: article.postId, created: false, status: 'DRAFT', access: 'MEMBER' })
    const finalPost = await (await admin.request(`/api/blog/admin/${article.postId}`)).json() as { slug: string; title: string; content: string; excerpt: string | null; excerptAuthored: boolean; status: string; access: string }
    expect(finalPost).toMatchObject({ title: 'Edited synthetic SOXX draft', content: editedContent, excerpt: null, excerptAuthored: false, status: 'DRAFT', access: 'MEMBER' })
    expect((await fetch(`${baseUrl}/api/blog/${encodeURIComponent(finalPost.slug)}`)).status).toBe(404)

    const publish = await admin.post(`/api/blog/admin/${article.postId}/publish`, {})
    expect(publish.status).toBe(409)
    expect(await publish.json()).toMatchObject({ data: { code: 'RESEARCH_ARTICLE_PROVENANCE' } })
    const unchanged = await (await admin.request(`/api/blog/admin/${article.postId}`)).json() as { status: string; access: string; content: string; excerpt: string | null }
    expect(unchanged).toMatchObject({ status: 'DRAFT', access: 'MEMBER', title: 'Edited synthetic SOXX draft', content: editedContent, excerpt: null })
  })
})
