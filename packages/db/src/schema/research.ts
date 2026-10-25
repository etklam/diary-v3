/**
 * Research Studio: runs, evidence, revisions and the search budget.
 *
 * Moved verbatim out of the single 2,458-line schema module; no definition
 * changed, which is what `npm run db:generate` reporting no drift proves.
 */

import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './account.js'
import { posts } from './publishing.js'

// Research Studio is deliberately isolated from the private AI report tables
// above. Its records contain only configured market evidence and editorial
// provenance; no Diary or portfolio rows are part of this context.
export const researchMethodStatus = pgEnum('research_method_status', ['COMPLETE', 'INCOMPLETE', 'RETIRED'])
export const researchExecutionStatus = pgEnum('research_execution_status', [
  'CREATED',
  'COLLECTING',
  'DATA_READY',
  'GENERATING',
  'DRAFT_READY',
  'BLOCKED',
  'FAILED',
  'CANCELLED',
])
export const researchDispatchStatus = pgEnum('research_dispatch_status', [
  'NOT_SENT',
  'DISPATCH_INTENT',
  'SENT',
  'SUCCEEDED',
  'FAILED',
  'OUTCOME_UNKNOWN',
])
export const researchQuality = pgEnum('research_quality', ['FULL', 'LIMITED', 'STALE', 'FAILED'])
export const researchQaStatus = pgEnum('research_qa_status', ['NOT_CHECKED', 'PASS', 'WARN', 'FAIL', 'N_A'])
export const researchReviewStatus = pgEnum('research_review_status', ['DRAFT', 'CHANGES_REQUIRED', 'APPROVED'])
export const researchProviderStatus = pgEnum('research_provider_status', ['DRAFT', 'ACTIVE', 'RETIRED'])
export const researchSearchReservationStatus = pgEnum('research_search_reservation_status', [
  'RESERVED',
  'CONSUMED',
  'UNKNOWN',
])
export const researchMethodProfiles = pgTable(
  'research_method_profile',
  {
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
  },
  table => [
    unique('research_method_profile_key').on(table.methodKey, table.version),
    check('research_method_profile_key_shape', sql`${table.methodKey} ~ '^[a-z][a-z0-9-]{2,80}$'`),
    check('research_method_profile_version_shape', sql`${table.version} ~ '^[0-9]+\\.[0-9]+\\.[0-9]+$'`),
    check(
      'research_method_profile_hash_shape',
      sql`${table.bundleHash} is null or ${table.bundleHash} ~ '^[a-f0-9]{64}$'`,
    ),
  ],
)
export const researchInstrumentProfiles = pgTable(
  'research_instrument_profile',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    methodProfileId: bigint('method_profile_id', { mode: 'bigint' })
      .notNull()
      .references(() => researchMethodProfiles.id, { onDelete: 'restrict' }),
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
  },
  table => [
    unique('research_instrument_profile_method_symbol_key').on(table.methodProfileId, table.symbol),
    index('research_instrument_profile_symbol_idx').on(table.symbol, table.enabled),
    check(
      'research_instrument_profile_symbol_shape',
      sql`${table.symbol} = upper(btrim(${table.symbol})) and ${table.symbol} ~ '^[A-Z0-9.\\-]{1,20}$'`,
    ),
    check('research_instrument_profile_currency_shape', sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check('research_instrument_profile_asset_type', sql`${table.assetType} in ('EQUITY', 'ETF')`),
    check(
      'research_instrument_profile_hash_shape',
      sql`${table.configHash} is null or ${table.configHash} ~ '^[a-f0-9]{64}$'`,
    ),
  ],
)
export const researchRuns = pgTable(
  'research_run',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    requesterId: bigint('requester_id', { mode: 'bigint' }).references(() => users.id, { onDelete: 'set null' }),
    methodProfileId: bigint('method_profile_id', { mode: 'bigint' })
      .notNull()
      .references(() => researchMethodProfiles.id, { onDelete: 'restrict' }),
    instrumentProfileId: bigint('instrument_profile_id', { mode: 'bigint' })
      .notNull()
      .references(() => researchInstrumentProfiles.id, { onDelete: 'restrict' }),
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
  },
  table => [
    unique('research_run_linked_post_key').on(table.linkedPostId),
    index('research_run_status_updated_idx').on(table.executionStatus, table.updatedAt.desc(), table.id.desc()),
    index('research_run_instrument_session_idx').on(
      table.instrumentProfileId,
      table.referenceSession.desc(),
      table.id.desc(),
    ),
    check('research_run_revision_nonnegative', sql`${table.currentRevision} >= 0`),
    check('research_run_version_positive', sql`${table.version} > 0`),
    check('research_run_hash_shape', sql`${table.evidenceHash} is null or ${table.evidenceHash} ~ '^[a-f0-9]{64}$'`),
  ],
)
export const researchEvidenceSnapshots = pgTable(
  'research_evidence_snapshot',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    runId: bigint('run_id', { mode: 'bigint' })
      .notNull()
      .references(() => researchRuns.id, { onDelete: 'cascade' }),
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
  },
  table => [
    unique('research_evidence_snapshot_run_version_key').on(table.runId, table.version),
    unique('research_evidence_snapshot_run_hash_key').on(table.runId, table.contentHash),
    index('research_evidence_snapshot_run_created_idx').on(table.runId, table.createdAt.desc(), table.id.desc()),
    check('research_evidence_snapshot_version_positive', sql`${table.version} > 0`),
    check('research_evidence_snapshot_hash_shape', sql`${table.contentHash} ~ '^[a-f0-9]{64}$'`),
  ],
)
export const researchRevisions = pgTable(
  'research_revision',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    runId: bigint('run_id', { mode: 'bigint' })
      .notNull()
      .references(() => researchRuns.id, { onDelete: 'cascade' }),
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
  },
  table => [
    unique('research_revision_run_number_key').on(table.runId, table.revision),
    unique('research_revision_id_run_key').on(table.id, table.runId),
    foreignKey({
      columns: [table.runId, table.parentRevision],
      foreignColumns: [table.runId, table.revision],
      name: 'research_revision_parent_run_fk',
    }),
    index('research_revision_run_created_idx').on(table.runId, table.createdAt.desc(), table.id.desc()),
    check('research_revision_positive', sql`${table.revision} > 0`),
    check('research_revision_parent_valid', sql`${table.parentRevision} is null or ${table.parentRevision} > 0`),
    check('research_revision_hash_shape', sql`${table.bodyHash} ~ '^[a-f0-9]{64}$'`),
    check(
      'research_revision_title_hash_shape',
      sql`${table.titleHash} is null or ${table.titleHash} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      'research_revision_approval_fields',
      sql`${table.reviewStatus} <> 'APPROVED' or (${table.approvedBySnapshot} is not null and ${table.approvedAt} is not null)`,
    ),
  ],
)
export const researchAttempts = pgTable(
  'research_attempt',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    runId: bigint('run_id', { mode: 'bigint' })
      .notNull()
      .references(() => researchRuns.id, { onDelete: 'cascade' }),
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
  },
  table => [
    unique('research_attempt_run_idempotency_key').on(table.runId, table.idempotencyKeyHash),
    index('research_attempt_run_created_idx').on(table.runId, table.createdAt.desc(), table.id.desc()),
    index('research_attempt_dispatch_idx').on(table.dispatchStatus, table.createdAt, table.id),
    check('research_attempt_hash_shape', sql`${table.idempotencyKeyHash} ~ '^[a-f0-9]{64}$'`),
    check('research_attempt_runtime_revision_positive', sql`${table.runtimeRevision} > 0`),
    check(
      'research_attempt_cost_nonnegative',
      sql`${table.reservedCostCents} >= 0 and (${table.estimatedCostCents} is null or ${table.estimatedCostCents} >= 0)`,
    ),
  ],
)
export const researchBudgetSessions = pgTable(
  'research_budget_session',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    budgetKey: varchar('budget_key', { length: 80 }).notNull().default('live-test'),
    dispatchLimit: integer('dispatch_limit').notNull().default(3),
    reserved: integer('reserved').notNull().default(0),
    consumed: integer('consumed').notNull().default(0),
    unknown: integer('unknown').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    unique('research_budget_session_key').on(table.budgetKey),
    check('research_budget_session_limit_nonnegative', sql`${table.dispatchLimit} >= 0`),
    check(
      'research_budget_session_counts_nonnegative',
      sql`${table.reserved} >= 0 and ${table.consumed} >= 0 and ${table.unknown} >= 0`,
    ),
  ],
)
export const researchSearchBudgets = pgTable(
  'research_search_budget',
  {
    singleton: varchar('singleton', { length: 16 }).primaryKey().default('default'),
    enabled: boolean('enabled').notNull().default(false),
    callLimit: integer('call_limit').notNull().default(0),
    reserved: integer('reserved').notNull().default(0),
    consumed: integer('consumed').notNull().default(0),
    unknown: integer('unknown').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    check('research_search_budget_limit_nonnegative', sql`${table.callLimit} >= 0`),
    check(
      'research_search_budget_counts_nonnegative',
      sql`${table.reserved} >= 0 and ${table.consumed} >= 0 and ${table.unknown} >= 0`,
    ),
    check('research_search_budget_disabled_zero', sql`${table.enabled} or ${table.callLimit} = 0`),
  ],
)
export const researchSearchReservations = pgTable(
  'research_search_reservation',
  {
    reservationId: varchar('reservation_id', { length: 36 }).primaryKey(),
    queryHash: varchar('query_hash', { length: 64 }).notNull(),
    status: researchSearchReservationStatus('status').notNull().default('RESERVED'),
    returnedResults: integer('returned_results').notNull().default(0),
    billedCredits: numeric('billed_credits', { precision: 12, scale: 3 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    settledAt: timestamp('settled_at', { withTimezone: true, mode: 'date' }),
  },
  table => [
    index('research_search_reservation_status_created_idx').on(table.status, table.createdAt),
    check('research_search_reservation_query_hash_shape', sql`${table.queryHash} ~ '^[a-f0-9]{64}$'`),
    check('research_search_reservation_results_nonnegative', sql`${table.returnedResults} >= 0`),
    check(
      'research_search_reservation_credits_nonnegative',
      sql`${table.billedCredits} is null or ${table.billedCredits} >= 0`,
    ),
  ],
)
export const researchRuntimeState = pgTable(
  'research_runtime_state',
  {
    singleton: varchar('singleton', { length: 16 }).primaryKey().default('default'),
    revision: integer('revision').notNull().default(1),
    featureEnabled: boolean('feature_enabled').notNull().default(false),
    generationEnabled: boolean('generation_enabled').notNull().default(false),
    workerId: varchar('worker_id', { length: 128 }),
    workerHeartbeatAt: timestamp('worker_heartbeat_at', { withTimezone: true, mode: 'date' }),
    activeAttemptId: bigint('active_attempt_id', { mode: 'bigint' }).references(() => researchAttempts.id, {
      onDelete: 'set null',
    }),
    activeLeaseToken: varchar('active_lease_token', { length: 128 }),
    activeLeaseExpiresAt: timestamp('active_lease_expires_at', { withTimezone: true, mode: 'date' }),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    check(
      'research_runtime_lease_fields',
      sql`(${table.activeAttemptId} is null and ${table.activeLeaseToken} is null and ${table.activeLeaseExpiresAt} is null) or (${table.activeAttemptId} is not null and ${table.activeLeaseToken} is not null and ${table.activeLeaseExpiresAt} is not null)`,
    ),
    check('research_runtime_revision_positive', sql`${table.revision} > 0`),
  ],
)
export const researchProviderConfigs = pgTable(
  'research_provider_config',
  {
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
  },
  table => [
    unique('research_provider_config_revision_key').on(table.revision),
    index('research_provider_config_status_idx').on(table.status, table.id),
    check('research_provider_config_provider', sql`${table.provider} = 'openrouter'`),
    check('research_provider_config_protocol', sql`${table.protocol} = 'chat_completions'`),
    check('research_provider_config_model', sql`${table.model} = 'openrouter/free'`),
    check('research_provider_config_base_url', sql`${table.baseUrl} = 'https://openrouter.ai/api/v1'`),
    check(
      'research_provider_config_bounds',
      sql`${table.maxInputTokens} > 0 and ${table.maxOutputTokens} > 0 and ${table.timeoutMs} between 1000 and 300000`,
    ),
  ],
)
export const researchArticleLinks = pgTable(
  'research_article_link',
  {
    postId: bigint('post_id', { mode: 'bigint' })
      .primaryKey()
      .references(() => posts.id, { onDelete: 'cascade' }),
    runId: bigint('run_id', { mode: 'bigint' })
      .notNull()
      .references(() => researchRuns.id, { onDelete: 'restrict' }),
    revisionId: bigint('revision_id', { mode: 'bigint' }).notNull(),
    titleHash: varchar('title_hash', { length: 64 }).notNull(),
    bodyHash: varchar('body_hash', { length: 64 }).notNull(),
    evidenceHash: varchar('evidence_hash', { length: 64 }).notNull(),
    referenceSession: date('reference_session', { mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    unique('research_article_link_run_key').on(table.runId),
    unique('research_article_link_revision_key').on(table.revisionId),
    foreignKey({
      columns: [table.revisionId, table.runId],
      foreignColumns: [researchRevisions.id, researchRevisions.runId],
      name: 'research_article_link_revision_run_fk',
    }),
    foreignKey({
      columns: [table.runId, table.evidenceHash],
      foreignColumns: [researchEvidenceSnapshots.runId, researchEvidenceSnapshots.contentHash],
      name: 'research_article_link_evidence_run_fk',
    }),
    check('research_article_link_title_hash_shape', sql`${table.titleHash} ~ '^[a-f0-9]{64}$'`),
    check('research_article_link_body_hash_shape', sql`${table.bodyHash} ~ '^[a-f0-9]{64}$'`),
    check('research_article_link_evidence_hash_shape', sql`${table.evidenceHash} ~ '^[a-f0-9]{64}$'`),
  ],
)
