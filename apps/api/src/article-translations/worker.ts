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
import { translateMarkdownDocuments } from './markdown.js'
import { TranslationProviderError, type ArticleTranslationLocale, type TranslationProvider } from './types.js'

const DEFAULT_LEASE_MS = 45_000
const DEFAULT_HEARTBEAT_MS = 5_000
const MAX_EDGE_CIRCUIT_MS = 60 * 60_000
const EDGE_CIRCUIT_THRESHOLD = 3
const EDGE_FAILURE_WINDOW_MS = 30 * 60_000

type JobRow = typeof articleTranslationJobs.$inferSelect
type PostRow = typeof posts.$inferSelect

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
}

export type ArticleTranslationWorkerResult =
  | { status: 'idle' }
  | { status: 'succeeded' | 'failed' | 'stale'; jobId: bigint; errorCode?: string }

function activeLeaseFields(token: string, workerId: string, jobId: bigint, expiresAt: Date) {
  return { activeJobId: jobId, activeLeaseToken: token, activeLeaseExpiresAt: expiresAt, workerId }
}

async function clearLease(db: Database, jobId: bigint, token: string, now: Date) {
  await db.update(articleTranslationRuntime).set({
    activeJobId: null,
    activeLeaseToken: null,
    activeLeaseExpiresAt: null,
    workerId: null,
    workerHeartbeatAt: now,
    updatedAt: now,
  }).where(and(eq(articleTranslationRuntime.singleton, 'default'), eq(articleTranslationRuntime.activeJobId, jobId), eq(articleTranslationRuntime.activeLeaseToken, token)))
}

function jobIsCurrent(job: JobRow, post: PostRow): boolean {
  return job.sourceLocale === post.sourceLocale
    && job.sourceRevision === post.sourceRevision
    && job.sourceHash === post.sourceHash
    && job.targetLocale !== post.sourceLocale
}

async function claimNextJob(db: Database, workerId: string, now: Date, leaseMs: number): Promise<ClaimedJob | null> {
  await db.insert(articleTranslationRuntime).values({ singleton: 'default', updatedAt: now }).onConflictDoNothing()
  return db.transaction(async tx => {
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
  return db.transaction(async tx => {
    const expiresAt = new Date(now.getTime() + leaseMs)
    const [updated] = await tx.update(articleTranslationJobs).set({ heartbeatAt: now, leaseExpiresAt: expiresAt, updatedAt: now })
      .where(and(eq(articleTranslationJobs.id, claimed.job.id), eq(articleTranslationJobs.status, 'running'), eq(articleTranslationJobs.leaseToken, claimed.leaseToken)))
      .returning({ id: articleTranslationJobs.id })
    if (!updated) return false
    const [runtime] = await tx.update(articleTranslationRuntime).set({
      workerId,
      workerHeartbeatAt: now,
      activeLeaseExpiresAt: expiresAt,
      updatedAt: now,
    }).where(and(eq(articleTranslationRuntime.singleton, 'default'), eq(articleTranslationRuntime.activeJobId, claimed.job.id), eq(articleTranslationRuntime.activeLeaseToken, claimed.leaseToken))).returning({ activeJobId: articleTranslationRuntime.activeJobId })
    return Boolean(runtime)
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
  const [runtime] = await db.select().from(articleTranslationRuntime).where(eq(articleTranslationRuntime.singleton, 'default')).limit(1)
  if (!runtime) return
  if (errorCode === null) {
    await db.update(articleTranslationRuntime).set({ edgeFailureCount: 0, edgeDisabledUntil: null, edgeLastErrorCode: null, edgeLastFailureAt: null, updatedAt: now }).where(eq(articleTranslationRuntime.singleton, 'default'))
    return
  }
  const inWindow = runtime.edgeLastFailureAt && now.getTime() - runtime.edgeLastFailureAt.getTime() <= EDGE_FAILURE_WINDOW_MS
  const failureCount = inWindow ? runtime.edgeFailureCount + 1 : 1
  const circuitDelay = failureCount < EDGE_CIRCUIT_THRESHOLD
    ? null
    : Math.min(MAX_EDGE_CIRCUIT_MS, 60_000 * (2 ** Math.min(5, failureCount - EDGE_CIRCUIT_THRESHOLD)))
  await db.update(articleTranslationRuntime).set({
    edgeFailureCount: failureCount,
    edgeDisabledUntil: circuitDelay === null ? runtime.edgeDisabledUntil : new Date(now.getTime() + circuitDelay),
    edgeLastErrorCode: errorCode,
    edgeLastFailureAt: now,
    updatedAt: now,
  }).where(eq(articleTranslationRuntime.singleton, 'default'))
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
  return db.transaction(async tx => {
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
  return db.transaction(async tx => {
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
      .where(and(eq(articleTranslationRuntime.singleton, 'default'), eq(articleTranslationRuntime.activeJobId, claimed.job.id), eq(articleTranslationRuntime.activeLeaseToken, claimed.leaseToken)))
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
  const [post] = await db.select().from(posts).where(eq(posts.id, claimed.job.postId)).limit(1)
  if (!post || !jobIsCurrent(claimed.job, post)) {
    await db.update(articleTranslationJobs).set({ status: 'stale', error: 'ARTICLE_SOURCE_CHANGED', progress: 100, leaseToken: null, workerId: null, leaseExpiresAt: null, finishedAt: now(), updatedAt: now() })
      .where(and(eq(articleTranslationJobs.id, claimed.job.id), eq(articleTranslationJobs.leaseToken, claimed.leaseToken)))
    await clearLease(db, claimed.job.id, claimed.leaseToken, now())
    return { status: 'stale', jobId: claimed.job.id }
  }
  const heartbeatAbort = new AbortController()
  const signal = options.signal ? AbortSignal.any([options.signal, heartbeatAbort.signal]) : heartbeatAbort.signal
  const heartbeatMs = options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS
  const timer = setInterval(() => {
    void heartbeat(db, claimed, workerId, now(), leaseMs).then(ok => { if (!ok) heartbeatAbort.abort() }).catch(() => heartbeatAbort.abort())
  }, heartbeatMs)
  try {
    const configured = await loadProvider(options, claimed.job, post)
    if (!await setProgress(db, claimed, 12, now())) throw new Error('ARTICLE_TRANSLATION_LEASE_LOST')
    if (!await setProgress(db, claimed, 20, now(), { dispatchedAt: claimed.job.dispatchedAt ?? now() })) throw new Error('ARTICLE_TRANSLATION_LEASE_LOST')
    const provider = configured.provider
    const targetLocale = claimed.job.targetLocale as ArticleTranslationLocale
    const sourceLocale = claimed.job.sourceLocale as ArticleTranslationLocale
    const documents = await translateMarkdownDocuments([
      { key: 'title', markdown: post.title },
      ...(post.excerpt ? [{ key: 'excerpt', markdown: post.excerpt }] : []),
      { key: 'content', markdown: post.content },
    ], { sourceLocale, targetLocale, articleAccess: post.access, signal }, provider)
    if (signal.aborted) throw new TranslationProviderError('TRANSLATION_PROVIDER_TIMEOUT')
    await setProgress(db, claimed, 85, now())
    const payload = {
      title: documents.documents.title ?? post.title,
      excerpt: post.excerpt ? documents.documents.excerpt ?? post.excerpt : null,
      content: documents.documents.content ?? post.content,
      provider: documents.provider,
      model: documents.model,
      promptVersion: documents.provider === 'ai' ? configured.promptVersion : null,
      usage: documents.usage,
    }
    const status = await completeJob(db, claimed, payload, now())
    if (documents.provider === 'edge') await updateEdgeCircuit(db, null, now())
    return status === 'succeeded' ? { status: 'succeeded', jobId: claimed.job.id } : { status: 'stale', jobId: claimed.job.id }
  } catch (error) {
    const code = publicProviderError(error)
    if (claimed.job.provider === 'edge') await updateEdgeCircuit(db, code, now())
    const finished = await failJob(db, claimed, code, now())
    return { status: 'failed', jobId: claimed.job.id, errorCode: finished ? code : 'ARTICLE_TRANSLATION_LEASE_LOST' }
  } finally {
    clearInterval(timer)
    heartbeatAbort.abort()
    await db.update(articleTranslationRuntime).set({ workerId, workerHeartbeatAt: now(), updatedAt: now() })
      .where(and(eq(articleTranslationRuntime.singleton, 'default'), eq(articleTranslationRuntime.activeJobId, claimed.job.id), eq(articleTranslationRuntime.activeLeaseToken, claimed.leaseToken)))
  }
}

export async function runArticleTranslationOnce(options: ArticleTranslationWorkerOptions): Promise<ArticleTranslationWorkerResult> {
  const now = options.now ?? (() => new Date())
  const workerId = options.workerId ?? `article-translation-${process.pid}`
  const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS
  if (!Number.isInteger(leaseMs) || leaseMs < 5_000 || leaseMs > 300_000) throw new Error('ARTICLE_TRANSLATION_WORKER_CONFIGURATION_INVALID')
  const claimed = await claimNextJob(options.db, workerId, now(), leaseMs)
  if (!claimed) return { status: 'idle' }
  return translateClaimed(options, claimed, now, workerId, leaseMs)
}

export async function runArticleTranslationWorker(options: ArticleTranslationWorkerOptions & { pollMs?: number }): Promise<void> {
  const pollMs = options.pollMs ?? 1_000
  if (!Number.isInteger(pollMs) || pollMs < 250 || pollMs > 60_000) throw new Error('ARTICLE_TRANSLATION_WORKER_CONFIGURATION_INVALID')
  while (!options.signal?.aborted) {
    await runArticleTranslationOnce(options)
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
