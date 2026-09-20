import { randomUUID } from 'node:crypto'
import { and, asc, eq, gt, isNotNull, isNull, lt, ne, or, sql } from 'drizzle-orm'
import { aiPromptVersions, aiProviderConfigVersions, aiReportAttempts, aiReportSources, aiReports, aiRuntimeState, aiUserAccess, aiUserConsents, type Database } from '@diary/db'
import { consumeUserQuota, recordUserQuotaUsage, releaseUserQuota, type QuotaReservation } from './quota.js'
import { consumeGlobalAiBudget, releaseGlobalAiBudget, settleGlobalAiBudget } from './budget.js'

export const AI_OWNER_LOCK_CLASS = 7441
export const AI_GLOBAL_LOCK_CLASS = 7440
export const AI_LEASE_MS = 180_000

export async function lockAiOwner(tx: Pick<Database, 'execute'>, userId: bigint) {
  await tx.execute(sql`select pg_advisory_xact_lock(${AI_OWNER_LOCK_CLASS}, hashtext(${userId.toString()}))`)
}

export async function lockAiGlobal(tx: Pick<Database, 'execute'>) {
  await tx.execute(sql`select pg_advisory_xact_lock(${AI_GLOBAL_LOCK_CLASS}, 1)`)
}

/** Reconcile provider call slots whose provider deadline has elapsed. */
export async function reapExpiredCallSlots(tx: Pick<Database, 'select' | 'update' | 'execute'>, now: Date) {
  const expired = await tx.select({
    id: aiReportAttempts.id,
    reportId: aiReportAttempts.reportId,
    status: aiReportAttempts.status,
    userId: aiReportAttempts.userId,
    reservationBucketMonth: aiReportAttempts.reservationBucketMonth,
    reservationCostCents: aiReportAttempts.reservationCostCents,
  }).from(aiReportAttempts).where(and(isNull(aiReportAttempts.slotReleasedAt), isNotNull(aiReportAttempts.slotExpiresAt), lt(aiReportAttempts.slotExpiresAt, now))).for('update')
  for (const attempt of expired) {
    if (attempt.status === 'dispatched') {
      const [unknown] = await tx.update(aiReportAttempts).set({ status: 'unknown', errorCode: 'AI_PROVIDER_OUTCOME_UNKNOWN', finishedAt: now })
        .where(and(eq(aiReportAttempts.id, attempt.id), eq(aiReportAttempts.status, 'dispatched'))).returning({ id: aiReportAttempts.id })
      if (unknown) {
        if (attempt.reservationCostCents > 0) await settleGlobalAiBudget(tx, { month: attempt.reservationBucketMonth, reservationCostCents: attempt.reservationCostCents, actualCostCents: null, inputTokens: null, outputTokens: null })
        if (attempt.reportId !== null && attempt.userId !== null) await recordUserQuotaUsage(tx, { userId: attempt.userId, bucketMonth: attempt.reservationBucketMonth, reservationCostCents: 0 }, { unknown: true })
        if (attempt.reportId !== null) {
          await tx.update(aiReports).set({ status: 'failed', errorCode: 'AI_PROVIDER_OUTCOME_UNKNOWN', finishedAt: now, leaseExpiresAt: null, updatedAt: now })
            .where(and(eq(aiReports.id, attempt.reportId), eq(aiReports.status, 'running'), isNotNull(aiReports.dispatchedAt), isNull(aiReports.deletedAt)))
        }
      }
    }
    await tx.update(aiReportAttempts).set({ slotReleasedAt: now }).where(and(eq(aiReportAttempts.id, attempt.id), isNull(aiReportAttempts.slotReleasedAt)))
  }
  return expired.length
}

/** The only concurrency count used by report and admin admission. */
export async function countActiveCallSlots(tx: Pick<Database, 'select'>) {
  const [row] = await tx.select({ count: sql<number>`count(*)::int` }).from(aiReportAttempts).where(isNull(aiReportAttempts.slotReleasedAt))
  return Number(row?.count ?? 0)
}

/** Compatibility helper retained for callers that need one global admission check. */
export async function countLiveAiCalls(tx: Pick<Database, 'select' | 'update' | 'execute'>, now: Date) {
  await reapExpiredCallSlots(tx, now)
  return countActiveCallSlots(tx)
}

export async function releaseAiCallSlot(db: Database, input: { attemptId: bigint; now: Date }) {
  return db.transaction(async tx => {
    await lockAiGlobal(tx)
    const [row] = await tx.update(aiReportAttempts).set({ slotReleasedAt: input.now }).where(and(eq(aiReportAttempts.id, input.attemptId), isNull(aiReportAttempts.slotReleasedAt))).returning({ id: aiReportAttempts.id })
    return Boolean(row)
  })
}

export async function requeueAiReport(db: Database, input: { reportId: bigint; leaseToken: string; now: Date }) {
  const [row] = await db.update(aiReports).set({ status: 'queued', leaseToken: null, workerId: null, leaseExpiresAt: null, heartbeatAt: null, startedAt: null, updatedAt: input.now })
    .where(and(eq(aiReports.id, input.reportId), eq(aiReports.status, 'running'), eq(aiReports.leaseToken, input.leaseToken), isNull(aiReports.dispatchedAt), isNull(aiReports.deletedAt), ne(aiReports.sourceState, 'invalidated'))).returning({ id: aiReports.id })
  return Boolean(row)
}

export async function claimNextAiReport(db: Database, workerId: string, now: Date, leaseMs = AI_LEASE_MS) {
  return db.transaction(async tx => {
    // Serialise admission so the count check is an atomic global concurrency
    // gate. The global lock is always acquired before the owner lock.
    await lockAiGlobal(tx)
    await reapExpiredCallSlots(tx, now)
    // Discover expired rows without locking them, then acquire owner locks
    // before touching reports. Source writers use owner→report, so this
    // preserves the global→owner→report order and cannot deadlock.
    const expired = await tx.select({ id: aiReports.id, userId: aiReports.userId, createdAt: aiReports.createdAt, dispatchedAt: aiReports.dispatchedAt, leaseToken: aiReports.leaseToken, reservationBucketMonth: aiReports.reservationBucketMonth, reservationCostCents: aiReports.reservationCostCents })
      .from(aiReports).where(and(eq(aiReports.status, 'running'), lt(aiReports.leaseExpiresAt, now), isNull(aiReports.deletedAt))).orderBy(asc(aiReports.userId), asc(aiReports.id))
    for (const owner of [...new Set(expired.map(row => row.userId.toString()))].sort()) await lockAiOwner(tx, BigInt(owner))
    for (const candidate of expired) {
      if (candidate.dispatchedAt === null) {
        await tx.update(aiReports).set({ status: 'queued', leaseToken: null, workerId: null, leaseExpiresAt: null, heartbeatAt: null, startedAt: null, updatedAt: now })
          .where(and(eq(aiReports.id, candidate.id), eq(aiReports.status, 'running'), candidate.leaseToken ? eq(aiReports.leaseToken, candidate.leaseToken) : isNull(aiReports.leaseToken), lt(aiReports.leaseExpiresAt, now), isNull(aiReports.dispatchedAt)))
      } else {
        const [failed] = await tx.update(aiReports).set({ status: 'failed', errorCode: 'AI_PROVIDER_OUTCOME_UNKNOWN', finishedAt: now, leaseExpiresAt: null, updatedAt: now })
          .where(and(eq(aiReports.id, candidate.id), eq(aiReports.status, 'running'), candidate.leaseToken ? eq(aiReports.leaseToken, candidate.leaseToken) : isNull(aiReports.leaseToken), lt(aiReports.leaseExpiresAt, now), sql`${aiReports.dispatchedAt} is not null`)).returning()
        if (failed) {
          const [attempt] = await tx.update(aiReportAttempts).set({ status: 'unknown', errorCode: 'AI_PROVIDER_OUTCOME_UNKNOWN', finishedAt: now })
            .where(and(eq(aiReportAttempts.reportId, candidate.id), eq(aiReportAttempts.status, 'dispatched'))).returning({ id: aiReportAttempts.id })
          if (attempt && candidate.reservationCostCents > 0) await settleGlobalAiBudget(tx, { month: candidate.reservationBucketMonth, reservationCostCents: candidate.reservationCostCents, actualCostCents: null, inputTokens: null, outputTokens: null })
          if (attempt) await recordUserQuotaUsage(tx, { userId: candidate.userId, bucketMonth: candidate.createdAt.toISOString().slice(0, 7) + '-01', reservationCostCents: 0 }, { unknown: true })
        }
      }
    }
    if (await countActiveCallSlots(tx) >= 2) return null
    const [candidate] = await tx.select().from(aiReports)
      .where(and(eq(aiReports.status, 'queued'), isNull(aiReports.deletedAt), ne(aiReports.sourceState, 'invalidated')))
      .orderBy(asc(aiReports.queuedAt), asc(aiReports.id)).limit(1)
    if (!candidate) return null
    await lockAiOwner(tx, candidate.userId)
    const [lockedCandidate] = await tx.select().from(aiReports).where(and(eq(aiReports.id, candidate.id), eq(aiReports.status, 'queued'), isNull(aiReports.deletedAt), ne(aiReports.sourceState, 'invalidated'))).limit(1).for('update')
    if (!lockedCandidate) return null
    const leaseToken = randomUUID()
    const leaseExpiresAt = new Date(now.getTime() + leaseMs)
    const [claimed] = await tx.update(aiReports).set({ status: 'running', workerId, leaseToken, leaseExpiresAt, heartbeatAt: now, startedAt: now, updatedAt: now })
      .where(and(eq(aiReports.id, lockedCandidate.id), eq(aiReports.status, 'queued'), isNull(aiReports.deletedAt))).returning()
    return claimed ?? null
  })
}

export async function heartbeatAiReport(db: Database, input: { reportId: bigint; leaseToken: string; now: Date; leaseMs?: number }) {
  const leaseExpiresAt = new Date(input.now.getTime() + (input.leaseMs ?? AI_LEASE_MS))
  const [row] = await db.update(aiReports).set({ heartbeatAt: input.now, leaseExpiresAt, updatedAt: input.now })
    .where(and(eq(aiReports.id, input.reportId), eq(aiReports.status, 'running'), eq(aiReports.leaseToken, input.leaseToken), gt(aiReports.leaseExpiresAt, input.now), isNull(aiReports.deletedAt), ne(aiReports.sourceState, 'invalidated'))).returning({ id: aiReports.id })
  return Boolean(row)
}

export async function admitAiReportDispatch(db: Database, input: { reportId: bigint; leaseToken: string; now: Date; reservation: QuotaReservation; returnAttempt?: boolean }) {
  return db.transaction(async tx => {
    await lockAiGlobal(tx)
    await reapExpiredCallSlots(tx, input.now)
    if (await countActiveCallSlots(tx) >= 2) return 'capacity' as const
    await lockAiOwner(tx, input.reservation.userId)
    const [runtime] = await tx.select().from(aiRuntimeState).where(eq(aiRuntimeState.singleton, 'default')).limit(1).for('update')
    if (!runtime?.generationEnabled) return false
    const [provider] = await tx.select({ id: aiProviderConfigVersions.id, status: aiProviderConfigVersions.status, model: aiProviderConfigVersions.model, timeoutMs: aiProviderConfigVersions.timeoutMs, recipientRevision: aiProviderConfigVersions.recipientRevision, pricingVersion: aiProviderConfigVersions.pricingVersion, pricingCurrency: aiProviderConfigVersions.pricingCurrency }).from(aiProviderConfigVersions).where(eq(aiProviderConfigVersions.id, (await tx.select({ id: aiReports.providerConfigVersionId }).from(aiReports).where(eq(aiReports.id, input.reportId)).limit(1))[0]?.id ?? -1n)).limit(1)
    const [reportRefs] = await tx.select({ userId: aiReports.userId, providerId: aiReports.providerConfigVersionId, promptId: aiReports.promptVersionId, reportType: aiReports.reportType, recipientRevision: aiReports.recipientRevision }).from(aiReports).where(and(eq(aiReports.id, input.reportId), eq(aiReports.userId, input.reservation.userId))).limit(1)
    if (!reportRefs || runtime.activeProviderConfigId !== reportRefs.providerId || !provider || provider.status !== 'published') return false
    const activePromptId = reportRefs.reportType === 'weekly' ? runtime.activeWeeklyPromptId : runtime.activeMonthlyPromptId
    const [prompt] = await tx.select({ id: aiPromptVersions.id, status: aiPromptVersions.status }).from(aiPromptVersions).where(eq(aiPromptVersions.id, reportRefs.promptId!)).limit(1)
    if (!prompt || prompt.status !== 'published' || activePromptId !== reportRefs.promptId) return false
    const [access] = await tx.select({ enabled: aiUserAccess.enabled }).from(aiUserAccess).where(eq(aiUserAccess.userId, input.reservation.userId)).limit(1).for('update')
    const [consent] = await tx.select({ acceptedAt: aiUserConsents.acceptedAt, revokedAt: aiUserConsents.revokedAt, recipientRevision: aiUserConsents.recipientRevision }).from(aiUserConsents).where(eq(aiUserConsents.userId, input.reservation.userId)).limit(1).for('update')
    if (!access?.enabled || !consent?.acceptedAt || consent.revokedAt || consent.recipientRevision !== reportRefs.recipientRevision) return false
    const [row] = await tx.update(aiReports).set({ dispatchedAt: input.now, updatedAt: input.now })
      .where(and(eq(aiReports.id, input.reportId), eq(aiReports.status, 'running'), eq(aiReports.leaseToken, input.leaseToken), isNull(aiReports.deletedAt), ne(aiReports.sourceState, 'invalidated'), isNull(aiReports.dispatchedAt))).returning({ id: aiReports.id, userId: aiReports.userId })
    if (!row) return false
    const slotExpiresAt = new Date(input.now.getTime() + provider.timeoutMs + 5_000)
    const [attempt] = await tx.insert(aiReportAttempts).values({ reportId: input.reportId, userId: input.reservation.userId, status: 'dispatched', dispatchedAt: input.now, slotExpiresAt, reservationBucketMonth: input.reservation.bucketMonth, reservationCostCents: input.reservation.reservationCostCents, providerConfigVersionId: provider.id, model: provider.model, pricingVersion: provider.pricingVersion, pricingCurrency: provider.pricingCurrency }).returning({ id: aiReportAttempts.id })
    if (!attempt) throw new Error('AI_ATTEMPT_NOT_RECORDED')
    if (input.reservation.reservationCostCents > 0) await consumeGlobalAiBudget(tx, { month: input.reservation.bucketMonth, reservationCostCents: input.reservation.reservationCostCents })
    await consumeUserQuota(tx, input.reservation, {})
    return input.returnAttempt ? { attemptId: attempt.id } : true
  })
}

export async function completeAiReport(db: Database, input: {
  reportId: bigint
  leaseToken: string
  now: Date
  analysisJson: string
  usage: { inputTokens?: number | null; outputTokens?: number | null; cacheHitTokens?: number | null; cacheMissTokens?: number | null; estimatedCostCents?: number | null; requestId?: string | null; latencyMs?: number | null }
}) {
  try {
    return await db.transaction(async tx => {
      await lockAiGlobal(tx)
      const [refs] = await tx.select({ userId: aiReports.userId }).from(aiReports).where(eq(aiReports.id, input.reportId)).limit(1)
      if (!refs) return false
      await lockAiOwner(tx, refs.userId)
      const [current] = await tx.select().from(aiReports).where(eq(aiReports.id, input.reportId)).limit(1).for('update')
      if (!current || current.status !== 'running' || current.leaseToken !== input.leaseToken || current.deletedAt !== null || current.sourceState === 'invalidated' || current.dispatchedAt === null) return false
      const [attempt] = await tx.update(aiReportAttempts).set({ status: 'succeeded', providerRequestId: input.usage.requestId ?? null, inputTokens: input.usage.inputTokens ?? null, outputTokens: input.usage.outputTokens ?? null, cacheHitTokens: input.usage.cacheHitTokens ?? null, cacheMissTokens: input.usage.cacheMissTokens ?? null, estimatedCostCents: input.usage.estimatedCostCents ?? null, latencyMs: input.usage.latencyMs ?? null, finishedAt: input.now, slotReleasedAt: input.now }).where(and(eq(aiReportAttempts.reportId, input.reportId), eq(aiReportAttempts.status, 'dispatched'), isNull(aiReportAttempts.slotReleasedAt))).returning({ id: aiReportAttempts.id })
      if (!attempt) return false
      const [row] = await tx.update(aiReports).set({ status: 'succeeded', analysisJson: input.analysisJson, finishedAt: input.now, heartbeatAt: input.now, leaseExpiresAt: null, errorCode: null, updatedAt: input.now })
        .where(and(eq(aiReports.id, input.reportId), eq(aiReports.status, 'running'), eq(aiReports.leaseToken, input.leaseToken), isNull(aiReports.deletedAt), ne(aiReports.sourceState, 'invalidated'), isNotNull(aiReports.dispatchedAt))).returning({ id: aiReports.id, userId: aiReports.userId, createdAt: aiReports.createdAt, reservationBucketMonth: aiReports.reservationBucketMonth, reservationCostCents: aiReports.reservationCostCents })
      if (!row) throw new Error('AI_COMPLETION_FENCE')
      if (row.reservationCostCents > 0) await settleGlobalAiBudget(tx, { month: row.reservationBucketMonth, reservationCostCents: row.reservationCostCents, actualCostCents: input.usage.estimatedCostCents ?? null, inputTokens: input.usage.inputTokens ?? null, outputTokens: input.usage.outputTokens ?? null })
      await recordUserQuotaUsage(tx, { userId: row.userId, bucketMonth: row.createdAt.toISOString().slice(0, 7) + '-01', reservationCostCents: 0 }, input.usage)
      return true
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'AI_COMPLETION_FENCE') return false
    throw error
  }
}

export async function failAiReport(db: Database, input: { reportId: bigint; leaseToken: string; now: Date; errorCode: string; unknown?: boolean }) {
  try {
    return await db.transaction(async tx => {
      await lockAiGlobal(tx)
      const [refs] = await tx.select({ userId: aiReports.userId }).from(aiReports).where(eq(aiReports.id, input.reportId)).limit(1)
      if (!refs) return false
      await lockAiOwner(tx, refs.userId)
      const [current] = await tx.select().from(aiReports).where(eq(aiReports.id, input.reportId)).limit(1).for('update')
      if (!current || current.status !== 'running' || current.leaseToken !== input.leaseToken || current.deletedAt !== null) return false
      if (current.dispatchedAt !== null) {
        const [attempt] = await tx.update(aiReportAttempts).set({ status: input.unknown ? 'unknown' : 'failed', errorCode: input.errorCode.slice(0, 80), finishedAt: input.now, slotReleasedAt: input.now }).where(and(eq(aiReportAttempts.reportId, input.reportId), eq(aiReportAttempts.status, 'dispatched'), isNull(aiReportAttempts.slotReleasedAt))).returning({ id: aiReportAttempts.id })
        if (!attempt) return false
      }
      const [row] = await tx.update(aiReports).set({ status: 'failed', errorCode: input.errorCode.slice(0, 80), finishedAt: input.now, leaseExpiresAt: null, updatedAt: input.now }).where(and(eq(aiReports.id, input.reportId), eq(aiReports.status, 'running'), eq(aiReports.leaseToken, input.leaseToken), isNull(aiReports.deletedAt))).returning({ id: aiReports.id, userId: aiReports.userId, createdAt: aiReports.createdAt, dispatchedAt: aiReports.dispatchedAt, reservationBucketMonth: aiReports.reservationBucketMonth, reservationCostCents: aiReports.reservationCostCents })
      if (!row) throw new Error('AI_COMPLETION_FENCE')
      if (row.dispatchedAt === null) {
        await releaseUserQuota(tx, { userId: row.userId, bucketMonth: row.createdAt.toISOString().slice(0, 7) + '-01', reservationCostCents: 0 })
        if (row.reservationCostCents > 0) await releaseGlobalAiBudget(tx, { month: row.reservationBucketMonth, reservationCostCents: row.reservationCostCents })
      } else {
        // Admission is the billing boundary. Any post-admission failure lacks
        // a trustworthy completed usage record, so retain the bound and count
        // the outcome as unknown exactly once.
        if (row.reservationCostCents > 0) await settleGlobalAiBudget(tx, { month: row.reservationBucketMonth, reservationCostCents: row.reservationCostCents, actualCostCents: null, inputTokens: null, outputTokens: null })
        await recordUserQuotaUsage(tx, { userId: row.userId, bucketMonth: row.createdAt.toISOString().slice(0, 7) + '-01', reservationCostCents: 0 }, { unknown: true })
      }
      return true
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'AI_COMPLETION_FENCE') return false
    throw error
  }
}

export async function cancelAiReport(db: Database, input: { reportId: bigint; userId: bigint; now: Date }) {
  return db.transaction(async tx => {
    await lockAiGlobal(tx)
    await lockAiOwner(tx, input.userId)
    const [row] = await tx.update(aiReports).set({ status: 'cancelled', errorCode: 'AI_CANCELLED', finishedAt: input.now, leaseExpiresAt: null, updatedAt: input.now })
      .where(and(eq(aiReports.id, input.reportId), eq(aiReports.userId, input.userId), or(eq(aiReports.status, 'queued'), eq(aiReports.status, 'running')), isNull(aiReports.deletedAt))).returning()
    if (row) {
      if (row.dispatchedAt === null) {
        await releaseUserQuota(tx, { userId: input.userId, bucketMonth: row.createdAt.toISOString().slice(0, 7) + '-01', reservationCostCents: 0 })
        if (row.reservationCostCents > 0) await releaseGlobalAiBudget(tx, { month: row.reservationBucketMonth, reservationCostCents: row.reservationCostCents })
      }
      else {
        const [attempt] = await tx.update(aiReportAttempts).set({ status: 'cancelled', errorCode: 'AI_CANCELLED', finishedAt: input.now }).where(and(eq(aiReportAttempts.reportId, row.id), eq(aiReportAttempts.status, 'dispatched'))).returning({ id: aiReportAttempts.id })
        if (attempt) {
          if (row.reservationCostCents > 0) await settleGlobalAiBudget(tx, { month: row.reservationBucketMonth, reservationCostCents: row.reservationCostCents, actualCostCents: null, inputTokens: null, outputTokens: null })
          await recordUserQuotaUsage(tx, { userId: input.userId, bucketMonth: row.createdAt.toISOString().slice(0, 7) + '-01', reservationCostCents: 0 }, { unknown: true })
        }
      }
    }
    return row ?? null
  })
}

export async function deleteAiReport(db: Database, input: { reportId: bigint; userId: bigint; now: Date }) {
  return db.transaction(async tx => {
    await lockAiGlobal(tx)
    await lockAiOwner(tx, input.userId)
    const [before] = await tx.select({ id: aiReports.id, status: aiReports.status, dispatchedAt: aiReports.dispatchedAt, createdAt: aiReports.createdAt, reservationBucketMonth: aiReports.reservationBucketMonth, reservationCostCents: aiReports.reservationCostCents })
      .from(aiReports).where(and(eq(aiReports.id, input.reportId), eq(aiReports.userId, input.userId), isNull(aiReports.deletedAt))).limit(1).for('update')
    if (!before) return null
    const [row] = await tx.update(aiReports).set({ deletedAt: input.now, analysisJson: null, metricsJson: '[]', coverageJson: '{"diaries":{"count":0,"available":false},"transactions":{"count":0,"available":false},"holdings":{"count":0,"available":false},"disciplines":{"count":0,"available":false},"notes":["Report deleted"]}', inputSnapshotEncrypted: null, sourceState: 'invalidated', sourceInvalidatedAt: input.now, leaseToken: null, workerId: null, leaseExpiresAt: null, heartbeatAt: null, status: sql`case when ${aiReports.status} in ('queued','running') then 'cancelled'::ai_report_status else ${aiReports.status} end`, finishedAt: sql`case when ${aiReports.finishedAt} is null then ${input.now} else ${aiReports.finishedAt} end`, updatedAt: input.now })
      .where(and(eq(aiReports.id, input.reportId), eq(aiReports.userId, input.userId), isNull(aiReports.deletedAt))).returning()
    if (row) {
      await tx.delete(aiReportSources).where(and(eq(aiReportSources.reportId, row.id), eq(aiReportSources.userId, input.userId)))
      if (before.dispatchedAt === null && (before.status === 'queued' || before.status === 'running')) await releaseUserQuota(tx, { userId: input.userId, bucketMonth: before.createdAt.toISOString().slice(0, 7) + '-01', reservationCostCents: 0 })
      if (before.dispatchedAt === null && (before.status === 'queued' || before.status === 'running') && before.reservationCostCents > 0) await releaseGlobalAiBudget(tx, { month: before.reservationBucketMonth, reservationCostCents: before.reservationCostCents })
      if (before.dispatchedAt !== null && (before.status === 'queued' || before.status === 'running')) {
        const [attempt] = await tx.update(aiReportAttempts).set({ status: 'cancelled', errorCode: 'AI_CANCELLED', finishedAt: input.now }).where(and(eq(aiReportAttempts.reportId, row.id), eq(aiReportAttempts.status, 'dispatched'))).returning({ id: aiReportAttempts.id })
        if (attempt) {
          if (before.reservationCostCents > 0) await settleGlobalAiBudget(tx, { month: before.reservationBucketMonth, reservationCostCents: before.reservationCostCents, actualCostCents: null, inputTokens: null, outputTokens: null })
          await recordUserQuotaUsage(tx, { userId: input.userId, bucketMonth: before.createdAt.toISOString().slice(0, 7) + '-01', reservationCostCents: 0 }, { unknown: true })
        }
      }
    }
    return row ?? null
  })
}
