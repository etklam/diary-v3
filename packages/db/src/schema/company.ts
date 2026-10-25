/**
 * Companies a diary names, the watchlist over them, and their evidence timeline.
 *
 * Moved verbatim out of the single 2,458-line schema module; no definition
 * changed, which is what `npm run db:generate` reporting no drift proves.
 */

import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './account.js'
import { diaries } from './diary.js'

export const stocks = pgTable('stocks', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  symbol: varchar('symbol', { length: 32 }).notNull().unique(),
  quoteSymbol: varchar('quote_symbol', { length: 32 }),
  name: varchar('name', { length: 255 }),
  exchange: varchar('exchange', { length: 32 }),
  currency: varchar('currency', { length: 8 }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
})
export const diaryStocks = pgTable(
  'diary_stocks',
  {
    diaryId: bigint('diary_id', { mode: 'bigint' })
      .notNull()
      .references(() => diaries.id, { onDelete: 'cascade' }),
    stockId: bigint('stock_id', { mode: 'bigint' })
      .notNull()
      .references(() => stocks.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    primaryKey({ columns: [table.diaryId, table.stockId] }),
    index('diary_stocks_stock_diary_idx').on(table.stockId, table.diaryId),
  ],
)
export const stockWatchStatus = pgEnum('stock_watch_status', ['WATCHING', 'ARCHIVED'])
export const stockWatchlists = pgTable(
  'stock_watchlists',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: bigint('user_id', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    stockId: bigint('stock_id', { mode: 'bigint' })
      .notNull()
      .references(() => stocks.id, { onDelete: 'cascade' }),
    status: stockWatchStatus('status').default('WATCHING').notNull(),
    pinned: boolean('pinned').default(false).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    unique('stock_watchlists_user_stock_key').on(table.userId, table.stockId),
    check('stock_watchlists_sort_nonnegative', sql`${table.sortOrder} >= 0`),
    index('stock_watchlists_user_status_sort_idx').on(
      table.userId,
      table.status,
      table.pinned,
      table.sortOrder,
      table.id,
    ),
  ],
)
export const stockTimelineSourceType = pgEnum('stock_timeline_source_type', [
  'TRADE_BASIC_DIARY',
  'VIDEO_TRANSCRIBE_SUMMARIZE',
  'DIARY',
  'ARTICLE',
  'MANUAL',
  'SYSTEM',
  'MARKET_ROTATION',
  'SEC_FILING',
  'RELATIVE_VALUE',
  'SEASONALITY',
])
export const stockTimelineCreatedVia = pgEnum('stock_timeline_created_via', ['API_KEY', 'WEB', 'SYSTEM'])
export const stockTimelineRecords = pgTable(
  'stock_timeline_records',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: bigint('user_id', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    stockId: bigint('stock_id', { mode: 'bigint' })
      .notNull()
      .references(() => stocks.id, { onDelete: 'cascade' }),
    summary: text('summary').notNull(),
    sourceType: stockTimelineSourceType('source_type').notNull(),
    sourceTitle: varchar('source_title', { length: 255 }),
    sourceUrl: varchar('source_url', { length: 1000 }),
    sourceDiaryId: bigint('source_diary_id', { mode: 'bigint' }).references(() => diaries.id, { onDelete: 'set null' }),
    sourceExternalId: varchar('source_external_id', { length: 255 }),
    sourceExcerpt: text('source_excerpt'),
    confidence: integer('confidence'),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdVia: stockTimelineCreatedVia('created_via').default('API_KEY').notNull(),
    createdByLabel: varchar('created_by_label', { length: 100 }),
    metadataJson: text('metadata_json'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    unique('stock_timeline_records_user_stock_idempotency_key').on(table.userId, table.stockId, table.idempotencyKey),
    check(
      'stock_timeline_records_confidence_check',
      sql`${table.confidence} is null or ${table.confidence} between 0 and 100`,
    ),
    index('stock_timeline_records_user_stock_time_idx').on(
      table.userId,
      table.stockId,
      table.occurredAt.desc(),
      table.id.desc(),
    ),
    index('stock_timeline_records_user_time_idx').on(table.userId, table.occurredAt.desc(), table.id.desc()),
    index('stock_timeline_records_source_external_idx').on(table.sourceType, table.sourceExternalId),
    index('stock_timeline_records_source_diary_idx').on(table.sourceDiaryId),
  ],
)
export const stockNoteCreatedVia = pgEnum('stock_note_created_via', ['USER', 'AGENT'])
export const stockNotes = pgTable(
  'stock_notes',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: bigint('user_id', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    stockId: bigint('stock_id', { mode: 'bigint' })
      .notNull()
      .references(() => stocks.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }).notNull(),
    content: text('content').notNull(),
    date: timestamp('date', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    createdVia: stockNoteCreatedVia('created_via').default('USER').notNull(),
    createdByLabel: varchar('created_by_label', { length: 100 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    index('stock_notes_user_stock_date_idx').on(table.userId, table.stockId, table.date.desc(), table.id.desc()),
    index('stock_notes_stock_date_idx').on(table.stockId, table.date.desc()),
  ],
)
