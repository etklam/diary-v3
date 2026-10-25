/**
 * Cross-Guru consensus snapshots and their rebuild requests.
 *
 * Moved verbatim out of the single 2,458-line schema module; no definition
 * changed, which is what `npm run db:generate` reporting no drift proves.
 */

import {
  bigint,
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { institutionalSecurities } from './institutionalSecurities.js'
import { institutionalSnapshotChangeEvents } from './institutionalSnapshots.js'

export const guruConsensusSnapshots = pgTable(
  'guru_consensus_snapshots',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    periodEnd: date('period_end', { mode: 'string' }).notNull(),
    consensusVersion: varchar('consensus_version', { length: 40 }).notNull(),
    inputHash: varchar('input_hash', { length: 64 }).notNull(),
    contextHash: varchar('context_hash', { length: 64 }).notNull(),
    themeMappingHash: varchar('theme_mapping_hash', { length: 64 }).notNull(),
    activeManagerCount: integer('active_manager_count').notNull(),
    readyManagerCount: integer('ready_manager_count').notNull(),
    partialManagerCount: integer('partial_manager_count').notNull(),
    errorManagerCount: integer('error_manager_count').notNull(),
    supersededManagerCount: integer('superseded_manager_count').notNull(),
    pendingManagerCount: integer('pending_manager_count').notNull(),
    noFilingManagerCount: integer('no_filing_manager_count').notNull(),
    comparableManagerCount: integer('comparable_manager_count').notNull(),
    previousReadyManagerCount: integer('previous_ready_manager_count').notNull(),
    sourceRowCount: integer('source_row_count').notNull(),
    mappedRowCount: integer('mapped_row_count').notNull(),
    mappingCoveragePercent: numeric('mapping_coverage_percent', { precision: 12, scale: 8 }),
    calculatedAt: timestamp('calculated_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  table => [
    unique('guru_consensus_snapshots_period_version_unique').on(table.periodEnd, table.consensusVersion),
    index('guru_consensus_snapshots_period_idx').on(table.periodEnd.desc(), table.id.desc()),
    check(
      'guru_consensus_snapshots_hash_valid',
      sql`${table.inputHash} ~ '^[a-f0-9]{64}$' and ${table.contextHash} ~ '^[a-f0-9]{64}$' and ${table.themeMappingHash} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      'guru_consensus_snapshots_counts_valid',
      sql`${table.activeManagerCount} >= 0 and ${table.readyManagerCount} >= 0 and ${table.partialManagerCount} >= 0 and ${table.errorManagerCount} >= 0 and ${table.supersededManagerCount} >= 0 and ${table.pendingManagerCount} >= 0 and ${table.noFilingManagerCount} >= 0 and ${table.comparableManagerCount} >= 0 and ${table.previousReadyManagerCount} >= 0 and ${table.sourceRowCount} >= 0 and ${table.mappedRowCount} >= 0 and ${table.mappedRowCount} <= ${table.sourceRowCount}`,
    ),
    check(
      'guru_consensus_snapshots_coverage_valid',
      sql`${table.mappingCoveragePercent} is null or ${table.mappingCoveragePercent} between 0 and 100`,
    ),
  ],
)
export const guruStockConsensus = pgTable(
  'guru_stock_consensus',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    snapshotId: bigint('snapshot_id', { mode: 'bigint' })
      .notNull()
      .references(() => guruConsensusSnapshots.id, { onDelete: 'cascade' }),
    securityId: bigint('security_id', { mode: 'bigint' })
      .notNull()
      .references(() => institutionalSecurities.id, { onDelete: 'restrict' }),
    ticker: varchar('ticker', { length: 32 }),
    company: text('company').notNull(),
    sector: varchar('sector', { length: 120 }),
    industry: varchar('industry', { length: 160 }),
    currentHolderCount: integer('current_holder_count').notNull(),
    comparableCurrentHolderCount: integer('comparable_current_holder_count').notNull(),
    previousHolderCount: integer('previous_holder_count').notNull(),
    holderCountChange: integer('holder_count_change').notNull(),
    newBuyerCount: integer('new_buyer_count').notNull(),
    addCount: integer('add_count').notNull(),
    unchangedCount: integer('unchanged_count').notNull(),
    reduceCount: integer('reduce_count').notNull(),
    exitCount: integer('exit_count').notNull(),
    netBuyerCount: integer('net_buyer_count').notNull(),
    actionManagerCount: integer('action_manager_count').notNull(),
    quantityChangeSampleCount: integer('quantity_change_sample_count').notNull(),
    averageQuantityChangePercent: numeric('average_quantity_change_percent', { precision: 20, scale: 8 }),
    medianQuantityChangePercent: numeric('median_quantity_change_percent', { precision: 20, scale: 8 }),
    aggregateWeightPercent: numeric('aggregate_weight_percent', { precision: 20, scale: 8 }).notNull(),
    averagePortfolioWeightPercent: numeric('average_portfolio_weight_percent', { precision: 20, scale: 8 }),
    weightBreadthPercent: numeric('weight_breadth_percent', { precision: 12, scale: 8 }).notNull(),
    classification: varchar('classification', { length: 20 }),
    quarterTrend: varchar('quarter_trend', { length: 20 }).notNull(),
  },
  table => [
    unique('guru_stock_consensus_snapshot_security_unique').on(table.snapshotId, table.securityId),
    index('guru_stock_consensus_holders_idx').on(table.snapshotId, table.currentHolderCount.desc(), table.ticker),
    index('guru_stock_consensus_net_buyers_idx').on(
      table.snapshotId,
      table.netBuyerCount.desc(),
      table.currentHolderCount.desc(),
    ),
    index('guru_stock_consensus_exits_idx').on(
      table.snapshotId,
      table.exitCount.desc(),
      table.currentHolderCount.desc(),
    ),
    index('guru_stock_consensus_weight_idx').on(table.snapshotId, table.aggregateWeightPercent.desc()),
    index('guru_stock_consensus_holder_change_idx').on(table.snapshotId, table.holderCountChange.desc()),
    check(
      'guru_stock_consensus_counts_valid',
      sql`${table.currentHolderCount} >= 0 and ${table.comparableCurrentHolderCount} >= 0 and ${table.previousHolderCount} >= 0 and ${table.newBuyerCount} >= 0 and ${table.addCount} >= 0 and ${table.unchangedCount} >= 0 and ${table.reduceCount} >= 0 and ${table.exitCount} >= 0 and ${table.actionManagerCount} >= 0 and ${table.quantityChangeSampleCount} >= 0`,
    ),
    check(
      'guru_stock_consensus_classification_valid',
      sql`${table.classification} is null or ${table.classification} in ('ACCUMULATION', 'NEUTRAL', 'DISTRIBUTION')`,
    ),
    check(
      'guru_stock_consensus_trend_valid',
      sql`${table.quarterTrend} in ('RISING', 'STABLE', 'FALLING', 'UNAVAILABLE')`,
    ),
  ],
)
export const guruSectorConsensus = pgTable(
  'guru_sector_consensus',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    snapshotId: bigint('snapshot_id', { mode: 'bigint' })
      .notNull()
      .references(() => guruConsensusSnapshots.id, { onDelete: 'cascade' }),
    dimension: varchar('dimension', { length: 16 }).notNull(),
    dimensionKey: varchar('dimension_key', { length: 160 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    currentHolderCount: integer('current_holder_count').notNull(),
    buyerCount: integer('buyer_count').notNull(),
    sellerCount: integer('seller_count').notNull(),
    newPositionCount: integer('new_position_count').notNull(),
    exitCount: integer('exit_count').notNull(),
    addCount: integer('add_count').notNull(),
    reduceCount: integer('reduce_count').notNull(),
    allocationManagerCount: integer('allocation_manager_count').notNull(),
    aggregateWeightPercent: numeric('aggregate_weight_percent', { precision: 20, scale: 8 }).notNull(),
    comparableCurrentAggregateWeightPercent: numeric('comparable_current_aggregate_weight_percent', {
      precision: 20,
      scale: 8,
    }).notNull(),
    previousAggregateWeightPercent: numeric('previous_aggregate_weight_percent', { precision: 20, scale: 8 }),
    aggregateWeightChangePoints: numeric('aggregate_weight_change_points', { precision: 20, scale: 8 }),
    holderBreadthPercent: numeric('holder_breadth_percent', { precision: 12, scale: 8 }).notNull(),
    allocationCoveragePercent: numeric('allocation_coverage_percent', { precision: 12, scale: 8 }).notNull(),
    direction: varchar('direction', { length: 16 }),
  },
  table => [
    unique('guru_sector_consensus_snapshot_dimension_key_unique').on(
      table.snapshotId,
      table.dimension,
      table.dimensionKey,
    ),
    index('guru_sector_consensus_dimension_idx').on(table.snapshotId, table.dimension, table.name),
    index('guru_sector_consensus_direction_idx').on(table.snapshotId, table.dimension, table.direction),
    check('guru_sector_consensus_dimension_valid', sql`${table.dimension} in ('SECTOR', 'INDUSTRY', 'THEME')`),
    check(
      'guru_sector_consensus_counts_valid',
      sql`${table.currentHolderCount} >= 0 and ${table.buyerCount} >= 0 and ${table.sellerCount} >= 0 and ${table.newPositionCount} >= 0 and ${table.exitCount} >= 0 and ${table.addCount} >= 0 and ${table.reduceCount} >= 0 and ${table.allocationManagerCount} >= 0`,
    ),
    check(
      'guru_sector_consensus_direction_valid',
      sql`${table.direction} is null or ${table.direction} in ('INCREASING', 'STABLE', 'REDUCING')`,
    ),
    check(
      'guru_sector_consensus_coverage_valid',
      sql`${table.holderBreadthPercent} between 0 and 100 and ${table.allocationCoveragePercent} between 0 and 100`,
    ),
  ],
)
export const guruAnalyticsEventDeliveries = pgTable(
  'guru_analytics_event_deliveries',
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
    index('guru_analytics_event_deliveries_due_idx').on(table.processedAt, table.nextAttemptAt, table.eventId),
    check('guru_analytics_event_deliveries_attempt_valid', sql`${table.attemptCount} >= 0`),
  ],
)
export const guruConsensusRebuildRequests = pgTable(
  'guru_consensus_rebuild_requests',
  {
    periodEnd: date('period_end', { mode: 'string' }).primaryKey(),
    requestedRevision: bigint('requested_revision', { mode: 'bigint' })
      .default(sql`1`)
      .notNull(),
    processedRevision: bigint('processed_revision', { mode: 'bigint' })
      .default(sql`0`)
      .notNull(),
    attemptCount: integer('attempt_count').default(0).notNull(),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true, mode: 'date' }).notNull(),
    lastError: varchar('last_error', { length: 96 }),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    index('guru_consensus_rebuild_requests_due_idx').on(table.processedRevision, table.nextAttemptAt, table.periodEnd),
    check(
      'guru_consensus_rebuild_requests_revision_valid',
      sql`${table.requestedRevision} > 0 and ${table.processedRevision} >= 0 and ${table.processedRevision} <= ${table.requestedRevision}`,
    ),
    check('guru_consensus_rebuild_requests_attempt_valid', sql`${table.attemptCount} >= 0`),
  ],
)
