import { randomUUID } from 'node:crypto'
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  or,
  sql,
} from 'drizzle-orm'
import type { Context, Hono } from 'hono'
import type { z } from 'zod'
import {
  postAdminDetailSchema,
  postAdminListQuerySchema,
  postAdminListResponseSchema,
  postBulkRequestSchema,
  postBulkResponseSchema,
  postDeleteResponseSchema,
  postPublicDetailSchema,
  postPublicListResponseSchema,
  postPublicMetadataSchema,
  postWriteRequestSchema,
  serializedIdSchema,
  type ErrorCode,
  type PostStatus,
} from '@diary/contracts'
import { articleLocaleSchema, type ArticleLocale } from '@diary/contracts'
import { articleTranslationAiProfiles, articleTranslationAiSettings, posts, researchArticleLinks, researchRuns, users, type Database } from '@diary/db'
import { getCookie } from 'hono/cookie'
import { resolveArticleReadAccess } from './article-policy.js'
import { lockResearchMutation, researchPublicationIssue, type ResearchTransaction } from './research-studio/publication.js'
import type { ResearchLatestCompletedSession } from './research-studio/service.js'
import { loadArticleTranslations, localizedPostFields, resolveArticleTranslation } from './article-translations/reader.js'
import { enqueueArticleTranslationJob } from './article-translations/store.js'
import type { AppEnv } from './app.js'

const PUBLIC_DEFAULT_LIMIT = 9
const ADMIN_DEFAULT_LIMIT = 20
const MAX_LIMIT = 50
const CATEGORY_ALIASES: Record<string, string[]> = {
  fundamental: ['基本面分析', 'Fundamental Analysis'],
  technical: ['技术面分析', '技術面分析', 'Technical Analysis'],
  market: ['市场观察', '市場觀察', 'Market Watch'],
  strategy: ['投资策略', '投資策略', 'Investment Strategy'],
}
type PostFail = (status: number, code: ErrorCode, message: string, details?: { field?: string; message?: string }[] | null) => never

function instant(value: Date | null): string | null {
  return value?.toISOString() ?? null
}

function excerptFromMarkdown(content: string): string {
  const plain = content
    .replace(/<[^>]*>/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#*`_[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return plain.length > 150 ? `${plain.slice(0, 150)}...` : plain
}

function slugFromTitle(title: string): string {
  const slug = title.toLowerCase().trim()
    .replace(/[^\p{Letter}\p{Number}\u4e00-\u9fff\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'post'
}

function parseId(value: string | undefined, validationError: (error: z.ZodError) => never): bigint {
  const result = serializedIdSchema.safeParse(value)
  if (!result.success) return validationError(result.error)
  return BigInt(result.data)
}

function parseDate(value: string | undefined, field: string, fail: PostFail): Date | undefined {
  if (!value) return undefined
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return fail(400, 'SYS_VALIDATION_ERROR', 'Validation failed', [{ field, message: 'Invalid date format' }])
  return date
}

function endOfDay(value: string | undefined, field: string, fail: PostFail): Date | undefined {
  const date = parseDate(value, field, fail)
  if (!date) return undefined
  date.setUTCHours(23, 59, 59, 999)
  return date
}

function publishedAtFor(_currentStatus: PostStatus, currentPublishedAt: Date | null, nextStatus: PostStatus, now: Date): Date | null {
  // Publication provenance is immutable once assigned. Visibility is governed
  // by status; archiving must not erase the original publication instant.
  return currentPublishedAt ?? (nextStatus === 'PUBLISHED' ? now : null)
}

const SEARCH_STOPWORDS = new Set(['a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'is', 'it', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'was', 'with', 'about'])

type SearchTerm = { query: string; phrase: boolean }
type SearchGroup = { required: SearchTerm[]; optional: SearchTerm[]; excluded: SearchTerm[] }

function normalizeSearchWords(value: string, allowShortPrefix = false): string[] {
  return (value.normalize('NFKC').match(/[\p{Letter}\p{Number}]+\*?/gu) ?? []).flatMap(token => {
    const prefix = token.endsWith('*')
    const word = prefix ? token.slice(0, -1) : token
    if (Array.from(word).length < (prefix && allowShortPrefix ? 2 : 3) || (!prefix && SEARCH_STOPWORDS.has(word.toLowerCase()))) return []
    const safe = word.replace(/[^\p{Letter}\p{Number}_]/gu, '')
    return safe ? [prefix ? `${safe}:*` : safe] : []
  })
}

export function parsePublicSearch(input: string): SearchGroup {
  const groups: SearchGroup = { required: [], optional: [], excluded: [] }
  const add = (marker: string, value: string, phrase: boolean, allowShortPrefix = false) => {
    const words = normalizeSearchWords(value, allowShortPrefix)
    if (words.length === 0) return
    const term = { query: phrase ? words.join(' <-> ') : words.join(' | '), phrase }
    if (marker === '-') groups.excluded.push(term)
    else if (marker === '+') groups.required.push(term)
    else groups.optional.push(term)
  }
  const groupsRemoved = input.normalize('NFKC').replace(/~[^\s]+/gu, ' ').replace(/([+-])\(([^()]*)\)/gu, (_whole, marker: string, value: string) => {
    add(marker, value, false, true)
    return ' '
  })
  const matcher = /([+-]?)(?:"([^"]+)"|([^\s]+))/gu
  let match: RegExpExecArray | null
  while ((match = matcher.exec(groupsRemoved)) !== null) {
    const marker = match[1] ?? ''
    add(marker, match[2] ?? match[3] ?? '', Boolean(match[2]), true)
  }
  return groups
}

function textVector(column: typeof posts.title | typeof posts.excerpt | ReturnType<typeof sql>) {
  // MariaDB's frozen query uses one MATCH(excerpt,title) vector. PostgreSQL
  // keeps the same combined field boundary and applies unaccent for the
  // measured cafe/café equivalence.
  let vector = sql`to_tsvector('simple', unaccent(coalesce(${column}, '')))`
  for (const stopword of SEARCH_STOPWORDS) vector = sql`ts_delete(${vector}, ${stopword})`
  return vector
}

function searchableExcerpt() {
  // Derived excerpts are body text. They stay out of guest search for MEMBER posts.
  return sql`case when ${posts.access} = 'PUBLIC' or (${posts.access} = 'MEMBER' and ${posts.excerptAuthored}) then coalesce(${posts.excerpt}, '') else '' end`
}

function combinedTextVector() {
  let vector = sql`to_tsvector('simple', unaccent(coalesce(${posts.title}, '') || ' ' || ${searchableExcerpt()}))`
  for (const stopword of SEARCH_STOPWORDS) vector = sql`ts_delete(${vector}, ${stopword})`
  return vector
}

function matchesTerm(term: SearchTerm) {
  if (term.phrase) return or(
    sql`${textVector(posts.title)} @@ to_tsquery('simple', ${term.query})`,
    sql`${textVector(searchableExcerpt())} @@ to_tsquery('simple', ${term.query})`,
  )
  return sql`${combinedTextVector()} @@ to_tsquery('simple', ${term.query})`
}

function fullText(query: string) {
  const parsed = parsePublicSearch(query)
  const clauses = []
  if (parsed.required.length > 0) clauses.push(and(...parsed.required.map(matchesTerm)))
  else if (parsed.optional.length > 0) clauses.push(or(...parsed.optional.map(matchesTerm)))
  else return sql`false`
  if (parsed.excluded.length > 0) clauses.push(sql`not (${or(...parsed.excluded.map(matchesTerm))})`)
  return and(...clauses)
}

function toPublicListItem(row: {
  post: typeof posts.$inferSelect
  author: { id: bigint; name: string | null }
}, options: { redactProtectedExcerpt?: boolean } = {}) {
  const redactProtectedExcerpt = options.redactProtectedExcerpt ?? true
  const excerpt = redactProtectedExcerpt && row.post.access === 'MEMBER' && !row.post.excerptAuthored
    ? null
    : row.post.excerpt
  return {
    id: String(row.post.id), title: row.post.title, slug: row.post.slug,
    excerpt, coverImage: row.post.coverImage,
    category: row.post.category, tags: row.post.tags,
    publishedAt: instant(row.post.publishedAt), createdAt: row.post.createdAt.toISOString(),
    updatedAt: row.post.updatedAt.toISOString(),
    access: row.post.access,
    membersOnly: row.post.access === 'MEMBER',
    sourceLocale: row.post.sourceLocale as ArticleLocale,
    requestedLocale: row.post.sourceLocale as ArticleLocale,
    resolvedLocale: row.post.sourceLocale as ArticleLocale,
    availableLocales: [row.post.sourceLocale as ArticleLocale],
    isFallback: false,
    fallbackReason: null,
    author: { id: String(row.author.id), name: row.author.name },
  }
}

function toAdminListItem(row: {
  post: typeof posts.$inferSelect
  author: { id: bigint; name: string | null; email: string }
}) {
  return {
    ...toPublicListItem(row, { redactProtectedExcerpt: false }),
    status: row.post.status,
    author: { id: String(row.author.id), name: row.author.name, email: row.author.email },
  }
}

function toAdminDetail(row: typeof posts.$inferSelect & { author: { id: bigint; name: string | null; email: string } }) {
  return postAdminDetailSchema.parse({
    ...toAdminListItem({ post: row, author: row.author }),
    content: row.content,
    excerptAuthored: row.excerptAuthored,
    authorId: String(row.authorId),
    sourceRevision: row.sourceRevision,
    sourceHash: row.sourceHash,
    autoTranslateEnabled: row.autoTranslateEnabled,
    autoTranslateLocales: row.autoTranslateLocales as ArticleLocale[],
    autoTranslateProvider: row.autoTranslateProvider === 'ai' ? 'ai' : 'edge',
  })
}

function toPublicDetail(
  row: typeof posts.$inferSelect & { author: { id: bigint; name: string | null } },
  options: { redactProtectedExcerpt?: boolean } = {},
) {
  return postPublicDetailSchema.parse({
    ...toPublicListItem({ post: row, author: row.author }, options),
    content: row.content,
  })
}

function toPublicMetadata(row: typeof posts.$inferSelect & { author: { id: bigint; name: string | null } }) {
  return postPublicMetadataSchema.parse(toPublicListItem({ post: row, author: row.author }))
}

export function registerPostRoutes(app: Hono<AppEnv>, dependencies: {
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
  const readAdmin = async (id: bigint) => {
    const [row] = await db.select({ post: posts, author: { id: users.id, name: users.name, email: users.email } })
      .from(posts).innerJoin(users, eq(users.id, posts.authorId)).where(eq(posts.id, id)).limit(1)
    return row
  }
  const readPublic = async (slug: string) => {
    const [row] = await db.select({ post: posts, author: { id: users.id, name: users.name } })
      .from(posts).innerJoin(users, eq(users.id, posts.authorId)).where(and(eq(posts.slug, slug), eq(posts.status, 'PUBLISHED'), isNotNull(posts.publishedAt))).limit(1)
    return row
  }
  const localePreference = async (c: Context<AppEnv>): Promise<ArticleLocale | null> => {
    const viewer = c.get('user')
    if (viewer) {
      const [account] = await db.select({ locale: users.locale }).from(users).where(eq(users.id, BigInt(viewer.id))).limit(1)
      const locale = articleLocaleSchema.safeParse(account?.locale)
      if (locale.success) return locale.data
    }
    const cookieLocale = articleLocaleSchema.safeParse(getCookie(c, 'diary-locale'))
    return cookieLocale.success ? cookieLocale.data : null
  }
  const explicitLocale = (value: string | undefined): ArticleLocale | undefined => {
    if (value === undefined) return undefined
    const parsed = articleLocaleSchema.safeParse(value)
    if (!parsed.success) return validationError(parsed.error)
    return parsed.data
  }
  const requestedLocaleForPost = async (c: Context<AppEnv>, post: typeof posts.$inferSelect, explicit?: ArticleLocale) =>
    explicit ?? await localePreference(c) ?? post.sourceLocale as ArticleLocale
  const uniqueSlug = async (title: string, excludeId?: bigint, connection: Database | ResearchTransaction = db) => {
    const base = slugFromTitle(title)
    const [clash] = await connection.select({ id: posts.id }).from(posts)
      .where(excludeId === undefined ? eq(posts.slug, base) : and(eq(posts.slug, base), sql`${posts.id} <> ${excludeId}`)).limit(1)
    return clash ? `${base}-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}` : base
  }
  const guardResearchPublication = async (tx: ResearchTransaction, postId: bigint, overrides?: { title?: string; content?: string }) => {
    const problem = await researchPublicationIssue({ db: tx, postId, now: now(), latestCompletedSession: dependencies.latestCompletedSession, ...overrides })
    if (problem) return fail(409, problem.code, problem.message)
  }
  const lockMutation = async (tx: ResearchTransaction, actorId: bigint) => {
    await lockResearchMutation(tx)
    const [actor] = await tx.select({ role: users.role }).from(users).where(eq(users.id, actorId))
    if (actor?.role !== 'ADMIN') return fail(403, 'AUTH_FORBIDDEN', 'Admin access required')
  }
  const queueAutomaticTranslations = async (post: typeof posts.$inferSelect, requestedBy: bigint) => {
    if (post.status !== 'PUBLISHED' || !post.publishedAt || !post.autoTranslateEnabled || !post.autoTranslateProvider) return
    const provider = post.autoTranslateProvider
    if (provider !== 'edge' && provider !== 'ai') return
    if (provider === 'edge' && post.access !== 'PUBLIC') return
    const targets = articleLocaleSchema.array().safeParse(post.autoTranslateLocales)
    if (!targets.success) return
    let aiProfile: typeof articleTranslationAiProfiles.$inferSelect | undefined
    if (provider === 'ai') {
      const [settings] = await db.select().from(articleTranslationAiSettings).where(eq(articleTranslationAiSettings.singleton, 'default')).limit(1)
      if (!settings?.defaultProfileId) return
      const [profile] = await db.select().from(articleTranslationAiProfiles).where(eq(articleTranslationAiProfiles.id, settings.defaultProfileId)).limit(1)
      if (!profile?.enabled || !profile.baseUrl || !profile.model || !profile.encryptedApiKey) return
      if (post.access === 'MEMBER' && !profile.allowMemberArticles) return
      aiProfile = profile
    }
    for (const targetLocale of targets.data) {
      if (targetLocale === post.sourceLocale) continue
      try {
        await enqueueArticleTranslationJob(db, {
          postId: post.id,
          targetLocale,
          provider,
          requestedBy,
          aiProfileId: aiProfile?.id ?? null,
          aiProfileName: aiProfile?.name ?? null,
          configRevision: aiProfile?.revision ?? null,
          now: now(),
        })
      } catch {
        // Translation drafts are best-effort after the source article has already been published.
      }
    }
  }
  const listWhere = (query: { category?: string; tag?: string; search?: string; dateFrom?: string; dateTo?: string; status?: PostStatus; author?: string }, publicView: boolean) => {
    const clauses = [
      publicView ? eq(posts.status, 'PUBLISHED') : query.status ? eq(posts.status, query.status) : undefined,
      publicView ? isNotNull(posts.publishedAt) : undefined,
      query.category ? inArray(posts.category, [query.category, ...(CATEGORY_ALIASES[query.category] ?? [])]) : undefined,
      query.tag ? ilike(posts.tags, `%${query.tag}%`) : undefined,
      query.search ? publicView
        ? fullText(query.search)
        : or(ilike(posts.title, `%${query.search}%`), ilike(users.name, `%${query.search}%`), ilike(users.email, `%${query.search}%`))
        : undefined,
      query.author ? or(ilike(users.name, `%${query.author}%`), ilike(users.email, `%${query.author}%`)) : undefined,
    ]
    const dateFrom = parseDate(query.dateFrom, 'dateFrom', fail)
    const dateTo = endOfDay(query.dateTo, 'dateTo', fail)
    if (dateFrom || dateTo) clauses.push(and(dateFrom ? (publicView ? sql`${posts.publishedAt} >= ${dateFrom}` : sql`${posts.createdAt} >= ${dateFrom}`) : undefined, dateTo ? (publicView ? sql`${posts.publishedAt} <= ${dateTo}` : sql`${posts.createdAt} <= ${dateTo}`) : undefined))
    return and(...clauses)
  }
  const orderBy = (sortBy: string | undefined, publicView: boolean) => {
    const fallback = publicView ? 'publishedAt_desc' : 'createdAt_desc'
    switch (sortBy || fallback) {
      case 'publishedAt_asc': return [asc(posts.publishedAt), asc(posts.id)]
      case 'createdAt_asc': return [asc(posts.createdAt), asc(posts.id)]
      case 'updatedAt_asc': return [asc(posts.updatedAt), asc(posts.id)]
      case 'title_asc': return [asc(posts.title), asc(posts.id)]
      case 'title_desc': return [desc(posts.title), desc(posts.id)]
      case 'publishedAt_desc': return [desc(posts.publishedAt), desc(posts.id)]
      case 'updatedAt_desc': return [desc(posts.updatedAt), desc(posts.id)]
      case 'createdAt_desc':
      default: return [desc(posts.createdAt), desc(posts.id)]
    }
  }
  async function list(c: Context<AppEnv>, publicView: boolean) {
    if (!publicView) admin(c)
    c.header('Cache-Control', 'no-store')
    const parsed = (publicView ? postAdminListQuerySchema.omit({ status: true, author: true }) : postAdminListQuerySchema).safeParse(c.req.query())
    if (!parsed.success) return validationError(parsed.error)
    const query = parsed.data
    const explicitLang = explicitLocale(query.lang)
    const preference = publicView && !explicitLang ? await localePreference(c) : null
    const defaultLimit = publicView ? PUBLIC_DEFAULT_LIMIT : ADMIN_DEFAULT_LIMIT
    const limit = query.limit && query.limit >= 1 && query.limit <= MAX_LIMIT ? query.limit : defaultLimit
    const page = query.page
    const where = listWhere(query, publicView)
    const rows = await db.select({ post: posts, author: publicView ? { id: users.id, name: users.name } : { id: users.id, name: users.name, email: users.email } })
      .from(posts).innerJoin(users, eq(users.id, posts.authorId)).where(where).orderBy(...orderBy(query.sortBy, publicView)).limit(limit).offset((page - 1) * limit)
    const [totalRow] = await db.select({ total: count() }).from(posts).innerJoin(users, eq(users.id, posts.authorId)).where(where)
    const total = Number(totalRow?.total ?? 0)
    let data: unknown[]
    if (publicView) {
      const publicRows = rows as Array<{ post: typeof posts.$inferSelect; author: { id: bigint; name: string | null } }>
      const accessibleRows = publicRows.filter(row => resolveArticleReadAccess(row.post, c.get('user')) !== 'NOT_FOUND')
      const translations = await loadArticleTranslations(db, accessibleRows.map(row => row.post.id))
      data = accessibleRows.map(row => {
        const requested = explicitLang ?? preference ?? row.post.sourceLocale as ArticleLocale
        const resolution = resolveArticleTranslation(row.post, translations.get(row.post.id) ?? [], requested)
        return postPublicListResponseSchema.shape.data.element.parse({
          ...toPublicListItem(row as { post: typeof posts.$inferSelect; author: { id: bigint; name: string | null } }),
          ...localizedPostFields(row.post, resolution),
        })
      })
    } else {
      data = rows.map(row => toAdminListItem(row as { post: typeof posts.$inferSelect; author: { id: bigint; name: string | null; email: string } }))
    }
    const response = { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }
    return c.json(publicView ? postPublicListResponseSchema.parse(response) : postAdminListResponseSchema.parse(response))
  }

  app.get('/api/blog/admin', c => list(c, false))
  app.get('/api/blog/admin/:id', async c => {
    admin(c)
    const id = parseId(c.req.param('id'), validationError)
    const row = await readAdmin(id)
    if (!row) return fail(404, 'BLOG_NOT_FOUND', 'Post not found')
    const decision = resolveArticleReadAccess(row.post, c.get('user'), { allowAdminPreview: true })
    if (decision !== 'FULL') return fail(404, 'BLOG_NOT_FOUND', 'Post not found')
    return c.json(toAdminDetail(row.post ? { ...row.post, author: row.author } : row as never))
  })
  app.post('/api/blog/admin/:id/publish', c => transition(c, 'PUBLISHED'))
  app.post('/api/blog/admin/:id/archive', c => transition(c, 'ARCHIVED'))
  async function transition(c: Context<AppEnv>, status: PostStatus) {
    const actorId = admin(c)
    const id = parseId(c.req.param('id'), validationError)
    await db.transaction(async tx => {
      await lockMutation(tx, actorId)
      const [post] = await tx.select().from(posts).where(eq(posts.id, id)).for('update')
      if (!post) return fail(404, 'BLOG_NOT_FOUND', 'Post not found')
      if (status === 'PUBLISHED') await guardResearchPublication(tx, id)
      const timestamp = now()
      await tx.update(posts).set({ status, publishedAt: publishedAtFor(post.status, post.publishedAt, status, timestamp), updatedAt: timestamp }).where(eq(posts.id, id))
    })
    const latest = await readAdmin(id)
    if (!latest) return fail(404, 'BLOG_NOT_FOUND', 'Post not found')
    if (status === 'PUBLISHED') await queueAutomaticTranslations(latest.post, actorId)
    return c.json(toAdminDetail({ ...latest.post, author: latest.author }))
  }
  app.post('/api/blog/admin/bulk-publish', async c => {
    const actorId = admin(c)
    const input = await parseJson(c, postBulkRequestSchema)
    const ids = input.ids.map(BigInt)
    const result = await db.transaction(async tx => {
      await lockMutation(tx, actorId)
      const rows = await tx.select({ id: posts.id, status: posts.status, publishedAt: posts.publishedAt }).from(posts).where(inArray(posts.id, ids)).orderBy(asc(posts.id)).for('update')
      for (const row of rows) await guardResearchPublication(tx, row.id)
      for (const row of rows) await tx.update(posts).set({ status: 'PUBLISHED', publishedAt: publishedAtFor(row.status, row.publishedAt, 'PUBLISHED', now()), updatedAt: now() }).where(eq(posts.id, row.id))
      return rows.length
    })
    const publishedRows = await db.select().from(posts).where(and(inArray(posts.id, ids), eq(posts.status, 'PUBLISHED')))
    for (const post of publishedRows) await queueAutomaticTranslations(post, actorId)
    return c.json(postBulkResponseSchema.parse({ count: result }))
  })
  app.post('/api/blog/admin/bulk-delete', async c => {
    const actorId = admin(c)
    const input = await parseJson(c, postBulkRequestSchema)
    const result = await db.transaction(async tx => {
      await lockMutation(tx, actorId)
      return tx.delete(posts).where(inArray(posts.id, input.ids.map(BigInt))).returning({ id: posts.id })
    })
    return c.json(postBulkResponseSchema.parse({ count: result.length }))
  })

  app.get('/api/blog', c => list(c, true))
  app.get('/api/blog/:slug/metadata', async c => {
    c.header('Cache-Control', 'no-store')
    const row = await readPublic(decodeURIComponent(c.req.param('slug')))
    if (!row) return fail(404, 'BLOG_NOT_FOUND', 'Post not found')
    const decision = resolveArticleReadAccess(row.post, c.get('user'))
    if (decision === 'NOT_FOUND') return fail(404, 'BLOG_NOT_FOUND', 'Post not found')
    const requested = await requestedLocaleForPost(c, row.post, explicitLocale(c.req.query('lang')))
    const translations = await loadArticleTranslations(db, [row.post.id])
    const resolution = resolveArticleTranslation(row.post, translations.get(row.post.id) ?? [], requested)
    return c.json(postPublicMetadataSchema.parse({
      ...toPublicMetadata({ ...row.post, author: row.author }),
      ...localizedPostFields(row.post, resolution),
    }))
  })
  app.get('/api/blog/:slug', async c => {
    c.header('Cache-Control', 'no-store')
    const row = await readPublic(decodeURIComponent(c.req.param('slug')))
    if (!row) return fail(404, 'BLOG_NOT_FOUND', 'Post not found')
    const decision = resolveArticleReadAccess(row.post, c.get('user'))
    if (decision === 'NOT_FOUND') return fail(404, 'BLOG_NOT_FOUND', 'Post not found')
    if (decision === 'LOCKED') return fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    const requested = await requestedLocaleForPost(c, row.post, explicitLocale(c.req.query('lang')))
    const translations = await loadArticleTranslations(db, [row.post.id])
    const resolution = resolveArticleTranslation(row.post, translations.get(row.post.id) ?? [], requested)
    return c.json(postPublicDetailSchema.parse({
      ...toPublicDetail({ ...row.post, author: row.author }, { redactProtectedExcerpt: c.get('user') === undefined }),
      ...localizedPostFields(row.post, resolution, { includeContent: true, redactProtectedExcerpt: c.get('user') === undefined }),
    }))
  })
  app.post('/api/blog', async c => {
    const authorId = admin(c)
    const input = await parseJson(c, postWriteRequestSchema)
    if (input.autoTranslateEnabled && (input.autoTranslateProvider ?? 'edge') === 'edge' && (input.access ?? 'MEMBER') !== 'PUBLIC') {
      return fail(409, 'ARTICLE_TRANSLATION_PRIVACY_RESTRICTED', 'Automatic Microsoft Edge Translate can only process PUBLIC articles')
    }
    const timestamp = now()
    const excerptAuthored = typeof input.excerpt === 'string' && input.excerpt.length > 0
    const created = await db.transaction(async tx => {
      await lockMutation(tx, authorId)
      const [post] = await tx.insert(posts).values({
        authorId,
        title: input.title,
        slug: await uniqueSlug(input.title, undefined, tx),
        content: input.content,
        excerpt: input.excerpt || excerptFromMarkdown(input.content),
        excerptAuthored,
        coverImage: input.coverImage,
        category: input.category,
        tags: input.tags,
        status: input.status,
        access: input.access ?? 'MEMBER',
        sourceLocale: input.sourceLocale ?? 'zh-TW',
        autoTranslateEnabled: input.autoTranslateEnabled ?? false,
        autoTranslateLocales: input.autoTranslateLocales ?? [],
        autoTranslateProvider: input.autoTranslateEnabled === false ? null : input.autoTranslateProvider ?? (input.autoTranslateEnabled ? 'edge' : null),
        publishedAt: input.status === 'PUBLISHED' ? timestamp : null,
        createdAt: timestamp,
        updatedAt: timestamp,
      }).returning()
      if (!post) throw new Error('Post insert returned no row')
      if (input.status === 'PUBLISHED') await guardResearchPublication(tx, post.id)
      return post
    })
    if (!created) throw new Error('Post insert returned no row')
    if (created.status === 'PUBLISHED') await queueAutomaticTranslations(created, authorId)
    const row = await readAdmin(created.id)
    if (!row) throw new Error('Post read after insert returned no row')
    return c.json(toAdminDetail({ ...row.post, author: row.author }), 200)
  })
  app.put('/api/blog/:id', async c => {
    const actorId = admin(c)
    const id = parseId(c.req.param('id'), validationError)
    const input = await parseJson(c, postWriteRequestSchema)
    await db.transaction(async tx => {
      await lockMutation(tx, actorId)
      const [post] = await tx.select().from(posts).where(eq(posts.id, id)).for('update')
      if (!post) return fail(404, 'BLOG_NOT_FOUND', 'Post not found')
      const existing = { post }
      const [researchLink] = await tx.select().from(researchArticleLinks).where(eq(researchArticleLinks.postId, id)).for('update')
      const researchContentChanged = Boolean(researchLink) && (input.title !== post.title || input.content !== post.content)
      if (input.status === 'PUBLISHED' && !researchContentChanged) await guardResearchPublication(tx, id, { title: input.title, content: input.content })
      const timestamp = now()
      const nextAccess = input.access ?? existing.post.access
      const nextAutoTranslateEnabled = input.autoTranslateEnabled ?? existing.post.autoTranslateEnabled
      const nextAutoTranslateProvider = input.autoTranslateEnabled === false
        ? null
        : input.autoTranslateProvider ?? (input.autoTranslateEnabled ? existing.post.autoTranslateProvider ?? 'edge' : existing.post.autoTranslateProvider)
      if (nextAutoTranslateEnabled && nextAutoTranslateProvider === 'edge' && nextAccess !== 'PUBLIC') {
        return fail(409, 'ARTICLE_TRANSLATION_PRIVACY_RESTRICTED', 'Automatic Microsoft Edge Translate can only process PUBLIC articles')
      }
      const hasExcerptInput = input.excerpt !== undefined
      const echoedDerivedExcerpt = !existing.post.excerptAuthored
        && typeof input.excerpt === 'string'
        && input.excerpt === existing.post.excerpt
      const excerptAuthored = hasExcerptInput
        ? typeof input.excerpt === 'string' && input.excerpt.length > 0 && !echoedDerivedExcerpt
        : existing.post.excerptAuthored
      const excerpt = hasExcerptInput
        ? input.excerpt || excerptFromMarkdown(input.content)
        : existing.post.excerptAuthored
          ? existing.post.excerpt
          : excerptFromMarkdown(input.content)
      // Existing derived excerpts cannot be proven safe after PUBLIC -> MEMBER.
      const safeExcerpt = !excerptAuthored && (researchLink || (nextAccess === 'MEMBER' && existing.post.access !== 'MEMBER')) ? null : excerpt
      const nextStatus = researchContentChanged ? 'DRAFT' as const : input.status
      const [updated] = await tx.update(posts).set({
        title: input.title,
        slug: input.title === existing.post.title ? existing.post.slug : await uniqueSlug(input.title, id, tx),
        content: input.content,
        excerpt: safeExcerpt,
        excerptAuthored,
        coverImage: input.coverImage,
        category: input.category,
        tags: input.tags,
        status: nextStatus,
        access: nextAccess,
        sourceLocale: input.sourceLocale ?? existing.post.sourceLocale,
        autoTranslateEnabled: nextAutoTranslateEnabled,
        autoTranslateLocales: input.autoTranslateLocales ?? existing.post.autoTranslateLocales,
        autoTranslateProvider: nextAutoTranslateProvider,
        publishedAt: publishedAtFor(existing.post.status, existing.post.publishedAt, nextStatus, timestamp),
        updatedAt: timestamp,
      }).where(eq(posts.id, id)).returning()
      if (!updated) return fail(404, 'BLOG_NOT_FOUND', 'Post not found')
      if (researchContentChanged && researchLink) {
        await tx.update(researchRuns).set({ reviewStatus: 'CHANGES_REQUIRED', version: sql`${researchRuns.version} + 1`, updatedAt: timestamp }).where(eq(researchRuns.id, researchLink.runId))
      }
    })
    const row = await readAdmin(id)
    if (!row) return fail(404, 'BLOG_NOT_FOUND', 'Post not found')
    if (row.post.status === 'PUBLISHED') await queueAutomaticTranslations(row.post, actorId)
    return c.json(toAdminDetail({ ...row.post, author: row.author }))
  })
  app.delete('/api/blog/:id', async c => {
    const actorId = admin(c)
    const id = parseId(c.req.param('id'), validationError)
    const result = await db.transaction(async tx => {
      await lockMutation(tx, actorId)
      return tx.delete(posts).where(eq(posts.id, id)).returning({ id: posts.id })
    })
    if (!result.length) return fail(404, 'BLOG_NOT_FOUND', 'Post not found')
    return c.json(postDeleteResponseSchema.parse({ success: true, message: 'Post deleted successfully' }))
  })
}
