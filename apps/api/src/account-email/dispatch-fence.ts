import type { Pool } from 'pg'

export type MailDispatchPool = Pick<Pool, 'connect'>

const LOCK_NAME = 'diary-mail-dispatch-fence'

/** Serialize SMTP dispatch with configuration changes without holding a SQL transaction over network I/O. */
export async function withMailDispatchFence<T>(
  pool: MailDispatchPool | undefined,
  mode: 'shared' | 'exclusive',
  operation: () => Promise<T>,
): Promise<T> {
  if (!pool) return operation()

  const client = await pool.connect()
  let acquired = false
  let discard = false
  try {
    const lock = mode === 'shared' ? 'pg_advisory_lock_shared' : 'pg_advisory_lock'
    await client.query(`select ${lock}(hashtextextended($1, 0::bigint))`, [LOCK_NAME])
    acquired = true
    return await operation()
  } finally {
    if (acquired) {
      try {
        const unlock = mode === 'shared' ? 'pg_advisory_unlock_shared' : 'pg_advisory_unlock'
        await client.query(`select ${unlock}(hashtextextended($1, 0::bigint))`, [LOCK_NAME])
      } catch {
        discard = true
      }
    }
    client.release(discard)
  }
}
