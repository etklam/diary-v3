import { createDatabase } from '@diary/db'
import { createLatestCompletedUsEquitySessionResolver, createVerifiedUsEquityCalendarProvider } from './research-studio/sources.js'
import { createResearchStudioService, runResearchWorkerOnce } from './research-studio/service.js'
import { createOpenRouterResearchTransport } from './research-studio/transport.js'
import { runResearchWorker } from './research-studio/worker.js'

const databaseUrl = process.env.DATABASE_URL?.trim()
if (!databaseUrl) throw new Error('DATABASE_URL is required')

const pollMs = Number(process.env.RESEARCH_WORKER_POLL_MS ?? 1_000)
if (!Number.isInteger(pollMs) || pollMs < 250 || pollMs > 60_000) throw new Error('RESEARCH_WORKER_POLL_MS must be an integer between 250 and 60000')

const database = createDatabase(databaseUrl)
const workerId = process.env.RESEARCH_WORKER_ID?.trim() || `research-worker-${process.pid}`
const calendar = createVerifiedUsEquityCalendarProvider()
const service = createResearchStudioService({
  db: database.db,
  transport: createOpenRouterResearchTransport(),
  latestCompletedSession: createLatestCompletedUsEquitySessionResolver(calendar),
  workerId,
})
const abortController = new AbortController()
process.once('SIGINT', () => abortController.abort())
process.once('SIGTERM', () => abortController.abort())

try {
  if (process.argv.includes('--once')) {
    const result = await runResearchWorkerOnce(service)
    console.log(JSON.stringify({ operation: 'research_worker_once', workerId, processed: result !== null, executionStatus: result?.executionStatus ?? null }))
  } else {
    console.log(JSON.stringify({ operation: 'research_worker_started', workerId, pollMs }))
    await runResearchWorker(service, { pollMs, signal: abortController.signal })
  }
} catch {
  console.error(JSON.stringify({ operation: 'research_worker', status: 'failed', errorCode: 'RESEARCH_WORKER_RUNTIME' }))
  process.exitCode = 1
} finally {
  await database.pool.end()
}
