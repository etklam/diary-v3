import { createHash } from 'node:crypto'
import { and, asc, desc, eq, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm'
import {
  aiAdminAuditEvents,
  aiProviderConfigVersions,
  aiRuntimeState,
  guruAnalysisEventDeliveries,
  guruAnalysisRuns,
  guruQuarterAnalytics,
  gurus,
  institutionalSnapshotChangeEvents,
  type Database,
} from '@diary/db'
import { GURU_ANALYSIS_SCHEMA_VERSION } from '@diary/domain/guru-analysis'
import { lockAiGlobal } from '../ai-reports/job-store.js'
import { releaseGlobalAiBudget, reserveGlobalAiBudget } from '../ai-reports/budget.js'
import { resolveSharedPrompt } from '../shared-prompts/service.js'
import { ensureAiRuntime } from '../ai-reports/settings.js'
import { buildGuruAnalysisInput } from './context.js'
import { GURU_ANALYSIS_PROMPT_KEY } from './prompt.js'

const INVALIDATION_LOCK = 'guru-analysis-invalidation-consumer'
const FAILURE_BACKOFF_MS = 60_000
const REGENERATION_COOLDOWN_MS = 60_000

export class GuruAnalysisError extends Error {
  constructor(readonly code: string, readonly statusCode: number, message = code) {
    super(message)
    this.name = 'GuruAnalysisError'
  }
}

export type GuruAnalysisRun = typeof guruAnalysisRuns.$inferSelect

function hash(value: string): string { return createHash('sha256').update(value).digest('hex') }
function bucketMonth(now: Date): string { return `${now.toISOString().slice(0, 7)}-01` }
function nextQuarterEnd(periodEnd: string): string {
  const [year, month] = periodEnd.split('-').map(Number)
  return new Date(Date.UTC(year!, month! + 3, 0)).toISOString().slice(0, 10)
}

/** Resolve the effective prompt and the published provider for a new request. */
async function resolveGeneration(db: Database, now: Date) {
  await ensureAiRuntime(db, now)
  const [runtime] = await db.select().from(aiRuntimeState).where(eq(aiRuntimeState.singleton, 'default')).limit(1)
  if (!runtime?.generationEnabled) throw new GuruAnalysisError('AI_REPORTS_DISABLED', 503, 'AI generation is disabled')
  const [provider] = runtime.activeProviderConfigId
    ? await db.select().from(aiProviderConfigVersions).where(and(eq(aiProviderConfigVersions.id, runtime.activeProviderConfigId), eq(aiProviderConfigVersions.status, 'published'))).limit(1)
    : []
  if (!provider?.encryptedApiKey || !provider.model) throw new GuruAnalysisError('AI_NOT_CONFIGURED', 503, 'Publish an AI provider configuration first')
  const prompt = await resolveSharedPrompt(db, GURU_ANALYSIS_PROMPT_KEY)
  return { provider, prompt }
}

export async function requestGuruAnalysis(db: Database, input: {
  guru: typeof gurus.$inferSelect
  periodEnd: string
  mode: 'generate' | 'regenerate'
  actorUserId: bigint
  now: Date
}): Promise<{ run: GuruAnalysisRun; reused: boolean }> {
  const built = await buildGuruAnalysisInput(db, { guru: input.guru, periodEnd: input.periodEnd })
  if (!built.ok) throw new GuruAnalysisError('GURU_ANALYSIS_BLOCKED', 409, built.reason)
  const { provider, prompt } = await resolveGeneration(db, input.now)
  const promptTemplateHash = hash(prompt.template)
  const month = bucketMonth(input.now)
  return db.transaction(async tx => {
    await lockAiGlobal(tx)
    const [active] = await tx.select().from(guruAnalysisRuns).where(and(
      eq(guruAnalysisRuns.managerId, input.guru.managerId), eq(guruAnalysisRuns.periodEnd, input.periodEnd),
      inArray(guruAnalysisRuns.status, ['queued', 'running']),
    )).limit(1).for('update')
    if (active) return { run: active, reused: true }
    const [latest] = await tx.select().from(guruAnalysisRuns).where(and(
      eq(guruAnalysisRuns.managerId, input.guru.managerId), eq(guruAnalysisRuns.periodEnd, input.periodEnd),
    )).orderBy(desc(guruAnalysisRuns.id)).limit(1)
    if (input.mode === 'generate') {
      const [reusable] = await tx.select().from(guruAnalysisRuns).where(and(
        eq(guruAnalysisRuns.managerId, input.guru.managerId), eq(guruAnalysisRuns.periodEnd, input.periodEnd),
        eq(guruAnalysisRuns.inputHash, built.inputHash), eq(guruAnalysisRuns.promptTemplateHash, promptTemplateHash),
        eq(guruAnalysisRuns.status, 'succeeded'), eq(guruAnalysisRuns.sourceState, 'current'),
      )).orderBy(desc(guruAnalysisRuns.id)).limit(1)
      if (reusable) return { run: reusable, reused: true }
    } else if (latest && input.now.getTime() - latest.createdAt.getTime() < REGENERATION_COOLDOWN_MS) {
      throw new GuruAnalysisError('AI_REPORT_ALREADY_RUNNING', 429, 'Wait before regenerating this analysis')
    }
    if (provider.reservationCostCents > 0 && !await reserveGlobalAiBudget(tx, { month, reservationCostCents: provider.reservationCostCents, monthlyBudgetCents: provider.monthlyBudgetCents })) {
      throw new GuruAnalysisError('AI_QUOTA_EXCEEDED', 429, 'The global AI budget is exhausted')
    }
    const [run] = await tx.insert(guruAnalysisRuns).values({
      managerId: input.guru.managerId, periodEnd: input.periodEnd,
      analyticsId: built.analytics.id, analyticsVersion: built.analytics.analyticsVersion, analyticsContextHash: built.analytics.contextHash,
      consensusSnapshotId: built.consensusSnapshotId, consensusVersion: built.consensusVersion,
      contextVersion: built.contextVersion, schemaVersion: GURU_ANALYSIS_SCHEMA_VERSION, inputHash: built.inputHash,
      context: built.context as unknown as Record<string, unknown>,
      promptKey: GURU_ANALYSIS_PROMPT_KEY, promptSource: prompt.source, promptSystemVersion: prompt.definition.systemVersion,
      promptOverrideVersionId: prompt.version?.id ?? null, promptTemplateHash,
      providerConfigVersionId: provider.id, model: provider.model,
      status: 'queued', sourceState: 'current', reason: input.mode === 'regenerate' ? 'REGENERATION' : 'INITIAL',
      reservationBucketMonth: month, reservationCostCents: provider.reservationCostCents,
      requestedByUserId: input.actorUserId, queuedAt: input.now, createdAt: input.now, updatedAt: input.now,
    }).returning()
    await tx.insert(aiAdminAuditEvents).values({
      actorUserId: input.actorUserId, action: `guru-analysis.${input.mode}`, targetType: GURU_ANALYSIS_PROMPT_KEY,
      targetId: run!.id.toString(), summary: `${input.guru.slug} ${input.periodEnd} queued`, createdAt: input.now,
    })
    return { run: run!, reused: false }
  })
}

export async function listGuruAnalysisRuns(db: Pick<Database, 'select'>, managerId: bigint, limit = 20) {
  return db.select().from(guruAnalysisRuns).where(eq(guruAnalysisRuns.managerId, managerId))
    .orderBy(desc(guruAnalysisRuns.periodEnd), desc(guruAnalysisRuns.id)).limit(limit)
}

/**
 * The newest succeeded analysis for a quarter, including an invalidated one. The
 * caller decides whether it is current; an invalidated result stays readable as
 * an audit record instead of disappearing.
 */
export async function readPublishedGuruAnalysis(db: Pick<Database, 'select'>, managerId: bigint, periodEnd: string) {
  const [row] = await db.select().from(guruAnalysisRuns).where(and(
    eq(guruAnalysisRuns.managerId, managerId), eq(guruAnalysisRuns.periodEnd, periodEnd),
    eq(guruAnalysisRuns.status, 'succeeded'),
  )).orderBy(desc(guruAnalysisRuns.id)).limit(1)
  return row
}

export async function readPendingGuruAnalysis(db: Pick<Database, 'select'>, managerId: bigint, periodEnd: string) {
  const [row] = await db.select().from(guruAnalysisRuns).where(and(
    eq(guruAnalysisRuns.managerId, managerId), eq(guruAnalysisRuns.periodEnd, periodEnd),
    inArray(guruAnalysisRuns.status, ['queued', 'running']),
  )).orderBy(desc(guruAnalysisRuns.id)).limit(1)
  return row
}

/**
 * Invalidate analyses whose prepared input has been rebuilt. Invalidation never
 * spends provider budget; regeneration stays an explicit admin request.
 */
export async function runPendingGuruAnalysisInvalidationOnce(db: Database, now = new Date()) {
  let attemptedEventId: bigint | undefined
  try {
    return await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${INVALIDATION_LOCK}, 0))`)
      const [event] = await tx.select({
        id: institutionalSnapshotChangeEvents.id,
        managerId: institutionalSnapshotChangeEvents.managerId,
        periodEnd: institutionalSnapshotChangeEvents.periodEnd,
      }).from(institutionalSnapshotChangeEvents)
        .leftJoin(guruAnalysisEventDeliveries, eq(guruAnalysisEventDeliveries.eventId, institutionalSnapshotChangeEvents.id))
        .where(and(
          isNull(guruAnalysisEventDeliveries.processedAt),
          or(isNull(guruAnalysisEventDeliveries.eventId), lte(guruAnalysisEventDeliveries.nextAttemptAt, now)),
        )).orderBy(asc(institutionalSnapshotChangeEvents.id)).limit(1)
      if (!event) return undefined
      attemptedEventId = event.id
      let invalidated = 0
      let cancelled = 0
      for (const periodEnd of [event.periodEnd, nextQuarterEnd(event.periodEnd)]) {
        const [analytics] = await tx.select({ contextHash: guruQuarterAnalytics.contextHash }).from(guruQuarterAnalytics)
          .where(and(eq(guruQuarterAnalytics.managerId, event.managerId), eq(guruQuarterAnalytics.periodEnd, periodEnd)))
          .orderBy(desc(guruQuarterAnalytics.calculatedAt), desc(guruQuarterAnalytics.id)).limit(1)
        const stale = await tx.update(guruAnalysisRuns).set({
          sourceState: 'invalidated', invalidatedAt: now, invalidationReason: 'GURU_ANALYTICS_REBUILT', updatedAt: now,
        }).where(and(
          eq(guruAnalysisRuns.managerId, event.managerId), eq(guruAnalysisRuns.periodEnd, periodEnd),
          eq(guruAnalysisRuns.status, 'succeeded'), eq(guruAnalysisRuns.sourceState, 'current'),
          analytics ? ne(guruAnalysisRuns.analyticsContextHash, analytics.contextHash) : sql`true`,
        )).returning({ id: guruAnalysisRuns.id })
        invalidated += stale.length
        const queued = await tx.update(guruAnalysisRuns).set({
          status: 'cancelled', errorCode: 'AI_SOURCE_INVALIDATED', finishedAt: now, leaseToken: null, leaseExpiresAt: null, workerId: null, updatedAt: now,
        }).where(and(
          eq(guruAnalysisRuns.managerId, event.managerId), eq(guruAnalysisRuns.periodEnd, periodEnd), eq(guruAnalysisRuns.status, 'queued'),
          analytics ? ne(guruAnalysisRuns.analyticsContextHash, analytics.contextHash) : sql`true`,
        )).returning({ id: guruAnalysisRuns.id, reservationBucketMonth: guruAnalysisRuns.reservationBucketMonth, reservationCostCents: guruAnalysisRuns.reservationCostCents })
        for (const run of queued) {
          if (run.reservationCostCents > 0) await releaseGlobalAiBudget(tx, { month: run.reservationBucketMonth, reservationCostCents: run.reservationCostCents })
        }
        cancelled += queued.length
      }
      await tx.insert(guruAnalysisEventDeliveries).values({ eventId: event.id, attemptCount: 0, nextAttemptAt: now, processedAt: now, lastError: null })
        .onConflictDoUpdate({ target: guruAnalysisEventDeliveries.eventId, set: { nextAttemptAt: now, processedAt: now, lastError: null } })
      return { eventId: event.id, managerId: event.managerId, periodEnd: event.periodEnd, invalidated, cancelled, status: 'PROCESSED' as const }
    })
  } catch (error) {
    if (attemptedEventId === undefined) throw error
    await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${INVALIDATION_LOCK}, 0))`)
      const [previous] = await tx.select({ attemptCount: guruAnalysisEventDeliveries.attemptCount }).from(guruAnalysisEventDeliveries)
        .where(eq(guruAnalysisEventDeliveries.eventId, attemptedEventId!)).limit(1)
      await tx.insert(guruAnalysisEventDeliveries).values({
        eventId: attemptedEventId!, attemptCount: 1, nextAttemptAt: new Date(now.getTime() + FAILURE_BACKOFF_MS),
        lastError: 'GURU_ANALYSIS_INVALIDATION_FAILED', processedAt: null,
      }).onConflictDoUpdate({ target: guruAnalysisEventDeliveries.eventId, set: {
        attemptCount: (previous?.attemptCount ?? 0) + 1, nextAttemptAt: new Date(now.getTime() + FAILURE_BACKOFF_MS),
        lastError: 'GURU_ANALYSIS_INVALIDATION_FAILED', processedAt: null,
      } })
    })
    return { eventId: attemptedEventId, status: 'ERROR' as const }
  }
}
