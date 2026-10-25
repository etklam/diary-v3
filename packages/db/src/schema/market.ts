/**
 * ETFs, the market universe, rotation snapshots and price reminders.
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

export const priceAlertType = pgEnum('price_alert_type', ['PRICE_ABOVE', 'PRICE_BELOW', 'CHANGE_PERCENT', 'MOVING_AVG'])
export const priceAlertMovingAverageDirection = pgEnum('price_alert_moving_average_direction', ['above', 'below'])
export const priceAlerts = pgTable(
  'price_alerts',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: bigint('user_id', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    symbol: varchar('symbol', { length: 32 }).notNull(),
    type: priceAlertType('type').notNull(),
    threshold: numeric('threshold', { precision: 10, scale: 4 }).notNull(),
    movingAverageDirection: priceAlertMovingAverageDirection('moving_average_direction'),
    message: varchar('message', { length: 500 }).notNull(),
    isTriggered: boolean('is_triggered').notNull().default(false),
    triggeredAt: timestamp('triggered_at', { withTimezone: true }).$type<Date>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index('price_alerts_user_created_idx').on(table.userId, table.createdAt, table.id),
    index('price_alerts_pending_idx').on(table.isTriggered, table.symbol),
    check('price_alerts_trigger_state_check', sql`${table.isTriggered} = (${table.triggeredAt} is not null)`),
    check('price_alerts_threshold_check', sql`${table.type} = 'CHANGE_PERCENT' or ${table.threshold} >= 0`),
    check(
      'price_alerts_moving_average_period_check',
      sql`${table.type} <> 'MOVING_AVG' or ${table.threshold} in (20, 50, 200)`,
    ),
    check(
      'price_alerts_moving_average_direction_check',
      sql`(${table.type} = 'MOVING_AVG' and ${table.movingAverageDirection} is not null) or (${table.type} <> 'MOVING_AVG' and ${table.movingAverageDirection} is null)`,
    ),
    check('price_alerts_symbol_check', sql`${table.symbol} ~ '^[A-Z0-9.]+$'`),
  ],
)
export const etfs = pgTable(
  'etfs',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    symbol: varchar('symbol', { length: 20 }).notNull(),
    name: varchar('name', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    unique('etfs_symbol_key').on(table.symbol),
    check(
      'etfs_symbol_canonical',
      sql`${table.symbol} = upper(btrim(${table.symbol})) and length(${table.symbol}) > 0`,
    ),
  ],
)
export const etfPrices = pgTable(
  'etf_prices',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    etfId: bigint('etf_id', { mode: 'bigint' })
      .notNull()
      .references(() => etfs.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    open: numeric('open', { precision: 10, scale: 4 }).notNull(),
    high: numeric('high', { precision: 10, scale: 4 }).notNull(),
    low: numeric('low', { precision: 10, scale: 4 }).notNull(),
    close: numeric('close', { precision: 10, scale: 4 }).notNull(),
    adjClose: numeric('adj_close', { precision: 10, scale: 4 }).notNull(),
    volume: bigint('volume', { mode: 'bigint' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    unique('etf_prices_etf_date_key').on(table.etfId, table.date),
    index('etf_prices_etf_date_idx').on(table.etfId, table.date.desc()),
    check('etf_prices_volume_nonnegative', sql`${table.volume} is null or ${table.volume} >= 0`),
  ],
)
export const etfWatchlists = pgTable(
  'etf_watchlists',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: bigint('user_id', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    etfId: bigint('etf_id', { mode: 'bigint' })
      .notNull()
      .references(() => etfs.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    unique('etf_watchlists_user_etf_key').on(table.userId, table.etfId),
    index('etf_watchlists_user_order_idx').on(table.userId, table.sortOrder, table.id),
  ],
)
export const marketUniverse = pgTable(
  'market_universe',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    symbol: varchar('symbol', { length: 20 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    exchange: varchar('exchange', { length: 32 }).notNull(),
    assetType: varchar('asset_type', { length: 32 }).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    sector: varchar('sector', { length: 100 }),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    unique('market_universe_symbol_key').on(table.symbol),
    index('market_universe_symbol_idx').on(table.symbol),
    index('market_universe_active_asset_type_idx').on(table.isActive, table.assetType),
    index('market_universe_exchange_active_idx').on(table.exchange, table.isActive),
    check(
      'market_universe_symbol_canonical',
      sql`${table.symbol} = upper(btrim(${table.symbol})) and length(${table.symbol}) > 0`,
    ),
  ],
)
export const marketBreadthDaily = pgTable(
  'market_breadth_daily',
  {
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
  },
  table => [
    unique('market_breadth_daily_universe_date_key').on(table.universeKey, table.date),
    index('market_breadth_daily_universe_date_idx').on(table.universeKey, table.date.desc()),
    check('market_breadth_daily_universe_count_nonnegative', sql`${table.universeCount} >= 0`),
    check(
      'market_breadth_daily_counts_nonnegative',
      sql`(${table.up4Count} is null or ${table.up4Count} >= 0) and (${table.down4Count} is null or ${table.down4Count} >= 0) and (${table.above40dCount} is null or ${table.above40dCount} >= 0)`,
    ),
    check(
      'market_breadth_daily_percentages_bounded',
      sql`(${table.up4Pct} is null or (${table.up4Pct} >= 0 and ${table.up4Pct} <= 100)) and (${table.down4Pct} is null or (${table.down4Pct} >= 0 and ${table.down4Pct} <= 100)) and (${table.above40dPct} is null or (${table.above40dPct} >= 0 and ${table.above40dPct} <= 100)) and (${table.coveragePct} is null or (${table.coveragePct} >= 0 and ${table.coveragePct} <= 100))`,
    ),
  ],
)
export const marketDailyPrices = pgTable(
  'market_daily_price',
  {
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
  },
  table => [
    unique('market_daily_price_symbol_date_key').on(table.symbol, table.date),
    index('market_daily_price_symbol_date_idx').on(table.symbol, table.date),
    index('market_daily_price_date_idx').on(table.date),
  ],
)
export const marketRotationSnapshots = pgTable(
  'market_rotation_snapshot',
  {
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
  },
  table => [
    unique('market_rotation_snapshot_scope_symbol_date_key').on(table.rankScope, table.symbol, table.date),
    index('market_rotation_snapshot_scope_date_rank_idx').on(table.rankScope, table.date, table.rotationRank),
    index('market_rotation_snapshot_scope_date_idx').on(table.rankScope, table.date),
  ],
)
export const marketRotationSnapshotRuns = pgTable(
  'market_rotation_snapshot_run',
  {
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
  },
  table => [
    index('market_rotation_snapshot_run_scope_started_idx').on(table.rankScope, table.startedAt.desc()),
    index('market_rotation_snapshot_run_snapshot_date_idx').on(table.snapshotDate),
  ],
)
