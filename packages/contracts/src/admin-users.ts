import { z } from 'zod'
import { calendarDateSchema, serializedIdSchema, utcInstantSchema } from './common.js'

export const adminUserRoleSchema = z.enum(['USER', 'ADMIN'])

export const adminUserListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  search: z.string().trim().max(255).optional(),
}).strict()

export const adminUserListItemSchema = z.object({
  id: serializedIdSchema,
  email: z.email(),
  name: z.string().nullable(),
  role: adminUserRoleSchema,
  createdAt: utcInstantSchema,
  diaryCount: z.number().int().nonnegative(),
}).strict()

export const adminUserListResponseSchema = z.object({
  data: z.array(adminUserListItemSchema),
  pagination: z.object({
    page: z.number().int().min(1),
    limit: z.number().int().min(1).max(50),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }).strict(),
}).strict()

export const adminUserRoleUpdateRequestSchema = z.object({ role: adminUserRoleSchema }).strict()
export const adminUserRoleResponseSchema = z.object({
  data: z.object({
    id: serializedIdSchema,
    email: z.email(),
    name: z.string().nullable(),
    role: adminUserRoleSchema,
  }).strict(),
}).strict()

export const adminUserDeleteResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
}).strict()

const adminDiaryAuthorSchema = z.object({
  id: serializedIdSchema,
  email: z.email(),
  name: z.string().nullable(),
}).strict()

/**
 * Admin Diary data deliberately excludes private review outcome/reflection
 * fields. The remaining scalar fields preserve the source's admin inventory.
 */
export const adminDiarySchema = z.object({
  id: serializedIdSchema,
  userId: serializedIdSchema,
  title: z.string(),
  content: z.string(),
  tags: z.array(z.string()),
  createdVia: z.enum(['WEB', 'API_KEY', 'TELEGRAM_BOT']),
  createdByLabel: z.string().nullable(),
  date: calendarDateSchema,
  createdAt: utcInstantSchema,
  updatedAt: utcInstantSchema,
  thesis: z.string().nullable(),
  risk: z.string().nullable(),
  execution: z.string().nullable(),
  reviewDueAt: utcInstantSchema.nullable(),
  reviewStatus: z.enum(['none', 'pending', 'reviewed']),
  reviewedAt: utcInstantSchema.nullable(),
  author: adminDiaryAuthorSchema,
  alertCount: z.number().int().nonnegative(),
  transactionCount: z.number().int().nonnegative(),
}).strict()

export const adminDiaryListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict()

export const adminDiaryListResponseSchema = z.object({
  data: z.array(adminDiarySchema),
  pagination: z.object({
    page: z.number().int().min(1),
    limit: z.number().int().min(1).max(50),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }).strict(),
}).strict()

export const adminStatsSchema = z.object({
  users: z.object({ total: z.number().int().nonnegative(), admin: z.number().int().nonnegative(), regular: z.number().int().nonnegative() }).strict(),
  diaries: z.object({ total: z.number().int().nonnegative() }).strict(),
  alerts: z.object({ total: z.number().int().nonnegative(), active: z.number().int().nonnegative(), dismissed: z.number().int().nonnegative() }).strict(),
  transactions: z.object({ total: z.number().int().nonnegative(), buy: z.number().int().nonnegative(), sell: z.number().int().nonnegative() }).strict(),
  recentActivity: z.object({
    users: z.array(adminUserListItemSchema).max(5),
    diaries: z.array(adminDiarySchema).max(5),
  }).strict(),
}).strict()

export const adminStatsResponseSchema = z.object({ data: adminStatsSchema }).strict()

export type AdminUserListItem = z.infer<typeof adminUserListItemSchema>
export type AdminDiary = z.infer<typeof adminDiarySchema>
export type AdminStats = z.infer<typeof adminStatsSchema>
