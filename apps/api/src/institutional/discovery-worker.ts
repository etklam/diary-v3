import { randomUUID } from 'node:crypto'
import { and, asc, eq, inArray, isNull, lte, ne, or } from 'drizzle-orm'
import {
  gurus,
  institutionalManagerDiscovery,
  institutionalManagers,
  institutionalFilings,
  institutionalSecurityMappingRefreshJobs,
  type Database,
} from '@diary/db'
import type { SecEdgarService } from '../sec-edgar/service.js'
import { SecProviderError } from '../sec-edgar/errors.js'
import { discover13FFilings, processUnfinished13FFilings } from './ingestion.js'
import { runSecurityMappingRefreshBatch } from './security-mapping.js'
import { runPendingEffectiveSnapshotRebuildOnce } from './effective-snapshots.js'
import { runPendingGuruPortfolioAnalyticsOnce } from './portfolio-analytics.js'
import { runPendingGuruConsensusRebuildOnce } from './guru-consensus.js'
import { runPendingGuruFollowNotificationsOnce, runPendingGuruStockNotificationsOnce } from '../guru-notifications/worker.js'

const DEFAULT_LEASE_MS = 300_000
const DEFAULT_RETRY_MS = 15 * 60_000

interface ClaimedManager {
  managerId: bigint
  cik: string
  leaseToken: string
}

function safeErrorCode(error: unknown): string {
  return error instanceof SecProviderError ? error.code : 'SEC_13F_DISCOVERY_FAILED'
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason)
    const timer = setTimeout(done, ms)
    function done() {
      signal?.removeEventListener('abort', abort)
      resolve()
    }
    function abort() {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      reject(signal?.reason)
    }
    signal?.addEventListener('abort', abort, { once: true })
  })
}

async function claimManager(db: Database, workerId: string, now: Date, leaseMs: number): Promise<ClaimedManager | null> {
  return db.transaction(async tx => {
    const tracked = await tx.select({ managerId: institutionalManagers.id })
      .from(institutionalManagers)
      .innerJoin(gurus, eq(gurus.managerId, institutionalManagers.id))
      .where(eq(gurus.active, true))
    for (const manager of tracked) await tx.insert(institutionalManagerDiscovery).values({ managerId: manager.managerId, nextCheckAt: now }).onConflictDoNothing()

    const [candidate] = await tx.select({ managerId: institutionalManagerDiscovery.managerId, cik: institutionalManagers.cik })
      .from(institutionalManagerDiscovery)
      .innerJoin(institutionalManagers, eq(institutionalManagers.id, institutionalManagerDiscovery.managerId))
      .innerJoin(gurus, eq(gurus.managerId, institutionalManagers.id))
      .where(and(
        eq(gurus.active, true),
        lte(institutionalManagerDiscovery.nextCheckAt, now),
        or(isNull(institutionalManagerDiscovery.leaseExpiresAt), lte(institutionalManagerDiscovery.leaseExpiresAt, now)),
      ))
      .orderBy(asc(institutionalManagerDiscovery.nextCheckAt), asc(institutionalManagerDiscovery.managerId))
      .limit(1)
      .for('update', { skipLocked: true })
    if (!candidate) return null

    const leaseToken = randomUUID()
    await tx.update(institutionalManagerDiscovery).set({
      status: 'RUNNING', leaseToken, leaseExpiresAt: new Date(now.getTime() + leaseMs), workerId,
      lastCheckAt: now, updatedAt: now,
    }).where(eq(institutionalManagerDiscovery.managerId, candidate.managerId))
    return { managerId: candidate.managerId, cik: candidate.cik, leaseToken }
  })
}

async function heartbeat(db: Database, claim: ClaimedManager, workerId: string, now: Date, leaseMs: number): Promise<boolean> {
  const rows = await db.update(institutionalManagerDiscovery).set({
    leaseExpiresAt: new Date(now.getTime() + leaseMs), updatedAt: now,
  }).where(and(
    eq(institutionalManagerDiscovery.managerId, claim.managerId),
    eq(institutionalManagerDiscovery.leaseToken, claim.leaseToken),
    eq(institutionalManagerDiscovery.workerId, workerId),
  )).returning({ managerId: institutionalManagerDiscovery.managerId })
  return rows.length === 1
}

async function finish(
  db: Database,
  claim: ClaimedManager,
  input: { now: Date; intervalMs: number; retryMs: number; errorCode: string | null; pending: boolean },
): Promise<void> {
  await db.update(institutionalManagerDiscovery).set({
    status: input.errorCode === 'SEC_SOURCE_STALE' ? 'STALE' : input.errorCode ? 'ERROR' : 'READY',
    lastErrorCode: input.errorCode,
    nextCheckAt: new Date(input.now.getTime() + (input.errorCode ? input.retryMs : input.pending ? 60_000 : input.intervalMs)),
    leaseToken: null,
    leaseExpiresAt: null,
    workerId: null,
    updatedAt: input.now,
    ...(input.errorCode ? {} : { lastSuccessAt: input.now }),
  }).where(and(eq(institutionalManagerDiscovery.managerId, claim.managerId), eq(institutionalManagerDiscovery.leaseToken, claim.leaseToken)))
}

export interface GuruFilingDiscoveryWorkerOptions {
  db: Database
  sec: SecEdgarService
  workerId?: string
  intervalMs?: number
  pollMs?: number
  leaseMs?: number
  retryMs?: number
  now?: () => Date
  signal?: AbortSignal
  filingsPerManagerRun?: number
}

export type GuruFilingDiscoveryResult =
  | { status: 'idle' }
  | { status: 'snapshot-rebuilt'; managerId: bigint; periodEnd: string; snapshotStatus: 'READY' | 'PARTIAL' | 'ERROR' }
  | { status: 'analytics-rebuilt'; managerId: bigint; periodEnd: string; eventId: bigint }
  | { status: 'analytics-error'; eventId: bigint }
  | { status: 'consensus-rebuilt'; periodEnd: string; changed: boolean; snapshotId: bigint }
  | { status: 'consensus-error'; periodEnd: string }
  | { status: 'mapping-refreshed'; jobId: bigint; processed: number; completed: boolean }
  | { status: 'follow-notifications'; eventId: bigint; delivered: number }
  | { status: 'stock-notifications'; snapshotId: bigint; delivered: number }
  | { status: 'notification-error' }
  | { status: 'succeeded' | 'stale' | 'failed'; managerId: bigint; discovered: number; processed: number; errorCode?: string }

export async function runPendingSecurityMappingRefreshOnce(db: Database, now = new Date()) {
  const [candidate] = await db.select({ id: institutionalSecurityMappingRefreshJobs.id })
    .from(institutionalSecurityMappingRefreshJobs)
    .where(or(
      eq(institutionalSecurityMappingRefreshJobs.status, 'PENDING'),
      and(eq(institutionalSecurityMappingRefreshJobs.status, 'RUNNING'), lte(institutionalSecurityMappingRefreshJobs.leaseExpiresAt, now)),
    ))
    .orderBy(asc(institutionalSecurityMappingRefreshJobs.id))
    .limit(1)
  if (!candidate) return undefined
  const result = await runSecurityMappingRefreshBatch(db, candidate.id, now)
  if (!result) return undefined
  return {
    jobId: result.job.id,
    processed: result.processedThisRun,
    completed: result.job.status === 'COMPLETE',
  }
}

export async function runGuruFilingDiscoveryOnce(options: GuruFilingDiscoveryWorkerOptions): Promise<GuruFilingDiscoveryResult> {
  const now = options.now ?? (() => new Date())
  const workerId = options.workerId ?? `guru-sec-${process.pid}`
  const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS
  const retryMs = options.retryMs ?? DEFAULT_RETRY_MS
  const intervalMs = options.intervalMs ?? 24 * 60 * 60_000
  const mappingRefresh = await runPendingSecurityMappingRefreshOnce(options.db, now())
  if (mappingRefresh) return { status: 'mapping-refreshed', ...mappingRefresh }
  const claim = await claimManager(options.db, workerId, now(), leaseMs)
  if (!claim) {
    const snapshotRebuild = await runPendingEffectiveSnapshotRebuildOnce(options.db, now())
    if (snapshotRebuild) return { status: 'snapshot-rebuilt', managerId: snapshotRebuild.managerId, periodEnd: snapshotRebuild.periodEnd, snapshotStatus: snapshotRebuild.status }
    const analytics = await runPendingGuruPortfolioAnalyticsOnce(options.db, now())
    if (analytics) return analytics.status === 'READY'
      ? { status: 'analytics-rebuilt', managerId: analytics.managerId, periodEnd: analytics.periodEnd, eventId: analytics.eventId }
      : { status: 'analytics-error', eventId: analytics.eventId }
    const consensus = await runPendingGuruConsensusRebuildOnce(options.db, now())
    if (consensus) return consensus.status === 'READY'
      ? { status: 'consensus-rebuilt', periodEnd: consensus.periodEnd, changed: consensus.changed, snapshotId: consensus.snapshotId }
      : { status: 'consensus-error', periodEnd: consensus.periodEnd }
    // Notification delivery is the last consumer of the same prepared data, so a
    // member is never told about a quarter before its analytics and consensus exist.
    const followNotifications = await runPendingGuruFollowNotificationsOnce(options.db, now())
    if (followNotifications) return followNotifications.status === 'PROCESSED'
      ? { status: 'follow-notifications', eventId: followNotifications.eventId, delivered: followNotifications.delivered }
      : { status: 'notification-error' }
    const stockNotifications = await runPendingGuruStockNotificationsOnce(options.db, now())
    if (stockNotifications) return stockNotifications.status === 'PROCESSED'
      ? { status: 'stock-notifications', snapshotId: stockNotifications.snapshotId, delivered: stockNotifications.delivered }
      : { status: 'notification-error' }
    return { status: 'idle' }
  }

  const leaseLost = new AbortController()
  const signal = options.signal ? AbortSignal.any([options.signal, leaseLost.signal]) : leaseLost.signal
  const timer = setInterval(() => {
    void heartbeat(options.db, claim, workerId, now(), leaseMs).then(owned => { if (!owned) leaseLost.abort(new Error('SEC discovery lease lost')) }, () => leaseLost.abort(new Error('SEC discovery heartbeat failed')))
  }, Math.max(5_000, Math.floor(leaseMs / 3)))
  let discovered = 0
  let processed = 0
  try {
    const discovery = await discover13FFilings({ db: options.db, sec: options.sec, managerId: claim.managerId, cik: claim.cik, now, signal })
    discovered = discovery.discovered
    const result = await processUnfinished13FFilings({
      db: options.db, sec: options.sec, managerId: claim.managerId, cik: claim.cik, now, signal,
      limit: options.filingsPerManagerRun ?? 20,
    })
    processed = result.processed
    const remaining = await options.db.select({ id: institutionalFilings.id }).from(institutionalFilings)
      .where(and(
        eq(institutionalFilings.managerId, claim.managerId),
        inArray(institutionalFilings.status, ['PENDING', 'DOWNLOADED', 'PARSED', 'ERROR']),
        or(isNull(institutionalFilings.errorCode), ne(institutionalFilings.errorCode, 'SEC_RAW_ARTIFACT_EXPIRED')),
      ))
      .limit(1)
    const errorCode = result.errors ? 'SEC_13F_INGESTION_FAILED' : discovery.stale ? 'SEC_SOURCE_STALE' : null
    await finish(options.db, claim, { now: now(), intervalMs, retryMs, errorCode, pending: remaining.length > 0 })
    return { status: errorCode === 'SEC_SOURCE_STALE' ? 'stale' : errorCode ? 'failed' : 'succeeded', managerId: claim.managerId, discovered, processed, ...(errorCode ? { errorCode } : {}) }
  } catch (error) {
    const errorCode = safeErrorCode(error)
    await finish(options.db, claim, { now: now(), intervalMs, retryMs, errorCode, pending: false })
    return { status: 'failed', managerId: claim.managerId, discovered, processed, errorCode }
  } finally {
    clearInterval(timer)
  }
}

export async function runGuruFilingDiscoveryWorker(options: GuruFilingDiscoveryWorkerOptions): Promise<void> {
  const pollMs = options.pollMs ?? 5_000
  if (!Number.isInteger(pollMs) || pollMs < 250 || pollMs > 60_000) throw new Error('GURU_SEC_DISCOVERY_POLL_MS_INVALID')
  while (!options.signal?.aborted) {
    const result = await runGuruFilingDiscoveryOnce(options)
    if (result.status === 'idle') await sleep(pollMs, options.signal).catch(() => undefined)
  }
}
