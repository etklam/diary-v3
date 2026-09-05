import {
  AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const userRole = pgEnum('user_role', ['USER', 'ADMIN'])
export const refreshTokenClientType = pgEnum('refresh_token_client_type', ['WEB', 'NATIVE'])
export const refreshTokenRevocationReason = pgEnum('refresh_token_revocation_reason', [
  'ROTATED', 'LOGOUT', 'LOGOUT_ALL', 'REUSE_DETECTED', 'EXPIRED',
])
export const diaryCreatedVia = pgEnum('diary_created_via', ['WEB', 'API_KEY', 'TELEGRAM_BOT'])
export const diaryReviewStatus = pgEnum('diary_review_status', ['none', 'pending', 'reviewed'])
export const thesisReviewOutcome = pgEnum('thesis_review_outcome', ['INTACT', 'PARTIAL', 'INVALIDATED', 'UNCLEAR'])
export const transactionType = pgEnum('transaction_type', ['BUY', 'SELL'])
export const tradePlanStatus = pgEnum('trade_plan_status', ['draft', 'active', 'closed', 'cancelled'])

export const users = pgTable('users', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  email: varchar('email', { length: 255 }).notNull(),
  password: text('password').notNull(),
  name: text('name'),
  role: userRole('role').default('USER').notNull(),
  tokenVersion: integer('token_version').default(0).notNull(),
  expectedMonthlyTrades: integer('expected_monthly_trades').default(20).notNull(),
  expectedProfit: numeric('expected_profit', { precision: 15, scale: 2 }).default('0').notNull(),
  expectedAvgHolding: numeric('expected_avg_holding', { precision: 15, scale: 2 }).default('0').notNull(),
  timezone: varchar('timezone', { length: 50 }).default('Asia/Taipei').notNull(),
  locale: varchar('locale', { length: 5 }).default('zh-TW').notNull(),
  excludeHolidaysInStats: boolean('exclude_holidays_in_stats').default(true).notNull(),
  favoriteTagsString: varchar('favorite_tags', { length: 500 }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('users_email_lower_key').on(sql`lower(${table.email})`),
  check('users_expected_monthly_trades_nonnegative', sql`${table.expectedMonthlyTrades} >= 0`),
  check('users_locale_valid', sql`${table.locale} in ('zh-TW', 'zh-CN', 'en')`),
])

export const refreshTokens = pgTable('refresh_tokens', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  token: varchar('token', { length: 500 }).notNull().unique('refresh_tokens_token_key'),
  userId: bigint('user_id', { mode: 'bigint' }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  clientType: refreshTokenClientType('client_type').default('WEB').notNull(),
  familyId: varchar('family_id', { length: 64 }).notNull(),
  deviceName: varchar('device_name', { length: 100 }),
  parentId: bigint('parent_id', { mode: 'bigint' }).references((): AnyPgColumn => refreshTokens.id, { onDelete: 'set null' }),
  replacementId: bigint('replacement_id', { mode: 'bigint' }).references((): AnyPgColumn => refreshTokens.id, { onDelete: 'set null' }),
  revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
  revocationReason: refreshTokenRevocationReason('revocation_reason'),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  unique('refresh_tokens_replacement_id_key').on(table.replacementId),
  index('refresh_tokens_user_id_idx').on(table.userId),
  index('refresh_tokens_user_client_idx').on(table.userId, table.clientType),
  index('refresh_tokens_family_revoked_idx').on(table.familyId, table.revokedAt),
  index('refresh_tokens_parent_id_idx').on(table.parentId),
])

export const diaries = pgTable('diaries', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  userId: bigint('user_id', { mode: 'bigint' }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 500 }).notNull(),
  content: text('content').notNull(),
  tags: text('tags').array().default(sql`ARRAY[]::text[]`).notNull(),
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
}, (table) => [
  unique('diaries_user_date_key').on(table.userId, table.date),
  unique('diaries_id_user_id_key').on(table.id, table.userId),
  index('diaries_user_id_idx').on(table.userId),
  index('diaries_user_created_idx').on(table.userId, table.createdAt.desc()),
])

export const transactions = pgTable('transactions', {
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
}, (table) => [
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
])

export const tradePlans = pgTable('trade_plans', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  userId: bigint('user_id', { mode: 'bigint' }).notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  diaryId: bigint('diary_id', { mode: 'bigint' })
    .references(() => diaries.id, { onDelete: 'set null' }),
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
}, (table) => [
  check('trade_plans_entry_price_nonnegative', sql`${table.entryPrice} is null or ${table.entryPrice} >= 0`),
  check('trade_plans_entry_zone_low_nonnegative', sql`${table.entryZoneLow} is null or ${table.entryZoneLow} >= 0`),
  check('trade_plans_entry_zone_high_nonnegative', sql`${table.entryZoneHigh} is null or ${table.entryZoneHigh} >= 0`),
  check('trade_plans_stop_loss_nonnegative', sql`${table.stopLoss} is null or ${table.stopLoss} >= 0`),
  check('trade_plans_target_price_nonnegative', sql`${table.targetPrice} is null or ${table.targetPrice} >= 0`),
  check('trade_plans_max_position_size_nonnegative', sql`${table.maxPositionSize} is null or ${table.maxPositionSize} >= 0`),
  check('trade_plans_zone_order_v1_check', sql`${table.entryZoneLow} is null or ${table.entryZoneHigh} is null or ${table.entryZoneLow} <= ${table.entryZoneHigh}`),
  index('trade_plans_user_status_idx').on(table.userId, table.status),
  index('trade_plans_user_symbol_idx').on(table.userId, table.symbol),
  index('trade_plans_diary_id_idx').on(table.diaryId),
])

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

export const diaryStocks = pgTable('diary_stocks', {
  diaryId: bigint('diary_id', { mode: 'bigint' }).notNull().references(() => diaries.id, { onDelete: 'cascade' }),
  stockId: bigint('stock_id', { mode: 'bigint' }).notNull().references(() => stocks.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, table => [
  primaryKey({ columns: [table.diaryId, table.stockId] }),
  index('diary_stocks_stock_diary_idx').on(table.stockId, table.diaryId),
])

export const stockWatchStatus = pgEnum('stock_watch_status', ['WATCHING', 'ARCHIVED'])
export const stockWatchlists = pgTable('stock_watchlists', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  userId: bigint('user_id', { mode: 'bigint' }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  stockId: bigint('stock_id', { mode: 'bigint' }).notNull().references(() => stocks.id, { onDelete: 'cascade' }),
  status: stockWatchStatus('status').default('WATCHING').notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, table => [
  unique('stock_watchlists_user_stock_key').on(table.userId, table.stockId),
  check('stock_watchlists_sort_nonnegative', sql`${table.sortOrder} >= 0`),
  index('stock_watchlists_user_status_sort_idx').on(table.userId, table.status, table.sortOrder, table.id),
])

export const stockTimelineSourceType = pgEnum('stock_timeline_source_type', [
  'TRADE_BASIC_DIARY', 'VIDEO_TRANSCRIBE_SUMMARIZE', 'DIARY', 'ARTICLE', 'MANUAL', 'SYSTEM',
  'MARKET_ROTATION', 'SEC_FILING', 'RELATIVE_VALUE', 'SEASONALITY',
])
export const stockTimelineCreatedVia = pgEnum('stock_timeline_created_via', ['API_KEY', 'WEB', 'SYSTEM'])
export const stockTimelineRecords = pgTable('stock_timeline_records', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  userId: bigint('user_id', { mode: 'bigint' }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  stockId: bigint('stock_id', { mode: 'bigint' }).notNull().references(() => stocks.id, { onDelete: 'cascade' }),
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
}, table => [
  unique('stock_timeline_records_user_stock_idempotency_key').on(table.userId, table.stockId, table.idempotencyKey),
  check('stock_timeline_records_confidence_check', sql`${table.confidence} is null or ${table.confidence} between 0 and 100`),
  index('stock_timeline_records_user_stock_time_idx').on(table.userId, table.stockId, table.occurredAt.desc(), table.id.desc()),
  index('stock_timeline_records_user_time_idx').on(table.userId, table.occurredAt.desc(), table.id.desc()),
  index('stock_timeline_records_source_external_idx').on(table.sourceType, table.sourceExternalId),
  index('stock_timeline_records_source_diary_idx').on(table.sourceDiaryId),
])

export const stockNoteCreatedVia = pgEnum('stock_note_created_via', ['USER', 'AGENT'])
export const stockNotes = pgTable('stock_notes', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  userId: bigint('user_id', { mode: 'bigint' }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  stockId: bigint('stock_id', { mode: 'bigint' }).notNull().references(() => stocks.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  content: text('content').notNull(),
  date: timestamp('date', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  createdVia: stockNoteCreatedVia('created_via').default('USER').notNull(),
  createdByLabel: varchar('created_by_label', { length: 100 }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, table => [
  index('stock_notes_user_stock_date_idx').on(table.userId, table.stockId, table.date.desc(), table.id.desc()),
  index('stock_notes_stock_date_idx').on(table.stockId, table.date.desc()),
])

export const investmentThesisStatus = pgEnum('investment_thesis_status', ['DRAFT', 'ACTIVE', 'ARCHIVED'])
export const thesisPortfolioDecision = pgEnum('thesis_portfolio_decision', ['HOLD', 'ADD', 'REDUCE', 'EXIT', 'CONTINUE_WATCHING'])
export const investmentTheses = pgTable('investment_theses', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  userId: bigint('user_id', { mode: 'bigint' }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  stockId: bigint('stock_id', { mode: 'bigint' }).notNull().references(() => stocks.id, { onDelete: 'cascade' }),
  status: investmentThesisStatus('status').default('DRAFT').notNull(),
  summary: text('summary'),
  whyIOwnIt: text('why_i_own_it'),
  growthDrivers: text('growth_drivers'),
  risks: text('risks'),
  invalidationConditions: text('invalidation_conditions'),
  expectedHoldingPeriod: varchar('expected_holding_period', { length: 255 }),
  reviewDueAt: timestamp('review_due_at', { withTimezone: true, mode: 'date' }),
  lastReviewedAt: timestamp('last_reviewed_at', { withTimezone: true, mode: 'date' }),
  latestReviewOutcome: thesisReviewOutcome('latest_review_outcome'),
  activatedAt: timestamp('activated_at', { withTimezone: true, mode: 'date' }),
  archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, table => [
  unique('investment_theses_user_stock_key').on(table.userId, table.stockId),
  unique('investment_theses_id_user_id_key').on(table.id, table.userId),
  index('investment_theses_user_status_due_idx').on(table.userId, table.status, table.reviewDueAt),
  check('investment_theses_active_content_check', sql`${table.status} <> 'ACTIVE' OR (nullif(btrim(${table.summary}), '') is not null AND nullif(btrim(${table.whyIOwnIt}), '') is not null)`),
])
export const thesisReviews = pgTable('thesis_reviews', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  thesisId: bigint('thesis_id', { mode: 'bigint' }).notNull(),
  userId: bigint('user_id', { mode: 'bigint' }).notNull().references(() => users.id, { onDelete: 'cascade' }),
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
}, table => [
  foreignKey({ name: 'thesis_reviews_thesis_owner_fkey', columns: [table.thesisId, table.userId], foreignColumns: [investmentTheses.id, investmentTheses.userId] }).onDelete('cascade'),
  index('thesis_reviews_user_thesis_time_idx').on(table.userId, table.thesisId, table.reviewedAt.desc(), table.id.desc()),
  index('thesis_reviews_thesis_user_idx').on(table.thesisId, table.userId),
  check('thesis_reviews_reflection_check', sql`nullif(btrim(${table.whatImproved}), '') is not null OR nullif(btrim(${table.whatDeteriorated}), '') is not null OR nullif(btrim(${table.whatChanged}), '') is not null`),
])

export const alertRecurringMode = pgEnum('alert_recurring_mode', ['WEEK', 'MONTH'])
export const alerts = pgTable('alerts', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  diaryId: bigint('diary_id', { mode: 'bigint' }).notNull().references(() => diaries.id, { onDelete: 'cascade' }),
  message: varchar('message', { length: 500 }).notNull(),
  triggerAt: timestamp('trigger_at', { withTimezone: true, mode: 'date' }).notNull(),
  isDismissed: boolean('is_dismissed').default(false).notNull(),
  recurringMode: alertRecurringMode('recurring_mode'),
  parentId: bigint('parent_id', { mode: 'bigint' }),
  instanceNumber: integer('instance_number').default(1).notNull(),
  isPaused: boolean('is_paused').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, table => [
  unique('alerts_id_diary_unique').on(table.id, table.diaryId),
  unique('alerts_parent_instance_unique').on(table.parentId, table.instanceNumber),
  foreignKey({ name: 'alerts_parent_same_diary_fk', columns: [table.parentId, table.diaryId], foreignColumns: [table.id, table.diaryId] }).onDelete('cascade'),
  check('alerts_instance_positive', sql`${table.instanceNumber} > 0`),
  check('alerts_message_nonempty', sql`length(trim(${table.message})) > 0`),
  check('alerts_single_shape', sql`${table.recurringMode} is not null or (${table.parentId} is null and ${table.instanceNumber} = 1)`),
  index('alerts_diary_trigger_id_idx').on(table.diaryId, table.triggerAt, table.id),
  index('alerts_pending_trigger_idx').on(table.isDismissed, table.triggerAt, table.id),
])

export const partnerLinks = pgTable('partner_links', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  userAId: bigint('user_a_id', { mode: 'bigint' }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  userBId: bigint('user_b_id', { mode: 'bigint' }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  initiatedByUserId: bigint('initiated_by_user_id', { mode: 'bigint' }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  userASharesDiaries: boolean('user_a_shares_diaries').notNull().default(false),
  userBSharesDiaries: boolean('user_b_shares_diaries').notNull().default(false),
  userASharesStockNotes: boolean('user_a_shares_stock_notes').notNull().default(false),
  userBSharesStockNotes: boolean('user_b_shares_stock_notes').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  unique('partner_links_user_pair_key').on(table.userAId, table.userBId),
  index('partner_links_user_b_idx').on(table.userBId),
  index('partner_links_initiated_by_idx').on(table.initiatedByUserId),
  check('partner_links_ordered_pair', sql`${table.userAId} < ${table.userBId}`),
  check('partner_links_initiator_participant', sql`${table.initiatedByUserId} IN (${table.userAId}, ${table.userBId})`),
  check('partner_links_pending_private', sql`${table.acceptedAt} IS NOT NULL OR NOT (${table.userASharesDiaries} OR ${table.userBSharesDiaries} OR ${table.userASharesStockNotes} OR ${table.userBSharesStockNotes})`),
])

export const apiKeyScope = pgEnum('api_key_scope', ['DIARY_CREATE', 'AGENT_WRITE'])
export const apiKeyCredentials = pgTable('api_key_credentials', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  userId: bigint('user_id', { mode: 'bigint' }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  label: varchar('label', { length: 100 }).notNull(),
  keyHash: varchar('key_hash', { length: 64 }).notNull(),
  keyPrefix: varchar('key_prefix', { length: 12 }).notNull(),
  scope: apiKeyScope('scope').default('DIARY_CREATE').notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true, mode: 'date' }),
  revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, table => [
  unique('api_key_credentials_hash_key').on(table.keyHash),
  index('api_key_credentials_user_created_idx').on(table.userId, table.createdAt.desc(), table.id.desc()),
  check('api_key_credentials_label_nonempty', sql`length(btrim(${table.label})) > 0`),
  check('api_key_credentials_hash_format', sql`${table.keyHash} ~ '^[0-9a-f]{64}$'`),
  check('api_key_credentials_prefix_format', sql`${table.keyPrefix} ~ '^dva_[0-9a-f]{8}$'`),
])

export const etfs = pgTable('etfs', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  symbol: varchar('symbol', { length: 20 }).notNull(),
  name: varchar('name', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, table => [unique('etfs_symbol_key').on(table.symbol), check('etfs_symbol_canonical', sql`${table.symbol} = upper(btrim(${table.symbol})) and length(${table.symbol}) > 0`)])
export const etfPrices = pgTable('etf_prices', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  etfId: bigint('etf_id', { mode: 'bigint' }).notNull().references(() => etfs.id, { onDelete: 'cascade' }),
  date: date('date', { mode: 'string' }).notNull(),
  open: numeric('open', { precision: 10, scale: 4 }).notNull(),
  high: numeric('high', { precision: 10, scale: 4 }).notNull(),
  low: numeric('low', { precision: 10, scale: 4 }).notNull(),
  close: numeric('close', { precision: 10, scale: 4 }).notNull(),
  adjClose: numeric('adj_close', { precision: 10, scale: 4 }).notNull(),
  volume: bigint('volume', { mode: 'bigint' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, table => [unique('etf_prices_etf_date_key').on(table.etfId, table.date), index('etf_prices_etf_date_idx').on(table.etfId, table.date.desc()), check('etf_prices_volume_nonnegative', sql`${table.volume} is null or ${table.volume} >= 0`)])
export const etfWatchlists = pgTable('etf_watchlists', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  userId: bigint('user_id', { mode: 'bigint' }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  etfId: bigint('etf_id', { mode: 'bigint' }).notNull().references(() => etfs.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, table => [unique('etf_watchlists_user_etf_key').on(table.userId, table.etfId), index('etf_watchlists_user_order_idx').on(table.userId, table.sortOrder, table.id)])

export const marketDailyPrices = pgTable('market_daily_price', {
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
}, table => [
  unique('market_daily_price_symbol_date_key').on(table.symbol, table.date),
  index('market_daily_price_symbol_date_idx').on(table.symbol, table.date),
  index('market_daily_price_date_idx').on(table.date),
])

export const marketRotationSnapshots = pgTable('market_rotation_snapshot', {
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
}, table => [
  unique('market_rotation_snapshot_scope_symbol_date_key').on(table.rankScope, table.symbol, table.date),
  index('market_rotation_snapshot_scope_date_rank_idx').on(table.rankScope, table.date, table.rotationRank),
  index('market_rotation_snapshot_scope_date_idx').on(table.rankScope, table.date),
])

export const marketRotationSnapshotRuns = pgTable('market_rotation_snapshot_run', {
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
}, table => [
  index('market_rotation_snapshot_run_scope_started_idx').on(table.rankScope, table.startedAt.desc()),
  index('market_rotation_snapshot_run_snapshot_date_idx').on(table.snapshotDate),
])
