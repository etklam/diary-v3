import { createDatabase } from '@diary/db'
import { runArticleTranslationOnce, runArticleTranslationWorker } from './article-translations/worker.js'

const databaseUrl = process.env.DATABASE_URL?.trim()
if (!databaseUrl) throw new Error('DATABASE_URL is required')

const pollMs = Number(process.env.ARTICLE_TRANSLATION_WORKER_POLL_MS ?? 1_000)
if (!Number.isInteger(pollMs) || pollMs < 250 || pollMs > 60_000) throw new Error('ARTICLE_TRANSLATION_WORKER_POLL_MS must be an integer between 250 and 60000')

const database = createDatabase(databaseUrl)
const workerId = process.env.ARTICLE_TRANSLATION_WORKER_ID?.trim() || `article-translation-worker-${process.pid}`
const abortController = new AbortController()
process.once('SIGINT', () => abortController.abort())
process.once('SIGTERM', () => abortController.abort())

try {
  const options = { db: database.db, workerId, signal: abortController.signal }
  if (process.argv.includes('--once')) {
    const result = await runArticleTranslationOnce(options)
    console.log(JSON.stringify({ operation: 'article_translation_worker_once', workerId, status: result.status, jobId: 'jobId' in result ? result.jobId.toString() : undefined, errorCode: 'errorCode' in result ? result.errorCode : undefined }))
  } else {
    console.log(JSON.stringify({ operation: 'article_translation_worker_started', workerId, pollMs }))
    await runArticleTranslationWorker({ ...options, pollMs })
  }
} catch {
  console.error(JSON.stringify({ operation: 'article_translation_worker', status: 'failed', errorCode: 'ARTICLE_TRANSLATION_WORKER_RUNTIME' }))
  process.exitCode = 1
} finally {
  await database.pool.end()
}
