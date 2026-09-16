import { createDatabase, migrateDatabase } from './index.js'
import { diaryExcerpt } from '@diary/domain'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is required')

const database = createDatabase(url)
try {
  await migrateDatabase(database.db, { migrationsFolder: process.env.MIGRATIONS_FOLDER ?? 'packages/db/migrations', diaryExcerpt })
  console.log(JSON.stringify({ operation: 'database_migrate', status: 'ok' }))
} finally {
  await database.pool.end()
}
