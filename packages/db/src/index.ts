import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import * as schema from './schema.js'

export { schema }
export * from './schema.js'

export type Database = NodePgDatabase<typeof schema>

export function createDatabase(url: string) {
  const pool = new Pool({ connectionString: url })
  return { db: drizzle(pool, { schema }), pool }
}

export async function migrateDatabase(
  db: Database,
  options: { migrationsFolder?: string } = {},
) {
  await migrate(db, { migrationsFolder: options.migrationsFolder ?? 'packages/db/migrations' })
}
