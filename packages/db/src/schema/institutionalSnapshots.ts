/**
 * Effective 13F snapshots: holdings, publications and rebuild requests.
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
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import {
  institutionalFilingArtifacts,
  institutionalFilingDocuments,
  institutionalFilings,
  institutionalManagers,
} from './institutionalFilings.js'
import { institutionalHoldingMappingStatus, institutionalSecurities } from './institutionalSecurities.js'

// Effective contents are immutable; publication and period quality have separate lifecycle rows.
export const institutionalEffectiveSnapshots = pgTable(
  'institutional_effective_snapshots',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    managerId: bigint('manager_id', { mode: 'bigint' })
      .notNull()
      .references(() => institutionalManagers.id, { onDelete: 'restrict' }),
    periodEnd: date('period_end', { mode: 'string' }).notNull(),
    replayKey: varchar('replay_key', { length: 64 }).notNull(),
    snapshotHash: varchar('snapshot_hash', { length: 64 }).notNull(),
    sourceManifestHash: varchar('source_manifest_hash', { length: 64 }).notNull(),
    resolverVersion: varchar('resolver_version', { length: 40 }).notNull(),
    holdingCount: integer('holding_count').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  table => [
    unique('institutional_effective_snapshots_replay_unique').on(table.managerId, table.periodEnd, table.replayKey),
    unique('institutional_effective_snapshots_identity_unique').on(table.id, table.managerId, table.periodEnd),
    check(
      'institutional_effective_snapshots_hash_valid',
      sql`${table.replayKey} ~ '^[a-f0-9]{64}$' and ${table.snapshotHash} ~ '^[a-f0-9]{64}$' and ${table.sourceManifestHash} ~ '^[a-f0-9]{64}$'`,
    ),
    check('institutional_effective_snapshots_count_nonnegative', sql`${table.holdingCount} >= 0`),
  ],
)
export const institutionalEffectiveSnapshotSources = pgTable(
  'institutional_effective_snapshot_sources',
  {
    snapshotId: bigint('snapshot_id', { mode: 'bigint' })
      .notNull()
      .references(() => institutionalEffectiveSnapshots.id, { onDelete: 'restrict' }),
    ordinal: integer('ordinal').notNull(),
    filingId: bigint('filing_id', { mode: 'bigint' })
      .notNull()
      .references(() => institutionalFilings.id, { onDelete: 'restrict' }),
    accession: varchar('accession', { length: 20 }).notNull(),
    operation: varchar('operation', { length: 24 }).notNull(),
    amendmentNumber: integer('amendment_number'),
    parserVersion: varchar('parser_version', { length: 32 }).notNull(),
    sourceManifest: jsonb('source_manifest').$type<Record<string, unknown>>().notNull(),
  },
  table => [
    primaryKey({ columns: [table.snapshotId, table.ordinal] }),
    unique('institutional_effective_snapshot_sources_filing_unique').on(table.snapshotId, table.filingId),
    check(
      'institutional_effective_snapshot_sources_operation_valid',
      sql`(${table.operation} = 'ORIGINAL' and ${table.amendmentNumber} is null) or (${table.operation} in ('RESTATEMENT', 'ADD_NEW_HOLDINGS') and ${table.amendmentNumber} > 0)`,
    ),
    check('institutional_effective_snapshot_sources_ordinal_nonnegative', sql`${table.ordinal} >= 0`),
  ],
)
export const institutionalEffectiveHoldings = pgTable(
  'institutional_effective_holdings',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    snapshotId: bigint('snapshot_id', { mode: 'bigint' })
      .notNull()
      .references(() => institutionalEffectiveSnapshots.id, { onDelete: 'restrict' }),
    ordinal: integer('ordinal').notNull(),
    sourceFilingId: bigint('source_filing_id', { mode: 'bigint' })
      .notNull()
      .references(() => institutionalFilings.id, { onDelete: 'restrict' }),
    sourceDocumentId: bigint('source_document_id', { mode: 'bigint' })
      .notNull()
      .references(() => institutionalFilingDocuments.id, { onDelete: 'restrict' }),
    sourceArtifactId: bigint('source_artifact_id', { mode: 'bigint' })
      .notNull()
      .references(() => institutionalFilingArtifacts.id, { onDelete: 'restrict' }),
    // Parsed rows may be replaced during reprocessing, so this durable identity uses accession/document/row/digest/version instead of their transient row ID.
    sourceRowKey: varchar('source_row_key', { length: 64 }).notNull(),
    sourceRowNumber: integer('source_row_number').notNull(),
    securityId: bigint('security_id', { mode: 'bigint' }).references(() => institutionalSecurities.id, {
      onDelete: 'restrict',
    }),
    mappingStatus: institutionalHoldingMappingStatus('mapping_status').notNull(),
    mappingVersion: varchar('mapping_version', { length: 40 }).notNull(),
    issuer: text('issuer').notNull(),
    titleOfClass: varchar('title_of_class', { length: 160 }).notNull(),
    cusip: varchar('cusip', { length: 32 }),
    figi: varchar('figi', { length: 32 }),
    reportedValue: numeric('reported_value', { precision: 32, scale: 8 }).notNull(),
    reportedValueUnit: varchar('reported_value_unit', { length: 32 }).notNull(),
    quantity: numeric('quantity', { precision: 32, scale: 8 }).notNull(),
    quantityType: varchar('quantity_type', { length: 8 }).notNull(),
    putCall: varchar('put_call', { length: 8 }),
    sourceData: jsonb('source_data').$type<Record<string, unknown>>().notNull(),
  },
  table => [
    unique('institutional_effective_holdings_ordinal_unique').on(table.snapshotId, table.ordinal),
    unique('institutional_effective_holdings_source_row_unique').on(table.snapshotId, table.sourceRowKey),
    check(
      'institutional_effective_holdings_row_valid',
      sql`${table.ordinal} >= 0 and ${table.sourceRowNumber} > 0 and ${table.sourceRowKey} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      'institutional_effective_holdings_quantity_valid',
      sql`${table.reportedValue} >= 0 and ${table.quantity} >= 0 and ${table.quantityType} in ('SH', 'PRN')`,
    ),
    check(
      'institutional_effective_holdings_mapping_valid',
      sql`(${table.mappingStatus} in ('MATCHED', 'MANUAL_OVERRIDE') and ${table.securityId} is not null) or (${table.mappingStatus} in ('AMBIGUOUS', 'UNRESOLVED') and ${table.securityId} is null)`,
    ),
  ],
)
export const institutionalEffectiveSnapshotPublications = pgTable(
  'institutional_effective_snapshot_publications',
  {
    snapshotId: bigint('snapshot_id', { mode: 'bigint' }).primaryKey(),
    managerId: bigint('manager_id', { mode: 'bigint' }).notNull(),
    periodEnd: date('period_end', { mode: 'string' }).notNull(),
    status: varchar('status', { length: 16 }).notNull(),
    active: boolean('active').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  table => [
    foreignKey({
      columns: [table.snapshotId, table.managerId, table.periodEnd],
      foreignColumns: [
        institutionalEffectiveSnapshots.id,
        institutionalEffectiveSnapshots.managerId,
        institutionalEffectiveSnapshots.periodEnd,
      ],
    }).onDelete('restrict'),
    uniqueIndex('institutional_effective_snapshot_publications_active_unique')
      .on(table.managerId, table.periodEnd)
      .where(sql`${table.active} and ${table.status} = 'READY'`),
    check(
      'institutional_effective_snapshot_publications_state_valid',
      sql`(${table.active} and ${table.status} = 'READY') or (not ${table.active} and ${table.status} = 'SUPERSEDED')`,
    ),
  ],
)
export const institutionalEffectivePeriodStates = pgTable(
  'institutional_effective_period_states',
  {
    managerId: bigint('manager_id', { mode: 'bigint' })
      .notNull()
      .references(() => institutionalManagers.id, { onDelete: 'restrict' }),
    periodEnd: date('period_end', { mode: 'string' }).notNull(),
    status: varchar('status', { length: 16 }).notNull(),
    reason: varchar('reason', { length: 80 }),
    sourceManifestHash: varchar('source_manifest_hash', { length: 64 }).notNull(),
    checkedAt: timestamp('checked_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  table => [
    primaryKey({ columns: [table.managerId, table.periodEnd] }),
    check('institutional_effective_period_states_status_valid', sql`${table.status} in ('READY', 'PARTIAL', 'ERROR')`),
    check(
      'institutional_effective_period_states_reason_valid',
      sql`(${table.status} = 'READY' and ${table.reason} is null) or (${table.status} <> 'READY' and ${table.reason} is not null)`,
    ),
  ],
)
// Producer outbox: analytics and AI consumers track their own delivery checkpoints.
export const institutionalSnapshotChangeEvents = pgTable(
  'institutional_snapshot_change_events',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    managerId: bigint('manager_id', { mode: 'bigint' }).notNull(),
    periodEnd: date('period_end', { mode: 'string' }).notNull(),
    snapshotId: bigint('snapshot_id', { mode: 'bigint' }).notNull(),
    previousSnapshotId: bigint('previous_snapshot_id', { mode: 'bigint' }),
    eventType: varchar('event_type', { length: 32 }).default('EFFECTIVE_SNAPSHOT_CHANGED').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  table => [
    foreignKey({
      columns: [table.snapshotId, table.managerId, table.periodEnd],
      foreignColumns: [
        institutionalEffectiveSnapshots.id,
        institutionalEffectiveSnapshots.managerId,
        institutionalEffectiveSnapshots.periodEnd,
      ],
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.previousSnapshotId, table.managerId, table.periodEnd],
      foreignColumns: [
        institutionalEffectiveSnapshots.id,
        institutionalEffectiveSnapshots.managerId,
        institutionalEffectiveSnapshots.periodEnd,
      ],
    }).onDelete('restrict'),
    index('institutional_snapshot_change_events_delivery_idx').on(table.id, table.managerId, table.periodEnd),
    check(
      'institutional_snapshot_change_events_type_valid',
      sql`${table.eventType} in ('EFFECTIVE_SNAPSHOT_CHANGED', 'EFFECTIVE_PERIOD_STATE_CHANGED')`,
    ),
    check(
      'institutional_snapshot_change_events_distinct',
      sql`${table.previousSnapshotId} is null or ${table.previousSnapshotId} <> ${table.snapshotId}`,
    ),
  ],
)
export const institutionalEffectiveSnapshotRebuildRequests = pgTable(
  'institutional_effective_snapshot_rebuild_requests',
  {
    managerId: bigint('manager_id', { mode: 'bigint' })
      .notNull()
      .references(() => institutionalManagers.id, { onDelete: 'restrict' }),
    periodEnd: date('period_end', { mode: 'string' }).notNull(),
    requestedRevision: bigint('requested_revision', { mode: 'bigint' })
      .default(sql`1`)
      .notNull(),
    processedRevision: bigint('processed_revision', { mode: 'bigint' })
      .default(sql`0`)
      .notNull(),
    requestedAt: timestamp('requested_at', { withTimezone: true, mode: 'date' }).notNull(),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true, mode: 'date' }).notNull(),
    lastError: varchar('last_error', { length: 80 }),
  },
  table => [
    primaryKey({ columns: [table.managerId, table.periodEnd] }),
    index('institutional_effective_snapshot_rebuild_requests_due_idx').on(
      table.nextAttemptAt,
      table.managerId,
      table.periodEnd,
    ),
    check(
      'institutional_effective_snapshot_rebuild_requests_revision_valid',
      sql`${table.requestedRevision} > 0 and ${table.processedRevision} >= 0 and ${table.processedRevision} <= ${table.requestedRevision}`,
    ),
  ],
)
