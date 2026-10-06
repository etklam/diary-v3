import { z } from 'zod'
import { serializedIdSchema, utcInstantSchema } from './common.js'

// Reserve the directory's aggregate routes before public profiles are added.
const reservedSlugs = new Set(['consensus', 'activity', 'stocks', 'sectors', 'compare'])
export const guruSlugSchema = z.string().trim().min(1).max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must use lowercase letters, numbers, and single hyphens')
  .refine(value => !reservedSlugs.has(value), 'Slug is reserved for a Guru directory route')
export const guruCikInputSchema = z.string().trim().regex(/^\d{1,10}$/, 'CIK must contain 1 to 10 digits')
  .refine(value => Number(value) > 0, 'CIK must be positive')
const publicUrlSchema = z.url({ protocol: /^https?$/ }).max(2048)
const optionalText = (max: number) => z.string().trim().max(max).nullable().default(null)

export const guruEditorialProfileSchema = z.object({
  name: z.string().trim().min(1).max(200),
  managerName: z.string().trim().min(1).max(200),
  slug: guruSlugSchema,
  description: optionalText(10000),
  investmentPhilosophy: optionalText(10000),
  styleTags: z.array(z.string().trim().min(1).max(60)).max(20).default([])
    .refine(tags => new Set(tags.map(tag => tag.toLowerCase())).size === tags.length, 'Style tags must be unique'),
  managerType: optionalText(80),
  website: publicUrlSchema.nullable().default(null),
  country: z.string().trim().regex(/^[A-Z]{2}$/, 'Country must be an uppercase ISO two-letter code').nullable().default(null),
  imageUrl: publicUrlSchema.nullable().default(null),
  securityNotes: optionalText(10000),
  featured: z.boolean().default(false),
  active: z.boolean().default(true),
  directoryOrder: z.number().int().min(-999999).max(999999).default(0),
}).strict()

export const adminGuruCreateRequestSchema = z.object({
  profile: guruEditorialProfileSchema,
  manager: z.object({ cik: guruCikInputSchema }).strict(),
}).strict()
export const adminGuruUpdateRequestSchema = adminGuruCreateRequestSchema

export const adminGuruSchema = z.object({
  id: serializedIdSchema,
  profile: guruEditorialProfileSchema,
  manager: z.object({
    id: serializedIdSchema,
    cik: z.string().regex(/^\d{10}$/).refine(value => Number(value) > 0),
    createdAt: utcInstantSchema,
    updatedAt: utcInstantSchema,
  }).strict(),
  createdAt: utcInstantSchema,
  updatedAt: utcInstantSchema,
}).strict()
export const adminGuruResponseSchema = z.object({ data: adminGuruSchema }).strict()
const booleanFilter = z.enum(['true', 'false']).optional()
export const adminGuruListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().trim().max(200).optional(),
  active: booleanFilter,
  featured: booleanFilter,
}).strict()
export const adminGuruListResponseSchema = z.object({
  data: z.array(adminGuruSchema),
  pagination: z.object({
    page: z.number().int().positive(),
    limit: z.number().int().min(1).max(50),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }).strict(),
}).strict()

export type AdminGuru = z.infer<typeof adminGuruSchema>
export type AdminGuruInput = z.input<typeof adminGuruCreateRequestSchema>
export type AdminGuruListResponse = z.infer<typeof adminGuruListResponseSchema>
