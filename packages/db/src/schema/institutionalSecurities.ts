/**
 * Security identity for 13F holdings: identifiers, mappings and overrides.
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
  index,
  integer,
  numeric,
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
import { institutional13fHoldings } from './institutionalFilings.js'

// Institutional securities use stable IDs; ticker is only one dated identifier.
export const institutionalSecurityStatus = pgEnum('institutional_security_status', ['ACTIVE', 'DELISTED'])
export const institutionalSecurityIdentifierType = pgEnum('institutional_security_identifier_type', [
  'CUSIP',
  'FIGI',
  'TICKER',
])
export const institutionalHoldingMappingStatus = pgEnum('institutional_holding_mapping_status', [
  'MATCHED',
  'AMBIGUOUS',
  'UNRESOLVED',
  'MANUAL_OVERRIDE',
])
export const institutionalSecurityIdentityEventType = pgEnum('institutional_security_identity_event_type', [
  'TICKER_CHANGE',
  'MERGER',
  'SPIN_OFF',
  'DELISTING',
  'STOCK_SPLIT',
  'SHARE_CLASS_CONTINUITY',
])
export const institutionalSecurityMappingRefreshStatus = pgEnum('institutional_security_mapping_refresh_status', [
  'PENDING',
  'RUNNING',
  'COMPLETE',
])
export const institutionalSecurities = pgTable(
  'institutional_securities',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    issuer: text('issuer').notNull(),
    titleOfClass: varchar('title_of_class', { length: 160 }).notNull(),
    exchange: varchar('exchange', { length: 32 }),
    securityType: varchar('security_type', { length: 80 }).notNull(),
    sector: varchar('sector', { length: 120 }),
    industry: varchar('industry', { length: 160 }),
    status: institutionalSecurityStatus('status').default('ACTIVE').notNull(),
    sourceUrl: varchar('source_url', { length: 2048 }).notNull(),
    sourceVerifiedBy: bigint('source_verified_by', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    sourceVerifiedAt: timestamp('source_verified_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    index('institutional_securities_search_idx').on(table.status, table.id),
    check('institutional_securities_issuer_nonempty', sql`length(btrim(${table.issuer})) > 0`),
    check('institutional_securities_title_nonempty', sql`length(btrim(${table.titleOfClass})) > 0`),
    check('institutional_securities_type_nonempty', sql`length(btrim(${table.securityType})) > 0`),
    check('institutional_securities_source_https', sql`${table.sourceUrl} like 'https://%'`),
  ],
)
export const institutionalSecurityIdentifiers = pgTable(
  'institutional_security_identifiers',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    securityId: bigint('security_id', { mode: 'bigint' })
      .notNull()
      .references(() => institutionalSecurities.id, { onDelete: 'restrict' }),
    supersedesIdentifierId: bigint('supersedes_identifier_id', { mode: 'bigint' }).references(
      (): AnyPgColumn => institutionalSecurityIdentifiers.id,
      { onDelete: 'restrict' },
    ),
    type: institutionalSecurityIdentifierType('type').notNull(),
    value: varchar('value', { length: 32 }).notNull(),
    validFrom: date('valid_from', { mode: 'string' }).notNull(),
    validTo: date('valid_to', { mode: 'string' }),
    sourceUrl: varchar('source_url', { length: 2048 }).notNull(),
    sourceVerifiedBy: bigint('source_verified_by', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    sourceVerifiedAt: timestamp('source_verified_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    unique('institutional_security_identifiers_identity_unique').on(
      table.securityId,
      table.type,
      table.value,
      table.validFrom,
    ),
    uniqueIndex('institutional_security_identifiers_supersedes_unique')
      .on(table.supersedesIdentifierId)
      .where(sql`${table.supersedesIdentifierId} is not null`),
    index('institutional_security_identifiers_lookup_idx').on(table.type, table.value, table.validFrom, table.validTo),
    index('institutional_security_identifiers_security_idx').on(table.securityId, table.type, table.validFrom),
    check('institutional_security_identifiers_value_nonempty', sql`length(btrim(${table.value})) > 0`),
    check(
      'institutional_security_identifiers_date_range_valid',
      sql`${table.validTo} is null or ${table.validTo} >= ${table.validFrom}`,
    ),
    check('institutional_security_identifiers_source_https', sql`${table.sourceUrl} like 'https://%'`),
    check(
      'institutional_security_identifiers_format_valid',
      sql`
    (${table.type} = 'CUSIP' and ${table.value} ~ '^[A-Z0-9*@#]{9}$') or
    (${table.type} = 'FIGI' and ${table.value} ~ '^[A-Z0-9]{12}$') or
    (${table.type} = 'TICKER' and ${table.value} ~ '^[A-Z0-9][A-Z0-9.-]{0,14}$')
  `,
    ),
  ],
)
export const institutionalHoldingSecurityMappings = pgTable(
  'institutional_holding_security_mappings',
  {
    holdingId: bigint('holding_id', { mode: 'bigint' })
      .primaryKey()
      .references(() => institutional13fHoldings.id, { onDelete: 'cascade' }),
    status: institutionalHoldingMappingStatus('status').notNull(),
    securityId: bigint('security_id', { mode: 'bigint' }).references(() => institutionalSecurities.id, {
      onDelete: 'restrict',
    }),
    reason: varchar('reason', { length: 80 }).notNull(),
    candidateSecurityIds: text('candidate_security_ids')
      .array()
      .default(sql`'{}'::text[]`)
      .notNull(),
    algorithmVersion: varchar('algorithm_version', { length: 40 }).notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true, mode: 'date' }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    index('institutional_holding_security_mappings_security_idx').on(table.securityId, table.status),
    index('institutional_holding_security_mappings_status_idx').on(table.status, table.resolvedAt),
    check(
      'institutional_holding_security_mappings_security_state',
      sql`(${table.status} in ('MATCHED', 'MANUAL_OVERRIDE') and ${table.securityId} is not null) or (${table.status} in ('AMBIGUOUS', 'UNRESOLVED') and ${table.securityId} is null)`,
    ),
    check(
      'institutional_holding_security_mappings_algorithm_nonempty',
      sql`length(btrim(${table.algorithmVersion})) > 0`,
    ),
  ],
)
// Overrides and identity events are append-only audit records. Corrections link to prior rows.
export const institutionalSecurityMappingOverrides = pgTable(
  'institutional_security_mapping_overrides',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    holdingId: bigint('holding_id', { mode: 'bigint' })
      .notNull()
      .references(() => institutional13fHoldings.id, { onDelete: 'cascade' }),
    securityId: bigint('security_id', { mode: 'bigint' })
      .notNull()
      .references(() => institutionalSecurities.id, { onDelete: 'restrict' }),
    version: integer('version').notNull(),
    actorUserId: bigint('actor_user_id', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    reason: text('reason').notNull(),
    evidenceUrl: varchar('evidence_url', { length: 2048 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
    supersedesOverrideId: bigint('supersedes_override_id', { mode: 'bigint' }).references(
      (): AnyPgColumn => institutionalSecurityMappingOverrides.id,
      { onDelete: 'restrict' },
    ),
  },
  table => [
    unique('institutional_security_mapping_overrides_version_unique').on(table.holdingId, table.version),
    uniqueIndex('institutional_security_mapping_overrides_supersedes_unique')
      .on(table.supersedesOverrideId)
      .where(sql`${table.supersedesOverrideId} is not null`),
    index('institutional_security_mapping_overrides_holding_time_idx').on(
      table.holdingId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    check('institutional_security_mapping_overrides_version_positive', sql`${table.version} > 0`),
    check('institutional_security_mapping_overrides_reason_nonempty', sql`length(btrim(${table.reason})) > 0`),
    check('institutional_security_mapping_overrides_source_https', sql`${table.evidenceUrl} like 'https://%'`),
  ],
)
export const institutionalSecurityIdentityEvents = pgTable(
  'institutional_security_identity_events',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    kind: institutionalSecurityIdentityEventType('kind').notNull(),
    fromSecurityId: bigint('from_security_id', { mode: 'bigint' })
      .notNull()
      .references(() => institutionalSecurities.id, { onDelete: 'restrict' }),
    toSecurityId: bigint('to_security_id', { mode: 'bigint' }).references(() => institutionalSecurities.id, {
      onDelete: 'restrict',
    }),
    effectiveOn: date('effective_on', { mode: 'string' }).notNull(),
    newTicker: varchar('new_ticker', { length: 32 }),
    newSharesPerOldShare: numeric('new_shares_per_old_share', { precision: 24, scale: 12 }),
    comparable: boolean('comparable').notNull(),
    reason: text('reason').notNull(),
    evidenceUrl: varchar('evidence_url', { length: 2048 }).notNull(),
    actorUserId: bigint('actor_user_id', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    verifiedAt: timestamp('verified_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
    supersedesEventId: bigint('supersedes_event_id', { mode: 'bigint' }).references(
      (): AnyPgColumn => institutionalSecurityIdentityEvents.id,
      { onDelete: 'restrict' },
    ),
  },
  table => [
    uniqueIndex('institutional_security_identity_events_supersedes_unique')
      .on(table.supersedesEventId)
      .where(sql`${table.supersedesEventId} is not null`),
    index('institutional_security_identity_events_from_idx').on(table.fromSecurityId, table.effectiveOn, table.id),
    index('institutional_security_identity_events_to_idx').on(table.toSecurityId, table.effectiveOn, table.id),
    check('institutional_security_identity_events_reason_nonempty', sql`length(btrim(${table.reason})) > 0`),
    check('institutional_security_identity_events_source_https', sql`${table.evidenceUrl} like 'https://%'`),
    check(
      'institutional_security_identity_events_semantics',
      sql`
    (${table.kind} = 'TICKER_CHANGE' and ${table.toSecurityId} = ${table.fromSecurityId} and ${table.newTicker} is not null and ${table.newSharesPerOldShare} is null and ${table.comparable}) or
    (${table.kind} = 'STOCK_SPLIT' and ${table.toSecurityId} = ${table.fromSecurityId} and ${table.newTicker} is null and ${table.newSharesPerOldShare} > 0 and ${table.comparable}) or
    (${table.kind} = 'SHARE_CLASS_CONTINUITY' and ${table.toSecurityId} is not null and ${table.toSecurityId} <> ${table.fromSecurityId} and ${table.newTicker} is null and ${table.newSharesPerOldShare} > 0 and ${table.comparable}) or
    (${table.kind} in ('MERGER', 'SPIN_OFF') and ${table.toSecurityId} is not null and ${table.toSecurityId} <> ${table.fromSecurityId} and ${table.newTicker} is null and ${table.newSharesPerOldShare} is null and not ${table.comparable}) or
    (${table.kind} = 'DELISTING' and ${table.toSecurityId} is null and ${table.newTicker} is null and ${table.newSharesPerOldShare} is null and not ${table.comparable})
  `,
    ),
  ],
)
export const institutionalSecurityMappingRefreshJobs = pgTable(
  'institutional_security_mapping_refresh_jobs',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    securityId: bigint('security_id', { mode: 'bigint' })
      .notNull()
      .references(() => institutionalSecurities.id, { onDelete: 'restrict' }),
    status: institutionalSecurityMappingRefreshStatus('status').default('PENDING').notNull(),
    lastFilingId: bigint('last_filing_id', { mode: 'bigint' })
      .default(sql`0`)
      .notNull(),
    processedFilingCount: integer('processed_filing_count').default(0).notNull(),
    leaseToken: varchar('lease_token', { length: 128 }),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true, mode: 'date' }),
    lastError: varchar('last_error', { length: 160 }),
    createdBy: bigint('created_by', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
  },
  table => [
    index('institutional_security_mapping_refresh_jobs_queue_idx').on(table.status, table.id),
    check(
      'institutional_security_mapping_refresh_jobs_cursor_nonnegative',
      sql`${table.lastFilingId} >= 0 and ${table.processedFilingCount} >= 0`,
    ),
    check(
      'institutional_security_mapping_refresh_jobs_lease_consistent',
      sql`(${table.leaseToken} is null and ${table.leaseExpiresAt} is null) or (${table.leaseToken} is not null and ${table.leaseExpiresAt} is not null)`,
    ),
    check(
      'institutional_security_mapping_refresh_jobs_state_valid',
      sql`
    (${table.status} = 'PENDING' and ${table.leaseToken} is null and ${table.leaseExpiresAt} is null and ${table.completedAt} is null) or
    (${table.status} = 'RUNNING' and ${table.leaseToken} is not null and ${table.leaseExpiresAt} is not null and ${table.completedAt} is null) or
    (${table.status} = 'COMPLETE' and ${table.leaseToken} is null and ${table.leaseExpiresAt} is null and ${table.completedAt} is not null)
  `,
    ),
  ],
)
