import { createDatabase } from '@diary/db'
import { createMarketData } from './market-data/index.js'
import { createYahooUpstream } from './market-data/yahoo.js'
import { createFixtureUpstream } from './market-data/fixture.js'
import { runMarketStateBatch } from './market-state-batch.js'
import { runMarketStateSeed } from './market-state-seed.js'
import { randomUUID } from 'node:crypto'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is required')

const database = createDatabase(url)
const market = createMarketData({ upstream: process.env.MARKET_PROVIDER === 'fixture' ? createFixtureUpstream() : createYahooUpstream() })
const args = new Set(process.argv.slice(2))
const jobId = randomUUID()

try {
  const result = args.has('--seed')
    ? await runMarketStateSeed({ db: database.db, pool: database.pool, market })
    : await runMarketStateBatch({ db: database.db, pool: database.pool, market }, { backfill: args.has('--backfill') })
  console.log(JSON.stringify({ operation: args.has('--seed') ? 'market_state_seed' : 'market_state_batch', jobId, ...result }))
  process.exitCode = 0
} catch (error) {
  console.error(JSON.stringify({ success: false, operation: 'market_state', jobId, errorMessage: error instanceof Error ? error.message : 'Market state update failed' }))
  process.exitCode = 1
} finally {
  await database.pool.end()
}
