import { randomUUID } from 'node:crypto'
import { createDatabase, etfs, marketUniverse } from '@diary/db'
import { COMMON_ETFS } from '../apps/api/src/etf-seed.js'
import { MARKET_STATE_SYMBOLS } from '../apps/api/src/market-state-universe.js'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is required')

const database = createDatabase(url)
const jobId = randomUUID()
try {
  const now = new Date()
  const result = await database.db.transaction(async tx => {
    const addedEtfs = await tx.insert(etfs).values(COMMON_ETFS.map(row => ({
      ...row,
      createdAt: now,
      updatedAt: now,
    }))).onConflictDoNothing({ target: etfs.symbol }).returning({ id: etfs.id })
    const seededUniverse = await tx.insert(marketUniverse).values(MARKET_STATE_SYMBOLS.map(symbol => ({
      symbol,
      name: symbol,
      exchange: 'CONFIGURED',
      assetType: 'stock',
      isActive: true,
      sector: null,
      updatedAt: now,
    }))).onConflictDoNothing({ target: marketUniverse.symbol }).returning({ id: marketUniverse.id })
    return { addedEtfs: addedEtfs.length, addedUniverse: seededUniverse.length }
  })
  console.log(JSON.stringify({ operation: 'seed_system', jobId, ...result }))
} catch (error) {
  console.error(JSON.stringify({ operation: 'seed_system', jobId, status: 'failed', error: error instanceof Error ? error.message : 'Seed failed' }))
  process.exitCode = 1
} finally {
  await database.pool.end()
}
