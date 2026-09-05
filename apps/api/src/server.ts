import { createDatabase } from '@diary/db'
import type { ApiConfig } from './app.js'
import { createApiRuntime } from './runtime.js'
import { createMarketData } from './market-data/index.js'
import { createFixtureUpstream } from './market-data/fixture.js'
import { createYahooUpstream } from './market-data/yahoo.js'

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

const nodeEnv = process.env.NODE_ENV ?? 'development'
if (!['development', 'test', 'production'].includes(nodeEnv)) throw new Error('NODE_ENV is invalid')

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
const runtime = createApiRuntime({ db: database.db, databasePool: database.pool, config, marketData })
const port = Number(process.env.API_PORT ?? 3101)
const hostname = process.env.API_HOST ?? (nodeEnv === 'production' ? '0.0.0.0' : '127.0.0.1')

runtime.server.listen(port, hostname, () => {
  console.log(JSON.stringify({ operation: 'api_started', hostname, port, scheduler: true }))
  runtime.pusher.start()
  runtime.priceChecker.start()
})

async function shutdown() {
  await runtime.close()
  await database.pool.end()
  console.log(JSON.stringify({ operation: 'api_shutdown', status: 'ok' }))
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
