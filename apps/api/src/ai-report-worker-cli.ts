import { createDatabase } from '@diary/db'
import { runAiReportOnce, runAiWorker, safeAiErrorCode } from './ai-reports/worker.js'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required')

const database = createDatabase(databaseUrl)
const workerId = process.env.AI_WORKER_ID ?? `ai-worker-${process.pid}`
const intervalMs = Number(process.env.AI_WORKER_INTERVAL_MS ?? 1_000)
const abortController = new AbortController()
const stop = () => abortController.abort()
process.once('SIGINT', stop)
process.once('SIGTERM', stop)

try {
  if (process.argv.includes('--once')) {
    const result = await runAiReportOnce({ db: database.db, workerId })
    console.log(JSON.stringify({ operation: 'ai_report_worker_once', workerId, status: result.status, reportId: 'reportId' in result ? result.reportId.toString() : undefined, errorCode: 'errorCode' in result ? result.errorCode : undefined }))
  } else {
    console.log(JSON.stringify({ operation: 'ai_report_worker_started', workerId, intervalMs }))
    await runAiWorker({ db: database.db, workerId, intervalMs, signal: abortController.signal })
  }
} catch (error) {
  console.error(JSON.stringify({ operation: 'ai_report_worker', status: 'failed', errorCode: safeAiErrorCode(error) }))
  process.exitCode = 1
} finally {
  await database.pool.end()
}
