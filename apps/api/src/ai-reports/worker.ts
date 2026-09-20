import { randomUUID } from 'node:crypto'
import { and, eq, isNotNull, lt, ne } from 'drizzle-orm'
import { aiPromptVersions, aiProviderConfigVersions, aiReportRequests, aiReports, aiRuntimeState, aiUserAccess, aiUserConsents, type Database } from '@diary/db'
import { generateAiAnalysis, AiProviderError } from './deepseek-provider.js'
import { decryptAiSecret } from './secrets.js'
import { validateAiAnalysis } from './output-validator.js'
import { admitAiReportDispatch, claimNextAiReport, completeAiReport, failAiReport, heartbeatAiReport, requeueAiReport, releaseAiCallSlot } from './job-store.js'
import { AiReportService, AiReportServiceError } from './report-service.js'

export interface AiWorkerOptions {
  db: Database
  service?: AiReportService
  workerId?: string
  now?: () => Date
  transport?: Parameters<typeof generateAiAnalysis>[1]
  leaseMs?: number
  signal?: AbortSignal
}

export type AiWorkerResult =
  | { status: 'idle' }
  | { status: 'succeeded'; reportId: bigint }
  | { status: 'failed'; reportId: bigint; errorCode: string }

export function safeAiErrorCode(error: unknown): string {
  if (error instanceof AiProviderError) return error.code
  if (error instanceof AiReportServiceError) return error.code
  if (error instanceof Error && /^AI_[A-Z0-9_]+$/.test(error.message)) return error.message
  return 'AI_PROVIDER_UNAVAILABLE'
}

function estimatedCostCents(config: typeof aiProviderConfigVersions.$inferSelect, usage: { inputTokens?: number | null; outputTokens?: number | null } | null): number | null {
  if (!usage || config.inputPricePerMillionCents === null || config.outputPricePerMillionCents === null || usage.inputTokens == null || usage.outputTokens == null) return null
  const input = Math.ceil(usage.inputTokens * config.inputPricePerMillionCents / 1_000_000)
  const output = Math.ceil(usage.outputTokens * config.outputPricePerMillionCents / 1_000_000)
  return input + output
}

async function touchWorker(db: Database, workerId: string, now: Date) {
  await db.update(aiRuntimeState).set({ workerId, workerHeartbeatAt: now, updatedAt: now }).where(eq(aiRuntimeState.singleton, 'default'))
}

async function assertDispatchStillAdmissible(db: Database, row: typeof aiReports.$inferSelect) {
  const [runtime] = await db.select().from(aiRuntimeState).where(eq(aiRuntimeState.singleton, 'default')).limit(1)
  if (!runtime?.generationEnabled || runtime.activeProviderConfigId !== row.providerConfigVersionId) throw new AiReportServiceError('AI_CONFIG_CHANGED', 409)
  const [provider] = await db.select().from(aiProviderConfigVersions).where(and(eq(aiProviderConfigVersions.id, row.providerConfigVersionId!), eq(aiProviderConfigVersions.status, 'published'))).limit(1)
  if (!provider) throw new AiReportServiceError('AI_CONFIG_CHANGED', 409)
  const activePromptId = row.reportType === 'weekly' ? runtime.activeWeeklyPromptId : runtime.activeMonthlyPromptId
  const [prompt] = await db.select({ id: aiPromptVersions.id }).from(aiPromptVersions).where(and(eq(aiPromptVersions.id, row.promptVersionId!), eq(aiPromptVersions.status, 'published'))).limit(1)
  if (!prompt || activePromptId !== row.promptVersionId) throw new AiReportServiceError('AI_CONFIG_CHANGED', 409)
  const [access] = await db.select().from(aiUserAccess).where(eq(aiUserAccess.userId, row.userId)).limit(1)
  if (!access?.enabled) throw new AiReportServiceError('AI_ACCESS_DENIED', 403)
  const [consent] = await db.select().from(aiUserConsents).where(eq(aiUserConsents.userId, row.userId)).limit(1)
  if (!consent?.acceptedAt || consent.revokedAt || consent.recipientRevision !== row.recipientRevision) throw new AiReportServiceError('AI_CONSENT_REQUIRED', 403)
  const [fresh] = await db.select({ sourceState: aiReports.sourceState, deletedAt: aiReports.deletedAt }).from(aiReports).where(and(eq(aiReports.id, row.id), eq(aiReports.status, 'running'))).limit(1)
  if (!fresh || fresh.deletedAt || fresh.sourceState === 'invalidated') throw new AiReportServiceError('AI_SOURCE_INVALIDATED', 409)
  return provider
}

export async function runAiReportOnce(options: AiWorkerOptions): Promise<AiWorkerResult> {
  const now = options.now ?? (() => new Date())
  const workerId = options.workerId ?? randomUUID()
  const leaseMs = options.leaseMs ?? 180_000
  const service = options.service ?? new AiReportService({ db: options.db, now })
  await touchWorker(options.db, workerId, now())
  const claimed = await claimNextAiReport(options.db, workerId, now(), leaseMs)
  if (!claimed) return { status: 'idle' }
  const leaseToken = claimed.leaseToken
  if (!leaseToken) return { status: 'failed', reportId: claimed.id, errorCode: 'AI_WORKER_UNAVAILABLE' }
  let admitted = false
  let attemptId: bigint | null = null
  const heartbeatAbort = new AbortController()
  const providerSignal = options.signal ? AbortSignal.any([options.signal, heartbeatAbort.signal]) : heartbeatAbort.signal
  const heartbeatTimer = setInterval(() => {
    const heartbeatNow = now()
    void Promise.all([
      heartbeatAiReport(options.db, { reportId: claimed.id, leaseToken, now: heartbeatNow, leaseMs }),
      touchWorker(options.db, workerId, heartbeatNow),
    ]).then(([ok]) => {
      if (!ok) heartbeatAbort.abort()
    }).catch(() => heartbeatAbort.abort())
  }, Math.min(10_000, Math.max(1_000, Math.floor(leaseMs / 3))))
  try {
    const provider = await assertDispatchStillAdmissible(options.db, claimed)
    const input = await service.dispatchInput(claimed)
    const inputBytes = Buffer.byteLength(JSON.stringify(input.messages), 'utf8')
    // One byte per input token is deliberately conservative. This includes
    // the fixed rules, schema and user context already present in messages.
    if (inputBytes > provider.maxInputTokens) throw new AiReportServiceError('AI_REPORT_CONTEXT_TOO_LARGE', 413)
    const admittedResult = await admitAiReportDispatch(options.db, {
      reportId: claimed.id,
      leaseToken,
      now: now(),
      reservation: { userId: claimed.userId, bucketMonth: claimed.reservationBucketMonth, reservationCostCents: claimed.reservationCostCents },
      returnAttempt: true,
    })
    if (admittedResult === 'capacity') {
      await requeueAiReport(options.db, { reportId: claimed.id, leaseToken, now: now() })
      return { status: 'idle' }
    }
    if (!admittedResult) {
      await failAiReport(options.db, { reportId: claimed.id, leaseToken, now: now(), errorCode: 'AI_CONFIG_CHANGED' })
      return { status: 'failed', reportId: claimed.id, errorCode: 'AI_CONFIG_CHANGED' }
    }
    admitted = true
    if (typeof admittedResult === 'object') attemptId = admittedResult.attemptId
    const result = await generateAiAnalysis({
      baseUrl: provider.baseUrl,
      apiKey: decryptAiSecret(provider.encryptedApiKey!, 'provider-api-key'),
      model: provider.model,
      timeoutMs: provider.timeoutMs,
      maxOutputTokens: provider.maxOutputTokens,
      ...(provider.thinking === 'enabled' ? { thinking: 'enabled' as const } : {}),
      messages: input.messages,
      signal: providerSignal,
    }, options.transport)
    const analysis = validateAiAnalysis(result.analysis, input.validationContext)
    const usage = result.usage ? { ...result.usage, estimatedCostCents: estimatedCostCents(provider, result.usage), requestId: result.requestId, latencyMs: result.latencyMs } : { requestId: result.requestId, latencyMs: result.latencyMs, estimatedCostCents: null }
    const completed = await completeAiReport(options.db, { reportId: claimed.id, leaseToken, now: now(), analysisJson: JSON.stringify(analysis), usage })
    if (!completed) return { status: 'failed', reportId: claimed.id, errorCode: 'AI_SOURCE_INVALIDATED' }
    return { status: 'succeeded', reportId: claimed.id }
  } catch (error) {
    const code = safeAiErrorCode(error)
    const failed = await failAiReport(options.db, { reportId: claimed.id, leaseToken, now: now(), errorCode: code, unknown: code === 'AI_PROVIDER_OUTCOME_UNKNOWN' })
    return { status: 'failed', reportId: claimed.id, errorCode: failed ? code : 'AI_SOURCE_INVALIDATED' }
  } finally {
    clearInterval(heartbeatTimer)
    heartbeatAbort.abort()
    await touchWorker(options.db, workerId, now())
    if (attemptId !== null) {
      try { await releaseAiCallSlot(options.db, { attemptId, now: now() }) } catch { /* deadline reaper is the durable fallback */ }
    }
    // A provider call is intentionally never retried here. The lease/attempt
    // record is the single dispatch boundary, including when the call fails.
    void admitted
  }
}

export async function purgeExpiredAiReportBodies(db: Database, now = new Date()) {
  const cutoff = new Date(now.getTime() - 7 * 86_400_000)
  const rows = await db.update(aiReports).set({ inputSnapshotEncrypted: null, updatedAt: now })
    .where(and(ne(aiReports.status, 'queued'), ne(aiReports.status, 'running'), lt(aiReports.finishedAt, cutoff), isNotNull(aiReports.inputSnapshotEncrypted))).returning({ id: aiReports.id })
  const tombstones = await db.delete(aiReportRequests).where(lt(aiReportRequests.tombstoneUntil, now)).returning({ id: aiReportRequests.id })
  return { bodyPurged: rows.length, tombstonesPurged: tombstones.length }
}

export async function runAiWorker(options: AiWorkerOptions & { intervalMs?: number; signal?: AbortSignal }) {
  const intervalMs = options.intervalMs ?? 1_000
  let lastMaintenance = 0
  while (!options.signal?.aborted) {
    const maintenanceNow = (options.now ?? (() => new Date()))()
    if (maintenanceNow.getTime() - lastMaintenance >= 60_000) {
      await purgeExpiredAiReportBodies(options.db, maintenanceNow)
      lastMaintenance = maintenanceNow.getTime()
    }
    await runAiReportOnce(options)
    if (options.signal?.aborted) break
    await new Promise<void>(resolve => setTimeout(resolve, intervalMs))
  }
}
