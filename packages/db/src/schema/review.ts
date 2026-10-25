/**
 * Investment theses, their reviews, and diary reminders.
 *
 * Moved verbatim out of the single 2,458-line schema module; no definition
 * changed, which is what `npm run db:generate` reporting no drift proves.
 */

import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './account.js'
import { stocks } from './company.js'
import { diaries } from './diary.js'

export const thesisReviewOutcome = pgEnum('thesis_review_outcome', ['INTACT', 'PARTIAL', 'INVALIDATED', 'UNCLEAR'])
export const investmentThesisStatus = pgEnum('investment_thesis_status', ['DRAFT', 'ACTIVE', 'ARCHIVED'])
export const thesisPortfolioDecision = pgEnum('thesis_portfolio_decision', [
  'HOLD',
  'ADD',
  'REDUCE',
  'EXIT',
  'CONTINUE_WATCHING',
])
export const investmentTheses = pgTable(
  'investment_theses',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: bigint('user_id', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    stockId: bigint('stock_id', { mode: 'bigint' })
      .notNull()
      .references(() => stocks.id, { onDelete: 'cascade' }),
    status: investmentThesisStatus('status').default('DRAFT').notNull(),
    summary: text('summary'),
    whyIOwnIt: text('why_i_own_it'),
    growthDrivers: text('growth_drivers'),
    risks: text('risks'),
    invalidationConditions: text('invalidation_conditions'),
    expectedHoldingPeriod: varchar('expected_holding_period', { length: 255 }),
    reviewPending: boolean('review_pending').default(false).notNull(),
    reviewDueAt: timestamp('review_due_at', { withTimezone: true, mode: 'date' }),
    lastReviewedAt: timestamp('last_reviewed_at', { withTimezone: true, mode: 'date' }),
    latestReviewOutcome: thesisReviewOutcome('latest_review_outcome'),
    activatedAt: timestamp('activated_at', { withTimezone: true, mode: 'date' }),
    archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    unique('investment_theses_user_stock_key').on(table.userId, table.stockId),
    unique('investment_theses_id_user_id_key').on(table.id, table.userId),
    index('investment_theses_user_status_due_idx').on(table.userId, table.status, table.reviewDueAt),
    check(
      'investment_theses_active_content_check',
      sql`${table.status} <> 'ACTIVE' OR (nullif(btrim(${table.summary}), '') is not null AND nullif(btrim(${table.whyIOwnIt}), '') is not null)`,
    ),
  ],
)
export const thesisReviews = pgTable(
  'thesis_reviews',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    thesisId: bigint('thesis_id', { mode: 'bigint' }).notNull(),
    userId: bigint('user_id', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
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
  },
  table => [
    foreignKey({
      name: 'thesis_reviews_thesis_owner_fkey',
      columns: [table.thesisId, table.userId],
      foreignColumns: [investmentTheses.id, investmentTheses.userId],
    }).onDelete('cascade'),
    index('thesis_reviews_user_thesis_time_idx').on(
      table.userId,
      table.thesisId,
      table.reviewedAt.desc(),
      table.id.desc(),
    ),
    index('thesis_reviews_thesis_user_idx').on(table.thesisId, table.userId),
    // Account-wide chronological order for the merged activity timeline; the
    // thesis-scoped index above leads with thesisId and cannot serve it.
    index('thesis_reviews_user_time_idx').on(table.userId, table.reviewedAt.desc(), table.id.desc()),
    check(
      'thesis_reviews_reflection_check',
      sql`nullif(btrim(${table.whatImproved}), '') is not null OR nullif(btrim(${table.whatDeteriorated}), '') is not null OR nullif(btrim(${table.whatChanged}), '') is not null`,
    ),
  ],
)
export const alertRecurringMode = pgEnum('alert_recurring_mode', ['WEEK', 'MONTH'])
export const alerts = pgTable(
  'alerts',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    diaryId: bigint('diary_id', { mode: 'bigint' })
      .notNull()
      .references(() => diaries.id, { onDelete: 'cascade' }),
    message: varchar('message', { length: 500 }).notNull(),
    triggerAt: timestamp('trigger_at', { withTimezone: true, mode: 'date' }).notNull(),
    isDismissed: boolean('is_dismissed').default(false).notNull(),
    recurringMode: alertRecurringMode('recurring_mode'),
    parentId: bigint('parent_id', { mode: 'bigint' }),
    instanceNumber: integer('instance_number').default(1).notNull(),
    isPaused: boolean('is_paused').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    unique('alerts_id_diary_unique').on(table.id, table.diaryId),
    unique('alerts_parent_instance_unique').on(table.parentId, table.instanceNumber),
    foreignKey({
      name: 'alerts_parent_same_diary_fk',
      columns: [table.parentId, table.diaryId],
      foreignColumns: [table.id, table.diaryId],
    }).onDelete('cascade'),
    check('alerts_instance_positive', sql`${table.instanceNumber} > 0`),
    check('alerts_message_nonempty', sql`length(trim(${table.message})) > 0`),
    check(
      'alerts_single_shape',
      sql`${table.recurringMode} is not null or (${table.parentId} is null and ${table.instanceNumber} = 1)`,
    ),
    index('alerts_diary_trigger_id_idx').on(table.diaryId, table.triggerAt, table.id),
    index('alerts_pending_trigger_idx').on(table.isDismissed, table.triggerAt, table.id),
  ],
)
