import { createDatabase, migrateDatabase } from './index.js'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is required')

const database = createDatabase(url)
try {
  await migrateDatabase(database.db)
} finally {
  await database.pool.end()
}
