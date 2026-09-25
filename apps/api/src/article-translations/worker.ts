import { randomUUID } from 'node:crypto'
import { and, asc, eq } from 'drizzle-orm'
import {
  articleTranslationAiProfiles,
  articleTranslationJobs,
  articleTranslationRuntime,
  postTranslations,
  posts,
  type Database,
} from '@diary/db'
import { aiHttpsTransport, type AiTransport } from '../ai-reports/outbound-policy.js'
import { decryptAiSecret } from '../ai-reports/secrets.js'
import { createAiTranslationProvider } from './ai-provider.js'
import { createEdgeTranslationProvider, type EdgeTranslationProviderOptions } from './edge-provider.js'
import { errorCode, safeErrorContext } from '../diagnostics.js'
import { translateMarkdownDocuments } from './markdown.js'
import { TranslationProviderError, type ArticleTranslationLocale, type TranslationProvider } from './types.js'

const DEFAULT_LEASE_MS = 45_000
const DEFAULT_HEARTBEAT_MS = 5_000
const MAX_EDGE_CIRCUIT_MS = 60 * 60_000
const EDGE_CIRCUIT_THRESHOLD = 3
const EDGE_FAILURE_WINDOW_MS = 30 * 60_000
const SAFE_CONNECTION_ERROR_CODES = new Set(['ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'ECONNREFUSED'])
const RECOVERABLE_DATABASE_ERROR_CODES = new Set(['40P01', '40001', '53300', '55P03', '57P01', '57P02', '57P03'])

type JobRow = typeof articleTranslationJobs.$inferSelect
type PostRow = typeof posts.$inferSelect
type DbTransaction = Parameters<Parameters<Database['transaction']>[0]>[0]

interface ClaimedJob {
  job: JobRow
  leaseToken: string
}

export interface ArticleTranslationWorkerOptions {
  db: Database
  workerId?: string
  now?: () => Date
  leaseMs?: number
  heartbeatMs?: number
  signal?: AbortSignal
  aiTransport?: AiTransport
  edgeProviderOptions?: EdgeTranslationProviderOptions
  logger?: { error(message: string, context: Record<string, unknown>): void }
}

export type ArticleTranslationWorkerResult =
  | { status: 'idle' }
  | { status: 'succeeded' | 'failed' | 'stale'; jobId: bigint; errorCode?: string }

function activeLeaseFields(token: string, workerId: string, jobId: bigint, expiresAt: Date) {
  return { activeJobId: jobId, activeLeaseToken: token, activeLeaseExpiresAt: expiresAt, workerId }
}

function jobIsCurrent(job: JobRow, post: PostRow): boolean {
  return job.sourceLocale === post.sourceLocale
    && job.sourceRevision === post.sourceRevision
    && job.sourceHash === post.sourceHash
    && job.targetLocale !== post.sourceLocale
}

function isDatabaseError(error: unknown): boolean {
  const code = errorCode(error)
  return Boolean(code && (/^[0-9A-Z]{5}$/.test(code) || SAFE_CONNECTION_ERROR_CODES.has(code)))
}

function isRecoverableDatabaseError(error: unknown): boolean {
  const code = errorCode(error)
  return Boolean(code && (code.startsWith('08') || RECOVERABLE_DATABASE_ERROR_CODES.has(code) || SAFE_CONNECTION_ERROR_CODES.has(code)))
}

function setWorkerStage(error: unknown, stage: string): unknown {
  if (error instanceof Error) Object.assign(error, { workerStage: stage })
  return error
}

function workerStage(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('workerStage' in error)) return undefined
  const stage = (error as { workerStage?: unknown }).workerStage
  return typeof stage === 'string' ? stage : undefined
}

async function transactionWithRetry<T>(db: Database, work: (tx: DbTransaction) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await db.transaction(work)
    } catch (error) {
      const code = errorCode(error)
      if (attempt >= 2 || (code !== '40P01' && code !== '40001')) throw error
      await new Promise(resolve => setTimeout(resolve, 10 * (attempt + 1)))
    }
  }
}

function logWorkerError(options: ArticleTranslationWorkerOptions, stage: string, error: unknown, claimed?: ClaimedJob, provider?: string, safeCode?: string) {
  const logger = options.logger ?? console
  logger.error('Article translation worker operation failed', {
    operation: 'article_translation_worker',
    stage,
    workerId: options.workerId ?? `article-translation-${process.pid}`,
    ...(claimed ? { jobId: claimed.job.id.toString(), provider: claimed.job.provider } : provider ? { provider } : {}),
    ...safeErrorContext(error, { fallbackCode: safeCode }),
  })
}

class TranslationLeaseLostError extends Error {}

async function markJobStale(db: Database, claimed: ClaimedJob, now: Date): Promise<void> {
  await transactionWithRetry(db, async tx => {
    const [runtime] = await tx.select().from(articleTranslationRuntime)
      .where(eq(articleTranslationRuntime.singleton, 'default')).for('update')
    if (!runtime || runtime.activeJobId !== claimed.job.id || runtime.activeLeaseToken !== claimed.leaseToken) return
    const [job] = await tx.select().from(articleTranslationJobs)
      .where(and(eq(articleTranslationJobs.id, claimed.job.id), eq(articleTranslationJobs.status, 'running'), eq(articleTranslationJobs.leaseToken, claimed.leaseToken)))
      .for('update')
    if (!job) return
    await tx.update(articleTranslationJobs).set({
      status: 'stale',
      error: 'ARTICLE_SOURCE_CHANGED',
      progress: 100,
      leaseToken: null,
      workerId: null,
      leaseExpiresAt: null,
      finishedAt: now,
      updatedAt: now,
    }).where(eq(articleTranslationJobs.id, job.id))
    await tx.update(articleTranslationRuntime).set({
      activeJobId: null,
      activeLeaseToken: null,
      activeLeaseExpiresAt: null,
      workerId: null,
      workerHeartbeatAt: now,
      updatedAt: now,
    }).where(eq(articleTranslationRuntime.singleton, 'default'))
  })
}

async function claimNextJob(db: Database, workerId: string, now: Date, leaseMs: number): Promise<ClaimedJob | null> {
  await db.insert(articleTranslationRuntime).values({ singleton: 'default', updatedAt: now }).onConflictDoNothing()
  return transactionWithRetry(db, async tx => {
    const [runtime] = await tx.select().from(articleTranslationRuntime).where(eq(articleTranslationRuntime.singleton, 'default')).for('update')
    if (!runtime) return null
    if (runtime.activeJobId && runtime.activeLeaseToken && runtime.activeLeaseExpiresAt) {
      if (runtime.activeLeaseExpiresAt > now) {
        await tx.update(articleTranslationRuntime).set({ workerHeartbeatAt: now, updatedAt: now }).where(eq(articleTranslationRuntime.singleton, 'default'))
        return null
      }
      const [expired] = await tx.select().from(articleTranslationJobs).where(eq(articleTranslationJobs.id, runtime.activeJobId)).for('update')
      if (expired?.status === 'running' && expired.leaseToken === runtime.activeLeaseToken) {
        const mayRetry = expired.provider === 'edge' && expired.retryCount < expired.maxRetries
        const safeAiRetry = expired.provider === 'ai' && expired.dispatchedAt === null
        const recover = mayRetry || safeAiRetry
        await tx.update(articleTranslationJobs).set({
          status: recover ? 'queued' : 'failed',
          retryCount: recover ? expired.retryCount + 1 : expired.retryCount,
          error: recover ? 'WORKER_LEASE_EXPIRED' : expired.provider === 'ai' && expired.dispatchedAt ? 'AI_PROVIDER_OUTCOME_UNKNOWN' : 'WORKER_LEASE_EXPIRED',
          leaseToken: null,
          workerId: null,
          leaseExpiresAt: null,
          heartbeatAt: now,
          finishedAt: recover ? null : now,
          updatedAt: now,
        }).where(and(eq(articleTranslationJobs.id, expired.id), eq(articleTranslationJobs.status, 'running')))
        await tx.update(articleTranslationRuntime).set({ activeJobId: null, activeLeaseToken: null, activeLeaseExpiresAt: null, workerId: null, workerHeartbeatAt: now, updatedAt: now }).where(eq(articleTranslationRuntime.singleton, 'default'))
      } else {
        await tx.update(articleTranslationRuntime).set({ activeJobId: null, activeLeaseToken: null, activeLeaseExpiresAt: null, workerId: null, workerHeartbeatAt: now, updatedAt: now }).where(eq(articleTranslationRuntime.singleton, 'default'))
      }
    }

    const [job] = await tx.select().from(articleTranslationJobs)
      .where(eq(articleTranslationJobs.status, 'queued'))
      .orderBy(asc(articleTranslationJobs.queuedAt), asc(articleTranslationJobs.id))
      .limit(1)
      .for('update', { skipLocked: true })
    if (!job) {
      await tx.update(articleTranslationRuntime).set({ workerId, workerHeartbeatAt: now, updatedAt: now }).where(eq(articleTranslationRuntime.singleton, 'default'))
      return null
    }
    const [post] = await tx.select().from(posts).where(eq(posts.id, job.postId)).for('update')
    if (!post || !jobIsCurrent(job, post)) {
      await tx.update(articleTranslationJobs).set({ status: 'stale', error: 'ARTICLE_SOURCE_CHANGED', progress: 100, finishedAt: now, updatedAt: now }).where(eq(articleTranslationJobs.id, job.id))
      await tx.update(articleTranslationRuntime).set({ workerId, workerHeartbeatAt: now, updatedAt: now }).where(eq(articleTranslationRuntime.singleton, 'default'))
      return null
    }
    const token = randomUUID()
    const expiresAt = new Date(now.getTime() + leaseMs)
    const [claimed] = await tx.update(articleTranslationJobs).set({
      status: 'running',
      progress: 5,
      error: null,
      leaseToken: token,
      workerId,
      leaseExpiresAt: expiresAt,
      heartbeatAt: now,
      startedAt: job.startedAt ?? now,
      updatedAt: now,
    }).where(and(eq(articleTranslationJobs.id, job.id), eq(articleTranslationJobs.status, 'queued'))).returning()
    if (!claimed) return null
    await tx.update(articleTranslationRuntime).set({ ...activeLeaseFields(token, workerId, job.id, expiresAt), workerHeartbeatAt: now, updatedAt: now }).where(eq(articleTranslationRuntime.singleton, 'default'))
    return { job: claimed, leaseToken: token }
  })
}

async function heartbeat(db: Database, claimed: ClaimedJob, workerId: string, now: Date, leaseMs: number): Promise<boolean> {
  return transactionWithRetry(db, async tx => {
    const [runtime] = await tx.select().from(articleTranslationRuntime)
      .where(eq(articleTranslationRuntime.singleton, 'default')).for('update')
    if (!runtime || runtime.activeJobId !== claimed.job.id || runtime.activeLeaseToken !== claimed.leaseToken) return false
    const expiresAt = new Date(now.getTime() + leaseMs)
    const [updated] = await tx.update(articleTranslationJobs).set({ heartbeatAt: now, leaseExpiresAt: expiresAt, updatedAt: now })
      .where(and(eq(articleTranslationJobs.id, claimed.job.id), eq(articleTranslationJobs.status, 'running'), eq(articleTranslationJobs.leaseToken, claimed.leaseToken)))
      .returning({ id: articleTranslationJobs.id })
    if (!updated) return false
    await tx.update(articleTranslationRuntime).set({
      workerId,
      workerHeartbeatAt: now,
      activeLeaseExpiresAt: expiresAt,
      updatedAt: now,
    }).where(eq(articleTranslationRuntime.singleton, 'default'))
    return true
  })
}

async function setProgress(db: Database, claimed: ClaimedJob, progress: number, now: Date, patch: Partial<Pick<JobRow, 'dispatchedAt'>> = {}) {
  const [updated] = await db.update(articleTranslationJobs).set({ ...patch, progress, heartbeatAt: now, updatedAt: now })
    .where(and(eq(articleTranslationJobs.id, claimed.job.id), eq(articleTranslationJobs.status, 'running'), eq(articleTranslationJobs.leaseToken, claimed.leaseToken)))
    .returning({ id: articleTranslationJobs.id })
  return Boolean(updated)
}

function publicProviderError(error: unknown): string {
  if (error instanceof TranslationProviderError) return error.code
  if (error instanceof Error && /^[A-Z][A-Z0-9_]{2,79}$/.test(error.message)) return error.message
  return 'TRANSLATION_PROVIDER_UNAVAILABLE'
}

async function updateEdgeCircuit(db: Database, errorCode: string | null, now: Date) {
  await db.insert(articleTranslationRuntime).values({ singleton: 'default', updatedAt: now }).onConflictDoNothing()
  await transactionWithRetry(db, async tx => {
    const [runtime] = await tx.select().from(articleTranslationRuntime)
      .where(eq(articleTranslationRuntime.singleton, 'default')).for('update')
    if (!runtime) return
    if (errorCode === null) {
      await tx.update(articleTranslationRuntime).set({ edgeFailureCount: 0, edgeDisabledUntil: null, edgeLastErrorCode: null, edgeLastFailureAt: null, updatedAt: now }).where(eq(articleTranslationRuntime.singleton, 'default'))
      return
    }
    const inWindow = runtime.edgeLastFailureAt && now.getTime() - runtime.edgeLastFailureAt.getTime() <= EDGE_FAILURE_WINDOW_MS
    const failureCount = inWindow ? runtime.edgeFailureCount + 1 : 1
    const circuitDelay = failureCount < EDGE_CIRCUIT_THRESHOLD
      ? null
      : Math.min(MAX_EDGE_CIRCUIT_MS, 60_000 * (2 ** Math.min(5, failureCount - EDGE_CIRCUIT_THRESHOLD)))
    await tx.update(articleTranslationRuntime).set({
      edgeFailureCount: failureCount,
      edgeDisabledUntil: circuitDelay === null ? runtime.edgeDisabledUntil : new Date(now.getTime() + circuitDelay),
      edgeLastErrorCode: errorCode,
      edgeLastFailureAt: now,
      updatedAt: now,
    }).where(eq(articleTranslationRuntime.singleton, 'default'))
  })
}

async function completeJob(db: Database, claimed: ClaimedJob, result: {
  title: string
  excerpt: string | null
  content: string
  provider: 'edge' | 'ai'
  model: string | null
  promptVersion: string | null
  usage: unknown
}, now: Date): Promise<'succeeded' | 'stale'> {
  return transactionWithRetry(db, async tx => {
    const [runtime] = await tx.select().from(articleTranslationRuntime)
      .where(eq(articleTranslationRuntime.singleton, 'default')).for('update')
    if (!runtime || runtime.activeJobId !== claimed.job.id || runtime.activeLeaseToken !== claimed.leaseToken) return 'stale'
    const [job] = await tx.select().from(articleTranslationJobs).where(and(eq(articleTranslationJobs.id, claimed.job.id), eq(articleTranslationJobs.status, 'running'), eq(articleTranslationJobs.leaseToken, claimed.leaseToken))).for('update')
    if (!job) return 'stale'
    const [post] = await tx.select().from(posts).where(eq(posts.id, job.postId)).for('update')
    if (!post || !jobIsCurrent(job, post)) {
      await tx.update(articleTranslationJobs).set({ status: 'stale', error: 'ARTICLE_SOURCE_CHANGED', progress: 100, resultJson: result, usageJson: result.usage, leaseToken: null, workerId: null, leaseExpiresAt: null, finishedAt: now, updatedAt: now }).where(eq(articleTranslationJobs.id, job.id))
      await tx.update(articleTranslationRuntime).set({ activeJobId: null, activeLeaseToken: null, activeLeaseExpiresAt: null, workerId: null, workerHeartbeatAt: now, updatedAt: now }).where(and(eq(articleTranslationRuntime.singleton, 'default'), eq(articleTranslationRuntime.activeJobId, job.id), eq(articleTranslationRuntime.activeLeaseToken, claimed.leaseToken)))
      return 'stale'
    }
    const [existing] = await tx.select().from(postTranslations).where(and(eq(postTranslations.postId, post.id), eq(postTranslations.locale, job.targetLocale))).for('update')
    const keepUnpublished = existing?.status === 'unpublished'
    const draftVersion = (existing?.draftVersion ?? 0) + 1
    const translationValues = {
      status: keepUnpublished ? 'unpublished' as const : 'pending_review' as const,
      draftTitle: result.title,
      draftExcerpt: result.excerpt,
      draftContent: result.content,
      draftVersion,
      draftSourceRevision: post.sourceRevision,
      draftSourceHash: post.sourceHash,
      draftProvider: result.provider,
      draftModel: result.model,
      draftPromptVersion: result.promptVersion,
      reviewedBy: null,
      reviewedAt: null,
      reviewedDraftVersion: null,
      updatedAt: now,
    }
    if (existing) await tx.update(postTranslations).set(translationValues).where(eq(postTranslations.id, existing.id))
    else await tx.insert(postTranslations).values({ postId: post.id, locale: job.targetLocale, ...translationValues, createdAt: now })
    await tx.update(articleTranslationJobs).set({ status: 'succeeded', progress: 100, error: null, resultJson: result, usageJson: result.usage, leaseToken: null, workerId: null, leaseExpiresAt: null, finishedAt: now, updatedAt: now }).where(eq(articleTranslationJobs.id, job.id))
    await tx.update(articleTranslationRuntime).set({ activeJobId: null, activeLeaseToken: null, activeLeaseExpiresAt: null, workerId: null, workerHeartbeatAt: now, updatedAt: now }).where(and(eq(articleTranslationRuntime.singleton, 'default'), eq(articleTranslationRuntime.activeJobId, job.id), eq(articleTranslationRuntime.activeLeaseToken, claimed.leaseToken)))
    return 'succeeded'
  })
}

async function failJob(db: Database, claimed: ClaimedJob, errorCode: string, now: Date): Promise<boolean> {
  return transactionWithRetry(db, async tx => {
    const [runtime] = await tx.select().from(articleTranslationRuntime)
      .where(eq(articleTranslationRuntime.singleton, 'default')).for('update')
    if (!runtime || runtime.activeJobId !== claimed.job.id || runtime.activeLeaseToken !== claimed.leaseToken) return false
    const [job] = await tx.select({ id: articleTranslationJobs.id }).from(articleTranslationJobs)
      .where(and(eq(articleTranslationJobs.id, claimed.job.id), eq(articleTranslationJobs.status, 'running'), eq(articleTranslationJobs.leaseToken, claimed.leaseToken))).for('update')
    if (!job) return false
    const [finished] = await tx.update(articleTranslationJobs).set({
      status: 'failed',
      error: errorCode,
      leaseToken: null,
      workerId: null,
      leaseExpiresAt: null,
      finishedAt: now,
      updatedAt: now,
    }).where(and(eq(articleTranslationJobs.id, claimed.job.id), eq(articleTranslationJobs.status, 'running'), eq(articleTranslationJobs.leaseToken, claimed.leaseToken))).returning({ id: articleTranslationJobs.id })
    if (!finished) return false
    await tx.update(articleTranslationRuntime).set({ activeJobId: null, activeLeaseToken: null, activeLeaseExpiresAt: null, workerId: null, workerHeartbeatAt: now, updatedAt: now })
      .where(eq(articleTranslationRuntime.singleton, 'default'))
    return true
  })
}

async function loadProvider(options: ArticleTranslationWorkerOptions, job: JobRow, post: PostRow): Promise<{ provider: TranslationProvider; promptVersion: string | null }> {
  if (job.provider === 'edge') {
    if (post.access !== 'PUBLIC') throw new TranslationProviderError('TRANSLATION_PRIVACY_RESTRICTED')
    const [runtime] = await options.db.select().from(articleTranslationRuntime).where(eq(articleTranslationRuntime.singleton, 'default')).limit(1)
    const now = (options.now ?? (() => new Date()))()
    if (runtime?.edgeDisabledUntil && runtime.edgeDisabledUntil > now) throw new TranslationProviderError('TRANSLATION_PROVIDER_DISABLED')
    return { provider: createEdgeTranslationProvider(options.edgeProviderOptions), promptVersion: null }
  }
  if (job.aiProfileId === null) throw new TranslationProviderError('TRANSLATION_CONFIGURATION_INVALID')
  const [config] = await options.db.select().from(articleTranslationAiProfiles).where(eq(articleTranslationAiProfiles.id, job.aiProfileId)).limit(1)
  if (!config?.enabled || !config.baseUrl || !config.model || !config.encryptedApiKey || config.revision !== job.configRevision) {
    throw new TranslationProviderError('TRANSLATION_CONFIGURATION_INVALID')
  }
  return {
    provider: createAiTranslationProvider({
      enabled: config.enabled,
      baseUrl: config.baseUrl,
      model: config.model,
      apiKey: decryptAiSecret(config.encryptedApiKey, 'article-translation-api-key'),
      timeoutMs: config.timeoutMs,
      maxTokens: config.maxTokens,
      maxCallsPerJob: config.maxCallsPerJob,
      tokenBudget: config.tokenBudgetPerJob,
      prompt: config.translationPrompt,
      promptVersion: config.promptVersion,
      allowMemberArticles: config.allowMemberArticles,
    }, { transport: options.aiTransport ?? aiHttpsTransport }),
    promptVersion: config.promptVersion,
  }
}

async function translateClaimed(options: ArticleTranslationWorkerOptions, claimed: ClaimedJob, now: () => Date, workerId: string, leaseMs: number): Promise<ArticleTranslationWorkerResult> {
  const { db } = options
  let post: PostRow | undefined
  try { [post] = await db.select().from(posts).where(eq(posts.id, claimed.job.postId)).limit(1) }
  catch (error) { throw setWorkerStage(error, 'load_source_article') }
  if (!post || !jobIsCurrent(claimed.job, post)) {
    try { await markJobStale(db, claimed, now()) }
    catch (error) { throw setWorkerStage(error, 'mark_stale_before_translation') }
    return { status: 'stale', jobId: claimed.job.id }
  }
  const heartbeatAbort = new AbortController()
  const signal = options.signal ? AbortSignal.any([options.signal, heartbeatAbort.signal]) : heartbeatAbort.signal
  const heartbeatMs = options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS
  let heartbeatError: unknown
  let leaseLost = false
  const timer = setInterval(() => {
    void heartbeat(db, claimed, workerId, now(), leaseMs).then(ok => {
      if (!ok) { leaseLost = true; heartbeatAbort.abort() }
    }).catch(error => {
      heartbeatError = setWorkerStage(error, 'heartbeat_database')
      heartbeatAbort.abort()
    })
  }, heartbeatMs)
  let stage = 'provider_configuration'
  try {
    const configured = await loadProvider(options, claimed.job, post)
    stage = 'record_dispatch'
    if (!await setProgress(db, claimed, 12, now())) throw new TranslationLeaseLostError('ARTICLE_TRANSLATION_LEASE_LOST')
    if (!await setProgress(db, claimed, 20, now(), { dispatchedAt: claimed.job.dispatchedAt ?? now() })) throw new TranslationLeaseLostError('ARTICLE_TRANSLATION_LEASE_LOST')
    const provider = configured.provider
    const targetLocale = claimed.job.targetLocale as ArticleTranslationLocale
    const sourceLocale = claimed.job.sourceLocale as ArticleTranslationLocale
    stage = 'provider_request'
    const documents = await translateMarkdownDocuments([
      { key: 'title', markdown: post.title },
      ...(post.excerpt ? [{ key: 'excerpt', markdown: post.excerpt }] : []),
      { key: 'content', markdown: post.content },
    ], { sourceLocale, targetLocale, articleAccess: post.access, signal }, provider)
    if (heartbeatError) throw heartbeatError
    if (leaseLost) return { status: 'stale', jobId: claimed.job.id, errorCode: 'ARTICLE_TRANSLATION_LEASE_LOST' }
    if (options.signal?.aborted) return { status: 'stale', jobId: claimed.job.id, errorCode: 'ARTICLE_TRANSLATION_WORKER_INTERRUPTED' }
    if (signal.aborted) throw new TranslationProviderError('TRANSLATION_PROVIDER_TIMEOUT')
    stage = 'record_progress'
    if (!await setProgress(db, claimed, 85, now())) throw new TranslationLeaseLostError('ARTICLE_TRANSLATION_LEASE_LOST')
    const payload = {
      title: documents.documents.title ?? post.title,
      excerpt: post.excerpt ? documents.documents.excerpt ?? post.excerpt : null,
      content: documents.documents.content ?? post.content,
      provider: documents.provider,
      model: documents.model,
      promptVersion: documents.provider === 'ai' ? configured.promptVersion : null,
      usage: documents.usage,
    }
    stage = 'persist_result'
    const status = await completeJob(db, claimed, payload, now())
    if (status === 'succeeded' && documents.provider === 'edge') {
      try { await updateEdgeCircuit(db, null, now()) }
      catch (error) { logWorkerError(options, 'reset_edge_circuit', error, claimed) }
    }
    return status === 'succeeded' ? { status: 'succeeded', jobId: claimed.job.id } : { status: 'stale', jobId: claimed.job.id }
  } catch (error) {
    if (heartbeatError) {
      throw heartbeatError
    }
    if (leaseLost || error instanceof TranslationLeaseLostError) {
      return { status: 'stale', jobId: claimed.job.id, errorCode: 'ARTICLE_TRANSLATION_LEASE_LOST' }
    }
    if (options.signal?.aborted) return { status: 'stale', jobId: claimed.job.id, errorCode: 'ARTICLE_TRANSLATION_WORKER_INTERRUPTED' }
    if (isDatabaseError(error)) {
      throw setWorkerStage(error, stage)
    }
    const code = publicProviderError(error)
    stage = 'record_provider_failure'
    let finished: boolean
    try { finished = await failJob(db, claimed, code, now()) }
    catch (recordError) { throw setWorkerStage(recordError, stage) }
    if (!finished) return { status: 'failed', jobId: claimed.job.id, errorCode: 'ARTICLE_TRANSLATION_LEASE_LOST' }
    if (claimed.job.provider === 'edge') {
      stage = 'record_edge_provider_failure'
      try { await updateEdgeCircuit(db, code, now()) }
      catch (recordError) { logWorkerError(options, stage, recordError, claimed) }
    }
    logWorkerError(options, 'provider_failure', error, claimed, undefined, code)
    return { status: 'failed', jobId: claimed.job.id, errorCode: code }
  } finally {
    clearInterval(timer)
    heartbeatAbort.abort()
    try {
      await db.update(articleTranslationRuntime).set({ workerId, workerHeartbeatAt: now(), updatedAt: now() })
        .where(and(eq(articleTranslationRuntime.singleton, 'default'), eq(articleTranslationRuntime.activeJobId, claimed.job.id), eq(articleTranslationRuntime.activeLeaseToken, claimed.leaseToken)))
    } catch (error) {
      logWorkerError(options, 'cleanup_heartbeat', error, claimed)
    }
  }
}

export async function runArticleTranslationOnce(options: ArticleTranslationWorkerOptions): Promise<ArticleTranslationWorkerResult> {
  const now = options.now ?? (() => new Date())
  const workerId = options.workerId ?? `article-translation-${process.pid}`
  const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS
  if (!Number.isInteger(leaseMs) || leaseMs < 5_000 || leaseMs > 300_000) throw new Error('ARTICLE_TRANSLATION_WORKER_CONFIGURATION_INVALID')
  let claimed: ClaimedJob | null
  try { claimed = await claimNextJob(options.db, workerId, now(), leaseMs) }
  catch (error) { logWorkerError(options, 'claim_job', error); throw error }
  if (!claimed) return { status: 'idle' }
  try { return await translateClaimed(options, claimed, now, workerId, leaseMs) }
  catch (error) { logWorkerError(options, workerStage(error) ?? 'process_job', error, claimed); throw error }
}

export async function runArticleTranslationWorker(options: ArticleTranslationWorkerOptions & { pollMs?: number }): Promise<void> {
  const pollMs = options.pollMs ?? 1_000
  if (!Number.isInteger(pollMs) || pollMs < 250 || pollMs > 60_000) throw new Error('ARTICLE_TRANSLATION_WORKER_CONFIGURATION_INVALID')
  while (!options.signal?.aborted) {
    try { await runArticleTranslationOnce(options) }
    catch (error) { if (!isRecoverableDatabaseError(error)) throw error }
    if (options.signal?.aborted) break
    await new Promise<void>(resolve => {
      const signal = options.signal
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort)
        resolve()
      }, pollMs)
      const onAbort = () => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
        resolve()
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      if (signal?.aborted) onAbort()
    })
  }
}
