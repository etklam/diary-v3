import { afterAll, beforeAll, expect, it } from 'vitest'
import { migrateDatabase, users } from '@diary/db'
import { diaryExcerpt } from '@diary/domain'
import { provisionTestDatabase } from '../support/database'
import { historicalMigrations } from '../support/historical-migrations'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
const historical = historicalMigrations('0021_steady_banshee')
beforeAll(async () => { database = await provisionTestDatabase('diary_excerpt_upgrade', historical.folder) })
afterAll(async () => { await database?.dispose(); historical.dispose() })

it('upgrades the historical pre-excerpt schema and backfills all existing diary rows', async () => {
  const [user] = await database.db.insert(users).values({ email: 'excerpt-upgrade@example.test', password: 'synthetic' }).returning({ id: users.id })
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
