/**
 * Diaries, the saved views that read them, and the Guru snapshot a diary pins.
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
  jsonb,
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
import { guruConsensusSnapshots } from './guruConsensus.js'
import { institutionalSecurities } from './institutionalSecurities.js'
import { thesisReviewOutcome } from './review.js'

export const diaryCreatedVia = pgEnum('diary_created_via', ['WEB', 'API_KEY', 'TELEGRAM_BOT'])
export const diaryReviewStatus = pgEnum('diary_review_status', ['none', 'pending', 'reviewed'])
export const diaries = pgTable(
  'diaries',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    revision: integer('revision').default(1).notNull(),
    userId: bigint('user_id', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 500 }).notNull(),
    content: text('content').notNull(),
    summaryExcerpt: text('summary_excerpt'),
    summaryExcerptContentHash: varchar('summary_excerpt_content_hash', { length: 32 }),
    tags: text('tags')
      .array()
      .default(sql`ARRAY[]::text[]`)
      .notNull(),
    createdVia: diaryCreatedVia('created_via').default('WEB').notNull(),
    createdByLabel: varchar('created_by_label', { length: 100 }),
    date: date('date', { mode: 'string' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    thesis: text('thesis'),
    risk: text('risk'),
    execution: text('execution'),
    reviewDueAt: timestamp('review_due_at', { withTimezone: true, mode: 'date' }),
    reviewStatus: diaryReviewStatus('review_status').default('none').notNull(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'date' }),
    reviewOutcome: thesisReviewOutcome('review_outcome'),
    reviewSummary: text('review_summary'),
    reviewLearning: text('review_learning'),
    reviewAdjustment: text('review_adjustment'),
  },
  table => [
    unique('diaries_user_date_key').on(table.userId, table.date),
    unique('diaries_id_user_id_key').on(table.id, table.userId),
    index('diaries_user_id_idx').on(table.userId),
    index('diaries_user_created_idx').on(table.userId, table.createdAt.desc()),
    // Completed reviews are their own events in the merged activity timeline;
    // partial, because only reviewed diaries ever enter that branch.
    index('diaries_user_reviewed_idx')
      .on(table.userId, table.reviewedAt.desc(), table.id.desc())
      .where(sql`reviewed_at is not null`),
  ],
)
export const diarySavedViews = pgTable(
  'diary_saved_views',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: bigint('user_id', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 80 }).notNull(),
    // Query format version; edits do not increment this schema marker.
    version: integer('version').default(1).notNull(),
    query: jsonb('query').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    uniqueIndex('diary_saved_views_user_name_key').on(table.userId, sql`lower(${table.name})`),
    index('diary_saved_views_user_updated_idx').on(table.userId, table.updatedAt.desc(), table.id.desc()),
  ],
)
// A decision-time snapshot. The row is insert-only so a later rebuild cannot
// change what the author saw when they recorded the decision.
export const diaryGuruSnapshots = pgTable(
  'diary_guru_snapshots',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    diaryId: bigint('diary_id', { mode: 'bigint' })
      .notNull()
      .references(() => diaries.id, { onDelete: 'cascade' }),
    userId: bigint('user_id', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    securityId: bigint('security_id', { mode: 'bigint' })
      .notNull()
      .references(() => institutionalSecurities.id, { onDelete: 'restrict' }),
    symbol: varchar('symbol', { length: 32 }).notNull(),
    periodEnd: date('period_end', { mode: 'string' }).notNull(),
    contextVersion: varchar('context_version', { length: 40 }).notNull(),
    consensusVersion: varchar('consensus_version', { length: 40 }),
    consensusSnapshotId: bigint('consensus_snapshot_id', { mode: 'bigint' }).references(
      () => guruConsensusSnapshots.id,
      { onDelete: 'set null' },
    ),
    holderCount: integer('holder_count').notNull(),
    snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  table => [
    unique('diary_guru_snapshots_diary_security_period_unique').on(table.diaryId, table.securityId, table.periodEnd),
    index('diary_guru_snapshots_owner_idx').on(table.userId, table.diaryId, table.id.desc()),
    check('diary_guru_snapshots_holder_count_nonnegative', sql`${table.holderCount} >= 0`),
  ],
)
