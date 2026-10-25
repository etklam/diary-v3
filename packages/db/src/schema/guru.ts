/**
 * Guru profiles, following and per-quarter analytics.
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
  text,
  timestamp,
  unique,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './account.js'
import { institutionalManagers } from './institutionalFilings.js'
import { institutionalSecurities } from './institutionalSecurities.js'
import { institutionalEffectiveSnapshots } from './institutionalSnapshots.js'

export const gurus = pgTable(
  'gurus',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    managerId: bigint('manager_id', { mode: 'bigint' })
      .notNull()
      .references(() => institutionalManagers.id, { onDelete: 'restrict' }),
    slug: varchar('slug', { length: 80 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    managerName: varchar('manager_name', { length: 200 }).notNull(),
    description: text('description'),
    investmentPhilosophy: text('investment_philosophy'),
    styleTags: text('style_tags')
      .array()
      .default(sql`'{}'::text[]`)
      .notNull(),
    managerType: varchar('manager_type', { length: 80 }),
    website: varchar('website', { length: 2048 }),
    country: varchar('country', { length: 2 }),
    imageUrl: varchar('image_url', { length: 2048 }),
    securityNotes: text('security_notes'),
    featured: boolean('featured').default(false).notNull(),
    active: boolean('active').default(true).notNull(),
    directoryOrder: integer('directory_order').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    unique('gurus_slug_unique').on(table.slug),
    unique('gurus_manager_unique').on(table.managerId),
    index('gurus_created_idx').on(table.createdAt.desc(), table.id.desc()),
    index('gurus_visibility_idx').on(table.active, table.featured, table.createdAt.desc(), table.id.desc()),
    index('gurus_directory_order_idx').on(table.active, table.directoryOrder, table.name),
    check(
      'gurus_slug_valid',
      sql`${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and ${table.slug} not in ('consensus', 'activity', 'stocks', 'sectors', 'compare', 'notifications')`,
    ),
    check('gurus_name_nonempty', sql`length(btrim(${table.name})) > 0`),
    check('gurus_manager_name_nonempty', sql`length(btrim(${table.managerName})) > 0`),
    check('gurus_country_valid', sql`${table.country} is null or ${table.country} ~ '^[A-Z]{2}$'`),
  ],
)
export const guruFollowers = pgTable(
  'guru_followers',
  {
    guruId: bigint('guru_id', { mode: 'bigint' })
      .notNull()
      .references(() => gurus.id, { onDelete: 'cascade' }),
    userId: bigint('user_id', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    primaryKey({ columns: [table.guruId, table.userId] }),
    index('guru_followers_user_idx').on(table.userId, table.guruId),
  ],
)
export const guruQuarterAnalytics = pgTable(
  'guru_quarter_analytics',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    managerId: bigint('manager_id', { mode: 'bigint' })
      .notNull()
      .references(() => institutionalManagers.id, { onDelete: 'restrict' }),
    periodEnd: date('period_end', { mode: 'string' }).notNull(),
    snapshotId: bigint('snapshot_id', { mode: 'bigint' })
      .notNull()
      .references(() => institutionalEffectiveSnapshots.id, { onDelete: 'restrict' }),
    previousSnapshotId: bigint('previous_snapshot_id', { mode: 'bigint' }).references(
      () => institutionalEffectiveSnapshots.id,
      { onDelete: 'restrict' },
    ),
    analyticsVersion: varchar('analytics_version', { length: 40 }).notNull(),
    inputHash: varchar('input_hash', { length: 64 }).notNull(),
    contextHash: varchar('context_hash', { length: 64 }).notNull(),
    status: varchar('status', { length: 16 }).notNull(),
    comparisonStatus: varchar('comparison_status', { length: 40 }).notNull(),
    reportedValueUsd: numeric('reported_value_usd', { precision: 32, scale: 8 }).notNull(),
    holdingCount: integer('holding_count').notNull(),
    sourceRowCount: integer('source_row_count').notNull(),
    mappedRowCount: integer('mapped_row_count').notNull(),
    mappingCoveragePercent: numeric('mapping_coverage_percent', { precision: 12, scale: 8 }).notNull(),
    topOneConcentrationPercent: numeric('top_one_concentration_percent', { precision: 12, scale: 8 }).notNull(),
    topFiveConcentrationPercent: numeric('top_five_concentration_percent', { precision: 12, scale: 8 }).notNull(),
    topTenConcentrationPercent: numeric('top_ten_concentration_percent', { precision: 12, scale: 8 }).notNull(),
    hhi: numeric('hhi', { precision: 16, scale: 4 }).notNull(),
    disclosedWeightTurnoverPercent: numeric('disclosed_weight_turnover_percent', { precision: 12, scale: 8 }),
    turnoverBand: varchar('turnover_band', { length: 10 }),
    turnoverUnavailableReason: varchar('turnover_unavailable_reason', { length: 48 }),
    newCount: integer('new_count').notNull(),
    strongAddCount: integer('strong_add_count').notNull(),
    addCount: integer('add_count').notNull(),
    unchangedCount: integer('unchanged_count').notNull(),
    reduceCount: integer('reduce_count').notNull(),
    strongReduceCount: integer('strong_reduce_count').notNull(),
    exitCount: integer('exit_count').notNull(),
    result: jsonb('result').$type<Record<string, unknown>>(),
    calculatedAt: timestamp('calculated_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  table => [
    unique('guru_quarter_analytics_manager_period_version_unique').on(
      table.managerId,
      table.periodEnd,
      table.analyticsVersion,
    ),
    index('guru_quarter_analytics_period_idx').on(table.periodEnd, table.managerId),
    check(
      'guru_quarter_analytics_hash_valid',
      sql`${table.inputHash} ~ '^[a-f0-9]{64}$' and ${table.contextHash} ~ '^[a-f0-9]{64}$'`,
    ),
    check('guru_quarter_analytics_status_valid', sql`${table.status} in ('READY', 'PARTIAL', 'ERROR')`),
    check(
      'guru_quarter_analytics_result_state_valid',
      sql`(${table.status} = 'READY' and ${table.result} is not null) or (${table.status} <> 'READY' and ${table.result} is null)`,
    ),
    check(
      'guru_quarter_analytics_counts_valid',
      sql`${table.holdingCount} >= 0 and ${table.sourceRowCount} >= 0 and ${table.mappedRowCount} >= 0 and ${table.mappedRowCount} <= ${table.sourceRowCount} and ${table.newCount} >= 0 and ${table.strongAddCount} >= 0 and ${table.addCount} >= 0 and ${table.unchangedCount} >= 0 and ${table.reduceCount} >= 0 and ${table.strongReduceCount} >= 0 and ${table.exitCount} >= 0`,
    ),
    check(
      'guru_quarter_analytics_turnover_valid',
      sql`(${table.turnoverBand} is null or ${table.turnoverBand} in ('LOW', 'MODERATE', 'HIGH')) and ((${table.disclosedWeightTurnoverPercent} is null and ${table.turnoverBand} is null) or (${table.disclosedWeightTurnoverPercent} is not null and ${table.turnoverUnavailableReason} is null))`,
    ),
  ],
)
export const guruHoldingChanges = pgTable(
  'guru_holding_changes',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    analyticsId: bigint('analytics_id', { mode: 'bigint' })
      .notNull()
      .references(() => guruQuarterAnalytics.id, { onDelete: 'cascade' }),
    positionKey: varchar('position_key', { length: 256 }).notNull(),
    securityId: bigint('security_id', { mode: 'bigint' }).references(() => institutionalSecurities.id, {
      onDelete: 'restrict',
    }),
    ticker: varchar('ticker', { length: 32 }),
    company: text('company').notNull(),
    action: varchar('action', { length: 20 }).notNull(),
    quantityType: varchar('quantity_type', { length: 8 }).notNull(),
    putCall: varchar('put_call', { length: 8 }),
    previousQuantity: numeric('previous_quantity', { precision: 32, scale: 8 }),
    comparablePreviousQuantity: numeric('comparable_previous_quantity', { precision: 32, scale: 8 }),
    currentQuantity: numeric('current_quantity', { precision: 32, scale: 8 }),
    quantityChange: numeric('quantity_change', { precision: 32, scale: 8 }).notNull(),
    quantityChangePercent: numeric('quantity_change_percent', { precision: 20, scale: 8 }),
    quantityAdjustmentFactor: numeric('quantity_adjustment_factor', { precision: 24, scale: 12 }),
    corporateActionEventIds: text('corporate_action_event_ids')
      .array()
      .default(sql`'{}'::text[]`)
      .notNull(),
    previousWeightPercent: numeric('previous_weight_percent', { precision: 12, scale: 8 }),
    currentWeightPercent: numeric('current_weight_percent', { precision: 12, scale: 8 }),
    weightChangePercentagePoints: numeric('weight_change_percentage_points', { precision: 12, scale: 8 }),
    previousRank: integer('previous_rank'),
    currentRank: integer('current_rank'),
    rankChange: integer('rank_change'),
    previousReportedValueUsd: numeric('previous_reported_value_usd', { precision: 32, scale: 8 }),
    currentReportedValueUsd: numeric('current_reported_value_usd', { precision: 32, scale: 8 }),
    reportedValueChangeUsd: numeric('reported_value_change_usd', { precision: 32, scale: 8 }),
  },
  table => [
    unique('guru_holding_changes_analytics_position_unique').on(table.analyticsId, table.positionKey),
    index('guru_holding_changes_stock_idx').on(table.securityId, table.action, table.analyticsId),
    check(
      'guru_holding_changes_action_valid',
      sql`${table.action} in ('NEW', 'STRONG_ADD', 'ADD', 'UNCHANGED', 'REDUCE', 'STRONG_REDUCE', 'EXIT')`,
    ),
    check(
      'guru_holding_changes_exposure_valid',
      sql`${table.quantityType} in ('SH', 'PRN') and (${table.putCall} is null or ${table.putCall} in ('PUT', 'CALL'))`,
    ),
  ],
)
export const guruThemeMappings = pgTable(
  'guru_theme_mappings',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    securityId: bigint('security_id', { mode: 'bigint' })
      .notNull()
      .references(() => institutionalSecurities.id, { onDelete: 'restrict' }),
    themeKey: varchar('theme_key', { length: 80 }).notNull(),
    themeName: varchar('theme_name', { length: 120 }).notNull(),
    version: integer('version').notNull(),
    source: varchar('source', { length: 32 }).notNull(),
    sourceReference: varchar('source_reference', { length: 500 }),
    active: boolean('active').default(true).notNull(),
    createdBy: bigint('created_by', { mode: 'bigint' }).references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    unique('guru_theme_mappings_security_theme_version_unique').on(table.securityId, table.themeKey, table.version),
    uniqueIndex('guru_theme_mappings_active_unique')
      .on(table.securityId, table.themeKey)
      .where(sql`${table.active}`),
    index('guru_theme_mappings_active_theme_idx').on(table.active, table.themeKey, table.securityId),
    check('guru_theme_mappings_theme_key_valid', sql`${table.themeKey} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check('guru_theme_mappings_name_nonempty', sql`length(btrim(${table.themeName})) > 0`),
    check('guru_theme_mappings_version_positive', sql`${table.version} > 0`),
    check('guru_theme_mappings_source_valid', sql`${table.source} in ('ADMIN', 'RESEARCH_METADATA')`),
  ],
)
