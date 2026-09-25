import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { serve } from '@hono/node-server'
import type { AddressInfo } from 'node:net'
import { hash } from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { researchQaGateSchema, type ResearchQaGate } from '@diary/contracts'
import { researchBudgetSessions, researchEvidenceSnapshots, researchRevisions, researchArticleLinks, researchAttempts, researchRuns, researchRuntimeState, posts, users } from '@diary/db'
import { ResearchStudioService, runResearchWorkerOnce, type ResearchTransport } from '../apps/api/src/research-studio/service.js'
import { ResearchTransportError } from '../apps/api/src/research-studio/transport.js'
import { createApp } from '../apps/api/src/app.js'
import { BrowserSession } from '../tests/support/browser-session.js'
import { provisionTestDatabase } from '../tests/support/database.js'
import { createSyntheticResearchFixture } from '../tests/support/research-fixtures.js'

const postgresContainer = 'diary-v3-postgres-1'
const postgresRole = 'diary'
const fallbackDatabaseUrl = 'postgresql://diary:diary_local@127.0.0.1:55433/diary_v3'
const fixedNow = () => new Date('2026-09-25T12:00:00.000Z')
const asOf = '2026-09-05T23:30:00.000Z'
const jwtSecret = 'synthetic-research-restore-smoke-secret'
const userPassword = `synthetic-${randomUUID()}-password`

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`
}

function databaseName(databaseUrl: string, expectedPrefix: 'research_restore_source_' | 'research_restore_target_') {
  const name = decodeURIComponent(new URL(databaseUrl).pathname.slice(1))
  invariant(new RegExp(`^${expectedPrefix}[a-f0-9]{32}$`, 'u').test(name), 'Refusing to dump or restore a database not created by this smoke run')
  return name
}

function docker(args: string[], input?: Buffer): Buffer {
  try {
    return execFileSync('docker', args, { ...(input ? { input } : {}), encoding: 'buffer', maxBuffer: 128 * 1024 * 1024, stdio: input ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'] })
  } catch {
    throw new Error('Docker PostgreSQL operation failed; no database URL or server output was retained')
  }
}

function reviewedSyntheticQa(value: unknown): ResearchQaGate[] {
  const gates = researchQaGateSchema.array().length(10).parse(value)
  return gates.map((gate): ResearchQaGate => {
    const gateId = gate.gateId
    if (gateId === 'G07') return { ...gate, status: 'PASS', evidence: ['Reviewed the synthetic section 9 claim; no current trade-plan conclusion is asserted.'], reason: null, remediation: null, reviewerId: null, reviewedAt: null }
    if (gateId === 'G08') return { ...gate, status: 'PASS', evidence: ['Reviewed the synthetic section 7 claim; no current event date or time is asserted.'], reason: null, remediation: null, reviewerId: null, reviewedAt: null }
    if (gateId === 'G09') return { ...gate, status: 'PASS', evidence: ['All claims are explicitly synthetic and contain no unsupported source citations.'], reason: null, remediation: null, reviewerId: null, reviewedAt: null }
    if (gateId === 'G10') return { ...gate, status: 'PASS', evidence: ['The ten synthetic sections and eight answers remain consistent and make no current-market claim.'], reason: null, remediation: null, reviewerId: null, reviewedAt: null }
    return { ...gate, reviewerId: null, reviewedAt: null }
  })
}

async function startApp(db: Parameters<typeof createApp>[0]['db'], fixture: ReturnType<typeof createSyntheticResearchFixture>, transport: ResearchTransport) {
  const app = createApp({
    db,
    now: fixedNow,
    researchEvidenceProvider: fixture.evidenceProvider,
    researchLatestCompletedSession: fixture.latestCompletedSession,
    researchTransport: transport,
    allowSyntheticEvidence: true,
    config: { jwtSecret, nodeEnv: 'test', trustProxy: false, webOrigin: 'http://127.0.0.1' },
  })
  const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 })
  await once(server, 'listening')
  const port = (server.address() as AddressInfo).port
  return {
    server,
    baseUrl: `http://127.0.0.1:${port}`,
    async close() {
      server.close()
      await once(server, 'close')
    },
  }
}

async function captureResearchState(db: Parameters<typeof createApp>[0]['db'], ids: {
  actorId: bigint
  runId: bigint
  unknownRunId: bigint
  successAttemptId: bigint
  unknownAttemptId: bigint
}) {
  const [actor] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, ids.actorId)).limit(1)
  const [run] = await db.select().from(researchRuns).where(eq(researchRuns.id, ids.runId)).limit(1)
  const [unknownRun] = await db.select().from(researchRuns).where(eq(researchRuns.id, ids.unknownRunId)).limit(1)
  const [snapshot] = await db.select().from(researchEvidenceSnapshots).where(eq(researchEvidenceSnapshots.runId, ids.runId)).limit(1)
  const [link] = await db.select().from(researchArticleLinks).where(eq(researchArticleLinks.runId, ids.runId)).limit(1)
  const [revision] = link ? await db.select().from(researchRevisions).where(eq(researchRevisions.id, link.revisionId)).limit(1) : []
  const [post] = link ? await db.select().from(posts).where(eq(posts.id, link.postId)).limit(1) : []
  const [successAttempt] = await db.select().from(researchAttempts).where(eq(researchAttempts.id, ids.successAttemptId)).limit(1)
  const [unknownAttempt] = await db.select().from(researchAttempts).where(eq(researchAttempts.id, ids.unknownAttemptId)).limit(1)
  const [budget] = await db.select().from(researchBudgetSessions).where(eq(researchBudgetSessions.budgetKey, 'live-test')).limit(1)
  invariant(actor && run && unknownRun && snapshot && revision && link && post && successAttempt && unknownAttempt && budget, 'A required research restore artifact is missing')

  const evidencePayload = {
    manifest: JSON.parse(snapshot.manifestJson) as unknown,
    bars: JSON.parse(snapshot.barsJson) as unknown,
    sources: JSON.parse(snapshot.sourcesJson) as unknown,
    metrics: JSON.parse(snapshot.metricsJson) as unknown,
    candidates: JSON.parse(snapshot.candidatesJson) as unknown,
    qa: JSON.parse(snapshot.qaJson) as unknown,
    quality: snapshot.quality,
  }
  const structured = JSON.parse(revision.structuredJson) as { title?: unknown }
  invariant(typeof structured.title === 'string', 'Approved revision has no title')
  return {
    actor: { id: String(actor.id), role: actor.role },
    run: {
      id: String(run.id), requesterId: run.requesterId === null ? null : String(run.requesterId),
      methodProfileId: String(run.methodProfileId), instrumentProfileId: String(run.instrumentProfileId),
      executionStatus: run.executionStatus, dispatchStatus: run.dispatchStatus, quality: run.quality,
      reviewStatus: run.reviewStatus, evidenceHash: run.evidenceHash, currentRevision: run.currentRevision,
      linkedPostId: run.linkedPostId === null ? null : String(run.linkedPostId),
    },
    snapshot: {
      id: String(snapshot.id), runId: String(snapshot.runId), version: snapshot.version,
      contentHash: snapshot.contentHash, recomputedHash: sha256(stableJson(evidencePayload)),
      synthetic: (evidencePayload.manifest as { synthetic?: unknown }).synthetic === true,
    },
    revision: {
      id: String(revision.id), runId: String(revision.runId), revision: revision.revision,
      parentRevision: revision.parentRevision, titleHash: revision.titleHash,
      recomputedTitleHash: sha256(structured.title), bodyHash: revision.bodyHash,
      recomputedBodyHash: sha256(revision.content), reviewStatus: revision.reviewStatus,
      approvedBy: revision.approvedBy === null ? null : String(revision.approvedBy),
      approvedBySnapshot: revision.approvedBySnapshot === null ? null : String(revision.approvedBySnapshot),
      createdBy: revision.createdBy === null ? null : String(revision.createdBy),
      approvedAt: revision.approvedAt?.toISOString() ?? null,
    },
    link: {
      postId: String(link.postId), runId: String(link.runId), revisionId: String(link.revisionId),
      titleHash: link.titleHash, bodyHash: link.bodyHash, evidenceHash: link.evidenceHash,
      referenceSession: link.referenceSession,
    },
    post: {
      id: String(post.id), authorId: String(post.authorId), status: post.status, access: post.access,
      titleHash: sha256(post.title), bodyHash: sha256(post.content), excerpt: post.excerpt,
      excerptAuthored: post.excerptAuthored, publishedAt: post.publishedAt?.toISOString() ?? null,
    },
    successAttempt: {
      id: String(successAttempt.id), runId: String(successAttempt.runId),
      idempotencyKeyHash: successAttempt.idempotencyKeyHash, dispatchStatus: successAttempt.dispatchStatus,
      diagnostics: successAttempt.diagnostics, finishedAt: successAttempt.finishedAt?.toISOString() ?? null,
    },
    unknownRun: {
      id: String(unknownRun.id), requesterId: unknownRun.requesterId === null ? null : String(unknownRun.requesterId),
      executionStatus: unknownRun.executionStatus, dispatchStatus: unknownRun.dispatchStatus,
      quality: unknownRun.quality, evidenceHash: unknownRun.evidenceHash,
    },
    unknownAttempt: {
      id: String(unknownAttempt.id), runId: String(unknownAttempt.runId),
      idempotencyKeyHash: unknownAttempt.idempotencyKeyHash, dispatchStatus: unknownAttempt.dispatchStatus,
      diagnostics: unknownAttempt.diagnostics, finishedAt: unknownAttempt.finishedAt?.toISOString() ?? null,
    },
    budget: {
      id: String(budget.id), budgetKey: budget.budgetKey, dispatchLimit: budget.dispatchLimit,
      reserved: budget.reserved, consumed: budget.consumed, unknown: budget.unknown,
    },
  }
}

async function main() {
  const originalDatabaseUrl = process.env.DATABASE_URL
  const hadDatabaseUrl = Object.hasOwn(process.env, 'DATABASE_URL')
  process.env.DATABASE_URL = fallbackDatabaseUrl
  let source: Awaited<ReturnType<typeof provisionTestDatabase>> | undefined
  let target: Awaited<ReturnType<typeof provisionTestDatabase>> | undefined
  let archiveDirectory: string | undefined
  let restoredApp: Awaited<ReturnType<typeof startApp>> | undefined
  let sanitizedSummary: Record<string, unknown> | undefined
  try {
    source = await provisionTestDatabase('research_restore_source')
    target = await provisionTestDatabase('research_restore_target')
    const sourceName = databaseName(source.url, 'research_restore_source_')
    const targetName = databaseName(target.url, 'research_restore_target_')
    invariant(sourceName !== targetName, 'Source and target databases must be distinct')

    const fixture = createSyntheticResearchFixture()
    const email = `research-restore-${randomUUID()}@example.test`
    const [actor] = await source.db.insert(users).values({ email, password: await hash(userPassword, 4), role: 'ADMIN' }).returning({ id: users.id })
    invariant(actor, 'Synthetic administrator could not be created')
    const actorId = actor.id
    await source.db.update(researchRuntimeState).set({ featureEnabled: true, generationEnabled: true })

    const service = new ResearchStudioService({
      db: source.db,
      now: fixedNow,
      evidenceProvider: fixture.evidenceProvider,
      latestCompletedSession: fixture.latestCompletedSession,
      transport: fixture.transport,
      allowSyntheticEvidence: true,
      workerId: 'research-restore-source-worker',
    })
    const method = (await service.methods()).find(row => row.key === 'us-equity-swing-report' && row.status === 'COMPLETE')
    invariant(method, 'Migrated research method profile is unavailable')
    const instrument = (await service.instruments(BigInt(method.id))).find(row => row.symbol === 'SOXX')
    invariant(instrument, 'Migrated SOXX instrument profile is unavailable')

    const prepared = await service.prepare(actorId, {
      methodProfileId: method.id,
      instrumentProfileId: instrument.id,
      displayTimezone: 'America/New_York',
      asOf,
      synthetic: true,
    })
    const runId = BigInt(prepared.id)
    await service.generate(actorId, runId, { expectedVersion: prepared.version, idempotencyKey: 'restore-smoke-success-01' })
    await runResearchWorkerOnce(service)
    assert.equal(fixture.transportCalls, 1)
    const generated = await service.detail(actorId, runId)
    assert.equal(generated.executionStatus, 'DRAFT_READY')
    assert.equal(generated.dispatchStatus, 'SUCCEEDED')
    assert.equal(generated.revisions.length, 1)
    const generatedRevision = generated.revisions[0]!
    const { qa, ...draft } = generatedRevision.structured
    const reviewedContent = generatedRevision.content.replace('Synthetic section 2', 'Reviewed synthetic section 2')
    const reviewedDraft = { ...draft, title: 'Reviewed synthetic SOXX restore smoke' }
    const revision = await service.createRevision(actorId, runId, {
      expectedVersion: generated.version,
      expectedRevision: generatedRevision.revision,
      structured: reviewedDraft,
      content: reviewedContent,
      qa: reviewedSyntheticQa(qa),
    })
    const afterReview = await service.detail(actorId, runId)
    const approved = await service.approve(actorId, runId, {
      expectedVersion: afterReview.version,
      revision: revision.revision,
      bodyHash: revision.bodyHash,
    })
    const handoff = await service.handoff(actorId, runId, {
      expectedVersion: approved.version,
      revision: revision.revision,
      bodyHash: revision.bodyHash,
      access: 'MEMBER',
      category: 'technical',
      tags: ['synthetic', 'restore-smoke'],
    })
    assert.deepEqual({ created: handoff.created, status: handoff.status, access: handoff.access }, { created: true, status: 'DRAFT', access: 'MEMBER' })

    const unknownTransportCalls = { count: 0 }
    const unknownTransport: ResearchTransport = {
      async generate() {
        unknownTransportCalls.count += 1
        throw new ResearchTransportError('RESEARCH_PROVIDER_UNAVAILABLE', true)
      },
    }
    const unknownService = new ResearchStudioService({
      db: source.db,
      now: fixedNow,
      evidenceProvider: fixture.evidenceProvider,
      latestCompletedSession: fixture.latestCompletedSession,
      transport: unknownTransport,
      allowSyntheticEvidence: true,
      workerId: 'research-restore-unknown-worker',
    })
    const unknownPrepared = await unknownService.prepare(actorId, {
      methodProfileId: method.id,
      instrumentProfileId: instrument.id,
      asOf,
      synthetic: true,
    })
    const unknownRunId = BigInt(unknownPrepared.id)
    await unknownService.generate(actorId, unknownRunId, { expectedVersion: unknownPrepared.version, idempotencyKey: 'restore-smoke-unknown-01' })
    await runResearchWorkerOnce(unknownService)
    assert.equal(unknownTransportCalls.count, 1)
    const unknownDetail = await unknownService.detail(actorId, unknownRunId)
    assert.equal(unknownDetail.dispatchStatus, 'OUTCOME_UNKNOWN')
    assert.equal(unknownDetail.attempts[0]?.dispatchStatus, 'OUTCOME_UNKNOWN')
    const successAttempt = generated.attempts.find(attempt => attempt.dispatchStatus === 'SUCCEEDED')
    const unknownAttempt = unknownDetail.attempts.find(attempt => attempt.dispatchStatus === 'OUTCOME_UNKNOWN')
    invariant(successAttempt && unknownAttempt, 'Successful and unknown attempts were not both persisted')

    const ids = { actorId, runId, unknownRunId, successAttemptId: BigInt(successAttempt.id), unknownAttemptId: BigInt(unknownAttempt.id) }
    const expected = await captureResearchState(source.db, ids)
    assert.equal(expected.actor.id, String(actorId))
    assert.equal(expected.run.requesterId, expected.actor.id)
    assert.equal(expected.run.evidenceHash, expected.snapshot.contentHash)
    assert.equal(expected.snapshot.recomputedHash, expected.snapshot.contentHash)
    assert.equal(expected.snapshot.synthetic, true)
    assert.equal(expected.revision.recomputedTitleHash, expected.revision.titleHash)
    assert.equal(expected.revision.recomputedBodyHash, expected.revision.bodyHash)
    assert.equal(expected.revision.reviewStatus, 'APPROVED')
    assert.equal(expected.revision.approvedBySnapshot, expected.actor.id)
    assert.equal(expected.link.titleHash, expected.revision.titleHash)
    assert.equal(expected.link.bodyHash, expected.revision.bodyHash)
    assert.equal(expected.link.evidenceHash, expected.snapshot.contentHash)
    assert.equal(expected.post.id, expected.link.postId)
    assert.equal(expected.post.titleHash, expected.revision.titleHash)
    assert.equal(expected.post.bodyHash, expected.revision.bodyHash)
    assert.deepEqual({ status: expected.post.status, access: expected.post.access, publishedAt: expected.post.publishedAt }, { status: 'DRAFT', access: 'MEMBER', publishedAt: null })
    assert.equal(expected.successAttempt.dispatchStatus, 'SUCCEEDED')
    assert.equal(expected.unknownAttempt.dispatchStatus, 'OUTCOME_UNKNOWN')

    const restoredSentinelCalls = { count: 0 }
    const restoredSentinel: ResearchTransport = {
      async generate() {
        restoredSentinelCalls.count += 1
        throw new Error('A restored terminal attempt must never be resent')
      },
    }

    archiveDirectory = mkdtempSync(join(tmpdir(), 'diary-v3-research-restore-'))
    const archivePath = join(archiveDirectory, 'research-fixture.dump')
    const dump = docker(['exec', postgresContainer, 'pg_dump', '-U', postgresRole, '-d', sourceName, '--format=custom'])
    writeFileSync(archivePath, dump, { mode: 0o600, flag: 'wx' })
    const restoreInput = readFileSync(archivePath)
    docker(['exec', '-i', postgresContainer, 'pg_restore', '-U', postgresRole, '--no-owner', '--clean', '--if-exists', '--exit-on-error', `--dbname=${targetName}`], restoreInput)

    const restored = await captureResearchState(target.db, ids)
    assert.deepEqual(restored, expected)
    const restoredService = new ResearchStudioService({
      db: target.db,
      now: fixedNow,
      evidenceProvider: fixture.evidenceProvider,
      latestCompletedSession: fixture.latestCompletedSession,
      transport: restoredSentinel,
      allowSyntheticEvidence: true,
      workerId: 'research-restore-recovery-worker',
    })
    const recovery = await runResearchWorkerOnce(restoredService)
    assert.equal(recovery, null)
    assert.equal(restoredSentinelCalls.count, 0)
    const recoveredUnknown = await captureResearchState(target.db, ids)
    assert.deepEqual(recoveredUnknown, expected)

    restoredApp = await startApp(target.db, fixture, restoredSentinel)
    const browser = new BrowserSession(restoredApp.baseUrl)
    const login = await browser.post('/api/auth/login', { email, password: userPassword })
    assert.equal(login.status, 200)
    const me = await browser.request('/api/auth/me')
    assert.equal(me.status, 200)
    const publish = await browser.post(`/api/blog/admin/${expected.post.id}/publish`, {})
    const publishBody = await publish.json() as Record<string, unknown>
    const publishError = publishBody.data && typeof publishBody.data === 'object' && !Array.isArray(publishBody.data)
      ? publishBody.data as Record<string, unknown>
      : undefined
    const publishCode = typeof publishError?.code === 'string' ? publishError.code : undefined
    assert.equal(publish.status, 409, `Expected the restored admin publish guard; received ${publish.status} ${publishCode ?? 'unknown error'}`)
    assert.equal(publishCode, 'RESEARCH_ARTICLE_PROVENANCE', `Expected provenance denial, received status ${publish.status} with keys ${Object.keys(publishBody).join(',')} and error keys ${Object.keys(publishError ?? {}).join(',')}`)
    const afterPublishAttempt = await captureResearchState(target.db, ids)
    assert.deepEqual(afterPublishAttempt, expected)
    await restoredApp.close()
    restoredApp = undefined

    sanitizedSummary = {
      check: 'research-physical-restore-smoke',
      result: 'PASS',
      sourceAndTarget: 'fresh disposable local PostgreSQL databases',
      dumpFormat: 'pg_dump custom archive / pg_restore clean into empty owned target',
      preserved: {
        actorId: expected.actor.id,
        runId: expected.run.id,
        evidenceSnapshotId: expected.snapshot.id,
        evidenceHash: expected.snapshot.contentHash,
        revisionId: expected.revision.id,
        revision: expected.revision.revision,
        titleHash: expected.revision.titleHash,
        bodyHash: expected.revision.bodyHash,
        approverId: expected.revision.approvedBySnapshot,
        postId: expected.post.id,
        successAttemptId: expected.successAttempt.id,
        unknownAttemptId: expected.unknownAttempt.id,
        unknownBudget: expected.budget,
      },
      recomputedHashes: { evidence: true, title: true, body: true, linkedPost: true },
      recoveredUnknownAttempt: { terminalStatus: expected.unknownAttempt.dispatchStatus, transportCallsAfterRestore: restoredSentinelCalls.count },
      publishAttempt: { status: publish.status, code: publishCode, postAfterAttempt: `${afterPublishAttempt.post.status}/${afterPublishAttempt.post.access}` },
      databasesDisposed: true,
      retainedData: 'only this sanitized summary; no report body, credentials, URLs, or dump archive',
    }
  } finally {
    await restoredApp?.close().catch(() => undefined)
    if (archiveDirectory) rmSync(archiveDirectory, { recursive: true, force: true })
    await target?.dispose()
    await source?.dispose()
    if (hadDatabaseUrl) process.env.DATABASE_URL = originalDatabaseUrl
    else delete process.env.DATABASE_URL
  }
  if (!sanitizedSummary) throw new Error('Restore smoke ended without a verified result summary')
  process.stdout.write(`${JSON.stringify(sanitizedSummary)}\n`)
}

main().catch(error => {
  const message = error instanceof Error ? error.message : 'Unknown restore smoke failure'
  process.stderr.write(`research restore smoke failed: ${message}\n`)
  process.exitCode = 1
})
