/**
 * Guru watches, notification preferences, deliveries and analysis runs.
 *
 * Moved verbatim out of the single 2,458-line schema module; no definition
 * changed, which is what `npm run db:generate` reporting no drift proves.
 */

import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  timestamp,
  unique,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './account.js'
import { aiProviderConfigVersions, aiReportAttempts } from './ai.js'
import { guruQuarterAnalytics, gurus } from './guru.js'
import { guruConsensusSnapshots } from './guruConsensus.js'
import { institutionalManagers } from './institutionalFilings.js'
import { institutionalSecurities } from './institutionalSecurities.js'
import { institutionalSnapshotChangeEvents } from './institutionalSnapshots.js'
import { sharedPromptVersions } from './platform.js'

// A member's private watch on one security's Guru activity. Follower and watcher
// identities never leave these rows; aggregate counts are read separately.
export const guruStockWatches = pgTable(
  'guru_stock_watches',
  {
    userId: bigint('user_id', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    securityId: bigint('security_id', { mode: 'bigint' })
      .notNull()
      .references(() => institutionalSecurities.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    primaryKey({ columns: [table.userId, table.securityId] }),
    index('guru_stock_watches_security_idx').on(table.securityId, table.userId),
  ],
)
export const guruNotificationPreferences = pgTable(
  'guru_notification_preferences',
  {
    userId: bigint('user_id', { mode: 'bigint' })
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    newFiling: boolean('new_filing').default(true).notNull(),
    newPosition: boolean('new_position').default(true).notNull(),
    exitedPosition: boolean('exited_position').default(true).notNull(),
    strongAdd: boolean('strong_add').default(true).notNull(),
    strongReduce: boolean('strong_reduce').default(true).notNull(),
    newStockHolder: boolean('new_stock_holder').default(true).notNull(),
    consensusChange: boolean('consensus_change').default(false).notNull(),
    minWeightPercent: numeric('min_weight_percent', { precision: 12, scale: 8 }),
    minQuantityChangePercent: numeric('min_quantity_change_percent', { precision: 20, scale: 8 }),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    check(
      'guru_notification_preferences_thresholds_valid',
      sql`(${table.minWeightPercent} is null or ${table.minWeightPercent} >= 0) and (${table.minQuantityChangePercent} is null or ${table.minQuantityChangePercent} >= 0)`,
    ),
  ],
)
// The dedupe key is the idempotency boundary: a retried delivery job inserts the
// same key and is discarded instead of notifying twice.
export const guruNotifications = pgTable(
  'guru_notifications',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: bigint('user_id', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    eventType: varchar('event_type', { length: 24 }).notNull(),
    dedupeKey: varchar('dedupe_key', { length: 320 }).notNull(),
    guruId: bigint('guru_id', { mode: 'bigint' }).references(() => gurus.id, { onDelete: 'cascade' }),
    securityId: bigint('security_id', { mode: 'bigint' }).references(() => institutionalSecurities.id, {
      onDelete: 'cascade',
    }),
    periodEnd: date('period_end', { mode: 'string' }),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
    readAt: timestamp('read_at', { withTimezone: true, mode: 'date' }),
  },
  table => [
    unique('guru_notifications_user_dedupe_unique').on(table.userId, table.dedupeKey),
    index('guru_notifications_inbox_idx').on(table.userId, table.createdAt.desc(), table.id.desc()),
    index('guru_notifications_unread_idx')
      .on(table.userId, table.id.desc())
      .where(sql`${table.readAt} is null`),
    check(
      'guru_notifications_event_type_valid',
      sql`${table.eventType} in ('NEW_FILING', 'NEW_POSITION', 'EXITED_POSITION', 'STRONG_ADD', 'STRONG_REDUCE', 'NEW_STOCK_HOLDER', 'CONSENSUS_CHANGE')`,
    ),
  ],
)
export const guruNotificationEventDeliveries = pgTable(
  'guru_notification_event_deliveries',
  {
    eventId: bigint('event_id', { mode: 'bigint' })
      .primaryKey()
      .references(() => institutionalSnapshotChangeEvents.id, { onDelete: 'restrict' }),
    attemptCount: integer('attempt_count').default(0).notNull(),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true, mode: 'date' }).notNull(),
    lastError: varchar('last_error', { length: 96 }),
    processedAt: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
  },
  table => [
    index('guru_notification_event_deliveries_due_idx').on(table.processedAt, table.nextAttemptAt, table.eventId),
    check('guru_notification_event_deliveries_attempt_valid', sql`${table.attemptCount} >= 0`),
  ],
)
export const guruNotificationConsensusDeliveries = pgTable(
  'guru_notification_consensus_deliveries',
  {
    snapshotId: bigint('snapshot_id', { mode: 'bigint' })
      .primaryKey()
      .references(() => guruConsensusSnapshots.id, { onDelete: 'cascade' }),
    attemptCount: integer('attempt_count').default(0).notNull(),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true, mode: 'date' }).notNull(),
    lastError: varchar('last_error', { length: 96 }),
    processedAt: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
  },
  table => [
    index('guru_notification_consensus_deliveries_due_idx').on(
      table.processedAt,
      table.nextAttemptAt,
      table.snapshotId,
    ),
    check('guru_notification_consensus_deliveries_attempt_valid', sql`${table.attemptCount} >= 0`),
  ],
)
// Interpretation is stored apart from the prepared facts it was generated from.
// Every row keeps the structured input, its hash, and the effective prompt so a
// published analysis stays auditable after analytics or prompts move on.
export const guruAnalysisRuns = pgTable(
  'guru_analysis_runs',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    managerId: bigint('manager_id', { mode: 'bigint' })
      .notNull()
      .references(() => institutionalManagers.id, { onDelete: 'restrict' }),
    periodEnd: date('period_end', { mode: 'string' }).notNull(),
    analyticsId: bigint('analytics_id', { mode: 'bigint' })
      .notNull()
      .references(() => guruQuarterAnalytics.id, { onDelete: 'restrict' }),
    analyticsVersion: varchar('analytics_version', { length: 40 }).notNull(),
    analyticsContextHash: varchar('analytics_context_hash', { length: 64 }).notNull(),
    consensusSnapshotId: bigint('consensus_snapshot_id', { mode: 'bigint' }).references(
      () => guruConsensusSnapshots.id,
      { onDelete: 'set null' },
    ),
    consensusVersion: varchar('consensus_version', { length: 40 }),
    contextVersion: varchar('context_version', { length: 40 }).notNull(),
    schemaVersion: varchar('schema_version', { length: 40 }).notNull(),
    inputHash: varchar('input_hash', { length: 64 }).notNull(),
    context: jsonb('context').$type<Record<string, unknown>>().notNull(),
    promptKey: varchar('prompt_key', { length: 100 }).notNull(),
    promptSource: varchar('prompt_source', { length: 16 }).notNull(),
    promptSystemVersion: varchar('prompt_system_version', { length: 40 }).notNull(),
    promptOverrideVersionId: bigint('prompt_override_version_id', { mode: 'bigint' }).references(
      () => sharedPromptVersions.id,
      { onDelete: 'restrict' },
    ),
    promptTemplateHash: varchar('prompt_template_hash', { length: 64 }).notNull(),
    providerConfigVersionId: bigint('provider_config_version_id', { mode: 'bigint' }).references(
      () => aiProviderConfigVersions.id,
      { onDelete: 'restrict' },
    ),
    model: varchar('model', { length: 200 }),
    attemptId: bigint('attempt_id', { mode: 'bigint' }).references(() => aiReportAttempts.id, { onDelete: 'set null' }),
    status: varchar('status', { length: 16 }).notNull(),
    sourceState: varchar('source_state', { length: 16 }).default('current').notNull(),
    reason: varchar('reason', { length: 16 }).notNull(),
    result: jsonb('result').$type<Record<string, unknown>>(),
    errorCode: varchar('error_code', { length: 80 }),
    workerId: varchar('worker_id', { length: 128 }),
    leaseToken: varchar('lease_token', { length: 128 }),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true, mode: 'date' }),
    heartbeatAt: timestamp('heartbeat_at', { withTimezone: true, mode: 'date' }),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true, mode: 'date' }),
    finishedAt: timestamp('finished_at', { withTimezone: true, mode: 'date' }),
    reservationBucketMonth: date('reservation_bucket_month', { mode: 'string' }).notNull(),
    reservationCostCents: integer('reservation_cost_cents').default(0).notNull(),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    estimatedCostCents: integer('estimated_cost_cents'),
    latencyMs: integer('latency_ms'),
    providerRequestId: varchar('provider_request_id', { length: 200 }),
    requestedByUserId: bigint('requested_by_user_id', { mode: 'bigint' }).references(() => users.id, {
      onDelete: 'set null',
    }),
    invalidatedAt: timestamp('invalidated_at', { withTimezone: true, mode: 'date' }),
    invalidationReason: varchar('invalidation_reason', { length: 80 }),
    queuedAt: timestamp('queued_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  table => [
    uniqueIndex('guru_analysis_runs_active_unique')
      .on(table.managerId, table.periodEnd)
      .where(sql`${table.status} in ('queued', 'running')`),
    index('guru_analysis_runs_latest_idx').on(table.managerId, table.periodEnd.desc(), table.id.desc()),
    index('guru_analysis_runs_reuse_idx').on(table.managerId, table.periodEnd, table.inputHash, table.promptKey),
    index('guru_analysis_runs_queue_idx').on(table.status, table.queuedAt, table.id),
    check(
      'guru_analysis_runs_hash_valid',
      sql`${table.inputHash} ~ '^[a-f0-9]{64}$' and ${table.analyticsContextHash} ~ '^[a-f0-9]{64}$' and ${table.promptTemplateHash} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      'guru_analysis_runs_status_valid',
      sql`${table.status} in ('queued', 'running', 'succeeded', 'failed', 'cancelled')`,
    ),
    check('guru_analysis_runs_source_state_valid', sql`${table.sourceState} in ('current', 'invalidated')`),
    check('guru_analysis_runs_reason_valid', sql`${table.reason} in ('INITIAL', 'REGENERATION')`),
    check(
      'guru_analysis_runs_prompt_source_valid',
      sql`(${table.promptSource} = 'system-default' and ${table.promptOverrideVersionId} is null) or (${table.promptSource} = 'override' and ${table.promptOverrideVersionId} is not null)`,
    ),
    check(
      'guru_analysis_runs_result_state_valid',
      sql`(${table.status} = 'succeeded' and ${table.result} is not null) or (${table.status} <> 'succeeded' and ${table.result} is null)`,
    ),
    check(
      'guru_analysis_runs_terminal_valid',
      sql`(${table.status} in ('succeeded', 'failed', 'cancelled')) = (${table.finishedAt} is not null)`,
    ),
    check(
      'guru_analysis_runs_lease_valid',
      sql`(${table.status} = 'running' and ${table.leaseToken} is not null and ${table.leaseExpiresAt} is not null) or (${table.status} <> 'running' and ${table.leaseToken} is null and ${table.leaseExpiresAt} is null)`,
    ),
    check(
      'guru_analysis_runs_invalidation_valid',
      sql`(${table.sourceState} = 'current' and ${table.invalidatedAt} is null and ${table.invalidationReason} is null) or (${table.sourceState} = 'invalidated' and ${table.invalidatedAt} is not null and ${table.invalidationReason} is not null)`,
    ),
  ],
)
// Invalidation is its own auditable consumer of the snapshot outbox. It never
// generates; regeneration stays an explicit, budget-checked admin request.
export const guruAnalysisEventDeliveries = pgTable(
  'guru_analysis_event_deliveries',
  {
    eventId: bigint('event_id', { mode: 'bigint' })
      .primaryKey()
      .references(() => institutionalSnapshotChangeEvents.id, { onDelete: 'restrict' }),
    attemptCount: integer('attempt_count').default(0).notNull(),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true, mode: 'date' }).notNull(),
    lastError: varchar('last_error', { length: 96 }),
    processedAt: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
  },
  table => [
    index('guru_analysis_event_deliveries_due_idx').on(table.processedAt, table.nextAttemptAt, table.eventId),
    check('guru_analysis_event_deliveries_attempt_valid', sql`${table.attemptCount} >= 0`),
  ],
)
