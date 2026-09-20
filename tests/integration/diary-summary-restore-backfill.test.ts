import { afterAll, beforeAll, expect, it } from 'vitest'
import { migrateDatabase, users } from '@diary/db'
import { diaryExcerpt } from '@diary/domain'
import { provisionTestDatabase } from '../support/database'
import { historicalMigrations } from '../support/historical-migrations'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
const historical = historicalMigrations('0021_steady_banshee')
beforeAll(async () => { database = await provisionTestDatabase('excerpt_restore', historical.folder) })
afterAll(async () => { await database?.dispose(); historical.dispose() })

it('skips the summary excerpt backfill when replaying the full set over a restored N backup', async () => {
  const [user] = await database.db.insert(users)
    .values({ email: 'excerpt-restore@example.test', password: 'synthetic' })
    .returning({ id: users.id })
  await database.pool.query(
    `insert into diaries(user_id,title,content,date) values ($1,'Restored row','Content awaiting excerpt upgrade.',date '2026-09-01')`,
    [user!.id.toString()],
  )

  // Regression: the backfill used to query summary_excerpt before migration
  // N+1 added the columns, failing the whole restore smoke gate with 42703.
  const migrationsFolder = historical.folder
  await expect(migrateDatabase(database.db, { migrationsFolder, diaryExcerpt })).resolves.toBeUndefined()

  const ledger = await database.pool.query<{ count: string }>('select count(*)::text as count from drizzle.__drizzle_migrations')
  expect(Number(ledger.rows[0]!.count)).toBe(historical.count)
  const excerptColumns = await database.pool.query<{ column_name: string }>(
    "select column_name from information_schema.columns where table_schema='public' and table_name='diaries' and column_name like 'summary_excerpt%'",
  )
  expect(excerptColumns.rows).toHaveLength(0)
})
