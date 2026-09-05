import type { Database } from '@diary/db'
import type { Pool } from 'pg'
import { MARKET_STATE_SYMBOLS, MARKET_STATE_UNIVERSE_KEY } from './market-state-universe.js'
import { upsertMarketUniverseItem } from './market-state-persistence.js'

type QuoteRead = { source: 'upstream' | 'cache' | 'stale'; data: unknown }
type MarketQuoteProvider = { quote: (symbol: string, bypass?: boolean) => Promise<QuoteRead> }

export interface MarketStateSeedResult {
  universeKey: string
  symbolCount: number
  successCount: number
  failedCount: number
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {}
}

export async function runMarketStateSeed(
  dependencies: { db: Database; pool?: Pick<Pool, 'connect'>; market: MarketQuoteProvider },
): Promise<MarketStateSeedResult> {
  const lock = dependencies.pool ? await dependencies.pool.connect() : null
  const lockKey = `diary:market-state:${MARKET_STATE_UNIVERSE_KEY}`
  let acquired = false
  if (lock) {
    acquired = (await lock.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired', [lockKey])).rows[0]?.acquired === true
    if (!acquired) {
      lock.release()
      throw new Error('This market state universe is already updating')
    }
  }
  let successCount = 0
  let failedCount = 0
  try {
    for (const symbol of MARKET_STATE_SYMBOLS) {
      let raw: Record<string, unknown>
      try {
        const read = await dependencies.market.quote(symbol, true)
        if (read.source === 'stale') throw new Error('Stale quote')
        raw = record(read.data)
      } catch {
        failedCount += 1
        continue
      }
      // The normalized market quote intentionally exposes no provider metadata;
      // the configured basket remains explicit and gets safe fallback labels.
      await upsertMarketUniverseItem(dependencies.db, {
        symbol,
        name: typeof raw.longName === 'string' && raw.longName.trim() ? raw.longName.trim()
          : typeof raw.shortName === 'string' && raw.shortName.trim() ? raw.shortName.trim() : symbol,
        exchange: typeof raw.fullExchangeName === 'string' && raw.fullExchangeName.trim() ? raw.fullExchangeName.trim()
          : typeof raw.exchange === 'string' && raw.exchange.trim() ? raw.exchange.trim() : 'UNKNOWN',
      })
      successCount += 1
    }
  } finally {
    if (lock) {
      let discard = false
      try {
        if (acquired) await lock.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [lockKey])
      } catch { discard = true } finally { lock.release(discard) }
    }
  }
  return { universeKey: MARKET_STATE_UNIVERSE_KEY, symbolCount: MARKET_STATE_SYMBOLS.length, successCount, failedCount }
}
