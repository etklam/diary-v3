import { createDatabase } from '@diary/db'
import { runAccountEmailWorker, runAccountEmailWorkerOnce } from './account-email/worker.js'

const databaseUrl = process.env.DATABASE_URL?.trim()
if (!databaseUrl) throw new Error('DATABASE_URL is required')

const pollMs = Number(process.env.MAIL_WORKER_POLL_MS ?? 1_000)
if (!Number.isInteger(pollMs) || pollMs < 250 || pollMs > 60_000) throw new Error('MAIL_WORKER_POLL_MS must be an integer between 250 and 60000')

const database = createDatabase(databaseUrl)
const workerId = process.env.MAIL_WORKER_ID?.trim() || `mail-worker-${process.pid}`
const abortController = new AbortController()
process.once('SIGINT', () => abortController.abort())
process.once('SIGTERM', () => abortController.abort())

try {
  if (process.argv.includes('--once')) {
    const result = await runAccountEmailWorkerOnce({ db: database.db, pool: database.pool, workerId })
    console.log(JSON.stringify({ operation: 'mail_worker_once', workerId, status: result.status }))
  } else {
    console.log(JSON.stringify({ operation: 'mail_worker_started', workerId, pollMs }))
    await runAccountEmailWorker({ db: database.db, pool: database.pool, workerId, pollMs, signal: abortController.signal })
  }
} catch {
  console.error(JSON.stringify({ operation: 'mail_worker', status: 'failed', errorCode: 'MAIL_WORKER_RUNTIME' }))
  process.exitCode = 1
} finally {
  await database.pool.end()
}
