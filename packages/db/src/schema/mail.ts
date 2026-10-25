/**
 * Account email: SMTP configuration, tokens, the outbox and its audit.
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
  text,
  timestamp,
  unique,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './account.js'

export const smtpSecurityMode = pgEnum('smtp_security_mode', ['none', 'tls', 'starttls'])
export const smtpAuthMode = pgEnum('smtp_auth_mode', ['none', 'password'])
export const smtpTestStatus = pgEnum('smtp_test_status', ['passed', 'failed'])
export const accountEmailTokenPurpose = pgEnum('account_email_token_purpose', ['registration', 'password_reset'])
export const mailOutboxKind = pgEnum('mail_outbox_kind', [
  'registration_verification',
  'password_reset',
  'password_changed',
  'admin_test',
])
export const mailOutboxStatus = pgEnum('mail_outbox_status', ['queued', 'running', 'sent', 'failed', 'cancelled'])
export const mailAuditResult = pgEnum('mail_audit_result', ['success', 'failure'])
/**
 * The single persisted SMTP configuration. Disabled installations may keep
 * incomplete values while enabled installations require a successful test of
 * the current revision.
 */
export const mailSettings = pgTable(
  'smtp_settings',
  {
    singleton: varchar('singleton', { length: 16 }).primaryKey().default('default'),
    enabled: boolean('enabled').notNull().default(false),
    host: varchar('host', { length: 255 }),
    port: integer('port'),
    security: smtpSecurityMode('security'),
    auth: smtpAuthMode('auth').notNull().default('none'),
    username: varchar('username', { length: 320 }),
    encryptedPassword: text('encrypted_password'),
    senderName: varchar('sender_name', { length: 200 }),
    senderEmail: varchar('sender_email', { length: 320 }),
    replyToEmail: varchar('reply_to_email', { length: 320 }),
    revision: integer('revision').notNull().default(1),
    lastTestedRevision: integer('last_tested_revision'),
    lastTestedAt: timestamp('last_tested_at', { withTimezone: true, mode: 'date' }),
    lastTestStatus: smtpTestStatus('last_test_status'),
    lastTestErrorCode: varchar('last_test_error_code', { length: 80 }),
    updatedBy: bigint('updated_by', { mode: 'bigint' }).references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    check('smtp_settings_singleton_check', sql`${table.singleton} = 'default'`),
    check('smtp_settings_host_nonempty', sql`${table.host} is null or length(btrim(${table.host})) > 0`),
    check('smtp_settings_port_bounds', sql`${table.port} is null or ${table.port} between 1 and 65535`),
    check('smtp_settings_username_nonempty', sql`${table.username} is null or length(btrim(${table.username})) > 0`),
    check(
      'smtp_settings_encrypted_password_nonempty',
      sql`${table.encryptedPassword} is null or length(${table.encryptedPassword}) > 0`,
    ),
    check(
      'smtp_settings_sender_name_nonempty',
      sql`${table.senderName} is null or length(btrim(${table.senderName})) > 0`,
    ),
    check(
      'smtp_settings_sender_email_shape',
      sql`${table.senderEmail} is null or ${table.senderEmail} ~ '^[^[:space:]@]+@[^[:space:]@]+$'`,
    ),
    check(
      'smtp_settings_reply_to_email_shape',
      sql`${table.replyToEmail} is null or ${table.replyToEmail} ~ '^[^[:space:]@]+@[^[:space:]@]+$'`,
    ),
    check(
      'smtp_settings_auth_fields',
      sql`not ${table.enabled} or ${table.auth} <> 'password' or (nullif(btrim(${table.username}), '') is not null and ${table.encryptedPassword} is not null)`,
    ),
    check('smtp_settings_revision_positive', sql`${table.revision} > 0`),
    check(
      'smtp_settings_test_revision_positive',
      sql`${table.lastTestedRevision} is null or ${table.lastTestedRevision} > 0`,
    ),
    check(
      'smtp_settings_test_metadata_consistent',
      sql`(${table.lastTestStatus} is null and ${table.lastTestedAt} is null and ${table.lastTestedRevision} is null) or (${table.lastTestStatus} is not null and ${table.lastTestedAt} is not null and ${table.lastTestedRevision} is not null)`,
    ),
    check(
      'smtp_settings_enabled_complete',
      sql`not ${table.enabled} or (${table.host} is not null and ${table.port} is not null and ${table.security} in ('tls', 'starttls') and ${table.senderName} is not null and ${table.senderEmail} is not null and ${table.lastTestStatus} = 'passed' and ${table.lastTestedAt} is not null and ${table.lastTestedRevision} = ${table.revision})`,
    ),
  ],
)
/** Lifecycle records retain only a digest of the raw account link token. */
export const accountEmailTokens = pgTable(
  'account_email_token',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    purpose: accountEmailTokenPurpose('purpose').notNull(),
    normalizedEmail: varchar('normalized_email', { length: 320 }).notNull(),
    userId: bigint('user_id', { mode: 'bigint' }).references(() => users.id, { onDelete: 'cascade' }),
    tokenDigest: varchar('token_digest', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true, mode: 'date' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    unique('account_email_token_digest_key').on(table.tokenDigest),
    uniqueIndex('account_email_token_active_email_key')
      .on(table.purpose, table.normalizedEmail)
      .where(sql`${table.consumedAt} is null and ${table.revokedAt} is null`),
    uniqueIndex('account_email_token_active_user_key')
      .on(table.purpose, table.userId)
      .where(sql`${table.userId} is not null and ${table.consumedAt} is null and ${table.revokedAt} is null`),
    index('account_email_token_expiry_idx').on(table.expiresAt, table.id),
    index('account_email_token_user_purpose_idx').on(table.userId, table.purpose, table.expiresAt),
    check(
      'account_email_token_email_normalized',
      sql`${table.normalizedEmail} = lower(btrim(${table.normalizedEmail})) and length(${table.normalizedEmail}) > 0`,
    ),
    check('account_email_token_digest_shape', sql`${table.tokenDigest} ~ '^[a-f0-9]{64}$'`),
    check(
      'account_email_token_purpose_user_consistent',
      sql`(${table.purpose} = 'registration' and ${table.userId} is null) or (${table.purpose} = 'password_reset' and ${table.userId} is not null)`,
    ),
    check(
      'account_email_token_terminal_state_exclusive',
      sql`not (${table.consumedAt} is not null and ${table.revokedAt} is not null)`,
    ),
  ],
)
/** Durable SMTP work; raw link material is encrypted and cleared at terminal states. */
export const mailOutbox = pgTable(
  'mail_outbox',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    kind: mailOutboxKind('kind').notNull(),
    recipientEmail: varchar('recipient_email', { length: 320 }).notNull(),
    locale: varchar('locale', { length: 5 }).notNull(),
    encryptedPayload: text('encrypted_payload'),
    tokenId: bigint('token_id', { mode: 'bigint' }).references(() => accountEmailTokens.id, { onDelete: 'set null' }),
    status: mailOutboxStatus('status').notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true, mode: 'date' }),
    leaseToken: varchar('lease_token', { length: 128 }),
    workerId: varchar('worker_id', { length: 128 }),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true, mode: 'date' }),
    heartbeatAt: timestamp('heartbeat_at', { withTimezone: true, mode: 'date' }),
    configRevisionUsed: integer('config_revision_used'),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    queuedAt: timestamp('queued_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }),
    sentAt: timestamp('sent_at', { withTimezone: true, mode: 'date' }),
    finishedAt: timestamp('finished_at', { withTimezone: true, mode: 'date' }),
    lastErrorCode: varchar('last_error_code', { length: 80 }),
    lastErrorDetail: varchar('last_error_detail', { length: 500 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    uniqueIndex('mail_outbox_active_token_key')
      .on(table.tokenId)
      .where(sql`${table.tokenId} is not null and ${table.status} in ('queued', 'running')`),
    index('mail_outbox_claim_idx').on(table.status, table.nextAttemptAt, table.expiresAt, table.id),
    index('mail_outbox_lease_idx')
      .on(table.status, table.leaseExpiresAt, table.id)
      .where(sql`${table.status} = 'running'`),
    index('mail_outbox_expiry_idx').on(table.expiresAt, table.id),
    index('mail_outbox_token_idx').on(table.tokenId, table.createdAt.desc()),
    index('mail_outbox_status_created_idx').on(table.status, table.createdAt.desc(), table.id.desc()),
    check('mail_outbox_recipient_email_shape', sql`${table.recipientEmail} ~ '^[^[:space:]@]+@[^[:space:]@]+$'`),
    check('mail_outbox_locale_valid', sql`${table.locale} in ('zh-TW', 'zh-CN', 'en')`),
    check(
      'mail_outbox_attempt_bounds',
      sql`${table.attempts} between 0 and ${table.maxAttempts} and ${table.maxAttempts} between 1 and 5`,
    ),
    check(
      'mail_outbox_config_revision_positive',
      sql`${table.configRevisionUsed} is null or ${table.configRevisionUsed} > 0`,
    ),
    check(
      'mail_outbox_lease_consistent',
      sql`(${table.status} = 'running' and ${table.leaseToken} is not null and ${table.workerId} is not null and ${table.leaseExpiresAt} is not null and ${table.startedAt} is not null and ${table.finishedAt} is null and ${table.sentAt} is null) or (${table.status} <> 'running' and ${table.leaseToken} is null and ${table.workerId} is null and ${table.leaseExpiresAt} is null)`,
    ),
    check(
      'mail_outbox_terminal_state_consistent',
      sql`(${table.status} in ('queued', 'running') and ${table.finishedAt} is null and ${table.sentAt} is null) or (${table.status} = 'sent' and ${table.finishedAt} is not null and ${table.sentAt} is not null) or (${table.status} in ('failed', 'cancelled') and ${table.finishedAt} is not null and ${table.sentAt} is null)`,
    ),
    check(
      'mail_outbox_payload_retention',
      sql`${table.status} in ('queued', 'running') or ${table.encryptedPayload} is null`,
    ),
    check(
      'mail_outbox_queued_payload',
      sql`${table.status} not in ('queued', 'running') or ${table.encryptedPayload} is not null`,
    ),
  ],
)
/** Hashed request keys support email and IP buckets without retaining either value. */
export const accountEmailRateLimits = pgTable(
  'email_request_rate_limit',
  {
    digest: varchar('digest', { length: 64 }).primaryKey(),
    requestCount: integer('request_count').notNull().default(0),
    windowStartedAt: timestamp('window_started_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    lastRequestedAt: timestamp('last_requested_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    blockedUntil: timestamp('blocked_until', { withTimezone: true, mode: 'date' }),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    index('email_request_rate_limit_expiry_idx').on(table.expiresAt, table.digest),
    index('email_request_rate_limit_blocked_idx').on(table.blockedUntil, table.digest),
    check('email_request_rate_limit_digest_shape', sql`${table.digest} ~ '^[a-f0-9]{64}$'`),
    check('email_request_rate_limit_count_nonnegative', sql`${table.requestCount} >= 0`),
  ],
)
/** Mail administration audit records intentionally contain no recipient or secret fields. */
export const mailAdminAuditEvents = pgTable(
  'mail_admin_audit_event',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    actorUserId: bigint('actor_user_id', { mode: 'bigint' }).references(() => users.id, { onDelete: 'set null' }),
    action: varchar('action', { length: 80 }).notNull(),
    result: mailAuditResult('result').notNull(),
    configRevision: integer('config_revision'),
    errorCode: varchar('error_code', { length: 80 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    index('mail_admin_audit_created_idx').on(table.createdAt.desc(), table.id.desc()),
    index('mail_admin_audit_actor_idx').on(table.actorUserId, table.createdAt.desc()),
    index('mail_admin_audit_action_idx').on(table.action, table.createdAt.desc()),
    check('mail_admin_audit_action_nonempty', sql`length(btrim(${table.action})) > 0`),
    check(
      'mail_admin_audit_config_revision_positive',
      sql`${table.configRevision} is null or ${table.configRevision} > 0`,
    ),
  ],
)
