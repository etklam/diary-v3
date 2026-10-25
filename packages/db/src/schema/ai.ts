/**
 * Manual AI reports, their provider configuration and usage accounting.
 *
 * Moved verbatim out of the single 2,458-line schema module; no definition
 * changed, which is what `npm run db:generate` reporting no drift proves.
 */

import {
  AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
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
export const aiAttemptStatus = pgEnum('ai_attempt_status', [
  'reserved',
  'dispatched',
  'succeeded',
  'failed',
  'cancelled',
  'unknown',
])
export const aiUsageScope = pgEnum('ai_usage_scope', ['user', 'global'])
export const aiProviderConfigVersions = pgTable(
  'ai_provider_config_version',
  {
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
    disclosureText: text('disclosure_text')
      .notNull()
      .default(
        'Your saved journal records will be processed by the configured AI provider to create a private review report.',
      ),
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
  },
  table => [
    unique('ai_provider_config_revision_key').on(table.revision),
    index('ai_provider_config_status_idx').on(table.status, table.id),
    check('ai_provider_config_max_input_positive', sql`${table.maxInputTokens} > 0`),
    check('ai_provider_config_max_output_positive', sql`${table.maxOutputTokens} > 0`),
    check('ai_provider_config_timeout_bounds', sql`${table.timeoutMs} between 1000 and 300000`),
    check('ai_provider_config_budget_nonnegative', sql`${table.monthlyBudgetCents} >= 0`),
    check('ai_provider_config_base_url_https', sql`${table.baseUrl} like 'https://%'`),
  ],
)
export const aiPromptVersions = pgTable(
  'ai_prompt_version',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    reportType: aiReportType('report_type').notNull(),
    revision: integer('revision').notNull(),
    template: text('template').notNull(),
    status: aiConfigStatus('status').notNull().default('draft'),
    isDefault: boolean('is_default').notNull().default(false),
    createdBy: bigint('created_by', { mode: 'bigint' }).references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }),
  },
  table => [
    unique('ai_prompt_version_type_revision_key').on(table.reportType, table.revision),
    index('ai_prompt_version_type_status_idx').on(table.reportType, table.status, table.id),
    check('ai_prompt_version_template_nonempty', sql`length(btrim(${table.template})) > 0`),
  ],
)
export const aiRuntimeState = pgTable('ai_runtime_state', {
  singleton: varchar('singleton', { length: 16 }).primaryKey().default('default'),
  generationEnabled: boolean('generation_enabled').notNull().default(false),
  activeProviderConfigId: bigint('active_provider_config_id', { mode: 'bigint' }).references(
    () => aiProviderConfigVersions.id,
    { onDelete: 'set null' },
  ),
  activeWeeklyPromptId: bigint('active_weekly_prompt_id', { mode: 'bigint' }).references(() => aiPromptVersions.id, {
    onDelete: 'set null',
  }),
  activeMonthlyPromptId: bigint('active_monthly_prompt_id', { mode: 'bigint' }).references(() => aiPromptVersions.id, {
    onDelete: 'set null',
  }),
  workerId: varchar('worker_id', { length: 128 }),
  workerHeartbeatAt: timestamp('worker_heartbeat_at', { withTimezone: true, mode: 'date' }),
  deploymentEpoch: varchar('deployment_epoch', { length: 64 }),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
})
export const aiUserAccess = pgTable(
  'ai_user_access',
  {
    userId: bigint('user_id', { mode: 'bigint' })
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    enabled: boolean('enabled').notNull().default(false),
    monthlyQuota: integer('monthly_quota').notNull().default(10),
    grantedBy: bigint('granted_by', { mode: 'bigint' }).references(() => users.id, { onDelete: 'set null' }),
    grantedAt: timestamp('granted_at', { withTimezone: true, mode: 'date' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    dataRevision: integer('data_revision').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    check('ai_user_access_quota_nonnegative', sql`${table.monthlyQuota} >= 0`),
    index('ai_user_access_enabled_idx').on(table.enabled, table.userId),
  ],
)
export const aiUserConsents = pgTable(
  'ai_user_consent',
  {
    userId: bigint('user_id', { mode: 'bigint' })
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    recipientRevision: integer('recipient_revision').notNull(),
    disclosureVersion: varchar('disclosure_version', { length: 80 }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true, mode: 'date' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    check('ai_user_consent_revision_positive', sql`${table.recipientRevision} > 0`),
    check('ai_user_consent_state_check', sql`(${table.acceptedAt} is not null) or (${table.revokedAt} is not null)`),
  ],
)
export const aiReports = pgTable(
  'ai_report',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: bigint('user_id', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
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
    providerConfigVersionId: bigint('provider_config_version_id', { mode: 'bigint' }).references(
      () => aiProviderConfigVersions.id,
      { onDelete: 'set null' },
    ),
    promptVersionId: bigint('prompt_version_id', { mode: 'bigint' }).references(() => aiPromptVersions.id, {
      onDelete: 'set null',
    }),
    recipientRevision: integer('recipient_revision').notNull(),
    capturedDataRevision: integer('captured_data_revision').notNull().default(0),
    reservationBucketMonth: date('reservation_bucket_month', { mode: 'string' }).notNull().defaultNow(),
    reservationCostCents: integer('reservation_cost_cents').notNull().default(0),
    schemaVersion: varchar('schema_version', { length: 40 }).notNull().default('ai-analysis-v1'),
    idempotencyKeyHash: varchar('idempotency_key_hash', { length: 64 }).notNull(),
    normalizedRequestHash: varchar('normalized_request_hash', { length: 64 }).notNull(),
    regeneratedFromReportId: bigint('regenerated_from_report_id', { mode: 'bigint' }).references(
      (): AnyPgColumn => aiReports.id,
      { onDelete: 'set null' },
    ),
    errorCode: varchar('error_code', { length: 80 }),
    sourceInvalidatedAt: timestamp('source_invalidated_at', { withTimezone: true, mode: 'date' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    unique('ai_reports_id_user_key').on(table.id, table.userId),
    unique('ai_reports_user_idempotency_key').on(table.userId, table.idempotencyKeyHash),
    unique('ai_reports_period_revision_key').on(
      table.userId,
      table.reportType,
      table.periodStart,
      table.timezone,
      table.locale,
      table.revision,
    ),
    index('ai_reports_user_created_idx').on(table.userId, table.createdAt.desc(), table.id.desc()),
    index('ai_reports_user_period_idx').on(table.userId, table.reportType, table.periodStart.desc(), table.id.desc()),
    index('ai_reports_job_claim_idx').on(table.status, table.leaseExpiresAt, table.queuedAt, table.id),
    index('ai_reports_input_hash_idx').on(table.userId, table.inputSnapshotHash),
    check('ai_reports_revision_positive', sql`${table.revision} > 0`),
    check('ai_reports_period_order', sql`${table.periodEndExclusive} > ${table.periodStart}`),
    check('ai_reports_locale_valid', sql`${table.locale} in ('zh-TW', 'zh-CN', 'en')`),
    check(
      'ai_reports_terminal_fields',
      sql`(${table.status} in ('queued', 'running') and ${table.finishedAt} is null) or (${table.status} in ('succeeded', 'failed', 'cancelled') and ${table.finishedAt} is not null)`,
    ),
    check(
      'ai_reports_queued_fields',
      sql`${table.status} <> 'queued' or (${table.startedAt} is null and ${table.dispatchedAt} is null and ${table.leaseToken} is null and ${table.workerId} is null and ${table.leaseExpiresAt} is null)`,
    ),
    check(
      'ai_reports_running_fields',
      sql`${table.status} <> 'running' or (${table.startedAt} is not null and ${table.leaseToken} is not null and ${table.workerId} is not null and ${table.leaseExpiresAt} is not null)`,
    ),
    check(
      'ai_reports_succeeded_analysis',
      sql`${table.status} <> 'succeeded' or ${table.deletedAt} is not null or ${table.sourceState} = 'invalidated' or ${table.analysisJson} is not null`,
    ),
    check(
      'ai_reports_invalidated_body',
      sql`${table.sourceState} <> 'invalidated' or (${table.inputSnapshotEncrypted} is null and ${table.analysisJson} is null and ${table.metricsJson} = '[]')`,
    ),
    check('ai_reports_reservation_nonnegative', sql`${table.reservationCostCents} >= 0`),
  ],
)
/** Durable request-key mapping keeps idempotency replayable across source
 * invalidation and report body retention without retaining model content. */
export const aiReportRequests = pgTable(
  'ai_report_request',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: bigint('user_id', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    idempotencyKeyHash: varchar('idempotency_key_hash', { length: 64 }).notNull(),
    normalizedRequestHash: varchar('normalized_request_hash', { length: 64 }).notNull(),
    reportId: bigint('report_id', { mode: 'bigint' }).references(() => aiReports.id, { onDelete: 'set null' }),
    tombstoneUntil: timestamp('tombstone_until', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    unique('ai_report_request_owner_key').on(table.userId, table.idempotencyKeyHash),
    index('ai_report_request_report_idx').on(table.reportId),
    index('ai_report_request_tombstone_idx').on(table.tombstoneUntil),
  ],
)
export const aiReportSources = pgTable(
  'ai_report_source',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    reportId: bigint('report_id', { mode: 'bigint' }).notNull(),
    userId: bigint('user_id', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    alias: varchar('alias', { length: 16 }).notNull(),
    sourceType: aiReportSourceType('source_type').notNull(),
    sourceId: varchar('source_id', { length: 80 }).notNull(),
    contentHash: varchar('content_hash', { length: 64 }).notNull(),
    dependency: boolean('dependency').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    foreignKey({
      name: 'ai_report_sources_report_owner_fkey',
      columns: [table.reportId, table.userId],
      foreignColumns: [aiReports.id, aiReports.userId],
    }).onDelete('cascade'),
    unique('ai_report_sources_report_alias_key').on(table.reportId, table.alias),
    unique('ai_report_sources_report_source_key').on(table.reportId, table.sourceType, table.sourceId),
    index('ai_report_sources_owner_source_idx').on(table.userId, table.sourceType, table.sourceId),
    index('ai_report_sources_report_idx').on(table.reportId),
  ],
)
export const aiReportAttempts = pgTable(
  'ai_report_attempt',
  {
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
    providerConfigVersionId: bigint('provider_config_version_id', { mode: 'bigint' }).references(
      () => aiProviderConfigVersions.id,
      { onDelete: 'set null' },
    ),
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
  },
  table => [
    foreignKey({
      name: 'ai_report_attempt_report_fkey',
      columns: [table.reportId],
      foreignColumns: [aiReports.id],
    }).onDelete('set null'),
    index('ai_report_attempt_report_idx').on(table.reportId, table.id),
    index('ai_report_attempt_user_idx').on(table.userId, table.createdAt.desc()),
    index('ai_report_attempt_active_slot_idx')
      .on(table.slotExpiresAt)
      .where(sql`${table.slotReleasedAt} is null`),
    uniqueIndex('ai_report_attempt_report_once_key')
      .on(table.reportId)
      .where(sql`${table.reportId} is not null`),
  ],
)
export const aiUsageBuckets = pgTable(
  'ai_usage_bucket',
  {
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
  },
  table => [
    unique('ai_usage_bucket_scope_month_key').on(table.scope, table.userId, table.bucketMonth),
    uniqueIndex('ai_usage_global_month_key')
      .on(table.bucketMonth)
      .where(sql`${table.scope} = 'global'`),
    check(
      'ai_usage_costs_nonnegative',
      sql`${table.reservedCostCents} >= 0 and coalesce(${table.estimatedCostCents}, 0) >= 0`,
    ),
    check(
      'ai_usage_bucket_counts_nonnegative',
      sql`${table.reserved} >= 0 and ${table.consumed} >= 0 and ${table.released} >= 0 and ${table.unknown} >= 0`,
    ),
    check(
      'ai_usage_bucket_scope_owner_check',
      sql`(${table.scope} = 'global' and ${table.userId} is null) or (${table.scope} = 'user' and ${table.userId} is not null)`,
    ),
  ],
)
export const aiAdminAuditEvents = pgTable(
  'ai_admin_audit_event',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    actorUserId: bigint('actor_user_id', { mode: 'bigint' }).references(() => users.id, { onDelete: 'set null' }),
    action: varchar('action', { length: 80 }).notNull(),
    targetType: varchar('target_type', { length: 80 }).notNull(),
    targetId: varchar('target_id', { length: 100 }),
    summary: varchar('summary', { length: 500 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    index('ai_admin_audit_created_idx').on(table.createdAt.desc(), table.id.desc()),
    index('ai_admin_audit_target_idx').on(table.targetType, table.targetId),
  ],
)
