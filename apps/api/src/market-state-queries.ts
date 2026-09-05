import { and, desc, eq, lte } from 'drizzle-orm'
import { marketBreadthDaily, type Database } from '@diary/db'
import { toMarketState, type MarketState } from '@diary/domain/market-rotation/state'

export const DEFAULT_MARKET_UNIVERSE_KEY = 'SP500_NDX'

type DecimalLike = number | string | { toNumber?: () => number; valueOf?: () => unknown } | null | undefined

export interface MarketBreadthSnapshot {
  universeKey: string
  date: string
  latestPriceDate: string
  coveragePct: number | null
  isStale: boolean
  marketState: MarketState
  score: number | null
  up4: number | null
  down4: number | null
  up4Pct: number | null
  down4Pct: number | null
  ratio10d: number | null
  above40dPct: number | null
}

export interface MarketBreadthHistoryItem {
  date: string
  up4: number | null
  down4: number | null
  up4Pct: number | null
  down4Pct: number | null
  ratio10d: number | null
  above40dPct: number | null
  marketState: MarketState
  isStale: boolean
  coveragePct: number | null
}

function toNumber(value: DecimalLike): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const number = Number(value)
    return Number.isFinite(number) ? number : null
  }
  if (typeof value.toNumber === 'function') {
    const number = value.toNumber()
    return Number.isFinite(number) ? number : null
  }
  const primitive = value.valueOf?.()
  const number = typeof primitive === 'number' ? primitive : Number(primitive)
  return Number.isFinite(number) ? number : null
}

function toDateString(date: Date | string): string {
  return (date instanceof Date ? date : new Date(date)).toISOString().slice(0, 10)
}

function stateForRow(row: { regime: string | null; isStale: boolean; coveragePct: DecimalLike }): MarketState {
  const coverage = toNumber(row.coveragePct)
  if (row.isStale || coverage === null || coverage < 90) return 'unknown'
  return toMarketState(row.regime)
}

function toSnapshotResult(row: typeof marketBreadthDaily.$inferSelect): MarketBreadthSnapshot {
  const date = toDateString(row.date)
  return {
    universeKey: row.universeKey,
    date,
    latestPriceDate: date,
    coveragePct: toNumber(row.coveragePct),
    isStale: row.isStale,
    marketState: stateForRow(row),
    score: row.score,
    up4: row.up4Count,
    down4: row.down4Count,
    up4Pct: toNumber(row.up4Pct),
    down4Pct: toNumber(row.down4Pct),
    ratio10d: toNumber(row.ratio10d),
    above40dPct: toNumber(row.above40dPct),
  }
}

function toHistoryResult(row: typeof marketBreadthDaily.$inferSelect): MarketBreadthHistoryItem {
  return {
    date: toDateString(row.date),
    up4: row.up4Count,
    down4: row.down4Count,
    up4Pct: toNumber(row.up4Pct),
    down4Pct: toNumber(row.down4Pct),
    ratio10d: toNumber(row.ratio10d),
    above40dPct: toNumber(row.above40dPct),
    marketState: stateForRow(row),
    isStale: row.isStale,
    coveragePct: toNumber(row.coveragePct),
  }
}

export async function getLatestBreadthSnapshot(
  db: Database,
  universeKey = DEFAULT_MARKET_UNIVERSE_KEY,
  asOfDate?: string,
): Promise<MarketBreadthSnapshot | null> {
  const where = asOfDate
    ? and(eq(marketBreadthDaily.universeKey, universeKey), lte(marketBreadthDaily.date, asOfDate))
    : eq(marketBreadthDaily.universeKey, universeKey)
  const [row] = await db.select().from(marketBreadthDaily)
    .where(where)
    .orderBy(desc(marketBreadthDaily.date))
    .limit(1)
  return row ? toSnapshotResult(row) : null
}

export async function getBreadthHistory(
  db: Database,
  days: number,
  universeKey = DEFAULT_MARKET_UNIVERSE_KEY,
  asOfDate?: string,
): Promise<MarketBreadthHistoryItem[]> {
  const where = asOfDate
    ? and(eq(marketBreadthDaily.universeKey, universeKey), lte(marketBreadthDaily.date, asOfDate))
    : eq(marketBreadthDaily.universeKey, universeKey)
  const rows = await db.select().from(marketBreadthDaily)
    .where(where)
    .orderBy(desc(marketBreadthDaily.date))
    .limit(days)
  return rows.map(toHistoryResult)
}

export function getRegimeGuidance(marketState: MarketState): { suggestedExposure: string; message: string } {
  switch (marketState) {
    case 'risk_on': return { suggestedExposure: '80-100%', message: 'Risk-on confirmed. Favor leading ETFs.' }
    case 'neutral': return { suggestedExposure: '40-60%', message: 'Market breadth is mixed. Keep exposure balanced.' }
    case 'defensive': return { suggestedExposure: '20-40%', message: 'Defensive conditions. Reduce laggards and protect capital.' }
    case 'risk_off': return { suggestedExposure: '0-20%', message: 'Capitulation risk elevated. Wait for breadth repair.' }
    default: return { suggestedExposure: '40-60%', message: 'Market state unknown. Use caution.' }
  }
}
