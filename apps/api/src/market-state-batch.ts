import { and, asc, eq, gte, inArray } from 'drizzle-orm'
import type { Pool } from 'pg'
import { marketBreadthDaily, marketDailyPrices, marketUniverse, type Database } from '@diary/db'
import { calculateBreadthRows, type PricePoint } from '@diary/domain/market-state/update-breadth-utils'
import { persistRotationPrices } from './rotation-prices.js'
import type { createMarketData } from './market-data/index.js'
import { MARKET_STATE_UNIVERSE_KEY } from './market-state-universe.js'
import { upsertMarketBreadthRows } from './market-state-persistence.js'

export class MarketStateBatchBusy extends Error {
  constructor() { super('This market state universe is already updating') }
}

type MarketData = Pick<ReturnType<typeof createMarketData>, 'dailyPrices'>

export interface MarketStateBatchResult {
  universeKey: string
  status: 'success' | 'partial' | 'empty'
  backfill: boolean
  symbolCount: number
  successfulSymbolCount: number
  failedSymbolCount: number
  fetchedPriceCount: number
  breadthDateCount: number
  upsertedCount: number
}

function dateFromKey(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`)
}

function subtractDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() - days)
  return result
}

export async function runMarketStateBatch(
  dependencies: { db: Database; pool: Pick<Pool, 'connect'>; market: MarketData; now?: () => Date },
  options: { backfill?: boolean } = {},
): Promise<MarketStateBatchResult> {
  const backfill = options.backfill === true
  const targetDays = backfill ? 260 : 10
  const range = backfill ? '1y' : '1mo'
  const lock = await dependencies.pool.connect()
  const lockKey = `diary:market-state:${MARKET_STATE_UNIVERSE_KEY}`
  let acquired = false
  try {
    acquired = (await lock.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired', [lockKey])).rows[0]?.acquired === true
    if (!acquired) throw new MarketStateBatchBusy()

    const universe = await dependencies.db.select({ symbol: marketUniverse.symbol })
      .from(marketUniverse)
      .where(and(eq(marketUniverse.isActive, true), eq(marketUniverse.assetType, 'stock')))
      .orderBy(asc(marketUniverse.symbol))
    const symbols = universe.map(row => row.symbol)
    if (symbols.length === 0) {
      return { universeKey: MARKET_STATE_UNIVERSE_KEY, status: 'empty', backfill, symbolCount: 0, successfulSymbolCount: 0, failedSymbolCount: 0, fetchedPriceCount: 0, breadthDateCount: 0, upsertedCount: 0 }
    }

    const fetchedDateKeys = new Set<string>()
    let successfulSymbolCount = 0
    let failedSymbolCount = 0
    let fetchedPriceCount = 0
    for (const symbol of symbols) {
      let read: Awaited<ReturnType<MarketData['dailyPrices']>>
      try {
        read = await dependencies.market.dailyPrices(symbol, range)
      } catch {
        failedSymbolCount += 1
        continue
      }
      if (read.source === 'stale') {
        failedSymbolCount += 1
        continue
      }
      // Persistence failures must escape the provider-failure handling above;
      // a database error cannot be reported as a successful partial update.
      await persistRotationPrices(dependencies.db, read.data)
      successfulSymbolCount += 1
      fetchedPriceCount += read.data.length
      for (const row of read.data) fetchedDateKeys.add(row.date)
    }

    const datesToCalculate = [...fetchedDateKeys].sort().slice(-targetDays).map(dateFromKey)
    if (datesToCalculate.length === 0) {
      return { universeKey: MARKET_STATE_UNIVERSE_KEY, status: failedSymbolCount ? 'partial' : 'success', backfill, symbolCount: symbols.length, successfulSymbolCount, failedSymbolCount, fetchedPriceCount, breadthDateCount: 0, upsertedCount: 0 }
    }
    const historyStart = subtractDays(datesToCalculate[0]!, 90)
    const [priceRows, breadthRows] = await Promise.all([
      dependencies.db.select({ symbol: marketDailyPrices.symbol, date: marketDailyPrices.date, adjustedClose: marketDailyPrices.adjustedClose })
        .from(marketDailyPrices)
        .where(and(inArray(marketDailyPrices.symbol, symbols), gte(marketDailyPrices.date, historyStart.toISOString().slice(0, 10))))
        .orderBy(asc(marketDailyPrices.symbol), asc(marketDailyPrices.date)),
      dependencies.db.select({ date: marketBreadthDaily.date, up4Count: marketBreadthDaily.up4Count, down4Count: marketBreadthDaily.down4Count })
        .from(marketBreadthDaily)
        .where(and(eq(marketBreadthDaily.universeKey, MARKET_STATE_UNIVERSE_KEY), gte(marketBreadthDaily.date, historyStart.toISOString().slice(0, 10))))
        .orderBy(asc(marketBreadthDaily.date)),
    ])
    const prices: PricePoint[] = priceRows.map(row => ({ symbol: row.symbol, date: dateFromKey(row.date), adjustedClose: Number(row.adjustedClose) }))
    const existingHistory = breadthRows.flatMap(row => row.up4Count === null || row.down4Count === null ? [] : [{ date: dateFromKey(row.date), up4Count: row.up4Count, down4Count: row.down4Count }])
    const rows = calculateBreadthRows(prices, symbols, datesToCalculate, existingHistory)
    const upsertedCount = await upsertMarketBreadthRows(dependencies.db, MARKET_STATE_UNIVERSE_KEY, rows)
    return { universeKey: MARKET_STATE_UNIVERSE_KEY, status: failedSymbolCount ? 'partial' : 'success', backfill, symbolCount: symbols.length, successfulSymbolCount, failedSymbolCount, fetchedPriceCount, breadthDateCount: rows.length, upsertedCount }
  } finally {
    let discard = false
    try {
      if (acquired) await lock.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [lockKey])
    } catch { discard = true } finally { lock.release(discard) }
  }
}
