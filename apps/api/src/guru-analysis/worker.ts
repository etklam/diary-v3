import { randomUUID } from 'node:crypto'
import { and, asc, eq, gt, isNull, lt } from 'drizzle-orm'
import {
  aiProviderConfigVersions,
  aiReportAttempts,
  aiRuntimeState,
  guruAnalysisRuns,
  gurus,
  sharedPromptVersions,
  type Database,
} from '@diary/db'
import type { GuruAnalysisContext } from '@diary/domain/guru-analysis'
import { generateAiAnalysis } from '../ai-reports/deepseek-provider.js'
import { AiProviderError, type AiTransport } from '../ai-reports/outbound-policy.js'
import { decryptAiSecret } from '../ai-reports/secrets.js'
import { countActiveCallSlots, lockAiGlobal, reapExpiredCallSlots, releaseAiCallSlot } from '../ai-reports/job-store.js'
import { consumeGlobalAiBudget, releaseGlobalAiBudget, settleGlobalAiBudget } from '../ai-reports/budget.js'
import { buildGuruAnalysisInput } from './context.js'
import { buildGuruAnalysisMessages, defaultGuruAnalysisTemplate, validateGuruAnalysisOutput } from './prompt.js'
import { GuruAnalysisError, type GuruAnalysisRun } from './service.js'

export const GURU_ANALYSIS_LEASE_MS = 180_000

export interface GuruAnalysisWorkerOptions {
  db: Database
  workerId?: string
  now?: () => Date
  transport?: AiTransport
  leaseMs?: number
  signal?: AbortSignal
}

export type GuruAnalysisWorkerResult =
  | { status: 'idle' }
  | { status: 'succeeded'; runId: bigint }
  | { status: 'failed'; runId: bigint; errorCode: string }

export function safeGuruAnalysisErrorCode(error: unknown): string {
  if (error instanceof AiProviderError) return error.code
  if (error instanceof GuruAnalysisError) return error.code
  if (error instanceof Error && /^(?:AI|GURU)_[A-Z0-9_]+$/.test(error.message)) return error.message
  return 'AI_PROVIDER_UNAVAILABLE'
}

function estimatedCostCents(config: typeof aiProviderConfigVersions.$inferSelect, usage: { inputTokens?: number | null; outputTokens?: number | null } | null): number | null {
  if (!usage || config.inputPricePerMillionCents === null || config.outputPricePerMillionCents === null || usage.inputTokens == null || usage.outputTokens == null) return null
  return Math.ceil(usage.inputTokens * config.inputPricePerMillionCents / 1_000_000) + Math.ceil(usage.outputTokens * config.outputPricePerMillionCents / 1_000_000)
}

/** Claim one queued run. Expired leases are reconciled before admission, exactly once. */
export async function claimNextGuruAnalysisRun(db: Database, workerId: string, now: Date, leaseMs = GURU_ANALYSIS_LEASE_MS) {
  return db.transaction(async tx => {
    await lockAiGlobal(tx)
    await reapExpiredCallSlots(tx, now)
    const expired = await tx.select().from(guruAnalysisRuns).where(and(
      eq(guruAnalysisRuns.status, 'running'), lt(guruAnalysisRuns.leaseExpiresAt, now),
    )).orderBy(asc(guruAnalysisRuns.id)).for('update')
    for (const run of expired) {
      if (run.dispatchedAt === null) {
        await tx.update(guruAnalysisRuns).set({ status: 'queued', leaseToken: null, leaseExpiresAt: null, workerId: null, heartbeatAt: null, startedAt: null, updatedAt: now })
          .where(and(eq(guruAnalysisRuns.id, run.id), eq(guruAnalysisRuns.status, 'running')))
        continue
      }
      // A dispatched provider call with an unknown outcome is terminal. It is
      // never retried implicitly; an admin must request regeneration.
      const [failed] = await tx.update(guruAnalysisRuns).set({
        status: 'failed', errorCode: 'AI_PROVIDER_OUTCOME_UNKNOWN', finishedAt: now, leaseToken: null, leaseExpiresAt: null, updatedAt: now,
      }).where(and(eq(guruAnalysisRuns.id, run.id), eq(guruAnalysisRuns.status, 'running'))).returning({ id: guruAnalysisRuns.id })
      if (failed && run.reservationCostCents > 0) {
        await settleGlobalAiBudget(tx, { month: run.reservationBucketMonth, reservationCostCents: run.reservationCostCents, actualCostCents: null, inputTokens: null, outputTokens: null })
      }
    }
    if (await countActiveCallSlots(tx) >= 2) return null
    const [candidate] = await tx.select().from(guruAnalysisRuns).where(eq(guruAnalysisRuns.status, 'queued'))
      .orderBy(asc(guruAnalysisRuns.queuedAt), asc(guruAnalysisRuns.id)).limit(1).for('update')
    if (!candidate) return null
    const [claimed] = await tx.update(guruAnalysisRuns).set({
      status: 'running', workerId, leaseToken: randomUUID(), leaseExpiresAt: new Date(now.getTime() + leaseMs),
      heartbeatAt: now, startedAt: now, updatedAt: now,
    }).where(and(eq(guruAnalysisRuns.id, candidate.id), eq(guruAnalysisRuns.status, 'queued'))).returning()
    return claimed ?? null
  })
}

export async function heartbeatGuruAnalysisRun(db: Database, input: { runId: bigint; leaseToken: string; now: Date; leaseMs?: number }) {
  const [row] = await db.update(guruAnalysisRuns).set({ heartbeatAt: input.now, leaseExpiresAt: new Date(input.now.getTime() + (input.leaseMs ?? GURU_ANALYSIS_LEASE_MS)), updatedAt: input.now })
    .where(and(
      eq(guruAnalysisRuns.id, input.runId), eq(guruAnalysisRuns.status, 'running'),
      eq(guruAnalysisRuns.leaseToken, input.leaseToken), gt(guruAnalysisRuns.leaseExpiresAt, input.now),
    )).returning({ id: guruAnalysisRuns.id })
  return Boolean(row)
}

export async function requeueGuruAnalysisRun(db: Database, input: { runId: bigint; leaseToken: string; now: Date }) {
  const [row] = await db.update(guruAnalysisRuns).set({ status: 'queued', leaseToken: null, leaseExpiresAt: null, workerId: null, heartbeatAt: null, startedAt: null, updatedAt: input.now })
    .where(and(
      eq(guruAnalysisRuns.id, input.runId), eq(guruAnalysisRuns.status, 'running'),
      eq(guruAnalysisRuns.leaseToken, input.leaseToken), isNull(guruAnalysisRuns.dispatchedAt),
    )).returning({ id: guruAnalysisRuns.id })
  return Boolean(row)
}

export async function admitGuruAnalysisDispatch(db: Database, input: { run: GuruAnalysisRun; leaseToken: string; now: Date }) {
  return db.transaction(async tx => {
    await lockAiGlobal(tx)
    await reapExpiredCallSlots(tx, input.now)
    if (await countActiveCallSlots(tx) >= 2) return 'capacity' as const
    const [runtime] = await tx.select().from(aiRuntimeState).where(eq(aiRuntimeState.singleton, 'default')).limit(1).for('update')
    if (!runtime?.generationEnabled || runtime.activeProviderConfigId !== input.run.providerConfigVersionId) return false
    const [provider] = await tx.select().from(aiProviderConfigVersions).where(and(
      eq(aiProviderConfigVersions.id, input.run.providerConfigVersionId!), eq(aiProviderConfigVersions.status, 'published'),
    )).limit(1)
    if (!provider) return false
    const [dispatched] = await tx.update(guruAnalysisRuns).set({ dispatchedAt: input.now, updatedAt: input.now }).where(and(
      eq(guruAnalysisRuns.id, input.run.id), eq(guruAnalysisRuns.status, 'running'),
      eq(guruAnalysisRuns.leaseToken, input.leaseToken), isNull(guruAnalysisRuns.dispatchedAt),
    )).returning({ id: guruAnalysisRuns.id })
    if (!dispatched) return false
    const [attempt] = await tx.insert(aiReportAttempts).values({
      reportId: null, userId: input.run.requestedByUserId, status: 'dispatched', dispatchedAt: input.now,
      slotExpiresAt: new Date(input.now.getTime() + provider.timeoutMs + 5_000),
      reservationBucketMonth: input.run.reservationBucketMonth, reservationCostCents: input.run.reservationCostCents,
      providerConfigVersionId: provider.id, model: provider.model, pricingVersion: provider.pricingVersion,
      pricingCurrency: provider.pricingCurrency, reservedAt: input.now,
    }).returning({ id: aiReportAttempts.id })
    if (!attempt) throw new Error('AI_ATTEMPT_NOT_RECORDED')
    await tx.update(guruAnalysisRuns).set({ attemptId: attempt.id, updatedAt: input.now }).where(eq(guruAnalysisRuns.id, input.run.id))
    if (input.run.reservationCostCents > 0) await consumeGlobalAiBudget(tx, { month: input.run.reservationBucketMonth, reservationCostCents: input.run.reservationCostCents })
    return { attemptId: attempt.id, provider }
  })
}

export async function completeGuruAnalysisRun(db: Database, input: {
  run: GuruAnalysisRun
  leaseToken: string
  now: Date
  result: Record<string, unknown>
  usage: { inputTokens?: number | null; outputTokens?: number | null; estimatedCostCents?: number | null; requestId?: string | null; latencyMs?: number | null }
}) {
  return db.transaction(async tx => {
    await lockAiGlobal(tx)
    const [attempt] = await tx.update(aiReportAttempts).set({
      status: 'succeeded', providerRequestId: input.usage.requestId ?? null, inputTokens: input.usage.inputTokens ?? null,
      outputTokens: input.usage.outputTokens ?? null, estimatedCostCents: input.usage.estimatedCostCents ?? null,
      latencyMs: input.usage.latencyMs ?? null, finishedAt: input.now, slotReleasedAt: input.now,
    }).where(and(eq(aiReportAttempts.id, input.run.attemptId!), eq(aiReportAttempts.status, 'dispatched'))).returning({ id: aiReportAttempts.id })
    if (!attempt) return false
    const [row] = await tx.update(guruAnalysisRuns).set({
      status: 'succeeded', result: input.result, errorCode: null, finishedAt: input.now, heartbeatAt: input.now,
      leaseToken: null, leaseExpiresAt: null, inputTokens: input.usage.inputTokens ?? null, outputTokens: input.usage.outputTokens ?? null,
      estimatedCostCents: input.usage.estimatedCostCents ?? null, latencyMs: input.usage.latencyMs ?? null,
      providerRequestId: input.usage.requestId ?? null, updatedAt: input.now,
    }).where(and(
      eq(guruAnalysisRuns.id, input.run.id), eq(guruAnalysisRuns.status, 'running'), eq(guruAnalysisRuns.leaseToken, input.leaseToken),
    )).returning({ id: guruAnalysisRuns.id })
    if (!row) return false
    if (input.run.reservationCostCents > 0) {
      await settleGlobalAiBudget(tx, {
        month: input.run.reservationBucketMonth, reservationCostCents: input.run.reservationCostCents,
        actualCostCents: input.usage.estimatedCostCents ?? null, inputTokens: input.usage.inputTokens ?? null, outputTokens: input.usage.outputTokens ?? null,
      })
    }
    return true
  })
}

export async function failGuruAnalysisRun(db: Database, input: { run: GuruAnalysisRun; leaseToken: string; now: Date; errorCode: string }) {
  return db.transaction(async tx => {
    await lockAiGlobal(tx)
    const [current] = await tx.select().from(guruAnalysisRuns).where(eq(guruAnalysisRuns.id, input.run.id)).limit(1).for('update')
    if (!current || current.status !== 'running' || current.leaseToken !== input.leaseToken) return false
    if (current.dispatchedAt !== null && current.attemptId !== null) {
      await tx.update(aiReportAttempts).set({
        status: input.errorCode === 'AI_PROVIDER_OUTCOME_UNKNOWN' ? 'unknown' : 'failed',
        errorCode: input.errorCode.slice(0, 80), finishedAt: input.now, slotReleasedAt: input.now,
      }).where(and(eq(aiReportAttempts.id, current.attemptId), eq(aiReportAttempts.status, 'dispatched')))
    }
    const [row] = await tx.update(guruAnalysisRuns).set({
      status: 'failed', errorCode: input.errorCode.slice(0, 80), finishedAt: input.now, leaseToken: null, leaseExpiresAt: null, updatedAt: input.now,
    }).where(and(eq(guruAnalysisRuns.id, input.run.id), eq(guruAnalysisRuns.status, 'running'))).returning({ id: guruAnalysisRuns.id })
    if (!row) return false
    if (current.reservationCostCents > 0) {
      if (current.dispatchedAt === null) await releaseGlobalAiBudget(tx, { month: current.reservationBucketMonth, reservationCostCents: current.reservationCostCents })
      else await settleGlobalAiBudget(tx, { month: current.reservationBucketMonth, reservationCostCents: current.reservationCostCents, actualCostCents: null, inputTokens: null, outputTokens: null })
    }
    return true
  })
}

/** Confirm the prepared input a queued run captured is still the published one. */
async function assertRunStillCurrent(db: Database, run: GuruAnalysisRun) {
  const [guru] = await db.select().from(gurus).where(eq(gurus.managerId, run.managerId)).limit(1)
  if (!guru || !guru.active) throw new GuruAnalysisError('GURU_NOT_FOUND', 404)
  const [fresh] = await db.select({ sourceState: guruAnalysisRuns.sourceState }).from(guruAnalysisRuns).where(eq(guruAnalysisRuns.id, run.id)).limit(1)
  if (fresh?.sourceState !== 'current') throw new GuruAnalysisError('AI_SOURCE_INVALIDATED', 409)
  const built = await buildGuruAnalysisInput(db, { guru, periodEnd: run.periodEnd })
  if (!built.ok || built.inputHash !== run.inputHash) throw new GuruAnalysisError('AI_SOURCE_INVALIDATED', 409)
  return built.context
}

export async function runGuruAnalysisOnce(options: GuruAnalysisWorkerOptions): Promise<GuruAnalysisWorkerResult> {
  const now = options.now ?? (() => new Date())
  const workerId = options.workerId ?? randomUUID()
  const leaseMs = options.leaseMs ?? GURU_ANALYSIS_LEASE_MS
  const claimed = await claimNextGuruAnalysisRun(options.db, workerId, now(), leaseMs)
  if (!claimed) return { status: 'idle' }
  const leaseToken = claimed.leaseToken!
  let run = claimed
  const heartbeatAbort = new AbortController()
  const providerSignal = options.signal ? AbortSignal.any([options.signal, heartbeatAbort.signal]) : heartbeatAbort.signal
  const heartbeatTimer = setInterval(() => {
    void heartbeatGuruAnalysisRun(options.db, { runId: claimed.id, leaseToken, now: now(), leaseMs })
      .then(ok => { if (!ok) heartbeatAbort.abort() })
      .catch(() => heartbeatAbort.abort())
  }, Math.min(10_000, Math.max(1_000, Math.floor(leaseMs / 3))))
  try {
    const context = await assertRunStillCurrent(options.db, claimed)
    const admitted = await admitGuruAnalysisDispatch(options.db, { run: claimed, leaseToken, now: now() })
    if (admitted === 'capacity') {
      await requeueGuruAnalysisRun(options.db, { runId: claimed.id, leaseToken, now: now() })
      return { status: 'idle' }
    }
    if (!admitted) {
      await failGuruAnalysisRun(options.db, { run: claimed, leaseToken, now: now(), errorCode: 'AI_CONFIG_CHANGED' })
      return { status: 'failed', runId: claimed.id, errorCode: 'AI_CONFIG_CHANGED' }
    }
    const [refreshed] = await options.db.select().from(guruAnalysisRuns).where(eq(guruAnalysisRuns.id, claimed.id)).limit(1)
    run = refreshed ?? { ...claimed, attemptId: admitted.attemptId, dispatchedAt: now() }
    const provider = admitted.provider
    const messages = buildGuruAnalysisMessages({ template: await effectiveTemplate(options.db, claimed), context: context as GuruAnalysisContext })
    if (Buffer.byteLength(JSON.stringify(messages), 'utf8') > provider.maxInputTokens) throw new GuruAnalysisError('AI_REPORT_CONTEXT_TOO_LARGE', 413)
    const result = await generateAiAnalysis({
      baseUrl: provider.baseUrl, apiKey: decryptAiSecret(provider.encryptedApiKey!, 'provider-api-key'), model: provider.model,
      timeoutMs: provider.timeoutMs, maxOutputTokens: provider.maxOutputTokens,
      ...(provider.thinking === 'enabled' ? { thinking: 'enabled' as const } : {}),
      messages, signal: providerSignal,
    }, options.transport)
    const analysis = validateGuruAnalysisOutput(result.analysis, context as GuruAnalysisContext)
    const completed = await completeGuruAnalysisRun(options.db, {
      run, leaseToken, now: now(), result: analysis as unknown as Record<string, unknown>,
      usage: { ...(result.usage ?? {}), estimatedCostCents: estimatedCostCents(provider, result.usage), requestId: result.requestId, latencyMs: result.latencyMs },
    })
    if (!completed) return { status: 'failed', runId: claimed.id, errorCode: 'AI_SOURCE_INVALIDATED' }
    return { status: 'succeeded', runId: claimed.id }
  } catch (error) {
    const code = safeGuruAnalysisErrorCode(error)
    const failed = await failGuruAnalysisRun(options.db, { run, leaseToken, now: now(), errorCode: code })
    return { status: 'failed', runId: claimed.id, errorCode: failed ? code : 'AI_SOURCE_INVALIDATED' }
  } finally {
    clearInterval(heartbeatTimer)
    heartbeatAbort.abort()
    if (run.attemptId !== null) {
      try { await releaseAiCallSlot(options.db, { attemptId: run.attemptId, now: now() }) } catch { /* the deadline reaper is the durable fallback */ }
    }
  }
}

/** The run pins its prompt at request time; a later override cannot change it. */
async function effectiveTemplate(db: Database, run: GuruAnalysisRun) {
  if (!run.promptOverrideVersionId) return defaultGuruAnalysisTemplate
  const [version] = await db.select().from(sharedPromptVersions).where(eq(sharedPromptVersions.id, run.promptOverrideVersionId)).limit(1)
  if (!version) throw new GuruAnalysisError('AI_CONFIG_CHANGED', 409)
  return version.template
}

export async function runGuruAnalysisWorker(options: GuruAnalysisWorkerOptions & { intervalMs?: number }) {
  const intervalMs = options.intervalMs ?? 1_000
  while (!options.signal?.aborted) {
    await runGuruAnalysisOnce(options)
    if (options.signal?.aborted) break
    await new Promise<void>(resolve => setTimeout(resolve, intervalMs))
  }
}

/** Cancel a queued run and return its reservation. */
export async function cancelGuruAnalysisRun(db: Database, input: { runId: bigint; now: Date }) {
  return db.transaction(async tx => {
    await lockAiGlobal(tx)
    const [row] = await tx.update(guruAnalysisRuns).set({ status: 'cancelled', errorCode: 'AI_CANCELLED', finishedAt: input.now, updatedAt: input.now })
      .where(and(eq(guruAnalysisRuns.id, input.runId), eq(guruAnalysisRuns.status, 'queued'))).returning()
    if (!row) return null
    if (row.reservationCostCents > 0) await releaseGlobalAiBudget(tx, { month: row.reservationBucketMonth, reservationCostCents: row.reservationCostCents })
    return row
  })
}
