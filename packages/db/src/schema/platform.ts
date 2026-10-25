/**
 * Cross-cutting platform state: shared schedulers and the prompt library.
 *
 * Moved verbatim out of the single 2,458-line schema module; no definition
 * changed, which is what `npm run db:generate` reporting no drift proves.
 */

import { bigint, check, foreignKey, integer, pgTable, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './account.js'
import { aiPromptVersions } from './ai.js'

export const secRequestSchedulerState = pgTable(
  'sec_request_scheduler_state',
  {
    singleton: integer('singleton').primaryKey(),
    nextAllowedAt: timestamp('next_allowed_at', { withTimezone: true, mode: 'date' }).notNull(),
    requestCount: bigint('request_count', { mode: 'bigint' })
      .default(sql`0`)
      .notNull(),
    failureCount: bigint('failure_count', { mode: 'bigint' })
      .default(sql`0`)
      .notNull(),
    lastRequestAt: timestamp('last_request_at', { withTimezone: true, mode: 'date' }),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    check('sec_request_scheduler_singleton_check', sql`${table.singleton} = 1`),
    check('sec_request_scheduler_counts_nonnegative', sql`${table.requestCount} >= 0 and ${table.failureCount} >= 0`),
  ],
)
export const sharedPromptVersions = pgTable(
  'shared_prompt_version',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    key: varchar('prompt_key', { length: 100 }).notNull(),
    revision: integer('revision').notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    template: text('template').notNull(),
    legacyPromptId: bigint('legacy_prompt_id', { mode: 'bigint' }).references(() => aiPromptVersions.id, {
      onDelete: 'restrict',
    }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdBy: bigint('created_by', { mode: 'bigint' }).references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    unique('shared_prompt_version_key_revision').on(table.key, table.revision),
    unique('shared_prompt_version_key_id').on(table.key, table.id),
    check('shared_prompt_version_revision_positive', sql`${table.revision} > 0`),
    check(
      'shared_prompt_version_template_valid',
      sql`length(btrim(${table.template})) > 0 and length(${table.template}) <= 12000`,
    ),
  ],
)
export const sharedPromptStates = pgTable(
  'shared_prompt_state',
  {
    key: varchar('prompt_key', { length: 100 }).primaryKey(),
    revision: integer('revision').notNull().default(0),
    activeVersionId: bigint('active_version_id', { mode: 'bigint' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    foreignKey({
      name: 'shared_prompt_state_active_version_fk',
      columns: [table.key, table.activeVersionId],
      foreignColumns: [sharedPromptVersions.key, sharedPromptVersions.id],
    }),
    check('shared_prompt_state_revision_nonnegative', sql`${table.revision} >= 0`),
  ],
)
