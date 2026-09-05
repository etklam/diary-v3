import { z } from 'zod'
import { calendarDateSchema, serializedIdSchema, utcInstantSchema } from './common.js'

export const postStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED'])
export type PostStatus = z.infer<typeof postStatusSchema>

const CATEGORY_ALIASES: Record<string, string> = {
  fundamental: 'fundamental',
  '基本面分析': 'fundamental',
  'Fundamental Analysis': 'fundamental',
  FUNDAMENTAL: 'fundamental',
  technical: 'technical',
  '技术面分析': 'technical',
  '技術面分析': 'technical',
  'Technical Analysis': 'technical',
  TECH: 'technical',
  market: 'market',
  '市场观察': 'market',
  '市場觀察': 'market',
  'Market Watch': 'market',
  MARKET: 'market',
  strategy: 'strategy',
  '投资策略': 'strategy',
  '投資策略': 'strategy',
  'Investment Strategy': 'strategy',
  STRATEGY: 'strategy',
}

export const postCategorySchema = z.string().trim().min(1).max(100)
  .transform(value => CATEGORY_ALIASES[value] ?? value)
  .refine(value => value === 'fundamental' || value === 'technical' || value === 'market' || value === 'strategy', 'Invalid category')

const postTagsSchema = z.union([
  z.string(),
  z.array(z.string()),
  z.null(),
]).optional().transform(value => {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []
  const tags = values.map(value => value.trim()).filter(Boolean)
  return tags.length > 0 ? tags.join(',') : null
})

const coverImageSchema = z.string().trim().max(500).nullish()
  .refine(value => value === undefined || value === null || value.startsWith('/') || URL.canParse(value), 'Cover image must be an absolute URL or site-relative path')
  .transform(value => value || null)

export const postWriteRequestSchema = z.object({
  title: z.string().trim().min(1).max(255),
  content: z.string().min(1).max(100_000),
  excerpt: z.string().trim().max(1_000).nullish().transform(value => value || null),
  coverImage: coverImageSchema,
  category: postCategorySchema,
  tags: postTagsSchema,
  status: postStatusSchema.default('DRAFT'),
}).strict()

export const postListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().optional(),
  category: z.string().trim().min(1).max(100).optional(),
  tag: z.string().trim().min(1).max(100).optional(),
  search: z.string().trim().min(1).max(500).optional(),
  dateFrom: calendarDateSchema.optional(),
  dateTo: calendarDateSchema.optional(),
  sortBy: z.enum(['publishedAt_desc', 'publishedAt_asc', 'createdAt_desc', 'createdAt_asc', 'updatedAt_desc', 'updatedAt_asc', 'title_asc', 'title_desc']).optional(),
}).strict()

export const postAdminListQuerySchema = postListQuerySchema.extend({
  status: postStatusSchema.optional(),
  author: z.string().trim().min(1).max(255).optional(),
}).strict()

const publicAuthorSchema = z.object({ id: serializedIdSchema, name: z.string().nullable() }).strict()
const adminAuthorSchema = publicAuthorSchema.extend({ email: z.string().email() }).strict()

const postListFields = {
  id: serializedIdSchema,
  title: z.string(),
  slug: z.string().min(1),
  excerpt: z.string().nullable(),
  coverImage: z.string().nullable(),
  category: z.string(),
  tags: z.string().nullable(),
  publishedAt: utcInstantSchema.nullable(),
  createdAt: utcInstantSchema,
  updatedAt: utcInstantSchema,
}

export const postPublicListItemSchema = z.object({ ...postListFields, author: publicAuthorSchema }).strict()
export const postAdminListItemSchema = z.object({ ...postListFields, status: postStatusSchema, author: adminAuthorSchema }).strict()
export const postPublicListResponseSchema = z.object({
  data: z.array(postPublicListItemSchema),
  pagination: z.object({ page: z.number().int().min(1), limit: z.number().int().min(1).max(50), total: z.number().int().nonnegative(), totalPages: z.number().int().nonnegative() }).strict(),
}).strict()
export const postAdminListResponseSchema = z.object({
  data: z.array(postAdminListItemSchema),
  pagination: z.object({ page: z.number().int().min(1), limit: z.number().int().min(1).max(50), total: z.number().int().nonnegative(), totalPages: z.number().int().nonnegative() }).strict(),
}).strict()

export const postPublicDetailSchema = z.object({
  ...postListFields,
  content: z.string(),
  author: publicAuthorSchema,
}).strict()
export const postAdminDetailSchema = z.object({
  ...postListFields,
  content: z.string(),
  status: postStatusSchema,
  authorId: serializedIdSchema,
  author: adminAuthorSchema,
}).strict()

export const postBulkRequestSchema = z.object({
  ids: z.array(serializedIdSchema).min(1).max(100),
}).strict()
export const postBulkResponseSchema = z.object({ count: z.number().int().nonnegative() }).strict()
export const postDeleteResponseSchema = z.object({ success: z.literal(true), message: z.string() }).strict()

export type PostWriteRequest = z.infer<typeof postWriteRequestSchema>
export type PostPublicListResponse = z.infer<typeof postPublicListResponseSchema>
export type PostAdminListResponse = z.infer<typeof postAdminListResponseSchema>
export type PostPublicDetail = z.infer<typeof postPublicDetailSchema>
export type PostAdminDetail = z.infer<typeof postAdminDetailSchema>
