import { createDatabase } from '@diary/db'
import type { ApiConfig } from './app-context.js'
import { createApiRuntime } from './runtime.js'
import { createMarketData } from './market-data/index.js'
import { createFixtureUpstream } from './market-data/fixture.js'
import { createYahooUpstream } from './market-data/yahoo.js'
import { createRateLimitRuntime, parseRateLimitConfig } from './rate-limit/index.js'

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

const nodeEnv = process.env.NODE_ENV ?? 'development'
if (!['development', 'test', 'production'].includes(nodeEnv)) throw new Error('NODE_ENV is invalid')

const rateLimitConfig = parseRateLimitConfig(process.env)
const database = createDatabase(required('DATABASE_URL'))
const config: ApiConfig = {
  jwtSecret: required('JWT_SECRET'),
  nodeEnv: nodeEnv as ApiConfig['nodeEnv'],
  trustProxy: process.env.TRUST_X_FORWARDED_FOR === 'true',
  webOrigin: process.env.WEB_ORIGIN ?? 'http://127.0.0.1:3100',
  secUserAgent: process.env.SEC_USER_AGENT,
}
const marketData = process.env.MARKET_PROVIDER === 'fixture'
  ? createMarketData({ upstream: createFixtureUpstream() })
  : createMarketData({ upstream: createYahooUpstream() })
const rateLimiter = await createRateLimitRuntime(rateLimitConfig, { logger: console })
const runtime = createApiRuntime({ db: database.db, databasePool: database.pool, config, marketData, rateLimiter })
const port = Number(process.env.API_PORT ?? 3101)
const hostname = process.env.API_HOST ?? (nodeEnv === 'production' ? '0.0.0.0' : '127.0.0.1')

runtime.server.listen(port, hostname, () => {
  console.log(JSON.stringify({ operation: 'api_started', hostname, port, scheduler: true }))
  runtime.pusher.start()
  runtime.priceChecker.start()
})

/**
 * A rejection here would otherwise be unhandled, and Node's default for that
 * is to terminate — turning an orderly shutdown into a crash. A lingering
 * handle would also keep the process alive until the orchestrator sends
 * SIGKILL, so the exit is explicit either way.
 */
let shuttingDown = false
async function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  let status: 'ok' | 'failed' = 'ok'
  try {
    await runtime.close()
    await database.pool.end()
  } catch (error) {
    status = 'failed'
    console.error(JSON.stringify({
      operation: 'api_shutdown',
      status,
      signal,
      errorName: error instanceof Error ? error.name : 'Error',
    }))
  }
  if (status === 'ok') console.log(JSON.stringify({ operation: 'api_shutdown', status, signal }))
  process.exit(status === 'ok' ? 0 : 1)
}

process.once('SIGINT', () => { void shutdown('SIGINT') })
process.once('SIGTERM', () => { void shutdown('SIGTERM') })

// Background timers and socket handlers run outside any request, so a fault
// there reaches no route-level boundary and Node's default terminates the
// process with an unstructured stack. These handlers keep that outcome — an
// unknown-state process should be restarted, not kept serving — and add the
// structured line the log pipeline can actually find.
function fatal(operation: string, reason: unknown): never {
  console.error(JSON.stringify({
    operation,
    errorName: reason instanceof Error ? reason.name : typeof reason,
    message: reason instanceof Error ? reason.message : undefined,
  }))
  if (reason instanceof Error && reason.stack) console.error(reason.stack)
  process.exit(1)
}
process.on('unhandledRejection', (reason) => fatal('api_unhandled_rejection', reason))
process.on('uncaughtException', (error) => fatal('api_uncaught_exception', error))
