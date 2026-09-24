import { afterAll, beforeAll, expect, it } from 'vitest'
import { migrateDatabase, users } from '@diary/db'
import { diaryExcerpt } from '@diary/domain'
import { provisionTestDatabase } from '../support/database'
import { historicalMigrations } from '../support/historical-migrations'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
const historical = historicalMigrations('0024_unusual_reptil')

beforeAll(async () => { database = await provisionTestDatabase('post_access_migration', historical.folder) })
afterAll(async () => { await database?.dispose(); historical.dispose() })

it('preserves article identity and classifies only demonstrably published rows as PUBLIC', async () => {
  const [user] = await database.db.insert(users).values({ email: 'post-migration@example.test', password: 'synthetic' }).returning({ id: users.id })
  await database.pool.query(`
    insert into posts(author_id,title,slug,content,excerpt,category,status,published_at)
    values
      ($1,'Published article','published-article','PUBLIC_BODY','Public excerpt','market','PUBLISHED','2026-09-01T00:00:00Z'),
      ($1,'Draft article','draft-article','DRAFT_BODY',null,'market','DRAFT',null),
      ($1,'Archived article','archived-article','ARCHIVED_BODY',null,'market','ARCHIVED','2026-09-02T00:00:00Z'),
      ($1,'Published without timestamp','published-without-timestamp','AMBIGUOUS_BODY',null,'market','PUBLISHED',null)`,
    [user!.id.toString()],
  )

  const before = await database.pool.query<{ id: string; slug: string; content: string; status: string }>('select id::text,slug,content,status from posts order by id')
  await migrateDatabase(database.db, { diaryExcerpt })
  const rows = await database.pool.query<{
    id: string
    title: string
    slug: string
    content: string
    status: string
    published_at: string | null
    access: string
    excerpt_authored: boolean
  }>('select id::text,title,slug,content,status,published_at,access,excerpt_authored from posts order by slug')

  expect(rows.rows).toEqual([
    expect.objectContaining({ title: 'Archived article', slug: 'archived-article', content: 'ARCHIVED_BODY', status: 'ARCHIVED', access: 'MEMBER', excerpt_authored: false }),
    expect.objectContaining({ title: 'Draft article', slug: 'draft-article', content: 'DRAFT_BODY', status: 'DRAFT', access: 'MEMBER', excerpt_authored: false }),
    expect.objectContaining({ title: 'Published article', slug: 'published-article', content: 'PUBLIC_BODY', status: 'PUBLISHED', access: 'PUBLIC', excerpt_authored: false }),
    expect.objectContaining({ title: 'Published without timestamp', slug: 'published-without-timestamp', content: 'AMBIGUOUS_BODY', status: 'PUBLISHED', access: 'MEMBER', excerpt_authored: false }),
  ])
  const after = rows.rows.map(row => ({ id: row.id, slug: row.slug, content: row.content, status: row.status })).sort((left, right) => left.id.localeCompare(right.id))
  expect(after).toEqual(before.rows)

  const defaults = await database.pool.query<{ status: string; access: string; excerpt_authored: boolean }>(
    `insert into posts(author_id,title,slug,content,category)
     values ($1,'Default access article','default-access-article','DEFAULT_BODY','market')
     returning status,access,excerpt_authored`,
    [user!.id.toString()],
  )
  expect(defaults.rows[0]).toEqual({ status: 'DRAFT', access: 'MEMBER', excerpt_authored: false })

  await expect(database.pool.query(
    `insert into posts(author_id,title,slug,content,category,access)
     values ($1,'Invalid access article','invalid-access-article','INVALID_BODY','market','PREMIUM')`,
    [user!.id.toString()],
  )).rejects.toThrow()
  await expect(database.pool.query(
    `insert into posts(author_id,title,slug,content,category,access)
     values ($1,'Null access article','null-access-article','NULL_BODY','market',null)`,
    [user!.id.toString()],
  )).rejects.toThrow()
})
