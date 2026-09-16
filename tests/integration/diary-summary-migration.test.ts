import { afterAll, beforeAll, expect, it } from 'vitest'
import { migrateDatabase, users } from '@diary/db'
import { diaryExcerpt } from '@diary/domain'
import { provisionTestDatabase } from '../support/database'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
beforeAll(async () => { database = await provisionTestDatabase('diary_excerpt_upgrade') })
afterAll(async () => { await database?.dispose() })

it('supports fresh install and backfills existing diary rows when the migration upgrades the schema', async () => {
  const freshColumns = await database.pool.query<{ column_name: string }>(
    "select column_name from information_schema.columns where table_schema='public' and table_name='diaries'",
  )
  expect(freshColumns.rows.map(row => row.column_name)).toContain('summary_excerpt')
  expect(freshColumns.rows.map(row => row.column_name)).toContain('summary_excerpt_content_hash')

  const [user] = await database.db.insert(users).values({ email: 'excerpt-upgrade@example.test', password: 'synthetic' }).returning({ id: users.id })
  await database.pool.query('drop trigger diaries_summary_excerpt_invalidate on diaries')
  await database.pool.query('drop function invalidate_stale_diary_summary_excerpt()')
  await database.pool.query('alter table diaries drop column summary_excerpt, drop column summary_excerpt_content_hash')
  await database.pool.query(`delete from drizzle.__drizzle_migrations where hash = (
    select hash from drizzle.__drizzle_migrations order by created_at desc limit 1
  )`)

  const content = '## Existing decision\n\n- [Open report](https://example.test/report)\n\n🚀 The original Markdown stays authoritative.'
  await database.pool.query(`
    insert into diaries(user_id,title,content,date)
    select $1,'Existing row ' || n,case when n=1 then $2 else 'Existing content ' || n end,date '2026-09-01' + n
    from generate_series(1,251) n`,
    [user!.id.toString(), content],
  )

  await migrateDatabase(database.db, { diaryExcerpt })
  const upgraded = await database.pool.query<{ content: string; summary_excerpt: string | null; summary_excerpt_content_hash: string | null; content_hash: string }>(
    'select content,summary_excerpt,summary_excerpt_content_hash,md5(content) as content_hash from diaries where user_id=$1 order by date',
    [user!.id.toString()],
  )
  expect(upgraded.rows).toHaveLength(251)
  for (const row of upgraded.rows) {
    expect(row.summary_excerpt).toBe(diaryExcerpt(row.content, 240))
    expect(row.summary_excerpt_content_hash).toBe(row.content_hash)
  }
})
