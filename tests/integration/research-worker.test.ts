import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { researchAttempts, researchBudgetSessions, researchEvidenceSnapshots, researchMethodProfiles, researchInstrumentProfiles, researchProviderConfigs, researchRevisions, researchRuns, researchRuntimeState, users } from '@diary/db'
import { createResearchStudioService, runResearchOnce, type ResearchEvidenceProvider, type ResearchTransport, type ResearchTransportResponse } from '../../apps/api/src/research-studio/service.js'
import { provisionTestDatabase } from '../support/database.js'

const baseNow = new Date('2026-09-25T12:00:00.000Z')

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise })
  return { promise, resolve, reject }
}

function draftPayload() {
  const claims = Array.from({ length: 10 }, (_, index) => ({
    claimId: `SYNTHETIC_SECTION_${String(index + 1).padStart(2, '0')}`,
    section: index + 1,
    text: `Offline synthetic test content for section ${index + 1}.`,
    type: 'inference' as const,
    sourceIds: [],
    metricPaths: index === 0 ? ['series.ema10[399]'] : [],
    zoneIds: [],
    planIds: [],
    status: 'LIMITED' as const,
  }))
  return {
    schemaVersion: 'research-draft-v1',
    title: 'Synthetic worker acceptance fixture',
    sections: Array.from({ length: 10 }, (_, index) => ({
      section: index + 1,
      title: `Synthetic section ${index + 1}`,
      content: `Offline fixture content for section ${index + 1}; no current market assertion.`,
      claimIds: [claims[index]!.claimId],
    })),
    claims,
    finalAnswers: Array.from({ length: 8 }, (_, index) => ({
      question: `Synthetic question ${index + 1}`,
      answer: 'Offline fixture answer.',
      claimIds: [claims[index]!.claimId],
    })),
    limitations: ['Synthetic fixture only; never publish.'],
  }
}

const syntheticEvidence: ResearchEvidenceProvider = async ({ asOf, displayTimezone }) => ({
  manifest: {
    referenceSession: null,
    asOf: asOf.toISOString(),
    displayTimezone,
    exchangeTimezone: 'America/New_York',
    calendarVersion: 'synthetic-fixture-calendar',
    normalizationVersion: 'synthetic-fixture-v1',
    targetSessions: 0,
    rowCount: 0,
    completeOhlcRows: 0,
    closeRows: 0,
    volumeRows: 0,
    missingSessions: [],
    warnings: ['Synthetic worker fixture; never publish.'],
    sourceIds: [],
    synthetic: true,
  },
  bars: [],
  sources: [],
  metrics: {
    latest: { close: 399, ema10: 399 },
    series: { ema10: Array.from({ length: 400 }, (_, index) => index) },
    completedWeeks: Array.from({ length: 80 }, (_, index) => ({ week: `2025-W${index + 1}`, close: index + 1, isWeekFinal: true })),
    relativeStrength: [],
    directionScore: { score: null, proof: [] },
    pivots: [],
    gaps: [],
    levels: [],
  },
  candidates: {
    search: {
      status: 'READY',
      discoveryOnly: true,
      query: 'synthetic fixture lead',
      results: [{ title: 'Synthetic discovery lead', url: 'https://fixture.example.invalid/lead', snippet: 'DO_NOT_SEND_DISCOVERY_SNIPPET_TO_MODEL', score: null, publishedDate: null }],
      retrievedAt: asOf.toISOString(),
      usage: { calls: 0, returnedResults: 1, billedCredits: null },
    },
  },
  qa: Array.from({ length: 10 }, (_, index) => ({
    gateId: `G${String(index + 1).padStart(2, '0')}`,
    severity: 'CORE' as const,
    status: 'NOT_CHECKED' as const,
    evidence: [],
    reason: 'Synthetic worker fixture; publication review is not performed.',
    remediation: 'Use real, authorized evidence and conduct human review.',
    reviewerId: null,
    reviewedAt: null,
  })),
})

const response: ResearchTransportResponse = {
  content: JSON.stringify(draftPayload()),
  model: 'openrouter/free',
  requestId: 'synthetic-worker-response',
  inputTokens: 240,
  outputTokens: 160,
  reasoningTokens: 0,
  reportedCostUsd: '0',
}

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let actorId: bigint
let methodProfileId: bigint
let instrumentProfileId: bigint
let clock: Date
let service: ReturnType<typeof createResearchStudioService>
let workerPayloads: string[]

beforeEach(async () => {
  database = await provisionTestDatabase('research_worker')
  clock = baseNow
  workerPayloads = []
  const [actor] = await database.db.insert(users).values({ email: `research-worker-${randomUUID()}@example.test`, password: 'synthetic-only', role: 'ADMIN', timezone: 'Asia/Taipei' }).returning({ id: users.id })
  actorId = actor!.id
  const [method] = await database.db.select().from(researchMethodProfiles).where(eq(researchMethodProfiles.methodKey, 'us-equity-swing-report')).limit(1)
  const [instrument] = await database.db.select().from(researchInstrumentProfiles).where(eq(researchInstrumentProfiles.symbol, 'SOXX')).limit(1)
  methodProfileId = method!.id
  instrumentProfileId = instrument!.id
  service = createResearchStudioService({
    db: database.db,
    now: () => clock,
    evidenceProvider: syntheticEvidence,
    transport: { async generate(request) { workerPayloads.push(request.payload); return response } },
    allowSyntheticEvidence: true,
    workerId: 'synthetic-research-worker-a',
  })
  await service.updateRuntime({ expectedRevision: 1, featureEnabled: true, generationEnabled: true }, actorId)
})

afterEach(async () => { await database?.dispose() })

async function enqueueRun(transport?: ResearchTransport) {
  const run = await service.prepare(actorId, {
    methodProfileId: String(methodProfileId),
    instrumentProfileId: String(instrumentProfileId),
    synthetic: true,
    asOf: baseNow.toISOString(),
  })
  if (transport) service = createResearchStudioService({
    db: database.db,
    now: () => clock,
    evidenceProvider: syntheticEvidence,
    transport,
    allowSyntheticEvidence: true,
    workerId: `synthetic-research-worker-${randomUUID()}`,
  })
  const result = await service.generate(actorId, BigInt(run.id), { expectedVersion: run.version, idempotencyKey: `synthetic-${randomUUID()}` })
  return { runId: BigInt(run.id), version: result.run.version }
}

describe('Research Studio worker with disposable PostgreSQL', () => {
  it('settles a successful dispatch and its first immutable revision in one completion', async () => {
    const queued = await enqueueRun()
    const generated = await runResearchOnce(service)

    expect(generated).toMatchObject({ id: String(queued.runId), executionStatus: 'DRAFT_READY', dispatchStatus: 'SUCCEEDED', currentRevision: 1 })
    const attempts = await database.db.select().from(researchAttempts).where(eq(researchAttempts.runId, queued.runId))
    const revisions = await database.db.select().from(researchRevisions).where(eq(researchRevisions.runId, queued.runId))
    expect(attempts).toHaveLength(1)
    expect(attempts[0]).toMatchObject({ dispatchStatus: 'SUCCEEDED', inputTokens: 240, outputTokens: 160, reportedCostUsd: '0.000000000' })
    expect(revisions).toHaveLength(1)
    expect(revisions[0]).toMatchObject({ revision: 1, reviewStatus: 'DRAFT' })
    expect(workerPayloads).toHaveLength(1)
    expect(Math.ceil(workerPayloads[0]!.length / 2)).toBeLessThanOrEqual(64_000)
    expect(workerPayloads[0]).not.toContain('DO_NOT_SEND_DISCOVERY_SNIPPET_TO_MODEL')
    const promptEvidence = JSON.parse(workerPayloads[0]!).untrustedEvidenceSnapshot
    expect(promptEvidence).not.toHaveProperty('bars')
    expect(promptEvidence.metrics.completedWeeks).not.toHaveProperty('0')
    expect(promptEvidence.metrics.completedWeekCount).toBe(80)
    expect(promptEvidence.metrics.completedWeeks['79']).toMatchObject({ close: 80 })
    expect(promptEvidence.metrics.writerProjection).toMatchObject({ version: 'research-writer-metrics-v1', dailySeriesWindow: 21, sourceSeriesLength: 400 })
    expect(promptEvidence.metrics.series.ema10).toMatchObject({ '379': 379, '399': 399 })
    expect(promptEvidence.metrics.series.ema10).not.toHaveProperty('378')
    const [runtime] = await database.db.select().from(researchRuntimeState).where(eq(researchRuntimeState.singleton, 'default'))
    expect(runtime).toMatchObject({ activeAttemptId: null, activeLeaseToken: null, activeLeaseExpiresAt: null })
  })

  it('serializes concurrent idempotent submissions into one attempt', async () => {
    const run = await service.prepare(actorId, { methodProfileId: String(methodProfileId), instrumentProfileId: String(instrumentProfileId), synthetic: true, asOf: baseNow.toISOString() })
    const input = { expectedVersion: run.version, idempotencyKey: 'synthetic-idempotent-submit-01' }
    const submitted = await Promise.all(Array.from({ length: 8 }, () => service.generate(actorId, BigInt(run.id), input)))

    expect(submitted.filter(item => !item.reused)).toHaveLength(1)
    expect(new Set(submitted.map(item => item.attempt.id)).size).toBe(1)
    expect(await database.db.select().from(researchAttempts).where(eq(researchAttempts.runId, BigInt(run.id)))).toHaveLength(1)
  })

  it('keeps one global SENT lease while the provider is pending, then processes the next run', async () => {
    const first = await enqueueRun()
    const second = await enqueueRun()
    const entered = deferred<void>()
    const release = deferred<ResearchTransportResponse>()
    let calls = 0
    const barrierTransport: ResearchTransport = {
      async generate() {
        calls += 1
        if (calls === 1) { entered.resolve(); return release.promise }
        return response
      },
    }
    const firstWorker = createResearchStudioService({ db: database.db, now: () => clock, transport: barrierTransport, allowSyntheticEvidence: true, workerId: 'synthetic-worker-one' })
    const secondWorker = createResearchStudioService({ db: database.db, now: () => clock, transport: barrierTransport, allowSyntheticEvidence: true, workerId: 'synthetic-worker-two' })
    const firstDispatch = firstWorker.runOnce()
    await entered.promise

    expect(await secondWorker.runOnce()).toBeNull()
    expect(calls).toBe(1)
    release.resolve(response)
    await firstDispatch
    const secondResult = await secondWorker.runOnce()

    expect(secondResult).toMatchObject({ id: String(second.runId), dispatchStatus: 'SUCCEEDED', currentRevision: 1 })
    expect((await firstWorker.detail(actorId, first.runId)).dispatchStatus).toBe('SUCCEEDED')
    expect(calls).toBe(2)
  })

  it('keeps a sent cancellation fenced until provider completion and creates no revision', async () => {
    const first = await enqueueRun()
    const second = await enqueueRun()
    const entered = deferred<void>()
    const release = deferred<ResearchTransportResponse>()
    let calls = 0
    const barrierTransport: ResearchTransport = {
      async generate() { calls += 1; entered.resolve(); return release.promise },
    }
    const worker = createResearchStudioService({ db: database.db, now: () => clock, transport: barrierTransport, allowSyntheticEvidence: true, workerId: 'synthetic-cancel-worker' })
    const pending = worker.runOnce()
    await entered.promise

    const cancelled = await worker.cancel(actorId, first.runId)
    expect(cancelled).toMatchObject({ executionStatus: 'CANCELLED', dispatchStatus: 'SENT', currentRevision: 0 })
    await expect(worker.generate(actorId, first.runId, { expectedVersion: cancelled.version, idempotencyKey: 'synthetic-cancel-resend-before-settle' })).rejects.toMatchObject({ code: 'RESEARCH_IDEMPOTENCY_CONFLICT' })
    expect(await worker.runOnce()).toBeNull()
    expect(calls).toBe(1)
    release.resolve(response)
    await pending

    const firstRun = await worker.detail(actorId, first.runId)
    expect(firstRun).toMatchObject({ executionStatus: 'CANCELLED', currentRevision: 0 })
    await expect(worker.generate(actorId, first.runId, { expectedVersion: firstRun.version, idempotencyKey: 'synthetic-cancel-resend-after-settle' })).rejects.toMatchObject({ code: 'RESEARCH_IDEMPOTENCY_CONFLICT' })
    expect(firstRun.attempts).toHaveLength(1)
    expect(firstRun.revisions).toHaveLength(0)
    expect(firstRun.attempts[0]).toMatchObject({ dispatchStatus: 'SUCCEEDED' })
    expect(await database.db.select().from(researchRevisions).where(eq(researchRevisions.runId, first.runId))).toHaveLength(0)
    expect((await worker.runOnce())?.id).toBe(String(second.runId))
  })

  it('expires a fixed lease as unknown and ignores a fenced late success without double settlement', async () => {
    const first = await enqueueRun()
    const second = await enqueueRun()
    const entered = deferred<void>()
    const releaseLate = deferred<ResearchTransportResponse>()
    let calls = 0
    const transport: ResearchTransport = {
      async generate() {
        calls += 1
        if (calls === 1) { entered.resolve(); return releaseLate.promise }
        return response
      },
    }
    const workerOne = createResearchStudioService({ db: database.db, now: () => clock, transport, allowSyntheticEvidence: true, workerId: 'synthetic-expiry-one' })
    const workerTwo = createResearchStudioService({ db: database.db, now: () => clock, transport, allowSyntheticEvidence: true, workerId: 'synthetic-expiry-two' })
    const lateDispatch = workerOne.runOnce()
    await entered.promise
    clock = new Date(baseNow.getTime() + 45_001)

    const secondResult = await workerTwo.runOnce()
    expect(secondResult).toMatchObject({ id: String(second.runId), dispatchStatus: 'SUCCEEDED', currentRevision: 1 })
    const firstExpired = await workerTwo.detail(actorId, first.runId)
    expect(firstExpired).toMatchObject({ dispatchStatus: 'OUTCOME_UNKNOWN', currentRevision: 0 })
    expect(firstExpired.attempts[0]).toMatchObject({ dispatchStatus: 'OUTCOME_UNKNOWN', diagnostics: 'RESEARCH_DISPATCH_EXPIRED' })

    releaseLate.resolve(response)
    await lateDispatch
    expect((await workerOne.detail(actorId, first.runId)).revisions).toHaveLength(0)
    expect(await database.db.select().from(researchRevisions).where(eq(researchRevisions.runId, first.runId))).toHaveLength(0)
    expect(calls).toBe(2)
  })

  it('settles a malformed completed response once and preserves absent usage as null', async () => {
    await enqueueRun({ async generate() { return { content: 'not valid JSON', model: null, requestId: null, inputTokens: null, outputTokens: null, reasoningTokens: null, reportedCostUsd: null } } })
    const result = await runResearchOnce(service)

    expect(result).toMatchObject({ executionStatus: 'FAILED', dispatchStatus: 'FAILED', currentRevision: 0 })
    const [attempt] = await database.db.select().from(researchAttempts)
    expect(attempt).toMatchObject({ dispatchStatus: 'FAILED', inputTokens: null, outputTokens: null, reasoningTokens: null, reportedCostUsd: null, diagnostics: 'RESEARCH_OUTPUT_INVALID' })
    expect(await database.db.select().from(researchRevisions)).toHaveLength(0)
  })

  it('keeps a missing durable budget fail closed rather than recreating a live quota', async () => {
    const run = await service.prepare(actorId, { methodProfileId: String(methodProfileId), instrumentProfileId: String(instrumentProfileId), synthetic: true, asOf: baseNow.toISOString() })
    await database.db.delete(researchBudgetSessions)
    await expect(service.settings()).resolves.toMatchObject({ runtime: { budget: { limit: 0, consumed: 0, unknown: 0 } } })
    await expect(service.generate(actorId, BigInt(run.id), { expectedVersion: run.version, idempotencyKey: 'synthetic-missing-budget' })).rejects.toMatchObject({ code: 'RESEARCH_BUDGET_EXCEEDED' })
  })

  it.each([
    ['requester role revoked', 'role'],
    ['feature kill switch disabled', 'feature-off'],
    ['generation kill switch disabled', 'generation-off'],
    ['runtime settings changed and restored', 'runtime-revision'],
    ['provider revision superseded', 'provider-revision'],
    ['evidence snapshot changed after admission', 'evidence-tampered'],
  ] as const)('blocks dispatch after %s and records a bounded diagnostic', async (_label, mutation) => {
    if (mutation === 'provider-revision') {
      await database.db.insert(researchProviderConfigs).values({
        revision: 1,
        status: 'ACTIVE',
        provider: 'openrouter',
        protocol: 'chat_completions',
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'openrouter/free',
        createdBy: actorId,
        createdAt: clock,
        updatedAt: clock,
      })
    }
    let calls = 0
    const queued = await enqueueRun({ async generate() { calls += 1; return response } })

    if (mutation === 'role') {
      await database.db.update(users).set({ role: 'USER' }).where(eq(users.id, actorId))
    } else if (mutation === 'feature-off' || mutation === 'generation-off') {
      const runtime = (await service.settings()).runtime
      await service.updateRuntime({
        expectedRevision: runtime.revision,
        ...(mutation === 'feature-off' ? { featureEnabled: false } : { generationEnabled: false }),
      }, actorId)
    } else if (mutation === 'runtime-revision') {
      let runtime = (await service.settings()).runtime
      runtime = await service.updateRuntime({ expectedRevision: runtime.revision, generationEnabled: false }, actorId)
      await service.updateRuntime({ expectedRevision: runtime.revision, generationEnabled: true }, actorId)
    } else if (mutation === 'provider-revision') {
      await database.db.update(researchProviderConfigs).set({ status: 'RETIRED' }).where(eq(researchProviderConfigs.revision, 1))
      await database.db.insert(researchProviderConfigs).values({
        revision: 2,
        status: 'ACTIVE',
        provider: 'openrouter',
        protocol: 'chat_completions',
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'openrouter/free',
        createdBy: actorId,
        createdAt: clock,
        updatedAt: clock,
      })
    } else {
      const [snapshot] = await database.db.select().from(researchEvidenceSnapshots).where(eq(researchEvidenceSnapshots.runId, queued.runId))
      await database.db.update(researchEvidenceSnapshots).set({ metricsJson: '{"tampered":true}' }).where(eq(researchEvidenceSnapshots.id, snapshot!.id))
    }

    await runResearchOnce(service)

    expect(calls).toBe(0)
    const [run] = await database.db.select().from(researchRuns).where(eq(researchRuns.id, queued.runId))
    const attempts = await database.db.select().from(researchAttempts).where(eq(researchAttempts.runId, queued.runId))
    expect(run?.dispatchStatus).toBe('FAILED')
    expect(await database.db.select().from(researchRevisions).where(eq(researchRevisions.runId, queued.runId))).toHaveLength(0)
    expect(attempts[0]).toMatchObject({ dispatchStatus: 'FAILED' })
    expect([
      'RESEARCH_DISPATCH_NOT_AUTHORIZED', 'RESEARCH_DISABLED', 'RESEARCH_GENERATION_DISABLED',
      'RESEARCH_REVISION_CONFLICT', 'RESEARCH_PROVIDER_NOT_CONFIGURED', 'RESEARCH_EVIDENCE_INVALID',
    ]).toContain(attempts[0]!.diagnostics)
  })

  it('preserves terminal unknown status after cancellation and refuses a fresh generation key', async () => {
    let calls = 0
    const queued = await enqueueRun({ async generate() { calls += 1; throw new Error('Synthetic ambiguous transport outcome') } })
    await service.runOnce()
    const unknown = await service.detail(actorId, queued.runId)
    expect(unknown.dispatchStatus).toBe('OUTCOME_UNKNOWN')
    const cancelled = await service.cancel(actorId, queued.runId)
    expect(cancelled).toMatchObject({ dispatchStatus: 'OUTCOME_UNKNOWN', version: unknown.version })
    await expect(service.generate(actorId, queued.runId, { expectedVersion: cancelled.version, idempotencyKey: 'synthetic-unknown-new-key' })).rejects.toMatchObject({ code: 'RESEARCH_OUTCOME_UNKNOWN' })
    expect(await service.runOnce()).toBeNull()
    expect(calls).toBe(1)
    expect(cancelled.attempts).toHaveLength(1)
    expect(cancelled.revisions).toHaveLength(0)
  })

})
