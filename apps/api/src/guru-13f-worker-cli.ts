import { createDatabase } from '@diary/db'
import { createSecEdgarService } from './sec-edgar/service.js'
import { createPostgresSecSharedScheduler } from './sec-edgar/postgres-scheduler.js'
import { runGuruFilingDiscoveryOnce, runGuruFilingDiscoveryWorker } from './institutional/discovery-worker.js'

const databaseUrl = process.env.DATABASE_URL?.trim()
const userAgent = process.env.SEC_USER_AGENT?.trim()
if (!databaseUrl) throw new Error('DATABASE_URL is required')
if (!userAgent || !userAgent.includes('@')) throw new Error('SEC_USER_AGENT must include application name and contact email')

const pollMs = Number(process.env.GURU_SEC_DISCOVERY_POLL_MS ?? 5_000)
if (!Number.isInteger(pollMs) || pollMs < 250 || pollMs > 60_000) throw new Error('GURU_SEC_DISCOVERY_POLL_MS must be an integer between 250 and 60000')
const intervalHours = Number(process.env.GURU_SEC_DISCOVERY_INTERVAL_HOURS ?? 24)
if (!Number.isInteger(intervalHours) || intervalHours < 1 || intervalHours > 168) throw new Error('GURU_SEC_DISCOVERY_INTERVAL_HOURS must be an integer between 1 and 168')

const database = createDatabase(databaseUrl)
const workerId = process.env.GURU_SEC_DISCOVERY_WORKER_ID?.trim() || `guru-sec-discovery-${process.pid}`
const sec = createSecEdgarService(userAgent, undefined, createPostgresSecSharedScheduler(database.db))
const abortController = new AbortController()
process.once('SIGINT', () => abortController.abort())
process.once('SIGTERM', () => abortController.abort())

try {
  const options = { db: database.db, sec, workerId, pollMs, intervalMs: intervalHours * 60 * 60_000, signal: abortController.signal }
  if (process.argv.includes('--once')) {
    const result = await runGuruFilingDiscoveryOnce(options)
    console.log(JSON.stringify({ operation: 'guru_13f_discovery_once', workerId, status: result.status, managerId: 'managerId' in result ? result.managerId.toString() : undefined, periodEnd: 'periodEnd' in result ? result.periodEnd : undefined, snapshotId: 'snapshotId' in result ? result.snapshotId.toString() : undefined, changed: 'changed' in result ? result.changed : undefined, jobId: 'jobId' in result ? result.jobId.toString() : undefined, discovered: 'discovered' in result ? result.discovered : undefined, processed: 'processed' in result ? result.processed : undefined, completed: 'completed' in result ? result.completed : undefined, errorCode: 'errorCode' in result ? result.errorCode : undefined }))
  } else {
    console.log(JSON.stringify({ operation: 'guru_13f_discovery_started', workerId, pollMs, intervalHours }))
    await runGuruFilingDiscoveryWorker(options)
  }
} catch {
  console.error(JSON.stringify({ operation: 'guru_13f_discovery_worker', status: 'failed', errorCode: 'SEC_13F_WORKER_RUNTIME' }))
  process.exitCode = 1
} finally {
  await database.pool.end()
}
