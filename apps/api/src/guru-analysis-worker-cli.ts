import { createDatabase } from '@diary/db'
import { runPendingGuruAnalysisInvalidationOnce } from './guru-analysis/service.js'
import { runGuruAnalysisOnce, runGuruAnalysisWorker } from './guru-analysis/worker.js'

const databaseUrl = process.env.DATABASE_URL?.trim()
if (!databaseUrl) throw new Error('DATABASE_URL is required')

const intervalMs = Number(process.env.GURU_ANALYSIS_POLL_MS ?? 2_000)
if (!Number.isInteger(intervalMs) || intervalMs < 250 || intervalMs > 60_000) throw new Error('GURU_ANALYSIS_POLL_MS must be an integer between 250 and 60000')

const database = createDatabase(databaseUrl)
const workerId = process.env.GURU_ANALYSIS_WORKER_ID?.trim() || `guru-analysis-${process.pid}`
const abortController = new AbortController()
process.once('SIGINT', () => abortController.abort())
process.once('SIGTERM', () => abortController.abort())

try {
  const options = { db: database.db, workerId, intervalMs, signal: abortController.signal }
  if (process.argv.includes('--once')) {
    // Invalidation runs first so a rebuilt quarter is never generated against stale input.
    const invalidation = await runPendingGuruAnalysisInvalidationOnce(database.db)
    const result = await runGuruAnalysisOnce(options)
    console.log(JSON.stringify({ operation: 'guru_analysis_once', workerId, status: result.status, runId: 'runId' in result ? result.runId.toString() : undefined, errorCode: 'errorCode' in result ? result.errorCode : undefined, invalidation: invalidation?.status }))
  } else {
    console.log(JSON.stringify({ operation: 'guru_analysis_started', workerId, intervalMs }))
    void (async () => {
      while (!abortController.signal.aborted) {
        try { while (await runPendingGuruAnalysisInvalidationOnce(database.db)) { /* drain the outbox */ } }
        catch { console.error(JSON.stringify({ operation: 'guru_analysis_invalidation', status: 'failed' })) }
        await new Promise<void>(resolve => setTimeout(resolve, intervalMs))
      }
    })()
    await runGuruAnalysisWorker(options)
  }
} catch {
  console.error(JSON.stringify({ operation: 'guru_analysis_worker', status: 'failed', errorCode: 'GURU_ANALYSIS_WORKER_RUNTIME' }))
  process.exitCode = 1
} finally {
  await database.pool.end()
}
