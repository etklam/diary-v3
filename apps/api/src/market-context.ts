import { type Database } from '@diary/db'
import { buildMarketRotationContext } from '@diary/domain/market-rotation/monitor'
import { decideBetaAllocation, type BetaAllocationResult } from '@diary/domain/beta-allocation'
import type { MarketState, RankScope } from '@diary/domain/market-rotation/types'
import { getLatestBreadthSnapshot } from './market-state-queries.js'
import { readRotationScopeSnapshot, type RotationScopeSnapshot } from './rotation-snapshot-read.js'

type DbTransaction = Parameters<Parameters<Database['transaction']>[0]>[0]

export interface PersistedMarketContext {
  marketState: MarketState
  marketStateAsOfDate: string | null
  selectedSnapshot: RotationScopeSnapshot
  sectorSnapshot: RotationScopeSnapshot
  asOfDate: string
  comparisonDate: string | null
  summaryAsOfDate: string | null
  rotationContext: ReturnType<typeof buildMarketRotationContext>
  betaAllocation: BetaAllocationResult
}

export interface PortfolioMarketContext {
  marketState: MarketState
  betaAllocation: BetaAllocationResult
  lastUpdated: Date
  marketStateAsOfDate: string | null
  summaryAsOfDate: string
}

/**
 * Read the canonical persisted state and current qualified rotation snapshots.
 * Monitor and Portfolio share this orchestration; only Monitor reads history.
 */
export async function readPersistedMarketContext(
  db: Database | DbTransaction,
  scope: RankScope,
  asOfDate: string,
  marketStateOverride?: MarketState,
): Promise<PersistedMarketContext | null> {
  const breadth = marketStateOverride === undefined
    ? await getLatestBreadthSnapshot(db, 'SP500_NDX', asOfDate)
    : null
  const marketState = marketStateOverride ?? breadth?.marketState ?? 'unknown'
  const selectedSnapshot = await readRotationScopeSnapshot(db, scope, asOfDate)
  if (!selectedSnapshot.window.latestDate || selectedSnapshot.rows.length === 0) return null

  const sectorSnapshot = scope === 'sectors'
    ? selectedSnapshot
    : await readRotationScopeSnapshot(db, 'sectors', asOfDate)
  const rotationContext = buildMarketRotationContext({
    marketState,
    rows: selectedSnapshot.rows,
    summaryRows: sectorSnapshot.rows,
  })
  const betaAllocation = decideBetaAllocation({
    marketState,
    breadthConfirmation: rotationContext.breadthConfirmation,
    above50dRatio: rotationContext.above50d.ratio,
    averageRsi: rotationContext.averageRsi,
    leadership: {
      topImproving: rotationContext.topImproving.map(row => row.sectorName ?? row.symbol),
      bottomWeakening: rotationContext.bottomWeakening.map(row => row.sectorName ?? row.symbol),
    },
  })
  return {
    marketState,
    marketStateAsOfDate: breadth?.date ?? null,
    selectedSnapshot,
    sectorSnapshot,
    asOfDate: selectedSnapshot.window.latestDate.toISOString().slice(0, 10),
    comparisonDate: selectedSnapshot.window.comparisonDate?.toISOString().slice(0, 10) ?? null,
    summaryAsOfDate: sectorSnapshot.window.latestDate?.toISOString().slice(0, 10) ?? null,
    rotationContext,
    betaAllocation,
  }
}

/** Read the bounded market context needed by Portfolio allocation guidance. */
export async function readPortfolioMarketContext(
  db: Database,
  asOfDate: string,
): Promise<PortfolioMarketContext | null> {
  return db.transaction(async tx => {
    const context = await readPersistedMarketContext(tx, 'sectors', asOfDate)
    if (!context) return null
    return {
      marketState: context.marketState,
      betaAllocation: context.betaAllocation,
      lastUpdated: context.selectedSnapshot.window.latestDate!,
      marketStateAsOfDate: context.marketStateAsOfDate,
      summaryAsOfDate: context.summaryAsOfDate!,
    }
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' })
}
