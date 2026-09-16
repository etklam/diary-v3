import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { asc, inArray, isNull, or, sql } from 'drizzle-orm'
import { Pool } from 'pg'
import * as schema from './schema.js'
import { diaries } from './schema.js'

const DIARY_SUMMARY_BACKFILL_BATCH_SIZE = 50

export { schema }
export * from './schema.js'

export type Database = NodePgDatabase<typeof schema>

export function createDatabase(url: string) {
  const pool = new Pool({ connectionString: url })
  return { db: drizzle(pool, { schema }), pool }
}

export async function migrateDatabase(
  db: Database,
  options: { migrationsFolder?: string; diaryExcerpt: (content: string, maxLength?: number) => string },
) {
  await migrate(db, { migrationsFolder: options.migrationsFolder ?? 'packages/db/migrations' })
  await backfillDiarySummaryExcerpts(db, options.diaryExcerpt)
}

async function backfillDiarySummaryExcerpts(
  db: Database,
  diaryExcerpt: (content: string, maxLength?: number) => string,
) {
  // Newer deployments replay the full migration set over restored N backups
  // (restore smoke) where the excerpt columns do not exist yet. Skip the
  // backfill in that case; the later migration adds the columns itself.
  const columns = await db.execute<{ column_name: string }>(
    `select column_name from information_schema.columns
     where table_schema = 'public' and table_name = 'diaries'
       and column_name in ('summary_excerpt', 'summary_excerpt_content_hash')`,
  )
  if (columns.rows.length < 2) return

  for (;;) {
    const updated = await db.transaction(async tx => {
      const rows = await tx.select({ id: diaries.id, content: diaries.content }).from(diaries)
        .where(or(
          isNull(diaries.summaryExcerpt),
          isNull(diaries.summaryExcerptContentHash),
          sql`${diaries.summaryExcerptContentHash} is distinct from md5(${diaries.content})`,
        ))
        .orderBy(asc(diaries.id)).limit(DIARY_SUMMARY_BACKFILL_BATCH_SIZE).for('update')
      if (rows.length === 0) return 0

      const excerptCases = sql.join(rows.map(row => sql`when ${row.id} then ${diaryExcerpt(row.content, 240)}`), sql` `)
      await tx.update(diaries).set({
        summaryExcerpt: sql`case ${diaries.id} ${excerptCases} else ${diaries.summaryExcerpt} end`,
        summaryExcerptContentHash: sql`md5(${diaries.content})`,
      }).where(inArray(diaries.id, rows.map(row => row.id)))
      return rows.length
    })
    if (updated === 0) return
  }
}
