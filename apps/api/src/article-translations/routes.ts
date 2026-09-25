import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { articleLocaleSchema, articleTranslationActionResponseSchema, articleTranslationAdminResponseSchema, articleTranslationAiDefaultUpdateSchema, articleTranslationAiProviderSaveSchema, articleTranslationAiProviderSchema, articleTranslationAiProvidersResponseSchema, articleTranslationAiProviderUpdateSchema, articleTranslationJobRequestSchema, articleTranslationJobResponseSchema, articleTranslationEditRequestSchema, serializedIdSchema, type ArticleLocale, type ErrorCode } from '@diary/contracts'
import { articleTranslationAiProfiles, articleTranslationAiSettings, articleTranslationJobs, articleTranslationRuntime, postTranslations, posts, users, type Database } from '@diary/db'
import type { Context, Hono } from 'hono'
import type { z } from 'zod'
import { lockResearchMutation, researchPublicationIssue, type ResearchTransaction } from '../research-studio/publication.js'
import type { ResearchLatestCompletedSession } from '../research-studio/service.js'
import { encryptAiSecret } from '../ai-reports/secrets.js'
import { AiProviderError, validateHttpsAiBaseUrl } from '../ai-reports/outbound-policy.js'
import { enqueueArticleTranslationJob } from './store.js'
import { currentPublishedTranslation } from './reader.js'
import { assertMarkdownTranslationPreservesSource } from './markdown.js'
import { TranslationProviderError } from './types.js'
import type { AppEnv } from '../app.js'

type PostFail = (status: number, code: ErrorCode, message: string, details?: { field?: string; message?: string }[] | null) => never

function postId(value: string | undefined, validationError: (error: z.ZodError) => never): bigint {
  const result = serializedIdSchema.safeParse(value)
  if (!result.success) return validationError(result.error)
  return BigInt(result.data)
}

function aiProfileId(value: string | undefined, validationError: (error: z.ZodError) => never): bigint {
  const result = serializedIdSchema.safeParse(value)
  if (!result.success) return validationError(result.error)
  return BigInt(result.data)
}

function locale(value: string | undefined, validationError: (error: z.ZodError) => never): ArticleLocale {
  const result = articleLocaleSchema.safeParse(value)
  if (!result.success) return validationError(result.error)
  return result.data
}

function instant(value: Date | null): string | null { return value?.toISOString() ?? null }
function publicTranslationIsCurrent(post: typeof posts.$inferSelect, translation: typeof postTranslations.$inferSelect | undefined): boolean {
  return currentPublishedTranslation(post, translation)
}

function jobStatus(value: typeof articleTranslationJobs.$inferSelect['status']) {
  return value.toUpperCase() as 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'STALE' | 'CANCELLED'
}

function adminTranslationStatus(post: typeof posts.$inferSelect, translation: typeof postTranslations.$inferSelect | undefined, latestJob: typeof articleTranslationJobs.$inferSelect | undefined) {
  if (translation?.status === 'unpublished') return 'UNPUBLISHED' as const
  if (latestJob?.status === 'queued') return 'QUEUED' as const
  if (latestJob?.status === 'running') return 'TRANSLATING' as const
  const draftIsCurrent = Boolean(translation
    && translation.draftVersion > 0
    && translation.draftSourceRevision === post.sourceRevision
    && translation.draftSourceHash === post.sourceHash)
  if (draftIsCurrent && translation) {
    if (translation.reviewedDraftVersion !== translation.draftVersion) return 'NEEDS_REVIEW' as const
    if (publicTranslationIsCurrent(post, translation)) return 'PUBLISHED' as const
    return 'READY' as const
  }
  if (latestJob?.status === 'failed' && latestJob.sourceRevision === post.sourceRevision && latestJob.sourceHash === post.sourceHash) return 'FAILED' as const
  if (!translation) return 'MISSING' as const
  if (translation.status === 'stale') return 'STALE' as const
  if (publicTranslationIsCurrent(post, translation)) return 'PUBLISHED' as const
  if (translation.publishedVersion > 0 && (translation.publishedSourceRevision !== post.sourceRevision || translation.publishedSourceHash !== post.sourceHash)) return 'STALE' as const
  return 'MISSING' as const
}

function adminTranslationRow(post: typeof posts.$inferSelect, targetLocale: ArticleLocale, translation: typeof postTranslations.$inferSelect | undefined, latestJob: typeof articleTranslationJobs.$inferSelect | undefined) {
  const current = publicTranslationIsCurrent(post, translation)
  return {
    locale: targetLocale,
    status: adminTranslationStatus(post, translation, latestJob),
    draftTitle: translation?.draftTitle ?? null,
    draftExcerpt: translation?.draftExcerpt ?? null,
    draftContent: translation?.draftContent ?? null,
    draftSourceRevision: translation?.draftSourceRevision ?? null,
    draftSourceHash: translation?.draftSourceHash ?? null,
    draftProvider: translation?.draftProvider ?? null,
    draftModel: translation?.draftModel ?? null,
    draftPromptVersion: translation?.draftPromptVersion ?? null,
    publishedTitle: translation?.publishedTitle ?? null,
    publishedExcerpt: translation?.publishedExcerpt ?? null,
    publishedContent: translation?.publishedContent ?? null,
    publishedVersion: translation?.publishedVersion || null,
    publishedSourceRevision: translation?.publishedSourceRevision ?? null,
    publishedSourceHash: translation?.publishedSourceHash ?? null,
    reviewedBy: translation?.reviewedBy?.toString() ?? null,
    reviewedAt: instant(translation?.reviewedAt ?? null),
    publishedAt: instant(translation?.publishedAt ?? null),
    draftIsCurrent: Boolean(translation && translation.draftVersion > 0 && translation.draftSourceRevision === post.sourceRevision && translation.draftSourceHash === post.sourceHash),
    isCurrent: current,
    latestJob: latestJob ? {
      id: latestJob.id.toString(),
      provider: latestJob.provider as 'edge' | 'ai',
      providerProfileName: latestJob.providerProfileName,
      status: jobStatus(latestJob.status),
      progress: latestJob.progress,
      error: latestJob.error,
      retryCount: latestJob.retryCount,
    } : null,
  }
}

function safeAiProfile(profile: typeof articleTranslationAiProfiles.$inferSelect) {
  return articleTranslationAiProviderSchema.parse({
    id: profile.id.toString(),
    name: profile.name,
    enabled: profile.enabled,
    baseUrl: profile.baseUrl ?? '',
    model: profile.model ?? '',
    secretConfigured: Boolean(profile.encryptedApiKey),
    revision: profile.revision,
    timeoutMs: profile.timeoutMs,
    prompt: profile.translationPrompt,
    promptVersion: profile.promptVersion,
    maxTokens: profile.maxTokens,
    maxCallsPerJob: profile.maxCallsPerJob,
    tokenBudgetPerJob: profile.tokenBudgetPerJob,
    allowMemberArticles: profile.allowMemberArticles,
  })
}

export function registerArticleTranslationRoutes(app: Hono<AppEnv>, dependencies: {
  db: Database
  now: () => Date
  latestCompletedSession?: ResearchLatestCompletedSession
  fail: PostFail
  validationError: (error: z.ZodError) => never
  parseJson: <T>(context: Context<AppEnv>, schema: z.ZodType<T>) => Promise<T>
}) {
  const { db, now, fail, validationError, parseJson } = dependencies
  const admin = (c: Context<AppEnv>) => {
    c.header('Cache-Control', 'no-store')
    const user = c.get('user')
    if (!user) return fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    if (user.role !== 'ADMIN') return fail(403, 'AUTH_FORBIDDEN', 'Admin access required')
    return BigInt(user.id)
  }
  const readPost = async (id: bigint) => {
    const [post] = await db.select().from(posts).where(eq(posts.id, id)).limit(1)
    return post
  }
  const readTranslation = async (postIdValue: bigint, targetLocale: ArticleLocale) => {
    const [translation] = await db.select().from(postTranslations).where(and(eq(postTranslations.postId, postIdValue), eq(postTranslations.locale, targetLocale))).limit(1)
    return translation
  }
  const validateDraft = (post: typeof posts.$inferSelect, draft: { title: string; excerpt: string | null; content: string }) => {
    try {
      assertMarkdownTranslationPreservesSource(post.title, draft.title)
      assertMarkdownTranslationPreservesSource(post.content, draft.content)
      if (post.excerpt === null && draft.excerpt !== null) throw new TranslationProviderError('TRANSLATION_OUTPUT_INVALID')
      if (post.excerpt !== null && draft.excerpt !== null) assertMarkdownTranslationPreservesSource(post.excerpt, draft.excerpt)
    } catch (error) {
      if (error instanceof TranslationProviderError && error.code === 'TRANSLATION_OUTPUT_INVALID') {
        return fail(400, 'SYS_VALIDATION_ERROR', 'Translation must preserve the source Markdown structure and immutable values')
      }
      throw error
    }
  }
  const lockActor = async (tx: ResearchTransaction, actorId: bigint) => {
    await lockResearchMutation(tx)
    const [actor] = await tx.select({ role: users.role }).from(users).where(eq(users.id, actorId))
    if (actor?.role !== 'ADMIN') return fail(403, 'AUTH_FORBIDDEN', 'Admin access required')
  }
  const readAdminTranslation = async (post: typeof posts.$inferSelect, targetLocale: ArticleLocale) => {
    const translation = await readTranslation(post.id, targetLocale)
    const [latestJob] = await db.select().from(articleTranslationJobs)
      .where(and(eq(articleTranslationJobs.postId, post.id), eq(articleTranslationJobs.targetLocale, targetLocale)))
      .orderBy(desc(articleTranslationJobs.createdAt), desc(articleTranslationJobs.id)).limit(1)
    return adminTranslationRow(post, targetLocale, translation, latestJob)
  }
  const queueOne = async (options: { postId: bigint; targetLocale: ArticleLocale; provider: 'edge' | 'ai'; actorId: bigint | null }) => {
    const post = await readPost(options.postId)
    if (!post) return fail(404, 'BLOG_NOT_FOUND', 'Post not found')
    if (post.sourceLocale === options.targetLocale) return fail(400, 'SYS_VALIDATION_ERROR', 'The source locale cannot be a translation target')
    if (options.provider === 'edge' && post.access !== 'PUBLIC') return fail(409, 'ARTICLE_TRANSLATION_PRIVACY_RESTRICTED', 'Microsoft Edge Translate can only process PUBLIC articles')
    let aiProfileIdValue: bigint | null = null
    let aiProfileName: string | null = null
    let configRevision: number | null = null
    if (options.provider === 'ai') {
      const [settings] = await db.select().from(articleTranslationAiSettings).where(eq(articleTranslationAiSettings.singleton, 'default')).limit(1)
      if (!settings?.defaultProfileId) return fail(409, 'ARTICLE_TRANSLATION_PROVIDER_DISABLED', 'Select an enabled AI provider before translating')
      const [profile] = await db.select().from(articleTranslationAiProfiles).where(eq(articleTranslationAiProfiles.id, settings.defaultProfileId)).limit(1)
      if (!profile?.enabled || !profile.baseUrl || !profile.model || !profile.encryptedApiKey) return fail(409, 'ARTICLE_TRANSLATION_PROVIDER_DISABLED', 'The selected AI provider is not configured or enabled')
      if (post.access === 'MEMBER' && !profile.allowMemberArticles) return fail(409, 'ARTICLE_TRANSLATION_PRIVACY_RESTRICTED', 'AI translation is not permitted for MEMBER articles by the current translation policy')
      aiProfileIdValue = profile.id
      aiProfileName = profile.name
      configRevision = profile.revision
    }
    const [runtime] = await db.select().from(articleTranslationRuntime).where(eq(articleTranslationRuntime.singleton, 'default')).limit(1)
    if (options.provider === 'edge' && runtime?.edgeDisabledUntil && runtime.edgeDisabledUntil > now()) return fail(409, 'ARTICLE_TRANSLATION_PROVIDER_DISABLED', 'Microsoft Edge Translate is temporarily disabled after repeated provider failures')
    try {
      return await enqueueArticleTranslationJob(db, {
        postId: options.postId,
        targetLocale: options.targetLocale,
        provider: options.provider,
        requestedBy: options.actorId,
        aiProfileId: aiProfileIdValue,
        aiProfileName,
        configRevision,
        now: now(),
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'BLOG_NOT_FOUND') return fail(404, 'BLOG_NOT_FOUND', 'Post not found')
      if (error instanceof Error && error.message === 'ARTICLE_TRANSLATION_TARGET_IS_SOURCE') return fail(400, 'SYS_VALIDATION_ERROR', 'The source locale cannot be a translation target')
      if (error instanceof Error && error.message === 'ARTICLE_TRANSLATION_PROVIDER_DISABLED') return fail(409, 'ARTICLE_TRANSLATION_PROVIDER_DISABLED', 'Select an enabled AI provider before translating')
      throw error
    }
  }

  app.get('/api/blog/admin/:id/translations', async c => {
    admin(c)
    const id = postId(c.req.param('id'), validationError)
    const post = await readPost(id)
    if (!post) return fail(404, 'BLOG_NOT_FOUND', 'Post not found')
    const [translations, jobs, runtime] = await Promise.all([
      db.select().from(postTranslations).where(eq(postTranslations.postId, id)),
      db.select().from(articleTranslationJobs).where(eq(articleTranslationJobs.postId, id)).orderBy(desc(articleTranslationJobs.createdAt), desc(articleTranslationJobs.id)),
      db.select().from(articleTranslationRuntime).where(eq(articleTranslationRuntime.singleton, 'default')).limit(1),
    ])
    const rows = (['zh-TW', 'zh-CN', 'en'] as const).filter(item => item !== post.sourceLocale).map(targetLocale => {
      const translation = translations.find(item => item.locale === targetLocale)
      const latestJob = jobs.find(item => item.targetLocale === targetLocale)
      return adminTranslationRow(post, targetLocale, translation, latestJob)
    })
    return c.json(articleTranslationAdminResponseSchema.parse({
      articleId: id.toString(),
      sourceLocale: post.sourceLocale,
      sourceRevision: post.sourceRevision,
      sourceHash: post.sourceHash,
      edgeEnabled: !runtime[0]?.edgeDisabledUntil || runtime[0].edgeDisabledUntil <= now(),
      edgeDisabledUntil: runtime[0]?.edgeDisabledUntil?.toISOString() ?? null,
      warning: 'Article text will be sent to a third-party translation service.',
      translations: rows,
    }))
  })

  app.post('/api/blog/admin/:id/translations/jobs', async c => {
    const actorId = admin(c)
    const id = postId(c.req.param('id'), validationError)
    const input = await parseJson(c, articleTranslationJobRequestSchema)
    const post = await readPost(id)
    if (!post) return fail(404, 'BLOG_NOT_FOUND', 'Post not found')
    const jobs = []
    for (const targetLocale of input.targetLocales) {
      const job = await queueOne({ postId: id, targetLocale, provider: input.provider, actorId })
      jobs.push({ id: job.id.toString(), locale: targetLocale, status: jobStatus(job.status) })
    }
    return c.json(articleTranslationJobResponseSchema.parse({ jobs }))
  })

  app.put('/api/blog/admin/:id/translations/:locale', async c => {
    const actorId = admin(c)
    const id = postId(c.req.param('id'), validationError)
    const targetLocale = locale(c.req.param('locale'), validationError)
    const input = await parseJson(c, articleTranslationEditRequestSchema)
    const result = await db.transaction(async tx => {
      await lockActor(tx, actorId)
      const [post] = await tx.select().from(posts).where(eq(posts.id, id)).for('update')
      if (!post) return fail(404, 'BLOG_NOT_FOUND', 'Post not found')
      if (targetLocale === post.sourceLocale) return fail(400, 'SYS_VALIDATION_ERROR', 'The original article cannot be edited as a translation')
      validateDraft(post, input)
      const [existing] = await tx.select().from(postTranslations).where(and(eq(postTranslations.postId, id), eq(postTranslations.locale, targetLocale))).for('update')
      const timestamp = now()
      const keepUnpublished = existing?.status === 'unpublished'
      const values = {
        draftTitle: input.title,
        draftExcerpt: input.excerpt,
        draftContent: input.content,
        draftVersion: (existing?.draftVersion ?? 0) + 1,
        draftSourceRevision: post.sourceRevision,
        draftSourceHash: post.sourceHash,
        draftProvider: 'manual' as const,
        draftModel: null,
        draftPromptVersion: null,
        reviewedBy: null,
        reviewedAt: null,
        reviewedDraftVersion: null,
        status: keepUnpublished ? 'unpublished' as const : 'pending_review' as const,
        updatedAt: timestamp,
      }
      if (existing) {
        await tx.update(postTranslations).set(values).where(eq(postTranslations.id, existing.id))
      } else {
        await tx.insert(postTranslations).values({ postId: id, locale: targetLocale, ...values, createdAt: timestamp })
      }
      return post
    })
    if (!result) return fail(404, 'BLOG_NOT_FOUND', 'Post not found')
    const post = await readPost(id)
    if (!post) return fail(404, 'BLOG_NOT_FOUND', 'Post not found')
    return c.json(articleTranslationActionResponseSchema.parse({ translation: await readAdminTranslation(post, targetLocale) }))
  })

  app.post('/api/blog/admin/:id/translations/:locale/review', async c => {
    const actorId = admin(c)
    const id = postId(c.req.param('id'), validationError)
    const targetLocale = locale(c.req.param('locale'), validationError)
    await db.transaction(async tx => {
      await lockActor(tx, actorId)
      const [post] = await tx.select().from(posts).where(eq(posts.id, id)).for('update')
      if (!post) return fail(404, 'BLOG_NOT_FOUND', 'Post not found')
      const [translation] = await tx.select().from(postTranslations).where(and(eq(postTranslations.postId, id), eq(postTranslations.locale, targetLocale))).for('update')
      if (!translation || translation.draftVersion === 0 || !translation.draftTitle || !translation.draftContent) return fail(404, 'ARTICLE_TRANSLATION_NOT_FOUND', 'Translation draft not found')
      if (translation.draftSourceRevision !== post.sourceRevision || translation.draftSourceHash !== post.sourceHash) {
        await tx.update(postTranslations).set({ status: 'stale', updatedAt: now() }).where(eq(postTranslations.id, translation.id))
        return fail(409, 'ARTICLE_TRANSLATION_SOURCE_STALE', 'The original article changed. Create a new translation draft before reviewing.')
      }
      validateDraft(post, { title: translation.draftTitle, excerpt: translation.draftExcerpt, content: translation.draftContent })
      await tx.update(postTranslations).set({
        status: translation.status === 'unpublished' ? 'unpublished' : 'draft',
        reviewedBy: actorId,
        reviewedAt: now(),
        reviewedDraftVersion: translation.draftVersion,
        updatedAt: now(),
      }).where(eq(postTranslations.id, translation.id))
    })
    const post = await readPost(id)
    if (!post) return fail(404, 'BLOG_NOT_FOUND', 'Post not found')
    return c.json(articleTranslationActionResponseSchema.parse({ translation: await readAdminTranslation(post, targetLocale) }))
  })

  app.post('/api/blog/admin/:id/translations/:locale/publish', async c => {
    const actorId = admin(c)
    const id = postId(c.req.param('id'), validationError)
    const targetLocale = locale(c.req.param('locale'), validationError)
    await db.transaction(async tx => {
      await lockActor(tx, actorId)
      const [post] = await tx.select().from(posts).where(eq(posts.id, id)).for('update')
      if (!post) return fail(404, 'BLOG_NOT_FOUND', 'Post not found')
      if (post.status !== 'PUBLISHED' || !post.publishedAt) return fail(409, 'ARTICLE_TRANSLATION_NOT_PUBLISHED', 'Publish the original article before publishing its translation')
      const [translation] = await tx.select().from(postTranslations).where(and(eq(postTranslations.postId, id), eq(postTranslations.locale, targetLocale))).for('update')
      if (!translation || translation.draftVersion === 0 || !translation.draftTitle || !translation.draftContent) return fail(404, 'ARTICLE_TRANSLATION_NOT_FOUND', 'Translation draft not found')
      if (translation.draftSourceRevision !== post.sourceRevision || translation.draftSourceHash !== post.sourceHash) {
        await tx.update(postTranslations).set({ status: 'stale', updatedAt: now() }).where(eq(postTranslations.id, translation.id))
        return fail(409, 'ARTICLE_TRANSLATION_SOURCE_STALE', 'The original article changed. Create a new translation draft before publishing.')
      }
      validateDraft(post, { title: translation.draftTitle, excerpt: translation.draftExcerpt, content: translation.draftContent })
      if (translation.reviewedDraftVersion !== translation.draftVersion || !translation.reviewedAt) return fail(409, 'ARTICLE_TRANSLATION_REVIEW_REQUIRED', 'Review and approve this translation draft before publishing')
      const issue = await researchPublicationIssue({ db: tx, postId: id, now: now(), latestCompletedSession: dependencies.latestCompletedSession })
      if (issue) return fail(409, issue.code, issue.message)
      const timestamp = now()
      await tx.update(postTranslations).set({
        status: 'published',
        publishedTitle: translation.draftTitle,
        publishedExcerpt: translation.draftExcerpt,
        publishedContent: translation.draftContent,
        publishedVersion: translation.publishedVersion + 1,
        publishedSourceRevision: post.sourceRevision,
        publishedSourceHash: post.sourceHash,
        publishedProvider: translation.draftProvider,
        publishedModel: translation.draftModel,
        publishedPromptVersion: translation.draftPromptVersion,
        publishedAt: timestamp,
        updatedAt: timestamp,
      }).where(eq(postTranslations.id, translation.id))
    })
    const post = await readPost(id)
    if (!post) return fail(404, 'BLOG_NOT_FOUND', 'Post not found')
    return c.json(articleTranslationActionResponseSchema.parse({ translation: await readAdminTranslation(post, targetLocale) }))
  })

  app.post('/api/blog/admin/:id/translations/:locale/unpublish', async c => {
    const actorId = admin(c)
    const id = postId(c.req.param('id'), validationError)
    const targetLocale = locale(c.req.param('locale'), validationError)
    await db.transaction(async tx => {
      await lockActor(tx, actorId)
      const [translation] = await tx.select().from(postTranslations).where(and(eq(postTranslations.postId, id), eq(postTranslations.locale, targetLocale))).for('update')
      if (!translation || translation.publishedVersion === 0) return fail(404, 'ARTICLE_TRANSLATION_NOT_FOUND', 'Published translation not found')
      await tx.update(postTranslations).set({ status: 'unpublished', updatedAt: now() }).where(eq(postTranslations.id, translation.id))
    })
    const post = await readPost(id)
    if (!post) return fail(404, 'BLOG_NOT_FOUND', 'Post not found')
    return c.json(articleTranslationActionResponseSchema.parse({ translation: await readAdminTranslation(post, targetLocale) }))
  })

  app.post('/api/blog/admin/:id/translations/:locale/retranslate', async c => {
    const actorId = admin(c)
    const id = postId(c.req.param('id'), validationError)
    const targetLocale = locale(c.req.param('locale'), validationError)
    const input = await parseJson(c, articleTranslationJobRequestSchema.pick({ provider: true }))
    const job = await queueOne({ postId: id, targetLocale, provider: input.provider, actorId })
    return c.json(articleTranslationJobResponseSchema.parse({ jobs: [{ id: job.id.toString(), locale: targetLocale, status: jobStatus(job.status) }] }))
  })

  const readAiProviders = async () => {
    const [[settings], providers] = await Promise.all([
      db.select().from(articleTranslationAiSettings).where(eq(articleTranslationAiSettings.singleton, 'default')).limit(1),
      db.select().from(articleTranslationAiProfiles).orderBy(asc(articleTranslationAiProfiles.name), asc(articleTranslationAiProfiles.id)),
    ])
    return articleTranslationAiProvidersResponseSchema.parse({
      providers: providers.map(safeAiProfile),
      defaultProviderId: settings?.defaultProfileId?.toString() ?? null,
    })
  }
  const profileValues = (input: z.infer<typeof articleTranslationAiProviderSaveSchema>, encryptedApiKey: string | null, actorId: bigint, revision: number) => ({
    name: input.name,
    enabled: input.enabled,
    baseUrl: validateHttpsAiBaseUrl(input.baseUrl).href.replace(/\/$/, ''),
    model: input.model,
    encryptedApiKey,
    timeoutMs: input.timeoutMs,
    translationPrompt: input.prompt,
    promptVersion: input.promptVersion,
    maxTokens: input.maxTokens,
    maxCallsPerJob: input.maxCallsPerJob,
    tokenBudgetPerJob: input.tokenBudgetPerJob,
    allowMemberArticles: input.allowMemberArticles,
    revision,
    updatedBy: actorId,
    updatedAt: now(),
  })

  app.get('/api/admin/article-translations/ai-providers', async c => {
    admin(c)
    return c.json(await readAiProviders())
  })

  app.post('/api/admin/article-translations/ai-providers', async c => {
    const actorId = admin(c)
    const input = await parseJson(c, articleTranslationAiProviderSaveSchema)
    try { validateHttpsAiBaseUrl(input.baseUrl) }
    catch (error) { return fail(400, error instanceof AiProviderError ? 'AI_UNSAFE_ENDPOINT' : 'SYS_VALIDATION_ERROR', 'Provider endpoint must be a safe HTTPS base URL') }
    const encryptedApiKey = input.apiKey ? encryptAiSecret(input.apiKey, 'article-translation-api-key') : null
    if (input.enabled && !encryptedApiKey) return fail(400, 'AI_NOT_CONFIGURED', 'Add an API key before enabling this provider')
    const [duplicate] = await db.select({ id: articleTranslationAiProfiles.id }).from(articleTranslationAiProfiles)
      .where(sql`lower(${articleTranslationAiProfiles.name}) = lower(${input.name})`).limit(1)
    if (duplicate) return fail(409, 'AI_ADMIN_REVISION_CONFLICT', 'A provider with this name already exists')
    try {
      const [created] = await db.insert(articleTranslationAiProfiles).values(profileValues(input, encryptedApiKey, actorId, 1)).returning()
      if (!created) return fail(500, 'SYS_INTERNAL_ERROR', 'Provider profile could not be created')
      return c.json(safeAiProfile(created))
    } catch (error) {
      if ((error as { code?: unknown }).code === '23505') return fail(409, 'AI_ADMIN_REVISION_CONFLICT', 'A provider with this name already exists')
      throw error
    }
  })

  app.put('/api/admin/article-translations/ai-providers/default', async c => {
    const actorId = admin(c)
    const input = await parseJson(c, articleTranslationAiDefaultUpdateSchema)
    const requestedId = input.providerId === null ? null : BigInt(input.providerId)
    await db.transaction(async tx => {
      await tx.insert(articleTranslationAiSettings).values({ singleton: 'default', updatedAt: now() }).onConflictDoNothing()
      if (requestedId !== null) {
        const [profile] = await tx.select().from(articleTranslationAiProfiles).where(eq(articleTranslationAiProfiles.id, requestedId)).for('update')
        if (!profile) return fail(404, 'ARTICLE_TRANSLATION_PROVIDER_DISABLED', 'AI provider not found')
        if (!profile.enabled || !profile.baseUrl || !profile.model || !profile.encryptedApiKey) {
          return fail(409, 'ARTICLE_TRANSLATION_PROVIDER_DISABLED', 'Enable and configure this provider before selecting it')
        }
      }
      const [settings] = await tx.select().from(articleTranslationAiSettings).where(eq(articleTranslationAiSettings.singleton, 'default')).for('update')
      if (!settings) return fail(500, 'SYS_INTERNAL_ERROR', 'AI provider settings are unavailable')
      await tx.update(articleTranslationAiSettings).set({
        defaultProfileId: requestedId,
        revision: settings.revision + 1,
        updatedBy: actorId,
        updatedAt: now(),
      }).where(eq(articleTranslationAiSettings.singleton, 'default'))
    })
    return c.json(await readAiProviders())
  })

  app.put('/api/admin/article-translations/ai-providers/:id', async c => {
    const actorId = admin(c)
    const id = aiProfileId(c.req.param('id'), validationError)
    const input = await parseJson(c, articleTranslationAiProviderUpdateSchema)
    try { validateHttpsAiBaseUrl(input.baseUrl) }
    catch (error) { return fail(400, error instanceof AiProviderError ? 'AI_UNSAFE_ENDPOINT' : 'SYS_VALIDATION_ERROR', 'Provider endpoint must be a safe HTTPS base URL') }
    const encryptedApiKey = input.apiKey ? encryptAiSecret(input.apiKey, 'article-translation-api-key') : null
    let result: typeof articleTranslationAiProfiles.$inferSelect
    try {
      result = await db.transaction(async tx => {
        const [existing] = await tx.select().from(articleTranslationAiProfiles).where(eq(articleTranslationAiProfiles.id, id)).for('update')
        if (!existing) return fail(404, 'ARTICLE_TRANSLATION_PROVIDER_DISABLED', 'AI provider not found')
        if (existing.revision !== input.expectedRevision) return fail(409, 'AI_ADMIN_REVISION_CONFLICT', 'Provider settings changed; reload and retry')
        const [duplicate] = await tx.select({ id: articleTranslationAiProfiles.id }).from(articleTranslationAiProfiles)
          .where(and(sql`lower(${articleTranslationAiProfiles.name}) = lower(${input.name})`, sql`${articleTranslationAiProfiles.id} <> ${id}`)).limit(1)
        if (duplicate) return fail(409, 'AI_ADMIN_REVISION_CONFLICT', 'A provider with this name already exists')
        const [settings] = await tx.select().from(articleTranslationAiSettings).where(eq(articleTranslationAiSettings.singleton, 'default')).for('update')
        if (settings?.defaultProfileId === id && !input.enabled) return fail(409, 'ARTICLE_TRANSLATION_PROVIDER_DISABLED', 'Select another default provider before disabling this one')
        const nextSecret = encryptedApiKey ?? existing.encryptedApiKey
        if (input.enabled && !nextSecret) return fail(400, 'AI_NOT_CONFIGURED', 'Add an API key before enabling this provider')
        const [updated] = await tx.update(articleTranslationAiProfiles).set({
          ...profileValues(input, nextSecret, actorId, existing.revision + 1),
        }).where(and(eq(articleTranslationAiProfiles.id, id), eq(articleTranslationAiProfiles.revision, input.expectedRevision))).returning()
        if (!updated) return fail(409, 'AI_ADMIN_REVISION_CONFLICT', 'Provider settings changed; reload and retry')
        return updated
      })
    } catch (error) {
      if ((error as { code?: unknown }).code === '23505') return fail(409, 'AI_ADMIN_REVISION_CONFLICT', 'A provider with this name already exists')
      throw error
    }
    return c.json(safeAiProfile(result))
  })
}
