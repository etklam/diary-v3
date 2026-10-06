import { sql } from 'drizzle-orm'
import type { Database } from '@diary/db'
import { withAbort } from './abort.js'

export interface SecSharedScheduler {
  start<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<{ response: Promise<T> }>
  recordResult(success: boolean): Promise<void>
}

export function createPostgresSecSharedScheduler(db: Database, minIntervalMs = 125): SecSharedScheduler {
  if (!Number.isInteger(minIntervalMs) || minIntervalMs < 100 || minIntervalMs > 10_000) throw new Error('SEC_SCHEDULER_INTERVAL_INVALID')

  return {
    async start<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<{ response: Promise<T> }> {
      let response!: Promise<T>
      await db.transaction(async tx => {
        await tx.execute(sql`insert into sec_request_scheduler_state (singleton, next_allowed_at) values (1, clock_timestamp()) on conflict (singleton) do nothing`)
        const result = await tx.execute<{ scheduled_at: Date | string }>(sql`
          select greatest(next_allowed_at, clock_timestamp()) as scheduled_at
          from sec_request_scheduler_state
          where singleton = 1
          for update
        `)
        const scheduledAt = result.rows[0]?.scheduled_at
        if (!scheduledAt) throw new Error('SEC_SCHEDULER_SLOT_MISSING')
        const scheduledAtMs = scheduledAt instanceof Date ? scheduledAt.getTime() : Date.parse(scheduledAt)
        if (!Number.isFinite(scheduledAtMs)) throw new Error('SEC_SCHEDULER_SLOT_INVALID')
        const waitMs = scheduledAtMs - Date.now()
        if (waitMs > 0) await withAbort(new Promise<void>(resolve => setTimeout(resolve, waitMs)), signal)
        // Hold the database row lock until fetch starts so API and worker processes share one start boundary.
        response = operation()
        await tx.execute(sql`
          update sec_request_scheduler_state
          set next_allowed_at = clock_timestamp() + (${minIntervalMs} * interval '1 millisecond'),
              request_count = request_count + 1,
              last_request_at = clock_timestamp(),
              updated_at = clock_timestamp()
          where singleton = 1
        `)
      })
      return { response }
    },
    async recordResult(success) {
      if (success) return
      await db.execute(sql`update sec_request_scheduler_state set failure_count = failure_count + 1, updated_at = clock_timestamp() where singleton = 1`)
    },
  }
}
