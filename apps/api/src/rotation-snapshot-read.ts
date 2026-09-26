import { marketRotationSnapshots, type Database } from '@diary/db'
import type { MarketRotationMonitorRow } from '@diary/domain/market-rotation/monitor'
import { getUniverseForScope } from '@diary/domain/market-rotation/universe'
import type { RankScope } from '@diary/domain/market-rotation/types'
import type { SnapshotDateCoverage, QualifiedDateWindow } from '@diary/domain/market-rotation/qualified-date'
import type { EnrichedSnapshotInput } from '../../../packages/domain/src/market-rotation/comparison-enrichment.js'
import { and, eq, inArray } from 'drizzle-orm'
import { readRotationWindow } from './rotation-queries.js'

type DbTransaction = Parameters<Parameters<Database['transaction']>[0]>[0]

export interface RotationScopeSnapshot {
  window: QualifiedDateWindow
  rows: MarketRotationMonitorRow[]
}

function decimal(value: string | null): number | null {
  if (value === null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function persistedNumber(value: string | null): number | null {
  return value === null ? null : Number(value)
}

function toMonitorRow(
  row: typeof marketRotationSnapshots.$inferSelect,
  entry: ReturnType<typeof getUniverseForScope>[number],
): MarketRotationMonitorRow {
  return {
    symbol: row.symbol,
    name: entry.name,
    groupType: entry.groupType,
    sectorName: row.sectorName,
    lastPrice: decimal(row.lastPrice),
    rsi14: decimal(row.rsi14),
    above20d: row.above20d,
    above50d: row.above50d,
    maStatus: (row.maStatus ?? 'unknown') as MarketRotationMonitorRow['maStatus'],
    percentFromHigh: decimal(row.percentFromHigh),
    rotationScore: decimal(row.rotationScore),
    rotationScoreDelta2W: decimal(row.rotationScoreDelta2W),
    rotationRank: row.rotationRank,
    rankDelta2W: row.rankDelta2W,
    rsiDelta2W: decimal(row.rsiDelta2W),
    twoWeekPerformancePct: decimal(row.twoWeekPerformancePct),
    twoWeekTrend: [],
    signal: (row.signal ?? null) as MarketRotationMonitorRow['signal'],
    signalStatus: row.signalStatus as MarketRotationMonitorRow['signalStatus'],
  }
}

/** Read the current qualified snapshot rows without loading comparison history. */
export async function readRotationScopeSnapshot(
  db: Database | DbTransaction,
  scope: RankScope,
  asOfDate: string,
  candidate?: SnapshotDateCoverage,
): Promise<RotationScopeSnapshot> {
  const window = await readRotationWindow(db, scope, asOfDate, candidate)
  const date = window.latestDate?.toISOString().slice(0, 10)
  if (!date) return { window, rows: [] }

  const universe = getUniverseForScope(scope)
  const symbols = universe.map(entry => entry.symbol)
  const names = new Map(universe.map(entry => [entry.symbol, entry]))
  const stored = await db.select().from(marketRotationSnapshots).where(and(
    eq(marketRotationSnapshots.rankScope, scope),
    eq(marketRotationSnapshots.date, date),
    inArray(marketRotationSnapshots.symbol, symbols),
  ))
  return {
    window,
    rows: stored.flatMap(row => {
      const entry = names.get(row.symbol)
      return entry ? [toMonitorRow(row, entry)] : []
    }),
  }
}

/** Read the canonical scope's persisted comparison rows for snapshot enrichment. */
export async function readRotationComparisonSnapshots(
  db: Database | DbTransaction,
  scope: RankScope,
  comparisonDate: string,
): Promise<EnrichedSnapshotInput[]> {
  const symbols = getUniverseForScope(scope).map(entry => entry.symbol)
  const stored = await db.select({
    symbol: marketRotationSnapshots.symbol,
    adjustedClose: marketRotationSnapshots.adjustedClose,
    rsi14: marketRotationSnapshots.rsi14,
    rsiPercentile: marketRotationSnapshots.rsiPercentile,
    maScore: marketRotationSnapshots.maScore,
    maScorePercentile: marketRotationSnapshots.maScorePercentile,
    distanceFromHighScore: marketRotationSnapshots.distanceFromHighScore,
    distanceFromHighScorePercentile: marketRotationSnapshots.distanceFromHighScorePercentile,
    rotationScore: marketRotationSnapshots.rotationScore,
    rotationRank: marketRotationSnapshots.rotationRank,
    maStatus: marketRotationSnapshots.maStatus,
    percentFromHigh: marketRotationSnapshots.percentFromHigh,
  }).from(marketRotationSnapshots).where(and(
    eq(marketRotationSnapshots.rankScope, scope),
    eq(marketRotationSnapshots.date, comparisonDate),
    inArray(marketRotationSnapshots.symbol, symbols),
  ))

  return stored.map(row => ({
    symbol: row.symbol,
    rankScope: scope,
    adjustedClose: persistedNumber(row.adjustedClose),
    rsi14: persistedNumber(row.rsi14),
    rsiPercentile: persistedNumber(row.rsiPercentile),
    maScore: row.maScore ?? 0,
    maScorePercentile: persistedNumber(row.maScorePercentile),
    distanceFromHighScore: persistedNumber(row.distanceFromHighScore),
    distanceFromHighScorePercentile: persistedNumber(row.distanceFromHighScorePercentile),
    rotationScore: persistedNumber(row.rotationScore),
    rotationRank: row.rotationRank,
    maStatus: row.maStatus ?? 'unknown',
    percentFromHigh: persistedNumber(row.percentFromHigh),
  }))
}

/** Read persisted prices used to normalize each selected symbol's trend series. */
export async function readRotationTrendPrices(
  db: Database | DbTransaction,
  scope: RankScope,
  qualifiedDates: string[],
  symbols: string[],
): Promise<Map<string, number | null>> {
  if (qualifiedDates.length === 0 || symbols.length === 0) return new Map()

  const stored = await db.select({
    symbol: marketRotationSnapshots.symbol,
    date: marketRotationSnapshots.date,
    adjustedClose: marketRotationSnapshots.adjustedClose,
    lastPrice: marketRotationSnapshots.lastPrice,
  }).from(marketRotationSnapshots).where(and(
    eq(marketRotationSnapshots.rankScope, scope),
    inArray(marketRotationSnapshots.date, qualifiedDates),
    inArray(marketRotationSnapshots.symbol, symbols),
  ))

  return new Map(stored.map(row => {
    const value = row.adjustedClose ?? row.lastPrice
    return [`${row.symbol}:${row.date}`, persistedNumber(value)] as const
  }))
}
