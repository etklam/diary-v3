import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createDatabase, migrateDatabase } from '@diary/db';

/** A fresh local database per suite; never reset or truncate an existing database. */
export async function provisionTestDatabase(prefix = 'diary_v3_test') {
  if (!/^[a-z][a-z0-9_]{0,25}$/.test(prefix)) throw new Error('Invalid test database prefix');
  const name = `${prefix}_${randomUUID().replaceAll('-', '')}`;
  const url = new URL(process.env.DATABASE_URL ?? 'postgresql://diary:diary_local@127.0.0.1:55433/diary_v3');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('Tests require a local disposable PostgreSQL server');
  const admin = new pg.Pool({ connectionString: url.toString() });
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
  } catch (error) {
    await admin.end();
    throw error;
  }
  url.pathname = `/${name}`;
  const database = createDatabase(url.toString());
  let disposed = false;
  async function dispose() {
    if (disposed) return;
    disposed = true;
    await database.pool.end();
    try {
      // pg pool.end can resolve just before PostgreSQL closes the backend sockets.
      // Wait for normal disconnects; FORCE would send a fatal error to those clients.
      const deadline = Date.now() + 5000;
      while (true) {
        const active = await admin.query('SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = $1', [name]);
        if (active.rows[0].count === 0) break;
        if (Date.now() >= deadline) throw new Error('Test database connections did not close; database retained for diagnosis');
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
    } finally { await admin.end(); }
  }
  try { await migrateDatabase(database.db); }
  catch (error) { await dispose(); throw error; }
  return { ...database, url: url.toString(), dispose };
}
