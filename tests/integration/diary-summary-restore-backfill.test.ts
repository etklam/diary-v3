import { afterAll, beforeAll, expect, it } from 'vitest'
import { copyFileSync, cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrateDatabase, users } from '@diary/db'
import { diaryExcerpt } from '@diary/domain'
import { provisionTestDatabase } from '../support/database'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
beforeAll(async () => { database = await provisionTestDatabase('excerpt_restore') })
afterAll(async () => { await database?.dispose() })

/** Reproduce the restore-smoke N folder: journal truncated at the penultimate migration. */
function truncateMigrationsFolder(cutoffTag: string) {
  const source = 'packages/db/migrations'
  const target = mkdtempSync(join(tmpdir(), 'diary-v3-migrations-n-'))
  cpSync(join(source, 'meta'), join(target, 'meta'), { recursive: true })
  const journal = JSON.parse(readFileSync(join(target, 'meta', '_journal.json'), 'utf8')) as { entries: Array<{ tag: string }> }
  const cutoff = journal.entries.findIndex(entry => entry.tag === cutoffTag)
  if (cutoff < 0) throw new Error(`migration tag not found: ${cutoffTag}`)
  for (const entry of journal.entries.slice(0, cutoff + 1)) {
    copyFileSync(join(source, `${entry.tag}.sql`), join(target, `${entry.tag}.sql`))
  }
  journal.entries = journal.entries.slice(0, cutoff + 1)
  writeFileSync(join(target, 'meta', '_journal.json'), `${JSON.stringify(journal, null, 2)}\n`)
  return target
}

it('skips the summary excerpt backfill when replaying the full set over a restored N backup', async () => {
  const [user] = await database.db.insert(users)
    .values({ email: 'excerpt-restore@example.test', password: 'synthetic' })
    .returning({ id: users.id })
  await database.pool.query(
    `insert into diaries(user_id,title,content,date) values ($1,'Restored row','Content awaiting excerpt upgrade.',date '2026-09-01')`,
    [user!.id.toString()],
  )

  // Rewind to the N restore state: pre-0022 columns/trigger/function and ledger row.
  await database.pool.query('drop trigger diaries_summary_excerpt_invalidate on diaries')
  await database.pool.query('drop function invalidate_stale_diary_summary_excerpt()')
  await database.pool.query('alter table diaries drop column summary_excerpt, drop column summary_excerpt_content_hash')
  await database.pool.query(`delete from drizzle.__drizzle_migrations where hash = (
    select hash from drizzle.__drizzle_migrations order by created_at desc limit 1
  )`)

  // Regression: the backfill used to query summary_excerpt before migration
  // N+1 added the columns, failing the whole restore smoke gate with 42703.
  const migrationsFolder = truncateMigrationsFolder('0021_steady_banshee')
  await expect(migrateDatabase(database.db, { migrationsFolder, diaryExcerpt })).resolves.toBeUndefined()

  const ledger = await database.pool.query<{ count: string }>('select count(*)::text as count from drizzle.__drizzle_migrations')
  expect(ledger.rows[0]!.count).toBe('22')
  const excerptColumns = await database.pool.query<{ column_name: string }>(
    "select column_name from information_schema.columns where table_schema='public' and table_name='diaries' and column_name like 'summary_excerpt%'",
  )
  expect(excerptColumns.rows).toHaveLength(0)
})
