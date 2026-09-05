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
  postStatusSchema,
  postWriteRequestSchema,
  serializedIdSchema,
  type PostStatus,
} from '@diary/contracts'
import { posts, users, type Database } from '@diary/db'
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
type PostFail = (status: number, code: 'AUTH_UNAUTHORIZED' | 'AUTH_FORBIDDEN' | 'BLOG_NOT_FOUND' | 'SYS_VALIDATION_ERROR' | 'SYS_NOT_FOUND', message: string, details?: { field?: string; message?: string }[] | null) => never

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

function textVector(column: typeof posts.title | typeof posts.excerpt) {
  // MariaDB's frozen query uses one MATCH(excerpt,title) vector. PostgreSQL
  // keeps the same combined field boundary and applies unaccent for the
  // measured cafe/café equivalence.
  let vector = sql`to_tsvector('simple', unaccent(coalesce(${column}, '')))`
  for (const stopword of SEARCH_STOPWORDS) vector = sql`ts_delete(${vector}, ${stopword})`
  return vector
}

function combinedTextVector() {
  let vector = sql`to_tsvector('simple', unaccent(coalesce(${posts.title}, '') || ' ' || coalesce(${posts.excerpt}, '')))`
  for (const stopword of SEARCH_STOPWORDS) vector = sql`ts_delete(${vector}, ${stopword})`
  return vector
}

function matchesTerm(term: SearchTerm) {
  if (term.phrase) return or(
    sql`${textVector(posts.title)} @@ to_tsquery('simple', ${term.query})`,
    sql`${textVector(posts.excerpt)} @@ to_tsquery('simple', ${term.query})`,
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
}) {
  return {
    id: String(row.post.id), title: row.post.title, slug: row.post.slug,
    excerpt: row.post.excerpt, coverImage: row.post.coverImage,
    category: row.post.category, tags: row.post.tags,
    publishedAt: instant(row.post.publishedAt), createdAt: row.post.createdAt.toISOString(),
    updatedAt: row.post.updatedAt.toISOString(),
    author: { id: String(row.author.id), name: row.author.name },
  }
}

function toAdminListItem(row: {
  post: typeof posts.$inferSelect
  author: { id: bigint; name: string | null; email: string }
}) {
  return {
    ...toPublicListItem(row),
    status: row.post.status,
    author: { id: String(row.author.id), name: row.author.name, email: row.author.email },
  }
}

function toAdminDetail(row: typeof posts.$inferSelect & { author: { id: bigint; name: string | null; email: string } }) {
  return postAdminDetailSchema.parse({
    ...toAdminListItem({ post: row, author: row.author }),
    content: row.content,
    authorId: String(row.authorId),
  })
}

function toPublicDetail(row: typeof posts.$inferSelect & { author: { id: bigint; name: string | null } }) {
  return postPublicDetailSchema.parse({
    ...toPublicListItem({ post: row, author: row.author }),
    content: row.content,
  })
}

export function registerPostRoutes(app: Hono<AppEnv>, dependencies: {
  db: Database
  now: () => Date
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
  const uniqueSlug = async (title: string, excludeId?: bigint) => {
    const base = slugFromTitle(title)
    const [clash] = await db.select({ id: posts.id }).from(posts)
      .where(excludeId === undefined ? eq(posts.slug, base) : and(eq(posts.slug, base), sql`${posts.id} <> ${excludeId}`)).limit(1)
    return clash ? `${base}-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}` : base
  }
  const listWhere = (query: { category?: string; tag?: string; search?: string; dateFrom?: string; dateTo?: string; status?: PostStatus; author?: string }, publicView: boolean) => {
    const clauses = [
      publicView ? eq(posts.status, 'PUBLISHED') : query.status ? eq(posts.status, query.status) : undefined,
      publicView ? isNotNull(posts.publishedAt) : undefined,
      query.category ? inArray(posts.category, [query.category, ...(CATEGORY_ALIASES[query.category] ?? [])]) : undefined,
      query.tag ? ilike(posts.tags, `%${query.tag}%`) : undefined,
      query.search ? publicView
        ? fullText(query.search)
        : ilike(posts.title, `%${query.search}%`)
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
    const defaultLimit = publicView ? PUBLIC_DEFAULT_LIMIT : ADMIN_DEFAULT_LIMIT
    const limit = query.limit && query.limit >= 1 && query.limit <= MAX_LIMIT ? query.limit : defaultLimit
    const page = query.page
    const where = listWhere(query, publicView)
    const rows = await db.select({ post: posts, author: publicView ? { id: users.id, name: users.name } : { id: users.id, name: users.name, email: users.email } })
      .from(posts).innerJoin(users, eq(users.id, posts.authorId)).where(where).orderBy(...orderBy(query.sortBy, publicView)).limit(limit).offset((page - 1) * limit)
    const [totalRow] = await db.select({ total: count() }).from(posts).innerJoin(users, eq(users.id, posts.authorId)).where(where)
    const total = Number(totalRow?.total ?? 0)
    const response = { data: rows.map(row => publicView ? toPublicListItem(row as { post: typeof posts.$inferSelect; author: { id: bigint; name: string | null } }) : toAdminListItem(row as { post: typeof posts.$inferSelect; author: { id: bigint; name: string | null; email: string } })), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }
    return c.json(publicView ? postPublicListResponseSchema.parse(response) : postAdminListResponseSchema.parse(response))
  }

  app.get('/api/blog/admin', c => list(c, false))
  app.get('/api/blog/admin/:id', async c => {
    admin(c)
    const id = parseId(c.req.param('id'), validationError)
    const row = await readAdmin(id)
    if (!row) return fail(404, 'BLOG_NOT_FOUND', 'Post not found')
    return c.json(toAdminDetail(row.post ? { ...row.post, author: row.author } : row as never))
  })
  app.post('/api/blog/admin/:id/publish', c => transition(c, 'PUBLISHED'))
  app.post('/api/blog/admin/:id/archive', c => transition(c, 'ARCHIVED'))
  async function transition(c: Context<AppEnv>, status: PostStatus) {
    admin(c)
    const id = parseId(c.req.param('id'), validationError)
    const row = await readAdmin(id)
    if (!row) return fail(404, 'BLOG_NOT_FOUND', 'Post not found')
    const [updated] = await db.update(posts).set({ status, publishedAt: publishedAtFor(row.post.status, row.post.publishedAt, status, now()), updatedAt: now() }).where(eq(posts.id, id)).returning()
    if (!updated) return fail(404, 'BLOG_NOT_FOUND', 'Post not found')
    const latest = await readAdmin(id)
    if (!latest) return fail(404, 'BLOG_NOT_FOUND', 'Post not found')
    return c.json(toAdminDetail({ ...latest.post, author: latest.author }))
  }
  app.post('/api/blog/admin/bulk-publish', async c => {
    admin(c)
    const input = await parseJson(c, postBulkRequestSchema)
    const ids = input.ids.map(BigInt)
    const result = await db.transaction(async tx => {
      const rows = await tx.select({ id: posts.id, status: posts.status, publishedAt: posts.publishedAt }).from(posts).where(inArray(posts.id, ids)).for('update')
      for (const row of rows) await tx.update(posts).set({ status: 'PUBLISHED', publishedAt: publishedAtFor(row.status, row.publishedAt, 'PUBLISHED', now()), updatedAt: now() }).where(eq(posts.id, row.id))
      return rows.length
    })
    return c.json(postBulkResponseSchema.parse({ count: result }))
  })
  app.post('/api/blog/admin/bulk-delete', async c => {
    admin(c)
    const input = await parseJson(c, postBulkRequestSchema)
    const result = await db.delete(posts).where(inArray(posts.id, input.ids.map(BigInt))).returning({ id: posts.id })
    return c.json(postBulkResponseSchema.parse({ count: result.length }))
  })

  app.get('/api/blog', c => list(c, true))
  app.get('/api/blog/:slug', async c => {
    c.header('Cache-Control', 'no-store')
    const row = await readPublic(decodeURIComponent(c.req.param('slug')))
    if (!row) return fail(404, 'BLOG_NOT_FOUND', 'Post not found')
    return c.json(toPublicDetail({ ...row.post, author: row.author }))
  })
  app.post('/api/blog', async c => {
    const authorId = admin(c)
    const input = await parseJson(c, postWriteRequestSchema)
    const timestamp = now()
    const [created] = await db.insert(posts).values({
      authorId,
      title: input.title,
      slug: await uniqueSlug(input.title),
      content: input.content,
      excerpt: input.excerpt || excerptFromMarkdown(input.content),
      coverImage: input.coverImage,
      category: input.category,
      tags: input.tags,
      status: input.status,
      publishedAt: input.status === 'PUBLISHED' ? timestamp : null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }).returning()
    if (!created) throw new Error('Post insert returned no row')
    const row = await readAdmin(created.id)
    if (!row) throw new Error('Post read after insert returned no row')
    return c.json(toAdminDetail({ ...row.post, author: row.author }), 200)
  })
  app.put('/api/blog/:id', async c => {
    admin(c)
    const id = parseId(c.req.param('id'), validationError)
    const input = await parseJson(c, postWriteRequestSchema)
    const existing = await readAdmin(id)
    if (!existing) return fail(404, 'BLOG_NOT_FOUND', 'Post not found')
    const timestamp = now()
    const [updated] = await db.update(posts).set({
      title: input.title,
      slug: input.title === existing.post.title ? existing.post.slug : await uniqueSlug(input.title, id),
      content: input.content,
      excerpt: input.excerpt || excerptFromMarkdown(input.content),
      coverImage: input.coverImage,
      category: input.category,
      tags: input.tags,
      status: input.status,
      publishedAt: publishedAtFor(existing.post.status, existing.post.publishedAt, input.status, timestamp),
      updatedAt: timestamp,
    }).where(eq(posts.id, id)).returning()
    if (!updated) return fail(404, 'BLOG_NOT_FOUND', 'Post not found')
    const row = await readAdmin(id)
    if (!row) return fail(404, 'BLOG_NOT_FOUND', 'Post not found')
    return c.json(toAdminDetail({ ...row.post, author: row.author }))
  })
  app.delete('/api/blog/:id', async c => {
    admin(c)
    const id = parseId(c.req.param('id'), validationError)
    const result = await db.delete(posts).where(eq(posts.id, id)).returning({ id: posts.id })
    if (!result.length) return fail(404, 'BLOG_NOT_FOUND', 'Post not found')
    return c.json(postDeleteResponseSchema.parse({ success: true, message: 'Post deleted successfully' }))
  })
}
