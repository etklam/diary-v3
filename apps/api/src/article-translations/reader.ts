import { eq, inArray } from 'drizzle-orm'
import { articleLocaleSchema, type ArticleLocale } from '@diary/contracts'
import { postTranslations, posts, users, type Database } from '@diary/db'

type SourcePost = Pick<typeof posts.$inferSelect,
  'title'
  | 'excerpt'
  | 'excerptAuthored'
  | 'sourceLocale'
  | 'sourceRevision'
  | 'sourceHash'
  | 'access'
> & { content?: string }
type Translation = typeof postTranslations.$inferSelect

/**
 * Fields needed to resolve a reader-facing translation snapshot. The content
 * field is optional so public list queries can keep their projection narrow.
 */
export type ArticleTranslationSnapshot = Pick<Translation,
  'locale'
  | 'status'
  | 'publishedTitle'
  | 'publishedExcerpt'
  | 'publishedVersion'
  | 'publishedSourceRevision'
  | 'publishedSourceHash'
  | 'publishedAt'
> & { publishedContent?: string | null }

export type ArticleTranslationSummary = Omit<ArticleTranslationSnapshot, 'publishedContent'>

export interface ArticleLocaleResolution {
  requestedLocale: ArticleLocale
  resolvedLocale: ArticleLocale
  sourceLocale: ArticleLocale
  availableLocales: ArticleLocale[]
  isFallback: boolean
  fallbackReason: 'translation_unavailable' | 'translation_stale' | null
  translation: ArticleTranslationSnapshot | null
}

export function currentPublishedTranslation(post: SourcePost, translation: ArticleTranslationSnapshot | undefined): translation is ArticleTranslationSnapshot {
  return Boolean(translation
    && translation.locale !== post.sourceLocale
    && translation.publishedVersion > 0
    && translation.publishedAt
    && translation.status !== 'draft'
    && translation.status !== 'stale'
    && translation.status !== 'unpublished'
    && translation.publishedSourceRevision === post.sourceRevision
    && translation.publishedSourceHash === post.sourceHash)
}

export async function resolveRequestedArticleLocale(options: {
  db: Database
  post: SourcePost
  explicitLocale?: string | null
  accountId?: bigint | null
  cookieLocale?: string | null
}): Promise<ArticleLocale> {
  if (options.explicitLocale !== undefined && options.explicitLocale !== null) {
    return articleLocaleSchema.parse(options.explicitLocale)
  }
  if (options.accountId !== undefined && options.accountId !== null) {
    const [account] = await options.db.select({ locale: users.locale }).from(users).where(eq(users.id, options.accountId)).limit(1)
    const locale = articleLocaleSchema.safeParse(account?.locale)
    if (locale.success) return locale.data
  }
  const cookieLocale = articleLocaleSchema.safeParse(options.cookieLocale)
  return cookieLocale.success ? cookieLocale.data : options.post.sourceLocale as ArticleLocale
}

export function resolveArticleTranslation(post: SourcePost, rows: readonly ArticleTranslationSnapshot[], requestedLocale: ArticleLocale): ArticleLocaleResolution {
  const byLocale = new Map(rows.map(row => [row.locale as ArticleLocale, row]))
  const selected = byLocale.get(requestedLocale)
  const published = requestedLocale === post.sourceLocale ? null : currentPublishedTranslation(post, selected) ? selected : null
  const availableLocales: ArticleLocale[] = [post.sourceLocale as ArticleLocale]
  for (const locale of ['zh-TW', 'zh-CN', 'en'] as const) {
    if (locale !== post.sourceLocale && currentPublishedTranslation(post, byLocale.get(locale))) availableLocales.push(locale)
  }
  if (requestedLocale === post.sourceLocale) {
    return { requestedLocale, resolvedLocale: requestedLocale, sourceLocale: post.sourceLocale as ArticleLocale, availableLocales, isFallback: false, fallbackReason: null, translation: null }
  }
  if (published) {
    return { requestedLocale, resolvedLocale: requestedLocale, sourceLocale: post.sourceLocale as ArticleLocale, availableLocales, isFallback: false, fallbackReason: null, translation: published }
  }
  const fallbackReason = selected?.status === 'stale'
    || Boolean(selected?.publishedVersion && (selected.publishedSourceRevision !== post.sourceRevision || selected.publishedSourceHash !== post.sourceHash))
    ? 'translation_stale' as const
    : 'translation_unavailable' as const
  return { requestedLocale, resolvedLocale: post.sourceLocale as ArticleLocale, sourceLocale: post.sourceLocale as ArticleLocale, availableLocales, isFallback: true, fallbackReason, translation: null }
}

export async function loadArticleTranslations(db: Database, postIds: readonly bigint[]): Promise<Map<bigint, Translation[]>> {
  if (postIds.length === 0) return new Map()
  const rows = await db.select().from(postTranslations).where(inArray(postTranslations.postId, [...postIds]))
  const grouped = new Map<bigint, Translation[]>()
  for (const row of rows) grouped.set(row.postId, [...(grouped.get(row.postId) ?? []), row])
  return grouped
}

/**
 * Load only the current-publication fields needed by public list and search
 * responses. In particular, do not pull draft or translated body content into
 * a list request.
 */
export async function loadArticleTranslationSummaries(db: Database, postIds: readonly bigint[]): Promise<Map<bigint, ArticleTranslationSummary[]>> {
  if (postIds.length === 0) return new Map()
  const rows = await db.select({
    postId: postTranslations.postId,
    locale: postTranslations.locale,
    status: postTranslations.status,
    publishedTitle: postTranslations.publishedTitle,
    publishedExcerpt: postTranslations.publishedExcerpt,
    publishedVersion: postTranslations.publishedVersion,
    publishedSourceRevision: postTranslations.publishedSourceRevision,
    publishedSourceHash: postTranslations.publishedSourceHash,
    publishedAt: postTranslations.publishedAt,
  }).from(postTranslations).where(inArray(postTranslations.postId, [...postIds]))
  const grouped = new Map<bigint, ArticleTranslationSummary[]>()
  for (const row of rows) grouped.set(row.postId, [...(grouped.get(row.postId) ?? []), row])
  return grouped
}

export function localizedPostFields(post: SourcePost, resolution: ArticleLocaleResolution, options: { includeContent?: boolean; redactProtectedExcerpt?: boolean } = {}) {
  const translation = resolution.translation
  const redact = options.redactProtectedExcerpt !== false && post.access === 'MEMBER' && !post.excerptAuthored
  const excerpt = redact ? null : translation ? translation.publishedExcerpt : post.excerpt
  return {
    title: translation?.publishedTitle ?? post.title,
    excerpt,
    ...(options.includeContent ? { content: translation?.publishedContent ?? post.content! } : {}),
    sourceLocale: resolution.sourceLocale,
    requestedLocale: resolution.requestedLocale,
    resolvedLocale: resolution.resolvedLocale,
    availableLocales: resolution.availableLocales,
    isFallback: resolution.isFallback,
    fallbackReason: resolution.fallbackReason,
  }
}
