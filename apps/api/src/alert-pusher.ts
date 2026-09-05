import { randomUUID } from 'node:crypto'
import { alerts, diaries, type Database } from '@diary/db'
import { and, asc, eq, gte, lt, sql } from 'drizzle-orm'

export const ALERT_CHECK_INTERVAL = 60_000
export const ALERT_LOOKAHEAD = 65_000
export async function findUpcomingAlerts(db: Database, start: Date, end: Date) {
  return db.select({ id: alerts.id, message: alerts.message, triggerAt: alerts.triggerAt,
    diary: { id: diaries.id, title: diaries.title, userId: diaries.userId },
  }).from(alerts).innerJoin(diaries, eq(diaries.id, alerts.diaryId)).where(and(
    eq(alerts.isDismissed, false), gte(alerts.triggerAt, start), lt(alerts.triggerAt, end),
    sql`(${alerts.parentId} is null or exists(select 1 from alerts parent where parent.id=${alerts.parentId} and parent.diary_id=${alerts.diaryId} and parent.is_dismissed=false))`,
  )).orderBy(asc(alerts.triggerAt), asc(alerts.id))
}
export type AlertHint = { id: string; message: string; triggerAt: string; diary: { id: string; title: string } }
type PusherRow = Awaited<ReturnType<typeof findUpcomingAlerts>>[number]
type Context = { operation: string; jobId: string; alertId?: string; userId?: string }
/** Foreground hints only. Never acknowledge or dismiss a reminder on delivery. */
export function createAlertPusher(dependencies: {
  findUpcoming: (start: Date, end: Date) => Promise<PusherRow[]>
  emitToUser: (userId: string, event: 'alert:triggered', payload: AlertHint) => boolean
  log: (context: Context, result: 'emitted' | 'offline' | 'failed', error?: unknown) => void
  now?: () => Date
}) {
  let timer: ReturnType<typeof setInterval> | undefined
  let running: Promise<void> | undefined
  let stopped = false
  async function push() {
    const jobId = randomUUID(), start = dependencies.now?.() ?? new Date()
    try {
      const rows = await dependencies.findUpcoming(start, new Date(start.getTime() + ALERT_LOOKAHEAD))
      if (stopped) return
      for (const row of rows) {
        const context = { operation: 'alert_push', jobId, alertId: String(row.id), userId: String(row.diary.userId) }
        try {
          const emitted = dependencies.emitToUser(context.userId, 'alert:triggered', {
            id: context.alertId, message: row.message, triggerAt: row.triggerAt.toISOString(),
            diary: { id: String(row.diary.id), title: row.diary.title },
          })
          dependencies.log(context, emitted ? 'emitted' : 'offline')
        } catch (error) { dependencies.log(context, 'failed', error) }
      }
    } catch (error) { dependencies.log({ operation: 'alert_scheduler_tick', jobId }, 'failed', error) }
  }
  function checkAndPushAlerts() {
    // Coalesce ticks while a slow read is running rather than stacking queries.
    if (!running) running = push().finally(() => { running = undefined })
    return running
  }
  function start() {
    if (timer !== undefined) return
    stopped = false
    timer = setInterval(() => { void checkAndPushAlerts() }, ALERT_CHECK_INTERVAL)
    timer.unref?.()
    void checkAndPushAlerts()
  }
  async function stop() {
    stopped = true
    if (timer !== undefined) clearInterval(timer)
    timer = undefined
    await running
  }
  return { start, stop, checkAndPushAlerts }
}
