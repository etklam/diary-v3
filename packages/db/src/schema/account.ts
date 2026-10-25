/**
 * Accounts, sessions and delegated access.
 *
 * Moved verbatim out of the single 2,458-line schema module; no definition
 * changed, which is what `npm run db:generate` reporting no drift proves.
 */

import {
  AnyPgColumn,
  bigint,
  boolean,
  check,
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

export const userRole = pgEnum('user_role', ['USER', 'ADMIN'])
export const refreshTokenClientType = pgEnum('refresh_token_client_type', ['WEB', 'NATIVE'])
export const refreshTokenRevocationReason = pgEnum('refresh_token_revocation_reason', [
  'ROTATED',
  'LOGOUT',
  'LOGOUT_ALL',
  'REUSE_DETECTED',
  'EXPIRED',
])
export const users = pgTable(
  'users',
  {
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
    defaultWorkspacePage: varchar('default_workspace_page', { length: 16 }).default('timeline').notNull(),
    excludeHolidaysInStats: boolean('exclude_holidays_in_stats').default(true).notNull(),
    favoriteTagsString: varchar('favorite_tags', { length: 500 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    uniqueIndex('users_email_lower_key').on(sql`lower(${table.email})`),
    check('users_expected_monthly_trades_nonnegative', sql`${table.expectedMonthlyTrades} >= 0`),
    check('users_locale_valid', sql`${table.locale} in ('zh-TW', 'zh-CN', 'en')`),
    check(
      'users_default_workspace_page_valid',
      sql`${table.defaultWorkspacePage} in ('diaries', 'timeline', 'calendar')`,
    ),
  ],
)
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    token: varchar('token', { length: 500 }).notNull().unique('refresh_tokens_token_key'),
    userId: bigint('user_id', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    clientType: refreshTokenClientType('client_type').default('WEB').notNull(),
    familyId: varchar('family_id', { length: 64 }).notNull(),
    deviceName: varchar('device_name', { length: 100 }),
    parentId: bigint('parent_id', { mode: 'bigint' }).references((): AnyPgColumn => refreshTokens.id, {
      onDelete: 'set null',
    }),
    replacementId: bigint('replacement_id', { mode: 'bigint' }).references((): AnyPgColumn => refreshTokens.id, {
      onDelete: 'set null',
    }),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    revocationReason: refreshTokenRevocationReason('revocation_reason'),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    unique('refresh_tokens_replacement_id_key').on(table.replacementId),
    index('refresh_tokens_user_id_idx').on(table.userId),
    index('refresh_tokens_user_client_idx').on(table.userId, table.clientType),
    index('refresh_tokens_family_revoked_idx').on(table.familyId, table.revokedAt),
    index('refresh_tokens_parent_id_idx').on(table.parentId),
  ],
)
export const partnerLinks = pgTable(
  'partner_links',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    userAId: bigint('user_a_id', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    userBId: bigint('user_b_id', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    initiatedByUserId: bigint('initiated_by_user_id', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    userASharesDiaries: boolean('user_a_shares_diaries').notNull().default(false),
    userBSharesDiaries: boolean('user_b_shares_diaries').notNull().default(false),
    userASharesStockNotes: boolean('user_a_shares_stock_notes').notNull().default(false),
    userBSharesStockNotes: boolean('user_b_shares_stock_notes').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    unique('partner_links_user_pair_key').on(table.userAId, table.userBId),
    index('partner_links_user_b_idx').on(table.userBId),
    index('partner_links_initiated_by_idx').on(table.initiatedByUserId),
    check('partner_links_ordered_pair', sql`${table.userAId} < ${table.userBId}`),
    check(
      'partner_links_initiator_participant',
      sql`${table.initiatedByUserId} IN (${table.userAId}, ${table.userBId})`,
    ),
    check(
      'partner_links_pending_private',
      sql`${table.acceptedAt} IS NOT NULL OR NOT (${table.userASharesDiaries} OR ${table.userBSharesDiaries} OR ${table.userASharesStockNotes} OR ${table.userBSharesStockNotes})`,
    ),
  ],
)
export const apiKeyScope = pgEnum('api_key_scope', ['DIARY_CREATE', 'AGENT_WRITE'])
export const apiKeyCredentials = pgTable(
  'api_key_credentials',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: bigint('user_id', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    label: varchar('label', { length: 100 }).notNull(),
    keyHash: varchar('key_hash', { length: 64 }).notNull(),
    keyPrefix: varchar('key_prefix', { length: 12 }).notNull(),
    scope: apiKeyScope('scope').default('DIARY_CREATE').notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true, mode: 'date' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    unique('api_key_credentials_hash_key').on(table.keyHash),
    index('api_key_credentials_user_created_idx').on(table.userId, table.createdAt.desc(), table.id.desc()),
    check('api_key_credentials_label_nonempty', sql`length(btrim(${table.label})) > 0`),
    check('api_key_credentials_hash_format', sql`${table.keyHash} ~ '^[0-9a-f]{64}$'`),
    check('api_key_credentials_prefix_format', sql`${table.keyPrefix} ~ '^dva_[0-9a-f]{8}$'`),
  ],
)
