import { randomUUID } from 'node:crypto'
import { and, desc, eq, isNull, or } from 'drizzle-orm'
import { articleTranslationJobs, posts, type Database } from '@diary/db'

export interface EnqueueArticleTranslationInput {
  postId: bigint
  targetLocale: 'zh-TW' | 'zh-CN' | 'en'
  provider: 'edge' | 'ai'
  requestedBy: bigint | null
  aiProfileId?: bigint | null
  aiProfileName?: string | null
  configRevision?: number | null
  now: Date
}

export interface EnqueuedArticleTranslationJob {
  id: bigint
  targetLocale: string
  provider: 'edge' | 'ai'
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'stale' | 'cancelled'
  deduplicated: boolean
}

export async function enqueueArticleTranslationJob(db: Database, input: EnqueueArticleTranslationInput): Promise<EnqueuedArticleTranslationJob> {
  if (input.provider === 'ai' && (!input.aiProfileId || !input.configRevision || input.configRevision < 1)) throw new Error('ARTICLE_TRANSLATION_PROVIDER_DISABLED')
  if (input.provider === 'edge' && input.aiProfileId) throw new Error('ARTICLE_TRANSLATION_PROVIDER_DISABLED')
  const configRevision = input.configRevision ?? 0
  const aiProfileIdentity = input.provider === 'ai'
    ? eq(articleTranslationJobs.aiProfileId, input.aiProfileId!)
    : isNull(articleTranslationJobs.aiProfileId)
  try {
    return await db.transaction(async tx => {
      const [post] = await tx.select().from(posts).where(eq(posts.id, input.postId)).for('update')
      if (!post) throw new Error('BLOG_NOT_FOUND')
      if (post.sourceLocale === input.targetLocale) throw new Error('ARTICLE_TRANSLATION_TARGET_IS_SOURCE')
      const [active] = await tx.select({ id: articleTranslationJobs.id, targetLocale: articleTranslationJobs.targetLocale, provider: articleTranslationJobs.provider, status: articleTranslationJobs.status })
        .from(articleTranslationJobs)
        .where(and(
          eq(articleTranslationJobs.postId, input.postId),
          eq(articleTranslationJobs.targetLocale, input.targetLocale),
          eq(articleTranslationJobs.sourceRevision, post.sourceRevision),
          eq(articleTranslationJobs.sourceHash, post.sourceHash),
          eq(articleTranslationJobs.provider, input.provider),
          aiProfileIdentity,
          eq(articleTranslationJobs.configRevision, configRevision),
          or(eq(articleTranslationJobs.status, 'queued'), eq(articleTranslationJobs.status, 'running')),
        ))
        .orderBy(desc(articleTranslationJobs.createdAt)).limit(1)
      if (active) return {
        ...active,
        provider: active.provider as 'edge' | 'ai',
        status: active.status as EnqueuedArticleTranslationJob['status'],
        deduplicated: true,
      }
      const [created] = await tx.insert(articleTranslationJobs).values({
        postId: input.postId,
        targetLocale: input.targetLocale,
        sourceLocale: post.sourceLocale,
        provider: input.provider,
        providerProfileName: input.aiProfileName ?? null,
        aiProfileId: input.aiProfileId ?? null,
        sourceRevision: post.sourceRevision,
        sourceHash: post.sourceHash,
        status: 'queued',
        progress: 0,
        retryCount: 0,
        maxRetries: 2,
        requestKey: randomUUID(),
        configRevision,
        requestedBy: input.requestedBy,
        queuedAt: input.now,
        createdAt: input.now,
        updatedAt: input.now,
      }).returning({ id: articleTranslationJobs.id, targetLocale: articleTranslationJobs.targetLocale, provider: articleTranslationJobs.provider, status: articleTranslationJobs.status })
      if (!created) throw new Error('ARTICLE_TRANSLATION_QUEUE_FAILED')
      return {
        ...created,
        provider: created.provider as 'edge' | 'ai',
        status: created.status as EnqueuedArticleTranslationJob['status'],
        deduplicated: false,
      }
    })
  } catch (error) {
    const candidate = error as { code?: unknown }
    if (candidate.code === '23505') {
      const [post] = await db.select({ sourceRevision: posts.sourceRevision, sourceHash: posts.sourceHash }).from(posts).where(eq(posts.id, input.postId)).limit(1)
      if (!post) throw error
      const [active] = await db.select({ id: articleTranslationJobs.id, targetLocale: articleTranslationJobs.targetLocale, provider: articleTranslationJobs.provider, status: articleTranslationJobs.status })
        .from(articleTranslationJobs)
        .where(and(
          eq(articleTranslationJobs.postId, input.postId),
          eq(articleTranslationJobs.targetLocale, input.targetLocale),
          eq(articleTranslationJobs.sourceRevision, post.sourceRevision),
          eq(articleTranslationJobs.sourceHash, post.sourceHash),
          eq(articleTranslationJobs.provider, input.provider),
          aiProfileIdentity,
          eq(articleTranslationJobs.configRevision, configRevision),
          or(eq(articleTranslationJobs.status, 'queued'), eq(articleTranslationJobs.status, 'running')),
        ))
        .orderBy(desc(articleTranslationJobs.createdAt)).limit(1)
      if (active) return {
        ...active,
        provider: active.provider as 'edge' | 'ai',
        status: active.status as EnqueuedArticleTranslationJob['status'],
        deduplicated: true,
      }
    }
    throw error
  }
}
