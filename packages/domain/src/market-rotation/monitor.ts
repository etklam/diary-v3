import type { MarketState } from './state.js'
import type { BreadthCondition, BreadthConfirmation } from './breadth.js'
import type { MaStatus, RotationSignal, SignalStatus } from './signal.js'
import type { RankScope } from './types.js'
import type { BetaAllocationResult } from '../beta-allocation.js'
import { getBreadthCondition, getBreadthConfirmation } from './breadth.js'
import { getUniverseForScope } from './universe.js'
import { roundMetric } from './round.js'

const SCORE_VERSION = 'v1'

export interface MarketRotationMonitorRow {
  symbol: string
  name: string
  groupType:
    | 'sector'
    | 'index'
    | 'core'
    | 'core_etf'
    | 'mega_cap'
    | 'single_stock'
  sectorName: string | null
  lastPrice: number | null
  rsi14: number | null
  above20d: boolean | null
  above50d: boolean | null
  maStatus: MaStatus
  percentFromHigh: number | null
  rotationScore: number | null
  rotationScoreDelta2W: number | null
  rotationRank: number | null
  rankDelta2W: number | null
  rsiDelta2W: number | null
  twoWeekPerformancePct: number | null
  twoWeekTrend: MarketRotationTrendPoint[]
  signal: RotationSignal | null
  signalStatus: SignalStatus
}

export interface MarketRotationTrendPoint {
  date: string
  value: number | null
}

export interface MarketRotationMonitorInput {
  asOfDate: string
  comparisonDate: string | null
  /** Observation date of the configured-universe market-state breadth row. */
  marketStateAsOfDate?: string | null
  /** Observation date used for the sector breadth summary when the active scope is indexes/core. */
  summaryAsOfDate?: string | null
  rankScope: RankScope
  marketState: MarketState
  rows: MarketRotationMonitorRow[]
  summaryRows?: MarketRotationMonitorRow[]
}

export interface RatioMetric {
  count: number
  total: number
  ratio: number | null
}

export interface MarketRotationMonitorSummary {
  marketState: MarketState
  breadthCondition: BreadthCondition
  breadthConfirmation: BreadthConfirmation
  above20d: RatioMetric
  above50d: RatioMetric
  averageRsi: number | null
}

export interface MarketRotationMonitorDataQuality {
  asOfDate: string
  comparisonDate: string | null
  rankScope: RankScope
  rowCount: number
  completeSignalCount: number
  coverageRatio: number
  isQualified: boolean
  expectedSymbolCount: number
  actualSymbolCount: number
  scoreVersion: string
}

export interface MarketRotationMonitorPayload {
  asOfDate: string
  comparisonDate: string | null
  marketStateAsOfDate: string | null
  summaryAsOfDate: string | null
  rankScope: RankScope
  marketState: MarketState
  breadthCondition: BreadthCondition
  breadthConfirmation: BreadthConfirmation
  summary: MarketRotationMonitorSummary
  summaryCards: {
    above20d: RatioMetric
    above50d: RatioMetric
    averageRsi: number | null
    marketState: MarketState
  }
  charts: {
    topImproving: MarketRotationMonitorRow[]
    bottomWeakening: MarketRotationMonitorRow[]
  }
  rows: MarketRotationMonitorRow[]
  topImproving: MarketRotationMonitorRow[]
  bottomWeakening: MarketRotationMonitorRow[]
  dataQuality: MarketRotationMonitorDataQuality
  betaAllocation: BetaAllocationResult
  currentMarketSummary: string
}

/** Payload produced by the shared builder before the endpoint adds its summary text. */
export type MarketRotationMonitorBasePayload = Omit<MarketRotationMonitorPayload, 'currentMarketSummary' | 'betaAllocation'>

function buildRatio(rows: MarketRotationMonitorRow[], field: 'above20d' | 'above50d'): RatioMetric {
  const eligible = rows.filter(row => row[field] != null)
  const count = eligible.filter(row => row[field] === true).length

  return {
    count,
    total: eligible.length,
    ratio: eligible.length > 0 ? roundMetric(count / eligible.length) : null,
  }
}

function calculateAverageRsi(rows: MarketRotationMonitorRow[]): number | null {
  const values = rows
    .map(row => row.rsi14)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))

  if (values.length === 0) return null

  return roundMetric(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function compareLeadershipChange(a: MarketRotationMonitorRow, b: MarketRotationMonitorRow): number {
  return (b.rankDelta2W ?? Number.NEGATIVE_INFINITY) - (a.rankDelta2W ?? Number.NEGATIVE_INFINITY)
    || (b.rotationScoreDelta2W ?? Number.NEGATIVE_INFINITY) - (a.rotationScoreDelta2W ?? Number.NEGATIVE_INFINITY)
    || (b.twoWeekPerformancePct ?? Number.NEGATIVE_INFINITY) - (a.twoWeekPerformancePct ?? Number.NEGATIVE_INFINITY)
    || (b.rsiDelta2W ?? Number.NEGATIVE_INFINITY) - (a.rsiDelta2W ?? Number.NEGATIVE_INFINITY)
    || (a.rotationRank ?? Number.POSITIVE_INFINITY) - (b.rotationRank ?? Number.POSITIVE_INFINITY)
}

function compareRowsByRank(a: MarketRotationMonitorRow, b: MarketRotationMonitorRow): number {
  return (a.rotationRank ?? Number.POSITIVE_INFINITY) - (b.rotationRank ?? Number.POSITIVE_INFINITY)
    || a.symbol.localeCompare(b.symbol)
}

export function buildMarketRotationMonitorPayload(input: MarketRotationMonitorInput): MarketRotationMonitorBasePayload {
  const rows = [...input.rows].sort(compareRowsByRank)
  const summaryRows = [...(input.summaryRows ?? input.rows)].sort(compareRowsByRank)
  const above20d = buildRatio(summaryRows, 'above20d')
  const above50d = buildRatio(summaryRows, 'above50d')
  const breadthCondition = getBreadthCondition(above50d.ratio)
  const breadthConfirmation = getBreadthConfirmation(input.marketState, above50d.ratio)
  const averageRsi = calculateAverageRsi(summaryRows)
  const improvingRows = rows
    .filter(row => row.rankDelta2W != null && row.rankDelta2W > 0)
    .sort(compareLeadershipChange)
    .slice(0, 3)
  const weakeningRows = rows
    .filter(row => row.rankDelta2W != null && row.rankDelta2W < 0)
    .sort(compareLeadershipChange)
    .slice(-3)
    .reverse()
  const expectedSymbolCount = getUniverseForScope(input.rankScope).length
  const actualSymbolCount = rows.length
  const coverageRatio = expectedSymbolCount > 0
    ? roundMetric(actualSymbolCount / expectedSymbolCount)
    : 0

  return {
    asOfDate: input.asOfDate,
    comparisonDate: input.comparisonDate,
    marketStateAsOfDate: input.marketStateAsOfDate ?? null,
    summaryAsOfDate: input.summaryAsOfDate ?? (input.rankScope === 'sectors' ? input.asOfDate : null),
    rankScope: input.rankScope,
    marketState: input.marketState,
    breadthCondition,
    breadthConfirmation,
    summary: {
      marketState: input.marketState,
      breadthCondition,
      breadthConfirmation,
      above20d,
      above50d,
      averageRsi,
    },
    summaryCards: {
      above20d,
      above50d,
      averageRsi,
      marketState: input.marketState,
    },
    charts: {
      topImproving: improvingRows,
      bottomWeakening: weakeningRows,
    },
    rows,
    topImproving: improvingRows,
    bottomWeakening: weakeningRows,
    dataQuality: {
      asOfDate: input.asOfDate,
      comparisonDate: input.comparisonDate,
      rankScope: input.rankScope,
      rowCount: rows.length,
      completeSignalCount: rows.filter(row => row.signalStatus === 'complete').length,
      coverageRatio,
      isQualified: coverageRatio >= 0.9,
      expectedSymbolCount,
      actualSymbolCount,
      scoreVersion: SCORE_VERSION,
    },
  }
}
