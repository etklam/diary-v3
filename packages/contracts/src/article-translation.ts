import { z } from 'zod'
import { serializedIdSchema, utcInstantSchema } from './common.js'

export const articleLocaleSchema = z.enum(['zh-TW', 'zh-CN', 'en'])
export type ArticleLocale = z.infer<typeof articleLocaleSchema>

export const translationProviderSchema = z.enum(['edge', 'ai', 'manual'])
export type TranslationProviderName = z.infer<typeof translationProviderSchema>

export const translationJobStatusSchema = z.enum(['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'STALE', 'CANCELLED'])
export const articleTranslationStatusSchema = z.enum(['MISSING', 'QUEUED', 'TRANSLATING', 'NEEDS_REVIEW', 'READY', 'PUBLISHED', 'UNPUBLISHED', 'STALE', 'FAILED'])

export const articleLocaleResolutionSchema = z.object({
  requestedLocale: articleLocaleSchema,
  resolvedLocale: articleLocaleSchema,
  sourceLocale: articleLocaleSchema,
  availableLocales: z.array(articleLocaleSchema),
  isFallback: z.boolean(),
  fallbackReason: z.enum(['translation_unavailable', 'translation_stale']).nullable(),
}).strict()

export const articleTranslationAdminRowSchema = z.object({
  locale: articleLocaleSchema,
  status: articleTranslationStatusSchema,
  draftTitle: z.string().nullable(),
  draftExcerpt: z.string().nullable(),
  draftContent: z.string().nullable(),
  draftSourceRevision: z.number().int().nonnegative().nullable(),
  draftSourceHash: z.string().nullable(),
  draftProvider: translationProviderSchema.nullable(),
  draftModel: z.string().nullable(),
  draftPromptVersion: z.string().nullable(),
  publishedTitle: z.string().nullable(),
  publishedExcerpt: z.string().nullable(),
  publishedContent: z.string().nullable(),
  publishedVersion: z.number().int().positive().nullable(),
  publishedSourceRevision: z.number().int().nonnegative().nullable(),
  publishedSourceHash: z.string().nullable(),
  reviewedBy: serializedIdSchema.nullable(),
  reviewedAt: utcInstantSchema.nullable(),
  publishedAt: utcInstantSchema.nullable(),
  draftIsCurrent: z.boolean(),
  isCurrent: z.boolean(),
  latestJob: z.object({
    id: serializedIdSchema,
    provider: z.enum(['edge', 'ai']),
    providerProfileName: z.string().nullable(),
    status: translationJobStatusSchema,
    progress: z.number().int().min(0).max(100),
    error: z.string().nullable(),
    retryCount: z.number().int().nonnegative(),
  }).strict().nullable(),
}).strict()

export const articleTranslationAdminResponseSchema = z.object({
  articleId: serializedIdSchema,
  sourceLocale: articleLocaleSchema,
  sourceRevision: z.number().int().nonnegative(),
  sourceHash: z.string(),
  edgeEnabled: z.boolean(),
  edgeDisabledUntil: utcInstantSchema.nullable().optional(),
  warning: z.literal('Article text will be sent to a third-party translation service.'),
  translations: z.array(articleTranslationAdminRowSchema),
}).strict()

export const articleTranslationJobRequestSchema = z.object({
  targetLocales: z.array(articleLocaleSchema).min(1).max(2).refine(values => new Set(values).size === values.length, 'Target locales must be unique'),
  provider: z.enum(['edge', 'ai']),
}).strict()

export const articleTranslationJobResponseSchema = z.object({
  jobs: z.array(z.object({ id: serializedIdSchema, locale: articleLocaleSchema, status: translationJobStatusSchema }).strict()),
}).strict()

/** Batch translation management from the Admin article list. The bound keeps a
 *  single dispatch to work an Admin can actually read back. */
export const ARTICLE_TRANSLATION_BATCH_LIMIT = 20
export const articleTranslationBatchRequestSchema = z.object({
  articleIds: z.array(serializedIdSchema).min(1).max(ARTICLE_TRANSLATION_BATCH_LIMIT)
    .refine(values => new Set(values).size === values.length, 'Article ids must be unique'),
  // A mixed selection can have three different source locales between its
  // articles, so a batch may legitimately target all three; each article still
  // skips its own source.
  targetLocales: z.array(articleLocaleSchema).min(1).max(3).refine(values => new Set(values).size === values.length, 'Target locales must be unique'),
  provider: z.enum(['edge', 'ai']),
}).strict()

/** One outcome per article and locale. A batch never reports "all queued". */
export const articleTranslationBatchOutcomeSchema = z.enum([
  'QUEUED', 'ALREADY_ACTIVE', 'SKIPPED_SOURCE_LOCALE', 'NOT_FOUND', 'PRIVACY_RESTRICTED', 'PROVIDER_DISABLED', 'FAILED',
])
export const articleTranslationBatchResponseSchema = z.object({
  results: z.array(z.object({
    articleId: serializedIdSchema,
    locale: articleLocaleSchema,
    outcome: articleTranslationBatchOutcomeSchema,
    jobId: serializedIdSchema.nullable(),
    status: translationJobStatusSchema.nullable(),
    message: z.string().nullable(),
  }).strict()),
}).strict()

export const articleTranslationStatesQuerySchema = z.object({
  ids: z.string().min(1).max(500),
}).strict()
export const articleTranslationStatesResponseSchema = z.object({
  articles: z.array(z.object({
    articleId: serializedIdSchema,
    title: z.string(),
    access: z.enum(['PUBLIC', 'MEMBER']),
    sourceLocale: articleLocaleSchema,
    locales: z.array(z.object({ locale: articleLocaleSchema, status: articleTranslationStatusSchema }).strict()),
  }).strict()),
}).strict()

export const articleTranslationEditRequestSchema = z.object({
  title: z.string().trim().min(1).max(255),
  excerpt: z.string().trim().max(1_000).nullable(),
  content: z.string().min(1).max(100_000),
}).strict()

export const articleTranslationActionResponseSchema = z.object({
  translation: articleTranslationAdminRowSchema,
}).strict()

export const articleTranslationAiProviderSchema = z.object({
  id: serializedIdSchema,
  name: z.string().trim().min(1).max(100),
  enabled: z.boolean(),
  baseUrl: z.string().max(500),
  model: z.string().max(200),
  secretConfigured: z.boolean(),
  revision: z.number().int().positive(),
  timeoutMs: z.number().int().min(1_000).max(120_000),
  prompt: z.string().min(50).max(20_000),
  promptVersion: z.string().trim().min(1).max(40),
  maxTokens: z.number().int().min(256).max(32_000),
  maxCallsPerJob: z.number().int().min(1).max(10),
  tokenBudgetPerJob: z.number().int().min(256).max(256_000),
  allowMemberArticles: z.boolean(),
}).strict()

export const articleTranslationAiProvidersResponseSchema = z.object({
  providers: z.array(articleTranslationAiProviderSchema),
  defaultProviderId: serializedIdSchema.nullable(),
}).strict()

export const articleTranslationAiProviderSaveSchema = z.object({
  name: z.string().trim().min(1).max(100),
  enabled: z.boolean(),
  baseUrl: z.string().url().max(500),
  model: z.string().trim().min(1).max(200),
  timeoutMs: z.number().int().min(1_000).max(120_000),
  prompt: z.string().min(50).max(20_000),
  promptVersion: z.string().trim().min(1).max(40),
  maxTokens: z.number().int().min(256).max(32_000),
  maxCallsPerJob: z.number().int().min(1).max(10),
  tokenBudgetPerJob: z.number().int().min(256).max(256_000),
  allowMemberArticles: z.boolean(),
  apiKey: z.string().min(1).max(1_000).optional(),
}).strict()

export const articleTranslationAiProviderUpdateSchema = articleTranslationAiProviderSaveSchema.extend({
  expectedRevision: z.number().int().positive(),
})

export const articleTranslationAiDefaultUpdateSchema = z.object({
  providerId: serializedIdSchema.nullable(),
}).strict()

export type ArticleTranslationAdminResponse = z.infer<typeof articleTranslationAdminResponseSchema>
export type ArticleTranslationJobRequest = z.infer<typeof articleTranslationJobRequestSchema>
export type ArticleTranslationEditRequest = z.infer<typeof articleTranslationEditRequestSchema>
export type ArticleTranslationAiProvider = z.infer<typeof articleTranslationAiProviderSchema>
