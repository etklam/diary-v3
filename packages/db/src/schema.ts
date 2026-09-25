import {
  AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const userRole = pgEnum('user_role', ['USER', 'ADMIN'])
export const refreshTokenClientType = pgEnum('refresh_token_client_type', ['WEB', 'NATIVE'])
export const refreshTokenRevocationReason = pgEnum('refresh_token_revocation_reason', [
  'ROTATED', 'LOGOUT', 'LOGOUT_ALL', 'REUSE_DETECTED', 'EXPIRED',
])
export const diaryCreatedVia = pgEnum('diary_created_via', ['WEB', 'API_KEY', 'TELEGRAM_BOT'])
export const diaryReviewStatus = pgEnum('diary_review_status', ['none', 'pending', 'reviewed'])
export const thesisReviewOutcome = pgEnum('thesis_review_outcome', ['INTACT', 'PARTIAL', 'INVALIDATED', 'UNCLEAR'])
export const transactionType = pgEnum('transaction_type', ['BUY', 'SELL'])
export const tradePlanStatus = pgEnum('trade_plan_status', ['draft', 'active', 'closed', 'cancelled'])
export const postStatus = pgEnum('post_status', ['DRAFT', 'PUBLISHED', 'ARCHIVED'])
export const postAccess = pgEnum('post_access', ['PUBLIC', 'MEMBER'])
export const articleTranslationProvider = pgEnum('article_translation_provider', ['edge', 'ai', 'manual'])
export const articleTranslationStatus = pgEnum('article_translation_status', [
  'draft', 'pending_review', 'published', 'unpublished', 'stale',
])
export const articleTranslationJobStatus = pgEnum('article_translation_job_status', [
  'queued', 'running', 'succeeded', 'failed', 'stale', 'cancelled',
])

export const users = pgTable('users', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  email: varchar('email', { length: 255 }).notNull(),
  password: text('password').notNull(),
  name: text('name'),
  role: userRole('role').default('USER').notNull(),
  tokenVersion: integer('token_version').default(0).notNull(),
  expectedMonthlyTrades: integer('expected_monthly_trades').default(20).notNull(),
  expectedProfit: numeric('expected_profit', { precision: 15, scale: 2 }).default('0').notNull(),
  expectedAvgHolding: numeric('expected_avg_holding', { precision: 15, scale: 2 }).default('0').notNull(),
  timezone: varchar('timezone', { length: 50 }).default('Asia/Taipei').notNull(),
  locale: varchar('locale', { length: 5 }).default('zh-TW').notNull(),
  defaultWorkspacePage: varchar('default_workspace_page', { length: 16 }).default('timeline').notNull(),
  excludeHolidaysInStats: boolean('exclude_holidays_in_stats').default(true).notNull(),
  favoriteTagsString: varchar('favorite_tags', { length: 500 }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('users_email_lower_key').on(sql`lower(${table.email})`),
  check('users_expected_monthly_trades_nonnegative', sql`${table.expectedMonthlyTrades} >= 0`),
  check('users_locale_valid', sql`${table.locale} in ('zh-TW', 'zh-CN', 'en')`),
  check('users_default_workspace_page_valid', sql`${table.defaultWorkspacePage} in ('diaries', 'timeline', 'calendar')`),
])

export const refreshTokens = pgTable('refresh_tokens', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  token: varchar('token', { length: 500 }).notNull().unique('refresh_tokens_token_key'),
  userId: bigint('user_id', { mode: 'bigint' }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  clientType: refreshTokenClientType('client_type').default('WEB').notNull(),
  familyId: varchar('family_id', { length: 64 }).notNull(),
  deviceName: varchar('device_name', { length: 100 }),
  parentId: bigint('parent_id', { mode: 'bigint' }).references((): AnyPgColumn => refreshTokens.id, { onDelete: 'set null' }),
  replacementId: bigint('replacement_id', { mode: 'bigint' }).references((): AnyPgColumn => refreshTokens.id, { onDelete: 'set null' }),
  revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
  revocationReason: refreshTokenRevocationReason('revocation_reason'),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  unique('refresh_tokens_replacement_id_key').on(table.replacementId),
  index('refresh_tokens_user_id_idx').on(table.userId),
  index('refresh_tokens_user_client_idx').on(table.userId, table.clientType),
  index('refresh_tokens_family_revoked_idx').on(table.familyId, table.revokedAt),
  index('refresh_tokens_parent_id_idx').on(table.parentId),
])

export const diaries = pgTable('diaries', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  userId: bigint('user_id', { mode: 'bigint' }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 500 }).notNull(),
  content: text('content').notNull(),
  summaryExcerpt: text('summary_excerpt'),
  summaryExcerptContentHash: varchar('summary_excerpt_content_hash', { length: 32 }),
  tags: text('tags').array().default(sql`ARRAY[]::text[]`).notNull(),
  createdVia: diaryCreatedVia('created_via').default('WEB').notNull(),
  createdByLabel: varchar('created_by_label', { length: 100 }),
  date: date('date', { mode: 'string' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  thesis: text('thesis'),
  risk: text('risk'),
  execution: text('execution'),
  reviewDueAt: timestamp('review_due_at', { withTimezone: true, mode: 'date' }),
  reviewStatus: diaryReviewStatus('review_status').default('none').notNull(),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'date' }),
  reviewOutcome: thesisReviewOutcome('review_outcome'),
  reviewSummary: text('review_summary'),
  reviewLearning: text('review_learning'),
  reviewAdjustment: text('review_adjustment'),
}, (table) => [
  unique('diaries_user_date_key').on(table.userId, table.date),
  unique('diaries_id_user_id_key').on(table.id, table.userId),
  index('diaries_user_id_idx').on(table.userId),
  index('diaries_user_created_idx').on(table.userId, table.createdAt.desc()),
])

export const posts = pgTable('posts', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  authorId: bigint('author_id', { mode: 'bigint' }).notNull().references(() => users.id, { onDelete: 'cascade' }),
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
  sourceHash: varchar('source_hash', { length: 32 }).default(sql`md5('')`).notNull(),
  autoTranslateEnabled: boolean('auto_translate_enabled').default(false).notNull(),
  autoTranslateLocales: text('auto_translate_locales').array().default(sql`ARRAY[]::text[]`).notNull(),
  autoTranslateProvider: articleTranslationProvider('auto_translate_provider'),
  status: postStatus('status').default('DRAFT').notNull(),
  access: postAccess('access').default('MEMBER').notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, table => [
  unique('posts_slug_key').on(table.slug),
  index('posts_author_id_idx').on(table.authorId),
  index('posts_status_idx').on(table.status),
  index('posts_published_at_idx').on(table.publishedAt),
  index('posts_status_published_idx').on(table.status, table.publishedAt.desc()),
  index('posts_category_status_idx').on(table.category, table.status),
  check('posts_source_locale_valid', sql`${table.sourceLocale} in ('zh-TW', 'zh-CN', 'en')`),
  check('posts_source_revision_positive', sql`${table.sourceRevision} > 0`),
  check('posts_source_hash_shape', sql`${table.sourceHash} ~ '^[a-f0-9]{32}$'`),
  check('posts_auto_translate_locales_valid', sql`${table.autoTranslateLocales} <@ array['zh-TW', 'zh-CN', 'en']::text[]`),
  check('posts_auto_translate_provider_valid', sql`${table.autoTranslateProvider} is null or ${table.autoTranslateProvider} in ('edge', 'ai')`),
  check('posts_auto_translate_preferences_complete', sql`not ${table.autoTranslateEnabled} or (${table.autoTranslateProvider} in ('edge', 'ai') and cardinality(${table.autoTranslateLocales}) > 0)`),
])

export const postTranslations = pgTable('post_translation', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  postId: bigint('post_id', { mode: 'bigint' }).notNull().references(() => posts.id, { onDelete: 'cascade' }),
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
}, table => [
  unique('post_translation_post_locale_key').on(table.postId, table.locale),
  index('post_translation_status_updated_idx').on(table.status, table.updatedAt.desc()),
  check('post_translation_locale_valid', sql`${table.locale} in ('zh-TW', 'zh-CN', 'en')`),
  check('post_translation_draft_version_nonnegative', sql`${table.draftVersion} >= 0`),
  check('post_translation_published_version_nonnegative', sql`${table.publishedVersion} >= 0`),
  check('post_translation_draft_snapshot_complete', sql`(${table.draftVersion} = 0 and ${table.draftTitle} is null and ${table.draftContent} is null and ${table.draftSourceRevision} is null and ${table.draftSourceHash} is null) or (${table.draftVersion} > 0 and ${table.draftTitle} is not null and ${table.draftContent} is not null and ${table.draftSourceRevision} is not null and ${table.draftSourceHash} is not null)`),
  check('post_translation_published_snapshot_complete', sql`(${table.publishedVersion} = 0 and ${table.publishedTitle} is null and ${table.publishedContent} is null and ${table.publishedSourceRevision} is null and ${table.publishedSourceHash} is null and ${table.publishedAt} is null) or (${table.publishedVersion} > 0 and ${table.publishedTitle} is not null and ${table.publishedContent} is not null and ${table.publishedSourceRevision} is not null and ${table.publishedSourceHash} is not null and ${table.publishedAt} is not null)`),
  check('post_translation_review_snapshot_consistent', sql`(${table.reviewedDraftVersion} is null and ${table.reviewedAt} is null) or (${table.reviewedDraftVersion} is not null and ${table.reviewedAt} is not null and ${table.reviewedDraftVersion} > 0)`),
  check('post_translation_published_requires_current_review', sql`${table.status} <> 'published' or (${table.publishedVersion} > 0 and ${table.draftVersion} > 0 and ${table.reviewedAt} is not null and ${table.reviewedDraftVersion} = ${table.draftVersion})`),
  check('post_translation_source_hash_shapes', sql`(${table.draftSourceHash} is null or ${table.draftSourceHash} ~ '^[a-f0-9]{32}$') and (${table.publishedSourceHash} is null or ${table.publishedSourceHash} ~ '^[a-f0-9]{32}$')`),
])

export const articleTranslationAiProfiles = pgTable('article_translation_ai_profile', {
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
}, table => [
  uniqueIndex('article_translation_ai_profile_name_key').on(sql`lower(${table.name})`),
  check('article_translation_ai_profile_timeout_bounds', sql`${table.timeoutMs} between 1000 and 300000`),
  check('article_translation_ai_profile_token_bounds', sql`${table.maxTokens} > 0 and ${table.maxTokens} <= 128000 and ${table.tokenBudgetPerJob} > 0 and ${table.tokenBudgetPerJob} <= 256000`),
  check('article_translation_ai_profile_calls_bounds', sql`${table.maxCallsPerJob} between 1 and 10`),
  check('article_translation_ai_profile_revision_positive', sql`${table.revision} > 0`),
  check('article_translation_ai_profile_base_url_https', sql`${table.baseUrl} is null or ${table.baseUrl} like 'https://%'`),
  check('article_translation_ai_profile_enabled_complete', sql`not ${table.enabled} or (${table.baseUrl} is not null and ${table.model} is not null and ${table.encryptedApiKey} is not null)`),
])

export const articleTranslationAiSettings = pgTable('article_translation_ai_settings', {
  singleton: varchar('singleton', { length: 16 }).primaryKey().default('default'),
  defaultProfileId: bigint('default_profile_id', { mode: 'bigint' }).references(() => articleTranslationAiProfiles.id, { onDelete: 'restrict' }),
  revision: integer('revision').notNull().default(1),
  updatedBy: bigint('updated_by', { mode: 'bigint' }).references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, table => [
  check('article_translation_ai_settings_revision_positive', sql`${table.revision} > 0`),
])

export const articleTranslationJobs = pgTable('article_translation_job', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  postId: bigint('post_id', { mode: 'bigint' }).notNull().references(() => posts.id, { onDelete: 'cascade' }),
  targetLocale: varchar('target_locale', { length: 5 }).notNull(),
  sourceLocale: varchar('source_locale', { length: 5 }).notNull(),
  provider: articleTranslationProvider('provider').notNull(),
  providerProfileName: varchar('provider_profile_name', { length: 100 }),
  aiProfileId: bigint('ai_profile_id', { mode: 'bigint' }).references(() => articleTranslationAiProfiles.id, { onDelete: 'restrict' }),
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
}, table => [
  unique('article_translation_job_post_request_key').on(table.postId, table.requestKey),
  uniqueIndex('article_translation_job_active_identity_key').on(table.postId, table.targetLocale, table.sourceRevision, table.sourceHash, table.provider, sql`coalesce(${table.aiProfileId}, 0::bigint)`, table.configRevision).where(sql`${table.status} in ('queued', 'running')`),
  index('article_translation_job_claim_idx').on(table.status, table.queuedAt, table.id),
  index('article_translation_job_post_created_idx').on(table.postId, table.createdAt.desc()),
  check('article_translation_job_locales_valid', sql`${table.targetLocale} in ('zh-TW', 'zh-CN', 'en') and ${table.sourceLocale} in ('zh-TW', 'zh-CN', 'en') and ${table.targetLocale} <> ${table.sourceLocale}`),
  check('article_translation_job_source_revision_positive', sql`${table.sourceRevision} > 0`),
  check('article_translation_job_source_hash_shape', sql`${table.sourceHash} ~ '^[a-f0-9]{32}$'`),
  check('article_translation_job_provider_supported', sql`${table.provider} in ('edge', 'ai')`),
  check('article_translation_job_ai_profile_consistent', sql`${table.provider} <> 'ai' or ${table.status} not in ('queued', 'running') or (${table.aiProfileId} is not null and ${table.configRevision} > 0)`),
  check('article_translation_job_progress_bounds', sql`${table.progress} between 0 and 100`),
  check('article_translation_job_retry_bounds', sql`${table.retryCount} between 0 and ${table.maxRetries} and ${table.maxRetries} between 0 and 5`),
  check('article_translation_job_lease_consistent', sql`(${table.status} = 'running' and ${table.leaseToken} is not null and ${table.workerId} is not null and ${table.leaseExpiresAt} is not null) or (${table.status} <> 'running' and ${table.leaseToken} is null and ${table.workerId} is null and ${table.leaseExpiresAt} is null)`),
  check('article_translation_job_finished_consistent', sql`(${table.status} in ('queued', 'running') and ${table.finishedAt} is null) or (${table.status} in ('succeeded', 'failed', 'stale', 'cancelled') and ${table.finishedAt} is not null)`),
])

export const articleTranslationRuntime = pgTable('article_translation_runtime', {
  singleton: varchar('singleton', { length: 16 }).primaryKey().default('default'),
  workerId: varchar('worker_id', { length: 128 }),
  workerHeartbeatAt: timestamp('worker_heartbeat_at', { withTimezone: true, mode: 'date' }),
  activeJobId: bigint('active_job_id', { mode: 'bigint' }).references(() => articleTranslationJobs.id, { onDelete: 'set null' }),
  activeLeaseToken: varchar('active_lease_token', { length: 128 }),
  activeLeaseExpiresAt: timestamp('active_lease_expires_at', { withTimezone: true, mode: 'date' }),
  edgeFailureCount: integer('edge_failure_count').notNull().default(0),
  edgeDisabledUntil: timestamp('edge_disabled_until', { withTimezone: true, mode: 'date' }),
  edgeLastErrorCode: varchar('edge_last_error_code', { length: 80 }),
  edgeLastFailureAt: timestamp('edge_last_failure_at', { withTimezone: true, mode: 'date' }),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, table => [
  check('article_translation_runtime_edge_failures_nonnegative', sql`${table.edgeFailureCount} >= 0`),
  check('article_translation_runtime_lease_consistent', sql`(${table.activeJobId} is null and ${table.activeLeaseToken} is null and ${table.activeLeaseExpiresAt} is null) or (${table.activeJobId} is not null and ${table.activeLeaseToken} is not null and ${table.activeLeaseExpiresAt} is not null)`),
])

// Research Studio is deliberately isolated from the private AI report tables
// above. Its records contain only configured market evidence and editorial
// provenance; no Diary or portfolio rows are part of this context.
export const researchMethodStatus = pgEnum('research_method_status', ['COMPLETE', 'INCOMPLETE', 'RETIRED'])
export const researchExecutionStatus = pgEnum('research_execution_status', [
  'CREATED', 'COLLECTING', 'DATA_READY', 'GENERATING', 'DRAFT_READY', 'BLOCKED', 'FAILED', 'CANCELLED',
])
export const researchDispatchStatus = pgEnum('research_dispatch_status', [
  'NOT_SENT', 'DISPATCH_INTENT', 'SENT', 'SUCCEEDED', 'FAILED', 'OUTCOME_UNKNOWN',
])
export const researchQuality = pgEnum('research_quality', ['FULL', 'LIMITED', 'STALE', 'FAILED'])
export const researchQaStatus = pgEnum('research_qa_status', ['NOT_CHECKED', 'PASS', 'WARN', 'FAIL', 'N_A'])
export const researchReviewStatus = pgEnum('research_review_status', ['DRAFT', 'CHANGES_REQUIRED', 'APPROVED'])
export const researchProviderStatus = pgEnum('research_provider_status', ['DRAFT', 'ACTIVE', 'RETIRED'])
export const researchSearchReservationStatus = pgEnum('research_search_reservation_status', ['RESERVED', 'CONSUMED', 'UNKNOWN'])

export const researchMethodProfiles = pgTable('research_method_profile', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  methodKey: varchar('method_key', { length: 80 }).notNull(),
  version: varchar('version', { length: 32 }).notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  status: researchMethodStatus('status').notNull().default('INCOMPLETE'),
  sourceUri: varchar('source_uri', { length: 500 }),
  bundleHash: varchar('bundle_hash', { length: 64 }),
  requirementsJson: text('requirements_json').notNull().default('{}'),
  coverageManifestJson: text('coverage_manifest_json').notNull().default('{}'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, table => [
  unique('research_method_profile_key').on(table.methodKey, table.version),
  check('research_method_profile_key_shape', sql`${table.methodKey} ~ '^[a-z][a-z0-9-]{2,80}$'`),
  check('research_method_profile_version_shape', sql`${table.version} ~ '^[0-9]+\\.[0-9]+\\.[0-9]+$'`),
  check('research_method_profile_hash_shape', sql`${table.bundleHash} is null or ${table.bundleHash} ~ '^[a-f0-9]{64}$'`),
])

export const researchInstrumentProfiles = pgTable('research_instrument_profile', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  methodProfileId: bigint('method_profile_id', { mode: 'bigint' }).notNull().references(() => researchMethodProfiles.id, { onDelete: 'restrict' }),
  symbol: varchar('symbol', { length: 20 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  exchange: varchar('exchange', { length: 32 }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull(),
  assetType: varchar('asset_type', { length: 16 }).notNull(),
  benchmarksJson: text('benchmarks_json').notNull().default('[]'),
  peersJson: text('peers_json').notNull().default('[]'),
  enabled: boolean('enabled').notNull().default(true),
  configHash: varchar('config_hash', { length: 64 }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, table => [
  unique('research_instrument_profile_method_symbol_key').on(table.methodProfileId, table.symbol),
  index('research_instrument_profile_symbol_idx').on(table.symbol, table.enabled),
  check('research_instrument_profile_symbol_shape', sql`${table.symbol} = upper(btrim(${table.symbol})) and ${table.symbol} ~ '^[A-Z0-9.\\-]{1,20}$'`),
  check('research_instrument_profile_currency_shape', sql`${table.currency} ~ '^[A-Z]{3}$'`),
  check('research_instrument_profile_asset_type', sql`${table.assetType} in ('EQUITY', 'ETF')`),
  check('research_instrument_profile_hash_shape', sql`${table.configHash} is null or ${table.configHash} ~ '^[a-f0-9]{64}$'`),
])

export const researchRuns = pgTable('research_run', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  requesterId: bigint('requester_id', { mode: 'bigint' }).references(() => users.id, { onDelete: 'set null' }),
  methodProfileId: bigint('method_profile_id', { mode: 'bigint' }).notNull().references(() => researchMethodProfiles.id, { onDelete: 'restrict' }),
  instrumentProfileId: bigint('instrument_profile_id', { mode: 'bigint' }).notNull().references(() => researchInstrumentProfiles.id, { onDelete: 'restrict' }),
  executionStatus: researchExecutionStatus('execution_status').notNull().default('CREATED'),
  dispatchStatus: researchDispatchStatus('dispatch_status').notNull().default('NOT_SENT'),
  quality: researchQuality('quality').notNull().default('LIMITED'),
  reviewStatus: researchReviewStatus('review_status').notNull().default('DRAFT'),
  referenceSession: date('reference_session', { mode: 'string' }),
  asOf: timestamp('as_of', { withTimezone: true, mode: 'date' }),
  displayTimezone: varchar('display_timezone', { length: 50 }).notNull().default('Asia/Hong_Kong'),
  exchangeTimezone: varchar('exchange_timezone', { length: 50 }).notNull().default('America/New_York'),
  profileSnapshotJson: text('profile_snapshot_json').notNull().default('{}'),
  evidenceHash: varchar('evidence_hash', { length: 64 }),
  currentRevision: integer('current_revision').notNull().default(0),
  version: integer('version').notNull().default(1),
  linkedPostId: bigint('linked_post_id', { mode: 'bigint' }).references(() => posts.id, { onDelete: 'set null' }),
  handoffPostId: bigint('handoff_post_id', { mode: 'bigint' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, table => [
  unique('research_run_linked_post_key').on(table.linkedPostId),
  index('research_run_status_updated_idx').on(table.executionStatus, table.updatedAt.desc(), table.id.desc()),
  index('research_run_instrument_session_idx').on(table.instrumentProfileId, table.referenceSession.desc(), table.id.desc()),
  check('research_run_revision_nonnegative', sql`${table.currentRevision} >= 0`),
  check('research_run_version_positive', sql`${table.version} > 0`),
  check('research_run_hash_shape', sql`${table.evidenceHash} is null or ${table.evidenceHash} ~ '^[a-f0-9]{64}$'`),
])

export const researchEvidenceSnapshots = pgTable('research_evidence_snapshot', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  runId: bigint('run_id', { mode: 'bigint' }).notNull().references(() => researchRuns.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  manifestJson: text('manifest_json').notNull(),
  barsJson: text('bars_json').notNull().default('[]'),
  sourcesJson: text('sources_json').notNull().default('[]'),
  metricsJson: text('metrics_json').notNull().default('{}'),
  candidatesJson: text('candidates_json').notNull().default('{}'),
  qaJson: text('qa_json').notNull().default('[]'),
  quality: researchQuality('quality').notNull().default('LIMITED'),
  contentHash: varchar('content_hash', { length: 64 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, table => [
  unique('research_evidence_snapshot_run_version_key').on(table.runId, table.version),
  unique('research_evidence_snapshot_run_hash_key').on(table.runId, table.contentHash),
  index('research_evidence_snapshot_run_created_idx').on(table.runId, table.createdAt.desc(), table.id.desc()),
  check('research_evidence_snapshot_version_positive', sql`${table.version} > 0`),
  check('research_evidence_snapshot_hash_shape', sql`${table.contentHash} ~ '^[a-f0-9]{64}$'`),
])

export const researchRevisions = pgTable('research_revision', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  runId: bigint('run_id', { mode: 'bigint' }).notNull().references(() => researchRuns.id, { onDelete: 'cascade' }),
  revision: integer('revision').notNull(),
  parentRevision: integer('parent_revision'),
  structuredJson: text('structured_json').notNull(),
  content: text('content').notNull(),
  titleHash: varchar('title_hash', { length: 64 }),
  bodyHash: varchar('body_hash', { length: 64 }).notNull(),
  qaStatus: researchQaStatus('qa_status').notNull().default('NOT_CHECKED'),
  reviewStatus: researchReviewStatus('review_status').notNull().default('DRAFT'),
  approvedBy: bigint('approved_by', { mode: 'bigint' }).references(() => users.id, { onDelete: 'set null' }),
  approvedBySnapshot: bigint('approved_by_snapshot', { mode: 'bigint' }),
  approvedAt: timestamp('approved_at', { withTimezone: true, mode: 'date' }),
  createdBy: bigint('created_by', { mode: 'bigint' }).references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, table => [
  unique('research_revision_run_number_key').on(table.runId, table.revision),
  unique('research_revision_id_run_key').on(table.id, table.runId),
  foreignKey({ columns: [table.runId, table.parentRevision], foreignColumns: [table.runId, table.revision], name: 'research_revision_parent_run_fk' }),
  index('research_revision_run_created_idx').on(table.runId, table.createdAt.desc(), table.id.desc()),
  check('research_revision_positive', sql`${table.revision} > 0`),
  check('research_revision_parent_valid', sql`${table.parentRevision} is null or ${table.parentRevision} > 0`),
  check('research_revision_hash_shape', sql`${table.bodyHash} ~ '^[a-f0-9]{64}$'`),
  check('research_revision_title_hash_shape', sql`${table.titleHash} is null or ${table.titleHash} ~ '^[a-f0-9]{64}$'`),
  check('research_revision_approval_fields', sql`${table.reviewStatus} <> 'APPROVED' or (${table.approvedBySnapshot} is not null and ${table.approvedAt} is not null)`),
])

export const researchAttempts = pgTable('research_attempt', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  runId: bigint('run_id', { mode: 'bigint' }).notNull().references(() => researchRuns.id, { onDelete: 'cascade' }),
  idempotencyKey: varchar('idempotency_key', { length: 200 }).notNull(),
  idempotencyKeyHash: varchar('idempotency_key_hash', { length: 64 }).notNull(),
  dispatchStatus: researchDispatchStatus('dispatch_status').notNull().default('DISPATCH_INTENT'),
  runtimeRevision: integer('runtime_revision').notNull().default(1),
  leaseToken: varchar('lease_token', { length: 128 }),
  workerId: varchar('worker_id', { length: 128 }),
  providerRevision: integer('provider_revision'),
  model: varchar('model', { length: 200 }),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  reasoningTokens: integer('reasoning_tokens'),
  requestId: varchar('request_id', { length: 200 }),
  reportedCostUsd: numeric('reported_cost_usd', { precision: 15, scale: 9 }),
  reservedCostCents: integer('reserved_cost_cents').notNull().default(0),
  estimatedCostCents: integer('estimated_cost_cents'),
  diagnostics: varchar('diagnostics', { length: 4_000 }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  dispatchedAt: timestamp('dispatched_at', { withTimezone: true, mode: 'date' }),
  finishedAt: timestamp('finished_at', { withTimezone: true, mode: 'date' }),
}, table => [
  unique('research_attempt_run_idempotency_key').on(table.runId, table.idempotencyKeyHash),
  index('research_attempt_run_created_idx').on(table.runId, table.createdAt.desc(), table.id.desc()),
  index('research_attempt_dispatch_idx').on(table.dispatchStatus, table.createdAt, table.id),
  check('research_attempt_hash_shape', sql`${table.idempotencyKeyHash} ~ '^[a-f0-9]{64}$'`),
  check('research_attempt_runtime_revision_positive', sql`${table.runtimeRevision} > 0`),
  check('research_attempt_cost_nonnegative', sql`${table.reservedCostCents} >= 0 and (${table.estimatedCostCents} is null or ${table.estimatedCostCents} >= 0)`),
])

export const researchBudgetSessions = pgTable('research_budget_session', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  budgetKey: varchar('budget_key', { length: 80 }).notNull().default('live-test'),
  dispatchLimit: integer('dispatch_limit').notNull().default(3),
  reserved: integer('reserved').notNull().default(0),
  consumed: integer('consumed').notNull().default(0),
  unknown: integer('unknown').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, table => [
  unique('research_budget_session_key').on(table.budgetKey),
  check('research_budget_session_limit_nonnegative', sql`${table.dispatchLimit} >= 0`),
  check('research_budget_session_counts_nonnegative', sql`${table.reserved} >= 0 and ${table.consumed} >= 0 and ${table.unknown} >= 0`),
])

export const researchSearchBudgets = pgTable('research_search_budget', {
  singleton: varchar('singleton', { length: 16 }).primaryKey().default('default'),
  enabled: boolean('enabled').notNull().default(false),
  callLimit: integer('call_limit').notNull().default(0),
  reserved: integer('reserved').notNull().default(0),
  consumed: integer('consumed').notNull().default(0),
  unknown: integer('unknown').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, table => [
  check('research_search_budget_limit_nonnegative', sql`${table.callLimit} >= 0`),
  check('research_search_budget_counts_nonnegative', sql`${table.reserved} >= 0 and ${table.consumed} >= 0 and ${table.unknown} >= 0`),
  check('research_search_budget_disabled_zero', sql`${table.enabled} or ${table.callLimit} = 0`),
])

export const researchSearchReservations = pgTable('research_search_reservation', {
  reservationId: varchar('reservation_id', { length: 36 }).primaryKey(),
  queryHash: varchar('query_hash', { length: 64 }).notNull(),
  status: researchSearchReservationStatus('status').notNull().default('RESERVED'),
  returnedResults: integer('returned_results').notNull().default(0),
  billedCredits: numeric('billed_credits', { precision: 12, scale: 3 }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  settledAt: timestamp('settled_at', { withTimezone: true, mode: 'date' }),
}, table => [
  index('research_search_reservation_status_created_idx').on(table.status, table.createdAt),
  check('research_search_reservation_query_hash_shape', sql`${table.queryHash} ~ '^[a-f0-9]{64}$'`),
  check('research_search_reservation_results_nonnegative', sql`${table.returnedResults} >= 0`),
  check('research_search_reservation_credits_nonnegative', sql`${table.billedCredits} is null or ${table.billedCredits} >= 0`),
])

export const researchRuntimeState = pgTable('research_runtime_state', {
  singleton: varchar('singleton', { length: 16 }).primaryKey().default('default'),
  revision: integer('revision').notNull().default(1),
  featureEnabled: boolean('feature_enabled').notNull().default(false),
  generationEnabled: boolean('generation_enabled').notNull().default(false),
  workerId: varchar('worker_id', { length: 128 }),
  workerHeartbeatAt: timestamp('worker_heartbeat_at', { withTimezone: true, mode: 'date' }),
  activeAttemptId: bigint('active_attempt_id', { mode: 'bigint' }).references(() => researchAttempts.id, { onDelete: 'set null' }),
  activeLeaseToken: varchar('active_lease_token', { length: 128 }),
  activeLeaseExpiresAt: timestamp('active_lease_expires_at', { withTimezone: true, mode: 'date' }),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, table => [
  check('research_runtime_lease_fields', sql`(${table.activeAttemptId} is null and ${table.activeLeaseToken} is null and ${table.activeLeaseExpiresAt} is null) or (${table.activeAttemptId} is not null and ${table.activeLeaseToken} is not null and ${table.activeLeaseExpiresAt} is not null)`),
  check('research_runtime_revision_positive', sql`${table.revision} > 0`),
])

export const researchProviderConfigs = pgTable('research_provider_config', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  revision: integer('revision').notNull(),
  status: researchProviderStatus('status').notNull().default('DRAFT'),
  provider: varchar('provider', { length: 40 }).notNull().default('openrouter'),
  protocol: varchar('protocol', { length: 40 }).notNull().default('chat_completions'),
  baseUrl: varchar('base_url', { length: 500 }).notNull().default('https://openrouter.ai/api/v1'),
  model: varchar('model', { length: 200 }).notNull().default('openrouter/free'),
  maxInputTokens: integer('max_input_tokens').notNull().default(64_000),
  maxOutputTokens: integer('max_output_tokens').notNull().default(6_000),
  timeoutMs: integer('timeout_ms').notNull().default(120_000),
  encryptedApiKey: text('encrypted_api_key'),
  createdBy: bigint('created_by', { mode: 'bigint' }).references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, table => [
  unique('research_provider_config_revision_key').on(table.revision),
  index('research_provider_config_status_idx').on(table.status, table.id),
  check('research_provider_config_provider', sql`${table.provider} = 'openrouter'`),
  check('research_provider_config_protocol', sql`${table.protocol} = 'chat_completions'`),
  check('research_provider_config_model', sql`${table.model} = 'openrouter/free'`),
  check('research_provider_config_base_url', sql`${table.baseUrl} = 'https://openrouter.ai/api/v1'`),
  check('research_provider_config_bounds', sql`${table.maxInputTokens} > 0 and ${table.maxOutputTokens} > 0 and ${table.timeoutMs} between 1000 and 300000`),
])

export const researchArticleLinks = pgTable('research_article_link', {
  postId: bigint('post_id', { mode: 'bigint' }).primaryKey().references(() => posts.id, { onDelete: 'cascade' }),
  runId: bigint('run_id', { mode: 'bigint' }).notNull().references(() => researchRuns.id, { onDelete: 'restrict' }),
  revisionId: bigint('revision_id', { mode: 'bigint' }).notNull(),
  titleHash: varchar('title_hash', { length: 64 }).notNull(),
  bodyHash: varchar('body_hash', { length: 64 }).notNull(),
  evidenceHash: varchar('evidence_hash', { length: 64 }).notNull(),
  referenceSession: date('reference_session', { mode: 'string' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, table => [
  unique('research_article_link_run_key').on(table.runId),
  unique('research_article_link_revision_key').on(table.revisionId),
  foreignKey({ columns: [table.revisionId, table.runId], foreignColumns: [researchRevisions.id, researchRevisions.runId], name: 'research_article_link_revision_run_fk' }),
  foreignKey({ columns: [table.runId, table.evidenceHash], foreignColumns: [researchEvidenceSnapshots.runId, researchEvidenceSnapshots.contentHash], name: 'research_article_link_evidence_run_fk' }),
  check('research_article_link_title_hash_shape', sql`${table.titleHash} ~ '^[a-f0-9]{64}$'`),
  check('research_article_link_body_hash_shape', sql`${table.bodyHash} ~ '^[a-f0-9]{64}$'`),
  check('research_article_link_evidence_hash_shape', sql`${table.evidenceHash} ~ '^[a-f0-9]{64}$'`),
])

export const transactions = pgTable('transactions', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  diaryId: bigint('diary_id', { mode: 'bigint' }).notNull(),
  // Denormalized owner enables a database-enforced same-owner relationship.
  userId: bigint('user_id', { mode: 'bigint' }).notNull(),
  symbol: varchar('symbol', { length: 20 }).notNull(),
  type: transactionType('type').notNull(),
  quantity: numeric('quantity', { precision: 15, scale: 4 }).notNull(),
  price: numeric('price', { precision: 15, scale: 4 }).notNull(),
  tradeDate: timestamp('trade_date', { withTimezone: true, mode: 'date' }).notNull(),
  notes: text('notes'),
  strategy: varchar('strategy', { length: 100 }),
  emotion: varchar('emotion', { length: 20 }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  foreignKey({
    name: 'transactions_diary_owner_fkey',
    columns: [table.diaryId, table.userId],
    foreignColumns: [diaries.id, diaries.userId],
  }).onDelete('cascade'),
  check('transactions_quantity_positive', sql`${table.quantity} > 0`),
  check('transactions_price_positive', sql`${table.price} > 0`),
  index('transactions_diary_id_idx').on(table.diaryId),
  index('transactions_diary_owner_idx').on(table.diaryId, table.userId),
  index('transactions_symbol_trade_date_idx').on(table.symbol, table.tradeDate.asc()),
  index('transactions_user_trade_date_idx').on(table.userId, table.tradeDate.asc()),
])

export const tradePlans = pgTable('trade_plans', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  userId: bigint('user_id', { mode: 'bigint' }).notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  diaryId: bigint('diary_id', { mode: 'bigint' })
    .references(() => diaries.id, { onDelete: 'set null' }),
  symbol: varchar('symbol', { length: 32 }).notNull(),
  setupType: varchar('setup_type', { length: 100 }),
  entryPrice: numeric('entry_price', { precision: 18, scale: 6 }),
  entryZoneLow: numeric('entry_zone_low', { precision: 18, scale: 6 }),
  entryZoneHigh: numeric('entry_zone_high', { precision: 18, scale: 6 }),
  stopLoss: numeric('stop_loss', { precision: 18, scale: 6 }),
  targetPrice: numeric('target_price', { precision: 18, scale: 6 }),
  maxPositionSize: numeric('max_position_size', { precision: 18, scale: 2 }),
  invalidationCondition: text('invalidation_condition'),
  notes: text('notes'),
  status: tradePlanStatus('status').default('draft').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  check('trade_plans_entry_price_nonnegative', sql`${table.entryPrice} is null or ${table.entryPrice} >= 0`),
  check('trade_plans_entry_zone_low_nonnegative', sql`${table.entryZoneLow} is null or ${table.entryZoneLow} >= 0`),
  check('trade_plans_entry_zone_high_nonnegative', sql`${table.entryZoneHigh} is null or ${table.entryZoneHigh} >= 0`),
  check('trade_plans_stop_loss_nonnegative', sql`${table.stopLoss} is null or ${table.stopLoss} >= 0`),
  check('trade_plans_target_price_nonnegative', sql`${table.targetPrice} is null or ${table.targetPrice} >= 0`),
  check('trade_plans_max_position_size_nonnegative', sql`${table.maxPositionSize} is null or ${table.maxPositionSize} >= 0`),
  check('trade_plans_zone_order_v1_check', sql`${table.entryZoneLow} is null or ${table.entryZoneHigh} is null or ${table.entryZoneLow} <= ${table.entryZoneHigh}`),
  index('trade_plans_user_status_idx').on(table.userId, table.status),
  index('trade_plans_user_symbol_idx').on(table.userId, table.symbol),
  index('trade_plans_diary_id_idx').on(table.diaryId),
])

export const stocks = pgTable('stocks', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  symbol: varchar('symbol', { length: 32 }).notNull().unique(),
  quoteSymbol: varchar('quote_symbol', { length: 32 }),
  name: varchar('name', { length: 255 }),
  exchange: varchar('exchange', { length: 32 }),
  currency: varchar('currency', { length: 8 }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
})

export const diaryStocks = pgTable('diary_stocks', {
  diaryId: bigint('diary_id', { mode: 'bigint' }).notNull().references(() => diaries.id, { onDelete: 'cascade' }),
  stockId: bigint('stock_id', { mode: 'bigint' }).notNull().references(() => stocks.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, table => [
  primaryKey({ columns: [table.diaryId, table.stockId] }),
  index('diary_stocks_stock_diary_idx').on(table.stockId, table.diaryId),
])

export const stockWatchStatus = pgEnum('stock_watch_status', ['WATCHING', 'ARCHIVED'])
export const stockWatchlists = pgTable('stock_watchlists', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  userId: bigint('user_id', { mode: 'bigint' }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  stockId: bigint('stock_id', { mode: 'bigint' }).notNull().references(() => stocks.id, { onDelete: 'cascade' }),
  status: stockWatchStatus('status').default('WATCHING').notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, table => [
  unique('stock_watchlists_user_stock_key').on(table.userId, table.stockId),
  check('stock_watchlists_sort_nonnegative', sql`${table.sortOrder} >= 0`),
  index('stock_watchlists_user_status_sort_idx').on(table.userId, table.status, table.sortOrder, table.id),
])

export const stockTimelineSourceType = pgEnum('stock_timeline_source_type', [
  'TRADE_BASIC_DIARY', 'VIDEO_TRANSCRIBE_SUMMARIZE', 'DIARY', 'ARTICLE', 'MANUAL', 'SYSTEM',
  'MARKET_ROTATION', 'SEC_FILING', 'RELATIVE_VALUE', 'SEASONALITY',
])
export const stockTimelineCreatedVia = pgEnum('stock_timeline_created_via', ['API_KEY', 'WEB', 'SYSTEM'])
export const stockTimelineRecords = pgTable('stock_timeline_records', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  userId: bigint('user_id', { mode: 'bigint' }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  stockId: bigint('stock_id', { mode: 'bigint' }).notNull().references(() => stocks.id, { onDelete: 'cascade' }),
  summary: text('summary').notNull(),
  sourceType: stockTimelineSourceType('source_type').notNull(),
  sourceTitle: varchar('source_title', { length: 255 }),
  sourceUrl: varchar('source_url', { length: 1000 }),
  sourceDiaryId: bigint('source_diary_id', { mode: 'bigint' }).references(() => diaries.id, { onDelete: 'set null' }),
  sourceExternalId: varchar('source_external_id', { length: 255 }),
  sourceExcerpt: text('source_excerpt'),
  confidence: integer('confidence'),
  idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' }).notNull(),
  createdVia: stockTimelineCreatedVia('created_via').default('API_KEY').notNull(),
  createdByLabel: varchar('created_by_label', { length: 100 }),
  metadataJson: text('metadata_json'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, table => [
  unique('stock_timeline_records_user_stock_idempotency_key').on(table.userId, table.stockId, table.idempotencyKey),
  check('stock_timeline_records_confidence_check', sql`${table.confidence} is null or ${table.confidence} between 0 and 100`),
  index('stock_timeline_records_user_stock_time_idx').on(table.userId, table.stockId, table.occurredAt.desc(), table.id.desc()),
  index('stock_timeline_records_user_time_idx').on(table.userId, table.occurredAt.desc(), table.id.desc()),
  index('stock_timeline_records_source_external_idx').on(table.sourceType, table.sourceExternalId),
  index('stock_timeline_records_source_diary_idx').on(table.sourceDiaryId),
])

export const stockNoteCreatedVia = pgEnum('stock_note_created_via', ['USER', 'AGENT'])
export const stockNotes = pgTable('stock_notes', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  userId: bigint('user_id', { mode: 'bigint' }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  stockId: bigint('stock_id', { mode: 'bigint' }).notNull().references(() => stocks.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  content: text('content').notNull(),
  date: timestamp('date', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  createdVia: stockNoteCreatedVia('created_via').default('USER').notNull(),
  createdByLabel: varchar('created_by_label', { length: 100 }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, table => [
  index('stock_notes_user_stock_date_idx').on(table.userId, table.stockId, table.date.desc(), table.id.desc()),
  index('stock_notes_stock_date_idx').on(table.stockId, table.date.desc()),
])

export const investmentThesisStatus = pgEnum('investment_thesis_status', ['DRAFT', 'ACTIVE', 'ARCHIVED'])
export const thesisPortfolioDecision = pgEnum('thesis_portfolio_decision', ['HOLD', 'ADD', 'REDUCE', 'EXIT', 'CONTINUE_WATCHING'])
export const investmentTheses = pgTable('investment_theses', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  userId: bigint('user_id', { mode: 'bigint' }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  stockId: bigint('stock_id', { mode: 'bigint' }).notNull().references(() => stocks.id, { onDelete: 'cascade' }),
  status: investmentThesisStatus('status').default('DRAFT').notNull(),
  summary: text('summary'),
  whyIOwnIt: text('why_i_own_it'),
  growthDrivers: text('growth_drivers'),
  risks: text('risks'),
  invalidationConditions: text('invalidation_conditions'),
  expectedHoldingPeriod: varchar('expected_holding_period', { length: 255 }),
  reviewDueAt: timestamp('review_due_at', { withTimezone: true, mode: 'date' }),
  lastReviewedAt: timestamp('last_reviewed_at', { withTimezone: true, mode: 'date' }),
  latestReviewOutcome: thesisReviewOutcome('latest_review_outcome'),
  activatedAt: timestamp('activated_at', { withTimezone: true, mode: 'date' }),
  archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, table => [
  unique('investment_theses_user_stock_key').on(table.userId, table.stockId),
  unique('investment_theses_id_user_id_key').on(table.id, table.userId),
  index('investment_theses_user_status_due_idx').on(table.userId, table.status, table.reviewDueAt),
  check('investment_theses_active_content_check', sql`${table.status} <> 'ACTIVE' OR (nullif(btrim(${table.summary}), '') is not null AND nullif(btrim(${table.whyIOwnIt}), '') is not null)`),
])
export const thesisReviews = pgTable('thesis_reviews', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  thesisId: bigint('thesis_id', { mode: 'bigint' }).notNull(),
  userId: bigint('user_id', { mode: 'bigint' }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  outcome: thesisReviewOutcome('outcome').notNull(),
  whatImproved: text('what_improved'),
  whatDeteriorated: text('what_deteriorated'),
  whatChanged: text('what_changed'),
  invalidationTriggered: boolean('invalidation_triggered').default(false).notNull(),
  portfolioDecision: thesisPortfolioDecision('portfolio_decision').notNull(),
  snapshotStatus: investmentThesisStatus('snapshot_status').notNull(),
  snapshotSummary: text('snapshot_summary'),
  snapshotWhyIOwnIt: text('snapshot_why_i_own_it'),
  snapshotGrowthDrivers: text('snapshot_growth_drivers'),
  snapshotRisks: text('snapshot_risks'),
  snapshotInvalidationConditions: text('snapshot_invalidation_conditions'),
  snapshotExpectedHoldingPeriod: varchar('snapshot_expected_holding_period', { length: 255 }),
  snapshotReviewDueAt: timestamp('snapshot_review_due_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, table => [
  foreignKey({ name: 'thesis_reviews_thesis_owner_fkey', columns: [table.thesisId, table.userId], foreignColumns: [investmentTheses.id, investmentTheses.userId] }).onDelete('cascade'),
  index('thesis_reviews_user_thesis_time_idx').on(table.userId, table.thesisId, table.reviewedAt.desc(), table.id.desc()),
  index('thesis_reviews_thesis_user_idx').on(table.thesisId, table.userId),
  check('thesis_reviews_reflection_check', sql`nullif(btrim(${table.whatImproved}), '') is not null OR nullif(btrim(${table.whatDeteriorated}), '') is not null OR nullif(btrim(${table.whatChanged}), '') is not null`),
])

export const alertRecurringMode = pgEnum('alert_recurring_mode', ['WEEK', 'MONTH'])
export const alerts = pgTable('alerts', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  diaryId: bigint('diary_id', { mode: 'bigint' }).notNull().references(() => diaries.id, { onDelete: 'cascade' }),
  message: varchar('message', { length: 500 }).notNull(),
  triggerAt: timestamp('trigger_at', { withTimezone: true, mode: 'date' }).notNull(),
  isDismissed: boolean('is_dismissed').default(false).notNull(),
  recurringMode: alertRecurringMode('recurring_mode'),
  parentId: bigint('parent_id', { mode: 'bigint' }),
  instanceNumber: integer('instance_number').default(1).notNull(),
  isPaused: boolean('is_paused').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, table => [
  unique('alerts_id_diary_unique').on(table.id, table.diaryId),
  unique('alerts_parent_instance_unique').on(table.parentId, table.instanceNumber),
  foreignKey({ name: 'alerts_parent_same_diary_fk', columns: [table.parentId, table.diaryId], foreignColumns: [table.id, table.diaryId] }).onDelete('cascade'),
  check('alerts_instance_positive', sql`${table.instanceNumber} > 0`),
  check('alerts_message_nonempty', sql`length(trim(${table.message})) > 0`),
  check('alerts_single_shape', sql`${table.recurringMode} is not null or (${table.parentId} is null and ${table.instanceNumber} = 1)`),
  index('alerts_diary_trigger_id_idx').on(table.diaryId, table.triggerAt, table.id),
  index('alerts_pending_trigger_idx').on(table.isDismissed, table.triggerAt, table.id),
])

export const priceAlertType = pgEnum('price_alert_type', ['PRICE_ABOVE', 'PRICE_BELOW', 'CHANGE_PERCENT', 'MOVING_AVG'])
export const priceAlertMovingAverageDirection = pgEnum('price_alert_moving_average_direction', ['above', 'below'])
export const priceAlerts = pgTable('price_alerts', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  userId: bigint('user_id', { mode: 'bigint' }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  symbol: varchar('symbol', { length: 32 }).notNull(),
  type: priceAlertType('type').notNull(),
  threshold: numeric('threshold', { precision: 10, scale: 4 }).notNull(),
  movingAverageDirection: priceAlertMovingAverageDirection('moving_average_direction'),
  message: varchar('message', { length: 500 }).notNull(),
  isTriggered: boolean('is_triggered').notNull().default(false),
  triggeredAt: timestamp('triggered_at', { withTimezone: true }).$type<Date>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('price_alerts_user_created_idx').on(table.userId, table.createdAt, table.id),
  index('price_alerts_pending_idx').on(table.isTriggered, table.symbol),
  check('price_alerts_trigger_state_check', sql`${table.isTriggered} = (${table.triggeredAt} is not null)`),
  check('price_alerts_threshold_check', sql`${table.type} = 'CHANGE_PERCENT' or ${table.threshold} >= 0`),
  check('price_alerts_moving_average_period_check', sql`${table.type} <> 'MOVING_AVG' or ${table.threshold} in (20, 50, 200)`),
  check('price_alerts_moving_average_direction_check', sql`(${table.type} = 'MOVING_AVG' and ${table.movingAverageDirection} is not null) or (${table.type} <> 'MOVING_AVG' and ${table.movingAverageDirection} is null)`),
  check('price_alerts_symbol_check', sql`${table.symbol} ~ '^[A-Z0-9.]+$'`),
])

export const disciplines = pgTable('disciplines', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  userId: bigint('user_id', { mode: 'bigint' }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  content: varchar('content', { length: 255 }).notNull(),
  order: integer('display_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('disciplines_user_order_id_idx').on(table.userId, table.order, table.id),
  check('disciplines_content_nonempty', sql`length(btrim(${table.content})) > 0`),
])

export const personalAchievements = pgTable('personal_achievements', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  userId: bigint('user_id', { mode: 'bigint' }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  date: date('date', { mode: 'string' }).notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, table => [
  index('personal_achievements_user_date_idx').on(table.userId, table.date.desc(), table.id.desc()),
  check('personal_achievements_content_nonempty', sql`length(btrim(${table.content})) > 0`),
  check('personal_achievements_content_length', sql`length(${table.content}) <= 1000`),
])

export const partnerLinks = pgTable('partner_links', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  userAId: bigint('user_a_id', { mode: 'bigint' }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  userBId: bigint('user_b_id', { mode: 'bigint' }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  initiatedByUserId: bigint('initiated_by_user_id', { mode: 'bigint' }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  userASharesDiaries: boolean('user_a_shares_diaries').notNull().default(false),
  userBSharesDiaries: boolean('user_b_shares_diaries').notNull().default(false),
  userASharesStockNotes: boolean('user_a_shares_stock_notes').notNull().default(false),
  userBSharesStockNotes: boolean('user_b_shares_stock_notes').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  unique('partner_links_user_pair_key').on(table.userAId, table.userBId),
  index('partner_links_user_b_idx').on(table.userBId),
  index('partner_links_initiated_by_idx').on(table.initiatedByUserId),
  check('partner_links_ordered_pair', sql`${table.userAId} < ${table.userBId}`),
  check('partner_links_initiator_participant', sql`${table.initiatedByUserId} IN (${table.userAId}, ${table.userBId})`),
  check('partner_links_pending_private', sql`${table.acceptedAt} IS NOT NULL OR NOT (${table.userASharesDiaries} OR ${table.userBSharesDiaries} OR ${table.userASharesStockNotes} OR ${table.userBSharesStockNotes})`),
])

export const apiKeyScope = pgEnum('api_key_scope', ['DIARY_CREATE', 'AGENT_WRITE'])
export const apiKeyCredentials = pgTable('api_key_credentials', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  userId: bigint('user_id', { mode: 'bigint' }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  label: varchar('label', { length: 100 }).notNull(),
  keyHash: varchar('key_hash', { length: 64 }).notNull(),
  keyPrefix: varchar('key_prefix', { length: 12 }).notNull(),
  scope: apiKeyScope('scope').default('DIARY_CREATE').notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true, mode: 'date' }),
  revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, table => [
  unique('api_key_credentials_hash_key').on(table.keyHash),
  index('api_key_credentials_user_created_idx').on(table.userId, table.createdAt.desc(), table.id.desc()),
  check('api_key_credentials_label_nonempty', sql`length(btrim(${table.label})) > 0`),
  check('api_key_credentials_hash_format', sql`${table.keyHash} ~ '^[0-9a-f]{64}$'`),
  check('api_key_credentials_prefix_format', sql`${table.keyPrefix} ~ '^dva_[0-9a-f]{8}$'`),
])

export const etfs = pgTable('etfs', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  symbol: varchar('symbol', { length: 20 }).notNull(),
  name: varchar('name', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, table => [unique('etfs_symbol_key').on(table.symbol), check('etfs_symbol_canonical', sql`${table.symbol} = upper(btrim(${table.symbol})) and length(${table.symbol}) > 0`)])
export const etfPrices = pgTable('etf_prices', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  etfId: bigint('etf_id', { mode: 'bigint' }).notNull().references(() => etfs.id, { onDelete: 'cascade' }),
  date: date('date', { mode: 'string' }).notNull(),
  open: numeric('open', { precision: 10, scale: 4 }).notNull(),
  high: numeric('high', { precision: 10, scale: 4 }).notNull(),
  low: numeric('low', { precision: 10, scale: 4 }).notNull(),
  close: numeric('close', { precision: 10, scale: 4 }).notNull(),
  adjClose: numeric('adj_close', { precision: 10, scale: 4 }).notNull(),
  volume: bigint('volume', { mode: 'bigint' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, table => [unique('etf_prices_etf_date_key').on(table.etfId, table.date), index('etf_prices_etf_date_idx').on(table.etfId, table.date.desc()), check('etf_prices_volume_nonnegative', sql`${table.volume} is null or ${table.volume} >= 0`)])
export const etfWatchlists = pgTable('etf_watchlists', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  userId: bigint('user_id', { mode: 'bigint' }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  etfId: bigint('etf_id', { mode: 'bigint' }).notNull().references(() => etfs.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, table => [unique('etf_watchlists_user_etf_key').on(table.userId, table.etfId), index('etf_watchlists_user_order_idx').on(table.userId, table.sortOrder, table.id)])

export const marketUniverse = pgTable('market_universe', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  symbol: varchar('symbol', { length: 20 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  exchange: varchar('exchange', { length: 32 }).notNull(),
  assetType: varchar('asset_type', { length: 32 }).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  sector: varchar('sector', { length: 100 }),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, table => [
  unique('market_universe_symbol_key').on(table.symbol),
  index('market_universe_symbol_idx').on(table.symbol),
  index('market_universe_active_asset_type_idx').on(table.isActive, table.assetType),
  index('market_universe_exchange_active_idx').on(table.exchange, table.isActive),
  check('market_universe_symbol_canonical', sql`${table.symbol} = upper(btrim(${table.symbol})) and length(${table.symbol}) > 0`),
])

export const marketBreadthDaily = pgTable('market_breadth_daily', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  universeKey: varchar('universe_key', { length: 32 }).notNull(),
  date: date('date', { mode: 'string' }).notNull(),
  universeCount: integer('universe_count').notNull(),
  up4Count: integer('up4_count'),
  down4Count: integer('down4_count'),
  up4Pct: numeric('up4_pct', { precision: 8, scale: 4 }),
  down4Pct: numeric('down4_pct', { precision: 8, scale: 4 }),
  above40dCount: integer('above40d_count'),
  above40dPct: numeric('above40d_pct', { precision: 8, scale: 4 }),
  ratio5d: numeric('ratio_5d', { precision: 12, scale: 4 }),
  ratio10d: numeric('ratio_10d', { precision: 12, scale: 4 }),
  regime: varchar('regime', { length: 32 }),
  score: integer('score'),
  coveragePct: numeric('coverage_pct', { precision: 5, scale: 2 }),
  isStale: boolean('is_stale').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, table => [
  unique('market_breadth_daily_universe_date_key').on(table.universeKey, table.date),
  index('market_breadth_daily_universe_date_idx').on(table.universeKey, table.date.desc()),
  check('market_breadth_daily_universe_count_nonnegative', sql`${table.universeCount} >= 0`),
  check('market_breadth_daily_counts_nonnegative', sql`(${table.up4Count} is null or ${table.up4Count} >= 0) and (${table.down4Count} is null or ${table.down4Count} >= 0) and (${table.above40dCount} is null or ${table.above40dCount} >= 0)`),
  check('market_breadth_daily_percentages_bounded', sql`(${table.up4Pct} is null or (${table.up4Pct} >= 0 and ${table.up4Pct} <= 100)) and (${table.down4Pct} is null or (${table.down4Pct} >= 0 and ${table.down4Pct} <= 100)) and (${table.above40dPct} is null or (${table.above40dPct} >= 0 and ${table.above40dPct} <= 100)) and (${table.coveragePct} is null or (${table.coveragePct} >= 0 and ${table.coveragePct} <= 100))`),
])


export const marketDailyPrices = pgTable('market_daily_price', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  symbol: varchar('symbol', { length: 20 }).notNull(),
  date: date('date', { mode: 'string' }).notNull(),
  open: numeric('open', { precision: 18, scale: 6 }).notNull(),
  high: numeric('high', { precision: 18, scale: 6 }).notNull(),
  low: numeric('low', { precision: 18, scale: 6 }).notNull(),
  close: numeric('close', { precision: 18, scale: 6 }).notNull(),
  adjustedClose: numeric('adjusted_close', { precision: 18, scale: 6 }).notNull(),
  volume: bigint('volume', { mode: 'bigint' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, table => [
  unique('market_daily_price_symbol_date_key').on(table.symbol, table.date),
  index('market_daily_price_symbol_date_idx').on(table.symbol, table.date),
  index('market_daily_price_date_idx').on(table.date),
])

export const marketRotationSnapshots = pgTable('market_rotation_snapshot', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  date: date('date', { mode: 'string' }).notNull(),
  symbol: varchar('symbol', { length: 20 }).notNull(),
  rankScope: varchar('rank_scope', { length: 20 }).notNull(),
  groupType: varchar('group_type', { length: 20 }).notNull(),
  sectorName: varchar('sector_name', { length: 100 }),
  lastPrice: numeric('last_price', { precision: 18, scale: 6 }),
  adjustedClose: numeric('adjusted_close', { precision: 18, scale: 6 }),
  dailyChangePct: numeric('daily_change_pct', { precision: 10, scale: 4 }),
  weeklyChangePct: numeric('weekly_change_pct', { precision: 10, scale: 4 }),
  twoWeekPerformancePct: numeric('two_week_performance_pct', { precision: 10, scale: 4 }),
  rsi14: numeric('rsi14', { precision: 8, scale: 4 }),
  rsiPercentile: numeric('rsi_percentile', { precision: 8, scale: 4 }),
  rsiDelta2W: numeric('rsi_delta_2w', { precision: 8, scale: 4 }),
  ema10: numeric('ema10', { precision: 18, scale: 6 }),
  ema20: numeric('ema20', { precision: 18, scale: 6 }),
  sma50: numeric('sma50', { precision: 18, scale: 6 }),
  sma200: numeric('sma200', { precision: 18, scale: 6 }),
  above10d: boolean('above10d'),
  above20d: boolean('above20d'),
  above50d: boolean('above50d'),
  above200d: boolean('above200d'),
  maScore: integer('ma_score'),
  maScorePercentile: numeric('ma_score_percentile', { precision: 8, scale: 4 }),
  maStatus: varchar('ma_status', { length: 32 }),
  rolling252dHigh: numeric('rolling_252d_high', { precision: 18, scale: 6 }),
  percentFromHigh: numeric('percent_from_high', { precision: 10, scale: 4 }),
  distanceFromHighScore: numeric('distance_from_high_score', { precision: 8, scale: 4 }),
  distanceFromHighScorePercentile: numeric('distance_from_high_score_percentile', { precision: 8, scale: 4 }),
  rotationScore: numeric('rotation_score', { precision: 8, scale: 4 }),
  rotationScoreDelta2W: numeric('rotation_score_delta_2w', { precision: 8, scale: 4 }),
  rotationRank: integer('rotation_rank'),
  rankDelta2W: integer('rank_delta_2w'),
  signal: varchar('signal', { length: 32 }),
  signalStatus: varchar('signal_status', { length: 32 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, table => [
  unique('market_rotation_snapshot_scope_symbol_date_key').on(table.rankScope, table.symbol, table.date),
  index('market_rotation_snapshot_scope_date_rank_idx').on(table.rankScope, table.date, table.rotationRank),
  index('market_rotation_snapshot_scope_date_idx').on(table.rankScope, table.date),
])

export const marketRotationSnapshotRuns = pgTable('market_rotation_snapshot_run', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  rankScope: varchar('rank_scope', { length: 20 }).notNull(),
  snapshotDate: date('snapshot_date', { mode: 'string' }),
  status: varchar('status', { length: 32 }).notNull(),
  symbolCount: integer('symbol_count').default(0).notNull(),
  qualifiedSymbolCount: integer('qualified_symbol_count').default(0).notNull(),
  upsertedCount: integer('upserted_count').default(0).notNull(),
  errorCount: integer('error_count').default(0).notNull(),
  errorMessage: text('error_message'),
  startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, table => [
  index('market_rotation_snapshot_run_scope_started_idx').on(table.rankScope, table.startedAt.desc()),
  index('market_rotation_snapshot_run_snapshot_date_idx').on(table.snapshotDate),
])

// AI reports are deliberately kept in server-owned tables. The model receives
// a bounded projection; raw context is encrypted and short-lived.
export const aiReportType = pgEnum('ai_report_type', ['weekly', 'monthly'])
export const aiReportStatus = pgEnum('ai_report_status', ['queued', 'running', 'succeeded', 'failed', 'cancelled'])
export const aiReportSourceState = pgEnum('ai_report_source_state', ['current', 'changed', 'invalidated'])
export const aiReportSourceType = pgEnum('ai_report_source_type', ['diary', 'transaction', 'discipline', 'holding'])
export const aiProviderType = pgEnum('ai_provider_type', ['deepseek'])
export const aiProviderProtocol = pgEnum('ai_provider_protocol', ['chat_completions'])
export const aiThinking = pgEnum('ai_thinking', ['enabled', 'disabled'])
export const aiConfigStatus = pgEnum('ai_config_status', ['draft', 'published'])
export const aiAttemptStatus = pgEnum('ai_attempt_status', ['reserved', 'dispatched', 'succeeded', 'failed', 'cancelled', 'unknown'])
export const aiUsageScope = pgEnum('ai_usage_scope', ['user', 'global'])

export const aiProviderConfigVersions = pgTable('ai_provider_config_version', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  revision: integer('revision').notNull(),
  status: aiConfigStatus('status').notNull().default('draft'),
  displayName: varchar('display_name', { length: 120 }).notNull(),
  providerType: aiProviderType('provider_type').notNull().default('deepseek'),
  protocol: aiProviderProtocol('protocol').notNull().default('chat_completions'),
  baseUrl: varchar('base_url', { length: 500 }).notNull(),
  model: varchar('model', { length: 200 }).notNull(),
  thinking: aiThinking('thinking').notNull().default('disabled'),
  maxInputTokens: integer('max_input_tokens').notNull().default(32_000),
  maxOutputTokens: integer('max_output_tokens').notNull().default(4_000),
  timeoutMs: integer('timeout_ms').notNull().default(120_000),
  monthlyBudgetCents: integer('monthly_budget_cents').notNull().default(0),
  recipientName: varchar('recipient_name', { length: 200 }).notNull().default('DeepSeek'),
  disclosureVersion: varchar('disclosure_version', { length: 80 }).notNull().default('v1'),
  disclosureText: text('disclosure_text').notNull().default('Your saved journal records will be processed by the configured AI provider to create a private review report.'),
  pricingCurrency: varchar('pricing_currency', { length: 3 }).notNull().default('USD'),
  pricingVersion: varchar('pricing_version', { length: 80 }),
  inputPricePerMillionCents: integer('input_price_per_million_cents'),
  outputPricePerMillionCents: integer('output_price_per_million_cents'),
  reservationCostCents: integer('reservation_cost_cents').notNull().default(0),
  encryptedApiKey: text('encrypted_api_key'),
  secretKeyVersion: integer('secret_key_version'),
  recipientRevision: integer('recipient_revision').notNull().default(1),
  lastTestedAt: timestamp('last_tested_at', { withTimezone: true, mode: 'date' }),
  lastTestStatus: varchar('last_test_status', { length: 16 }),
  createdBy: bigint('created_by', { mode: 'bigint' }).references(() => users.id, { onDelete: 'set null' }),
  publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, table => [
  unique('ai_provider_config_revision_key').on(table.revision),
  index('ai_provider_config_status_idx').on(table.status, table.id),
  check('ai_provider_config_max_input_positive', sql`${table.maxInputTokens} > 0`),
  check('ai_provider_config_max_output_positive', sql`${table.maxOutputTokens} > 0`),
  check('ai_provider_config_timeout_bounds', sql`${table.timeoutMs} between 1000 and 300000`),
  check('ai_provider_config_budget_nonnegative', sql`${table.monthlyBudgetCents} >= 0`),
  check('ai_provider_config_base_url_https', sql`${table.baseUrl} like 'https://%'`),
])

export const aiPromptVersions = pgTable('ai_prompt_version', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  reportType: aiReportType('report_type').notNull(),
  revision: integer('revision').notNull(),
  template: text('template').notNull(),
  status: aiConfigStatus('status').notNull().default('draft'),
  isDefault: boolean('is_default').notNull().default(false),
  createdBy: bigint('created_by', { mode: 'bigint' }).references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }),
}, table => [
  unique('ai_prompt_version_type_revision_key').on(table.reportType, table.revision),
  index('ai_prompt_version_type_status_idx').on(table.reportType, table.status, table.id),
  check('ai_prompt_version_template_nonempty', sql`length(btrim(${table.template})) > 0`),
])

export const aiRuntimeState = pgTable('ai_runtime_state', {
  singleton: varchar('singleton', { length: 16 }).primaryKey().default('default'),
  generationEnabled: boolean('generation_enabled').notNull().default(false),
  activeProviderConfigId: bigint('active_provider_config_id', { mode: 'bigint' }).references(() => aiProviderConfigVersions.id, { onDelete: 'set null' }),
  activeWeeklyPromptId: bigint('active_weekly_prompt_id', { mode: 'bigint' }).references(() => aiPromptVersions.id, { onDelete: 'set null' }),
  activeMonthlyPromptId: bigint('active_monthly_prompt_id', { mode: 'bigint' }).references(() => aiPromptVersions.id, { onDelete: 'set null' }),
  workerId: varchar('worker_id', { length: 128 }),
  workerHeartbeatAt: timestamp('worker_heartbeat_at', { withTimezone: true, mode: 'date' }),
  deploymentEpoch: varchar('deployment_epoch', { length: 64 }),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
})

export const aiUserAccess = pgTable('ai_user_access', {
  userId: bigint('user_id', { mode: 'bigint' }).primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').notNull().default(false),
  monthlyQuota: integer('monthly_quota').notNull().default(10),
  grantedBy: bigint('granted_by', { mode: 'bigint' }).references(() => users.id, { onDelete: 'set null' }),
  grantedAt: timestamp('granted_at', { withTimezone: true, mode: 'date' }),
  revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
  dataRevision: integer('data_revision').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, table => [check('ai_user_access_quota_nonnegative', sql`${table.monthlyQuota} >= 0`), index('ai_user_access_enabled_idx').on(table.enabled, table.userId)])

export const aiUserConsents = pgTable('ai_user_consent', {
  userId: bigint('user_id', { mode: 'bigint' }).primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  recipientRevision: integer('recipient_revision').notNull(),
  disclosureVersion: varchar('disclosure_version', { length: 80 }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true, mode: 'date' }),
  revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, table => [check('ai_user_consent_revision_positive', sql`${table.recipientRevision} > 0`), check('ai_user_consent_state_check', sql`(${table.acceptedAt} is not null) or (${table.revokedAt} is not null)`)])

export const aiReports = pgTable('ai_report', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  userId: bigint('user_id', { mode: 'bigint' }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  reportType: aiReportType('report_type').notNull(),
  periodStart: date('period_start', { mode: 'string' }).notNull(),
  periodEndExclusive: date('period_end_exclusive', { mode: 'string' }).notNull(),
  timezone: varchar('timezone', { length: 50 }).notNull(),
  locale: varchar('locale', { length: 5 }).notNull(),
  revision: integer('revision').notNull(),
  status: aiReportStatus('status').notNull().default('queued'),
  sourceState: aiReportSourceState('source_state').notNull().default('current'),
  isPartialPeriod: boolean('is_partial_period').notNull().default(false),
  leaseToken: varchar('lease_token', { length: 128 }),
  workerId: varchar('worker_id', { length: 128 }),
  leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true, mode: 'date' }),
  heartbeatAt: timestamp('heartbeat_at', { withTimezone: true, mode: 'date' }),
  queuedAt: timestamp('queued_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  snapshotCapturedAt: timestamp('snapshot_captured_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }),
  dispatchedAt: timestamp('dispatched_at', { withTimezone: true, mode: 'date' }),
  finishedAt: timestamp('finished_at', { withTimezone: true, mode: 'date' }),
  inputSnapshotEncrypted: text('input_snapshot_encrypted'),
  inputSnapshotHash: varchar('input_snapshot_hash', { length: 64 }).notNull(),
  coverageJson: text('coverage_json').notNull(),
  metricsJson: text('metrics_json').notNull(),
  analysisJson: text('analysis_json'),
  model: varchar('model', { length: 200 }),
  providerConfigVersionId: bigint('provider_config_version_id', { mode: 'bigint' }).references(() => aiProviderConfigVersions.id, { onDelete: 'set null' }),
  promptVersionId: bigint('prompt_version_id', { mode: 'bigint' }).references(() => aiPromptVersions.id, { onDelete: 'set null' }),
  recipientRevision: integer('recipient_revision').notNull(),
  capturedDataRevision: integer('captured_data_revision').notNull().default(0),
  reservationBucketMonth: date('reservation_bucket_month', { mode: 'string' }).notNull().defaultNow(),
  reservationCostCents: integer('reservation_cost_cents').notNull().default(0),
  schemaVersion: varchar('schema_version', { length: 40 }).notNull().default('ai-analysis-v1'),
  idempotencyKeyHash: varchar('idempotency_key_hash', { length: 64 }).notNull(),
  normalizedRequestHash: varchar('normalized_request_hash', { length: 64 }).notNull(),
  regeneratedFromReportId: bigint('regenerated_from_report_id', { mode: 'bigint' }).references((): AnyPgColumn => aiReports.id, { onDelete: 'set null' }),
  errorCode: varchar('error_code', { length: 80 }),
  sourceInvalidatedAt: timestamp('source_invalidated_at', { withTimezone: true, mode: 'date' }),
  deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, table => [
  unique('ai_reports_id_user_key').on(table.id, table.userId),
  unique('ai_reports_user_idempotency_key').on(table.userId, table.idempotencyKeyHash),
  unique('ai_reports_period_revision_key').on(table.userId, table.reportType, table.periodStart, table.timezone, table.locale, table.revision),
  index('ai_reports_user_created_idx').on(table.userId, table.createdAt.desc(), table.id.desc()),
  index('ai_reports_user_period_idx').on(table.userId, table.reportType, table.periodStart.desc(), table.id.desc()),
  index('ai_reports_job_claim_idx').on(table.status, table.leaseExpiresAt, table.queuedAt, table.id),
  index('ai_reports_input_hash_idx').on(table.userId, table.inputSnapshotHash),
  check('ai_reports_revision_positive', sql`${table.revision} > 0`),
  check('ai_reports_period_order', sql`${table.periodEndExclusive} > ${table.periodStart}`),
  check('ai_reports_locale_valid', sql`${table.locale} in ('zh-TW', 'zh-CN', 'en')`),
  check('ai_reports_terminal_fields', sql`(${table.status} in ('queued', 'running') and ${table.finishedAt} is null) or (${table.status} in ('succeeded', 'failed', 'cancelled') and ${table.finishedAt} is not null)`),
  check('ai_reports_queued_fields', sql`${table.status} <> 'queued' or (${table.startedAt} is null and ${table.dispatchedAt} is null and ${table.leaseToken} is null and ${table.workerId} is null and ${table.leaseExpiresAt} is null)`),
  check('ai_reports_running_fields', sql`${table.status} <> 'running' or (${table.startedAt} is not null and ${table.leaseToken} is not null and ${table.workerId} is not null and ${table.leaseExpiresAt} is not null)`),
  check('ai_reports_succeeded_analysis', sql`${table.status} <> 'succeeded' or ${table.deletedAt} is not null or ${table.sourceState} = 'invalidated' or ${table.analysisJson} is not null`),
  check('ai_reports_invalidated_body', sql`${table.sourceState} <> 'invalidated' or (${table.inputSnapshotEncrypted} is null and ${table.analysisJson} is null and ${table.metricsJson} = '[]')`),
  check('ai_reports_reservation_nonnegative', sql`${table.reservationCostCents} >= 0`),
])

/** Durable request-key mapping keeps idempotency replayable across source
 * invalidation and report body retention without retaining model content. */
export const aiReportRequests = pgTable('ai_report_request', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  userId: bigint('user_id', { mode: 'bigint' }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  idempotencyKeyHash: varchar('idempotency_key_hash', { length: 64 }).notNull(),
  normalizedRequestHash: varchar('normalized_request_hash', { length: 64 }).notNull(),
  reportId: bigint('report_id', { mode: 'bigint' }).references(() => aiReports.id, { onDelete: 'set null' }),
  tombstoneUntil: timestamp('tombstone_until', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, table => [
  unique('ai_report_request_owner_key').on(table.userId, table.idempotencyKeyHash),
  index('ai_report_request_report_idx').on(table.reportId),
  index('ai_report_request_tombstone_idx').on(table.tombstoneUntil),
])

export const aiReportSources = pgTable('ai_report_source', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  reportId: bigint('report_id', { mode: 'bigint' }).notNull(),
  userId: bigint('user_id', { mode: 'bigint' }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  alias: varchar('alias', { length: 16 }).notNull(),
  sourceType: aiReportSourceType('source_type').notNull(),
  sourceId: varchar('source_id', { length: 80 }).notNull(),
  contentHash: varchar('content_hash', { length: 64 }).notNull(),
  dependency: boolean('dependency').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, table => [
  foreignKey({ name: 'ai_report_sources_report_owner_fkey', columns: [table.reportId, table.userId], foreignColumns: [aiReports.id, aiReports.userId] }).onDelete('cascade'),
  unique('ai_report_sources_report_alias_key').on(table.reportId, table.alias),
  unique('ai_report_sources_report_source_key').on(table.reportId, table.sourceType, table.sourceId),
  index('ai_report_sources_owner_source_idx').on(table.userId, table.sourceType, table.sourceId),
  index('ai_report_sources_report_idx').on(table.reportId),
])

export const aiReportAttempts = pgTable('ai_report_attempt', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  reportId: bigint('report_id', { mode: 'bigint' }),
  userId: bigint('user_id', { mode: 'bigint' }).references(() => users.id, { onDelete: 'set null' }),
  status: aiAttemptStatus('status').notNull().default('reserved'),
  providerRequestId: varchar('provider_request_id', { length: 200 }),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  cacheHitTokens: integer('cache_hit_tokens'),
  cacheMissTokens: integer('cache_miss_tokens'),
  estimatedCostCents: integer('estimated_cost_cents'),
  providerConfigVersionId: bigint('provider_config_version_id', { mode: 'bigint' }).references(() => aiProviderConfigVersions.id, { onDelete: 'set null' }),
  model: varchar('model', { length: 200 }),
  pricingVersion: varchar('pricing_version', { length: 80 }),
  pricingCurrency: varchar('pricing_currency', { length: 3 }),
  errorCode: varchar('error_code', { length: 80 }),
  reservationBucketMonth: date('reservation_bucket_month', { mode: 'string' }).notNull().defaultNow(),
  reservationCostCents: integer('reservation_cost_cents').notNull().default(0),
  slotExpiresAt: timestamp('slot_expires_at', { withTimezone: true, mode: 'date' }),
  slotReleasedAt: timestamp('slot_released_at', { withTimezone: true, mode: 'date' }),
  reservedAt: timestamp('reserved_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  dispatchedAt: timestamp('dispatched_at', { withTimezone: true, mode: 'date' }),
  finishedAt: timestamp('finished_at', { withTimezone: true, mode: 'date' }),
  latencyMs: integer('latency_ms'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, table => [
  foreignKey({ name: 'ai_report_attempt_report_fkey', columns: [table.reportId], foreignColumns: [aiReports.id] }).onDelete('set null'),
  index('ai_report_attempt_report_idx').on(table.reportId, table.id),
  index('ai_report_attempt_user_idx').on(table.userId, table.createdAt.desc()),
  index('ai_report_attempt_active_slot_idx').on(table.slotExpiresAt).where(sql`${table.slotReleasedAt} is null`),
  uniqueIndex('ai_report_attempt_report_once_key').on(table.reportId).where(sql`${table.reportId} is not null`),
])

export const aiUsageBuckets = pgTable('ai_usage_bucket', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  scope: aiUsageScope('scope').notNull(),
  userId: bigint('user_id', { mode: 'bigint' }).references(() => users.id, { onDelete: 'cascade' }),
  bucketMonth: date('bucket_month', { mode: 'string' }).notNull(),
  reserved: integer('reserved').notNull().default(0),
  reservedCostCents: integer('reserved_cost_cents').notNull().default(0),
  consumed: integer('consumed').notNull().default(0),
  released: integer('released').notNull().default(0),
  unknown: integer('unknown').notNull().default(0),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  estimatedCostCents: integer('estimated_cost_cents'),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, table => [
  unique('ai_usage_bucket_scope_month_key').on(table.scope, table.userId, table.bucketMonth),
  uniqueIndex('ai_usage_global_month_key').on(table.bucketMonth).where(sql`${table.scope} = 'global'`),
  check('ai_usage_costs_nonnegative', sql`${table.reservedCostCents} >= 0 and coalesce(${table.estimatedCostCents}, 0) >= 0`),
  check('ai_usage_bucket_counts_nonnegative', sql`${table.reserved} >= 0 and ${table.consumed} >= 0 and ${table.released} >= 0 and ${table.unknown} >= 0`),
  check('ai_usage_bucket_scope_owner_check', sql`(${table.scope} = 'global' and ${table.userId} is null) or (${table.scope} = 'user' and ${table.userId} is not null)`),
])

export const aiAdminAuditEvents = pgTable('ai_admin_audit_event', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  actorUserId: bigint('actor_user_id', { mode: 'bigint' }).references(() => users.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 80 }).notNull(),
  targetType: varchar('target_type', { length: 80 }).notNull(),
  targetId: varchar('target_id', { length: 100 }),
  summary: varchar('summary', { length: 500 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, table => [index('ai_admin_audit_created_idx').on(table.createdAt.desc(), table.id.desc()), index('ai_admin_audit_target_idx').on(table.targetType, table.targetId)])
