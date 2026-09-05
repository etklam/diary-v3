import { portfolioExposureResponseSchema } from '@diary/contracts/portfolio-exposure'
import { compareExposureToTarget, computePortfolioExposure, type SuggestedAllocation } from '@diary/domain/portfolio-exposure'
import type { BetaAllocationResult } from '@diary/domain/beta-allocation'
import type { Database } from '@diary/db'
import { getHoldings } from './ledger.js'
import { readRotationMonitor } from './rotation-monitor.js'

const FALLBACK_ALLOCATION = { highBetaTargetPct: 0, coreIndexTargetPct: 50, cashTargetPct: 50 } as const
const NO_MARKET_DATA_EXPLANATION = 'Market regime unclear. No market regime data available. Showing current exposure only.'

export async function readPortfolioExposure(db: Database, userId: bigint, asOfDate: string) {
  const holdings = (await getHoldings(db, userId)).map(row => ({ symbol: row.symbol, quantity: Number(row.quantity), avgCost: Number(row.avgCost), totalCost: Number(row.totalCost) }))
  const exposure = computePortfolioExposure(holdings)
  let suggestedAllocation: SuggestedAllocation = FALLBACK_ALLOCATION
  let betaAllocation: BetaAllocationResult = {
    ...FALLBACK_ALLOCATION,
    suggestedMode: 'unknown',
    suggestedBetaLevel: null,
    explanation: NO_MARKET_DATA_EXPLANATION,
    warnings: [] as string[],
  }
  let marketState: 'risk_on' | 'neutral' | 'defensive' | 'risk_off' | 'unknown' = 'unknown'
  let lastUpdated: string | null = null
  let marketStateAsOfDate: string | null = null
  let summaryAsOfDate: string | null = null

  // Rotation data is contextual. A missing or failed reader must not remove
  // the owner ledger projection or turn unknown targets into a recommendation.
  try {
    const context = await readRotationMonitor(db, 'sectors', asOfDate)
    if (context?.betaAllocation && context.lastUpdated) {
      const decided = context.betaAllocation
      marketState = context.marketState
      suggestedAllocation = {
        highBetaTargetPct: decided.highBetaTargetPct,
        coreIndexTargetPct: decided.coreIndexTargetPct,
        cashTargetPct: decided.cashTargetPct,
      }
      betaAllocation = decided
      lastUpdated = context.lastUpdated.toISOString()
      marketStateAsOfDate = context.payload.marketStateAsOfDate
      summaryAsOfDate = context.payload.summaryAsOfDate
    }
  } catch {
    // Best effort by design: keep the exact holdings exposure when the
    // persisted market context is unavailable or malformed.
  }

  const gaps = marketState === 'unknown' ? [] : compareExposureToTarget(exposure, suggestedAllocation)
  return portfolioExposureResponseSchema.parse({
    exposure, gaps, suggestedAllocation, betaAllocation, marketState, lastUpdated, marketStateAsOfDate, summaryAsOfDate,
  })
}
