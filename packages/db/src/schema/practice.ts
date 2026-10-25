/**
 * Trading principles, achievements and goals.
 *
 * Moved verbatim out of the single 2,458-line schema module; no definition
 * changed, which is what `npm run db:generate` reporting no drift proves.
 */

import { bigint, check, date, index, integer, pgEnum, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './account.js'

export const disciplines = pgTable(
  'disciplines',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: bigint('user_id', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    content: varchar('content', { length: 255 }).notNull(),
    order: integer('display_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index('disciplines_user_order_id_idx').on(table.userId, table.order, table.id),
    check('disciplines_content_nonempty', sql`length(btrim(${table.content})) > 0`),
  ],
)
export const personalAchievements = pgTable(
  'personal_achievements',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: bigint('user_id', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    index('personal_achievements_user_date_idx').on(table.userId, table.date.desc(), table.id.desc()),
    check('personal_achievements_content_nonempty', sql`length(btrim(${table.content})) > 0`),
    check('personal_achievements_content_length', sql`length(${table.content}) <= 1000`),
  ],
)
export const personalGoalStatus = pgEnum('personal_goal_status', ['active', 'achieved'])
/**
 * A manually recorded intention. `target_date` is null for open-ended goals and
 * overdue state is derived at read time, so no scheduled job has to age rows.
 */
export const personalGoals = pgTable(
  'personal_goals',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: bigint('user_id', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    targetDate: date('target_date', { mode: 'string' }),
    status: personalGoalStatus('status').default('active').notNull(),
    achievedDate: date('achieved_date', { mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    index('personal_goals_user_status_idx').on(table.userId, table.status, table.targetDate, table.id.desc()),
    check('personal_goals_content_nonempty', sql`length(btrim(${table.content})) > 0`),
    check('personal_goals_content_length', sql`length(${table.content}) <= 1000`),
    check(
      'personal_goals_achieved_date_consistency',
      sql`(${table.status} = 'achieved') = (${table.achievedDate} is not null)`,
    ),
  ],
)
