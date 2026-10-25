/**
 * Public articles and their translations.
 *
 * Moved verbatim out of the single 2,458-line schema module; no definition
 * changed, which is what `npm run db:generate` reporting no drift proves.
 */

import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './account.js'

export const postStatus = pgEnum('post_status', ['DRAFT', 'PUBLISHED', 'ARCHIVED'])
export const postAccess = pgEnum('post_access', ['PUBLIC', 'MEMBER'])
export const articleTranslationProvider = pgEnum('article_translation_provider', ['edge', 'ai', 'manual'])
export const articleTranslationStatus = pgEnum('article_translation_status', [
  'draft',
  'pending_review',
  'published',
  'unpublished',
  'stale',
])
export const articleTranslationJobStatus = pgEnum('article_translation_job_status', [
  'queued',
  'running',
  'succeeded',
  'failed',
  'stale',
  'cancelled',
])
export const posts = pgTable(
  'posts',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    authorId: bigint('author_id', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull(),
    content: text('content').notNull(),
    excerpt: text('excerpt'),
    excerptAuthored: boolean('excerpt_authored').default(false).notNull(),
    coverImage: varchar('cover_image', { length: 500 }),
    category: varchar('category', { length: 100 }).notNull(),
    tags: varchar('tags', { length: 500 }),
    sourceLocale: varchar('source_locale', { length: 5 }).default('zh-TW').notNull(),
    sourceRevision: integer('source_revision').default(1).notNull(),
    sourceHash: varchar('source_hash', { length: 32 })
      .default(sql`md5('')`)
      .notNull(),
    autoTranslateEnabled: boolean('auto_translate_enabled').default(false).notNull(),
    autoTranslateLocales: text('auto_translate_locales')
      .array()
      .default(sql`ARRAY[]::text[]`)
      .notNull(),
    autoTranslateProvider: articleTranslationProvider('auto_translate_provider'),
    status: postStatus('status').default('DRAFT').notNull(),
    access: postAccess('access').default('MEMBER').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    unique('posts_slug_key').on(table.slug),
    index('posts_author_id_idx').on(table.authorId),
    index('posts_status_idx').on(table.status),
    index('posts_published_at_idx').on(table.publishedAt),
    index('posts_status_published_idx').on(table.status, table.publishedAt.desc()),
    index('posts_category_status_idx').on(table.category, table.status),
    check('posts_source_locale_valid', sql`${table.sourceLocale} in ('zh-TW', 'zh-CN', 'en')`),
    check('posts_source_revision_positive', sql`${table.sourceRevision} > 0`),
    check('posts_source_hash_shape', sql`${table.sourceHash} ~ '^[a-f0-9]{32}$'`),
    check(
      'posts_auto_translate_locales_valid',
      sql`${table.autoTranslateLocales} <@ array['zh-TW', 'zh-CN', 'en']::text[]`,
    ),
    check(
      'posts_auto_translate_provider_valid',
      sql`${table.autoTranslateProvider} is null or ${table.autoTranslateProvider} in ('edge', 'ai')`,
    ),
    check(
      'posts_auto_translate_preferences_complete',
      sql`not ${table.autoTranslateEnabled} or (${table.autoTranslateProvider} in ('edge', 'ai') and cardinality(${table.autoTranslateLocales}) > 0)`,
    ),
  ],
)
export const postTranslations = pgTable(
  'post_translation',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    postId: bigint('post_id', { mode: 'bigint' })
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    locale: varchar('locale', { length: 5 }).notNull(),
    status: articleTranslationStatus('status').notNull().default('draft'),
    draftTitle: varchar('draft_title', { length: 255 }),
    draftExcerpt: text('draft_excerpt'),
    draftContent: text('draft_content'),
    draftVersion: integer('draft_version').notNull().default(0),
    draftSourceRevision: integer('draft_source_revision'),
    draftSourceHash: varchar('draft_source_hash', { length: 32 }),
    draftProvider: articleTranslationProvider('draft_provider'),
    draftModel: varchar('draft_model', { length: 200 }),
    draftPromptVersion: varchar('draft_prompt_version', { length: 80 }),
    publishedTitle: varchar('published_title', { length: 255 }),
    publishedExcerpt: text('published_excerpt'),
    publishedContent: text('published_content'),
    publishedVersion: integer('published_version').notNull().default(0),
    publishedSourceRevision: integer('published_source_revision'),
    publishedSourceHash: varchar('published_source_hash', { length: 32 }),
    publishedProvider: articleTranslationProvider('published_provider'),
    publishedModel: varchar('published_model', { length: 200 }),
    publishedPromptVersion: varchar('published_prompt_version', { length: 80 }),
    reviewedBy: bigint('reviewed_by', { mode: 'bigint' }).references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'date' }),
    reviewedDraftVersion: integer('reviewed_draft_version'),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    unique('post_translation_post_locale_key').on(table.postId, table.locale),
    index('post_translation_status_updated_idx').on(table.status, table.updatedAt.desc()),
    check('post_translation_locale_valid', sql`${table.locale} in ('zh-TW', 'zh-CN', 'en')`),
    check('post_translation_draft_version_nonnegative', sql`${table.draftVersion} >= 0`),
    check('post_translation_published_version_nonnegative', sql`${table.publishedVersion} >= 0`),
    check(
      'post_translation_draft_snapshot_complete',
      sql`(${table.draftVersion} = 0 and ${table.draftTitle} is null and ${table.draftContent} is null and ${table.draftSourceRevision} is null and ${table.draftSourceHash} is null) or (${table.draftVersion} > 0 and ${table.draftTitle} is not null and ${table.draftContent} is not null and ${table.draftSourceRevision} is not null and ${table.draftSourceHash} is not null)`,
    ),
    check(
      'post_translation_published_snapshot_complete',
      sql`(${table.publishedVersion} = 0 and ${table.publishedTitle} is null and ${table.publishedContent} is null and ${table.publishedSourceRevision} is null and ${table.publishedSourceHash} is null and ${table.publishedAt} is null) or (${table.publishedVersion} > 0 and ${table.publishedTitle} is not null and ${table.publishedContent} is not null and ${table.publishedSourceRevision} is not null and ${table.publishedSourceHash} is not null and ${table.publishedAt} is not null)`,
    ),
    check(
      'post_translation_review_snapshot_consistent',
      sql`(${table.reviewedDraftVersion} is null and ${table.reviewedAt} is null) or (${table.reviewedDraftVersion} is not null and ${table.reviewedAt} is not null and ${table.reviewedDraftVersion} > 0)`,
    ),
    check(
      'post_translation_published_requires_current_review',
      sql`${table.status} <> 'published' or (${table.publishedVersion} > 0 and ${table.draftVersion} > 0 and ${table.reviewedAt} is not null and ${table.reviewedDraftVersion} = ${table.draftVersion})`,
    ),
    check(
      'post_translation_source_hash_shapes',
      sql`(${table.draftSourceHash} is null or ${table.draftSourceHash} ~ '^[a-f0-9]{32}$') and (${table.publishedSourceHash} is null or ${table.publishedSourceHash} ~ '^[a-f0-9]{32}$')`,
    ),
  ],
)
export const articleTranslationAiProfiles = pgTable(
  'article_translation_ai_profile',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    name: varchar('name', { length: 100 }).notNull(),
    enabled: boolean('enabled').notNull().default(false),
    baseUrl: varchar('base_url', { length: 500 }),
    model: varchar('model', { length: 200 }),
    encryptedApiKey: text('encrypted_api_key'),
    secretKeyVersion: integer('secret_key_version'),
    timeoutMs: integer('timeout_ms').notNull().default(60_000),
    translationPrompt: text('translation_prompt').notNull(),
    promptVersion: varchar('prompt_version', { length: 80 }).notNull().default('article-translation-v1'),
    maxTokens: integer('max_tokens').notNull().default(8_000),
    maxCallsPerJob: integer('max_calls_per_job').notNull().default(2),
    tokenBudgetPerJob: integer('token_budget_per_job').notNull().default(16_000),
    allowMemberArticles: boolean('allow_member_articles').notNull().default(false),
    revision: integer('revision').notNull().default(1),
    updatedBy: bigint('updated_by', { mode: 'bigint' }).references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    uniqueIndex('article_translation_ai_profile_name_key').on(sql`lower(${table.name})`),
    check('article_translation_ai_profile_timeout_bounds', sql`${table.timeoutMs} between 1000 and 300000`),
    check(
      'article_translation_ai_profile_token_bounds',
      sql`${table.maxTokens} > 0 and ${table.maxTokens} <= 128000 and ${table.tokenBudgetPerJob} > 0 and ${table.tokenBudgetPerJob} <= 256000`,
    ),
    check('article_translation_ai_profile_calls_bounds', sql`${table.maxCallsPerJob} between 1 and 10`),
    check('article_translation_ai_profile_revision_positive', sql`${table.revision} > 0`),
    check(
      'article_translation_ai_profile_base_url_https',
      sql`${table.baseUrl} is null or ${table.baseUrl} like 'https://%'`,
    ),
    check(
      'article_translation_ai_profile_enabled_complete',
      sql`not ${table.enabled} or (${table.baseUrl} is not null and ${table.model} is not null and ${table.encryptedApiKey} is not null)`,
    ),
  ],
)
export const articleTranslationAiSettings = pgTable(
  'article_translation_ai_settings',
  {
    singleton: varchar('singleton', { length: 16 }).primaryKey().default('default'),
    defaultProfileId: bigint('default_profile_id', { mode: 'bigint' }).references(
      () => articleTranslationAiProfiles.id,
      { onDelete: 'restrict' },
    ),
    revision: integer('revision').notNull().default(1),
    updatedBy: bigint('updated_by', { mode: 'bigint' }).references(() => users.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [check('article_translation_ai_settings_revision_positive', sql`${table.revision} > 0`)],
)
export const articleTranslationJobs = pgTable(
  'article_translation_job',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    postId: bigint('post_id', { mode: 'bigint' })
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    targetLocale: varchar('target_locale', { length: 5 }).notNull(),
    sourceLocale: varchar('source_locale', { length: 5 }).notNull(),
    provider: articleTranslationProvider('provider').notNull(),
    providerProfileName: varchar('provider_profile_name', { length: 100 }),
    aiProfileId: bigint('ai_profile_id', { mode: 'bigint' }).references(() => articleTranslationAiProfiles.id, {
      onDelete: 'restrict',
    }),
    sourceRevision: integer('source_revision').notNull(),
    sourceHash: varchar('source_hash', { length: 32 }).notNull(),
    status: articleTranslationJobStatus('status').notNull().default('queued'),
    progress: integer('progress').notNull().default(0),
    error: text('error'),
    retryCount: integer('retry_count').notNull().default(0),
    maxRetries: integer('max_retries').notNull().default(2),
    requestKey: varchar('request_key', { length: 128 }).notNull(),
    configRevision: integer('config_revision').notNull().default(0),
    leaseToken: varchar('lease_token', { length: 128 }),
    workerId: varchar('worker_id', { length: 128 }),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true, mode: 'date' }),
    heartbeatAt: timestamp('heartbeat_at', { withTimezone: true, mode: 'date' }),
    queuedAt: timestamp('queued_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true, mode: 'date' }),
    finishedAt: timestamp('finished_at', { withTimezone: true, mode: 'date' }),
    resultJson: jsonb('result_json'),
    usageJson: jsonb('usage_json'),
    requestedBy: bigint('requested_by', { mode: 'bigint' }).references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    unique('article_translation_job_post_request_key').on(table.postId, table.requestKey),
    uniqueIndex('article_translation_job_active_identity_key')
      .on(
        table.postId,
        table.targetLocale,
        table.sourceRevision,
        table.sourceHash,
        table.provider,
        sql`coalesce(${table.aiProfileId}, 0::bigint)`,
        table.configRevision,
      )
      .where(sql`${table.status} in ('queued', 'running')`),
    index('article_translation_job_claim_idx').on(table.status, table.queuedAt, table.id),
    index('article_translation_job_post_created_idx').on(table.postId, table.createdAt.desc()),
    check(
      'article_translation_job_locales_valid',
      sql`${table.targetLocale} in ('zh-TW', 'zh-CN', 'en') and ${table.sourceLocale} in ('zh-TW', 'zh-CN', 'en') and ${table.targetLocale} <> ${table.sourceLocale}`,
    ),
    check('article_translation_job_source_revision_positive', sql`${table.sourceRevision} > 0`),
    check('article_translation_job_source_hash_shape', sql`${table.sourceHash} ~ '^[a-f0-9]{32}$'`),
    check('article_translation_job_provider_supported', sql`${table.provider} in ('edge', 'ai')`),
    check(
      'article_translation_job_ai_profile_consistent',
      sql`${table.provider} <> 'ai' or ${table.status} not in ('queued', 'running') or (${table.aiProfileId} is not null and ${table.configRevision} > 0)`,
    ),
    check('article_translation_job_progress_bounds', sql`${table.progress} between 0 and 100`),
    check(
      'article_translation_job_retry_bounds',
      sql`${table.retryCount} between 0 and ${table.maxRetries} and ${table.maxRetries} between 0 and 5`,
    ),
    check(
      'article_translation_job_lease_consistent',
      sql`(${table.status} = 'running' and ${table.leaseToken} is not null and ${table.workerId} is not null and ${table.leaseExpiresAt} is not null) or (${table.status} <> 'running' and ${table.leaseToken} is null and ${table.workerId} is null and ${table.leaseExpiresAt} is null)`,
    ),
    check(
      'article_translation_job_finished_consistent',
      sql`(${table.status} in ('queued', 'running') and ${table.finishedAt} is null) or (${table.status} in ('succeeded', 'failed', 'stale', 'cancelled') and ${table.finishedAt} is not null)`,
    ),
  ],
)
export const articleTranslationRuntime = pgTable(
  'article_translation_runtime',
  {
    singleton: varchar('singleton', { length: 16 }).primaryKey().default('default'),
    workerId: varchar('worker_id', { length: 128 }),
    workerHeartbeatAt: timestamp('worker_heartbeat_at', { withTimezone: true, mode: 'date' }),
    activeJobId: bigint('active_job_id', { mode: 'bigint' }).references(() => articleTranslationJobs.id, {
      onDelete: 'set null',
    }),
    activeLeaseToken: varchar('active_lease_token', { length: 128 }),
    activeLeaseExpiresAt: timestamp('active_lease_expires_at', { withTimezone: true, mode: 'date' }),
    edgeFailureCount: integer('edge_failure_count').notNull().default(0),
    edgeDisabledUntil: timestamp('edge_disabled_until', { withTimezone: true, mode: 'date' }),
    edgeLastErrorCode: varchar('edge_last_error_code', { length: 80 }),
    edgeLastFailureAt: timestamp('edge_last_failure_at', { withTimezone: true, mode: 'date' }),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    check('article_translation_runtime_edge_failures_nonnegative', sql`${table.edgeFailureCount} >= 0`),
    check(
      'article_translation_runtime_lease_consistent',
      sql`(${table.activeJobId} is null and ${table.activeLeaseToken} is null and ${table.activeLeaseExpiresAt} is null) or (${table.activeJobId} is not null and ${table.activeLeaseToken} is not null and ${table.activeLeaseExpiresAt} is not null)`,
    ),
  ],
)
