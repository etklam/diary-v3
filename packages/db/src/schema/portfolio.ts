/**
 * Transactions and the trade plans they execute.
 *
 * Moved verbatim out of the single 2,458-line schema module; no definition
 * changed, which is what `npm run db:generate` reporting no drift proves.
 */

import {
  bigint,
  check,
  foreignKey,
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
import { diaries } from './diary.js'

export const transactionType = pgEnum('transaction_type', ['BUY', 'SELL'])
export const tradePlanStatus = pgEnum('trade_plan_status', ['draft', 'active', 'closed', 'cancelled'])
export const transactions = pgTable(
  'transactions',
  {
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
  },
  table => [
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
  ],
)
export const tradePlans = pgTable(
  'trade_plans',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: bigint('user_id', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    diaryId: bigint('diary_id', { mode: 'bigint' }).references(() => diaries.id, { onDelete: 'set null' }),
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
  },
  table => [
    check('trade_plans_entry_price_nonnegative', sql`${table.entryPrice} is null or ${table.entryPrice} >= 0`),
    check('trade_plans_entry_zone_low_nonnegative', sql`${table.entryZoneLow} is null or ${table.entryZoneLow} >= 0`),
    check(
      'trade_plans_entry_zone_high_nonnegative',
      sql`${table.entryZoneHigh} is null or ${table.entryZoneHigh} >= 0`,
    ),
    check('trade_plans_stop_loss_nonnegative', sql`${table.stopLoss} is null or ${table.stopLoss} >= 0`),
    check('trade_plans_target_price_nonnegative', sql`${table.targetPrice} is null or ${table.targetPrice} >= 0`),
    check(
      'trade_plans_max_position_size_nonnegative',
      sql`${table.maxPositionSize} is null or ${table.maxPositionSize} >= 0`,
    ),
    check(
      'trade_plans_zone_order_v1_check',
      sql`${table.entryZoneLow} is null or ${table.entryZoneHigh} is null or ${table.entryZoneLow} <= ${table.entryZoneHigh}`,
    ),
    index('trade_plans_user_status_idx').on(table.userId, table.status),
    index('trade_plans_user_symbol_idx').on(table.userId, table.symbol),
    index('trade_plans_diary_id_idx').on(table.diaryId),
  ],
)
/** A user-confirmed immutable snapshot used by Plan vs actual execution. */
export const tradePlanExecutionBaselines = pgTable(
  'trade_plan_execution_baselines',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    tradePlanId: bigint('trade_plan_id', { mode: 'bigint' })
      .notNull()
      .references(() => tradePlans.id, { onDelete: 'cascade' }),
    userId: bigint('user_id', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    planUpdatedAt: timestamp('plan_updated_at', { withTimezone: true, mode: 'date' }).notNull(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    symbol: varchar('symbol', { length: 32 }).notNull(),
    setupType: varchar('setup_type', { length: 100 }),
    entryPrice: numeric('entry_price', { precision: 18, scale: 6 }),
    entryZoneLow: numeric('entry_zone_low', { precision: 18, scale: 6 }),
    entryZoneHigh: numeric('entry_zone_high', { precision: 18, scale: 6 }),
    stopLoss: numeric('stop_loss', { precision: 18, scale: 6 }),
    targetPrice: numeric('target_price', { precision: 18, scale: 6 }),
    maxPositionSize: numeric('max_position_size', { precision: 18, scale: 2 }),
    maxPositionSizeUnit: varchar('max_position_size_unit', { length: 16 }).notNull().default('unknown'),
    invalidationCondition: text('invalidation_condition'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    unique('trade_plan_execution_baseline_plan_version_key').on(table.tradePlanId, table.version),
    index('trade_plan_execution_baseline_owner_plan_idx').on(table.userId, table.tradePlanId, table.version.desc()),
    check('trade_plan_execution_baseline_version_positive', sql`${table.version} > 0`),
    check('trade_plan_execution_baseline_unit_unknown', sql`${table.maxPositionSizeUnit} = 'unknown'`),
  ],
)
/** Current manually confirmed comparison state for a Trade Plan. */
export const tradePlanExecutions = pgTable(
  'trade_plan_executions',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    tradePlanId: bigint('trade_plan_id', { mode: 'bigint' })
      .notNull()
      .references(() => tradePlans.id, { onDelete: 'cascade' }),
    userId: bigint('user_id', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    baselineId: bigint('baseline_id', { mode: 'bigint' })
      .notNull()
      .references(() => tradePlanExecutionBaselines.id, { onDelete: 'restrict' }),
    revision: integer('revision').notNull().default(1),
    deviationReason: text('deviation_reason'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    unique('trade_plan_execution_plan_key').on(table.tradePlanId),
    index('trade_plan_execution_owner_idx').on(table.userId, table.tradePlanId),
    check('trade_plan_execution_revision_positive', sql`${table.revision} > 0`),
  ],
)
/** Whole-transaction links; a transaction can belong to at most one plan. */
export const tradePlanExecutionTransactions = pgTable(
  'trade_plan_execution_transactions',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    executionId: bigint('execution_id', { mode: 'bigint' })
      .notNull()
      .references(() => tradePlanExecutions.id, { onDelete: 'cascade' }),
    transactionId: bigint('transaction_id', { mode: 'bigint' }).references(() => transactions.id, {
      onDelete: 'set null',
    }),
    // Keep immutable identity so a deleted transaction remains actionable in the comparison UI.
    snapshotTransactionId: bigint('snapshot_transaction_id', { mode: 'bigint' }).notNull(),
    snapshotDiaryId: bigint('snapshot_diary_id', { mode: 'bigint' }).notNull(),
    snapshotSymbol: varchar('snapshot_symbol', { length: 20 }).notNull(),
    snapshotType: transactionType('snapshot_type').notNull(),
    snapshotQuantity: numeric('snapshot_quantity', { precision: 15, scale: 4 }).notNull(),
    snapshotPrice: numeric('snapshot_price', { precision: 15, scale: 4 }).notNull(),
    snapshotTradeDate: timestamp('snapshot_trade_date', { withTimezone: true, mode: 'date' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    unique('trade_plan_execution_transaction_key').on(
      table.executionId,
      table.snapshotSymbol,
      table.snapshotTradeDate,
      table.id,
    ),
    uniqueIndex('trade_plan_execution_transaction_once_key')
      .on(table.transactionId)
      .where(sql`${table.transactionId} is not null`),
    index('trade_plan_execution_transaction_execution_idx').on(table.executionId, table.id),
  ],
)
