/**
 * Portfolio exposure analysis.
 *
 * Pure functions — no Prisma, no Decimal, no side effects.
 * `Holding` is the unvalued position shape (see `~/lib/position-state`).
 */

import type { PortfolioHolding as Holding } from '@diary/contracts/portfolio'
import { classifyBetaBucket, type BetaBucket } from './beta-buckets.js'

export interface PortfolioExposure {
  highBetaPct: number
  coreIndexPct: number
  megaCapPct: number
  singleStockPct: number
  defensivePct: number
  cashProxyPct: number
  unknownPct: number
  largestTheme: string | null
  concentrationWarning: boolean
  totalValue: number
  /**
   * Number of holdings whose resolved market value was NaN / Infinity /
   * non-numeric (e.g. corrupted Decimal parse from `Number(tx.quantity)`).
   * Those holdings are excluded from bucket totals so the displayed
   * percentages stay finite; UI should warn the user when > 0.
   */
  skippedCount: number
}

export interface ExposureGap {
  bucket: string
  currentPct: number
  targetPct: number
  gapPct: number
  status: 'underweight' | 'balanced' | 'overweight'
}

export interface SuggestedAllocation {
  highBetaTargetPct: number
  coreIndexTargetPct: number
  cashTargetPct: number
}

const EMPTY_EXPOSURE: PortfolioExposure = {
  highBetaPct: 0,
  coreIndexPct: 0,
  megaCapPct: 0,
  singleStockPct: 0,
  defensivePct: 0,
  cashProxyPct: 0,
  unknownPct: 0,
  largestTheme: null,
  concentrationWarning: false,
  totalValue: 0,
  skippedCount: 0,
}

/**
 * Resolve the market value of a single holding.
 *
 * Exposure intentionally consumes the unvalued position read model. The
 * denominator is always totalCost, independent of quote availability.
 * Invalid cost values are skipped and counted so percentages stay finite.
 */
function resolveMarketValue(h: Holding): number | null {
  return typeof h.totalCost === 'number' && Number.isFinite(h.totalCost) && h.totalCost >= 0
    ? h.totalCost
    : null
}

/**
 * Compute portfolio-level beta exposure from a set of holdings.
 *
 * Each holding is classified into a beta bucket, its market value accumulated
 * into that bucket, and the resulting percentages returned. Unknown buckets
 * are surfaced (not silently dropped) so T7 can warn the user.
 */
export function computePortfolioExposure(holdings: Holding[]): PortfolioExposure {
  if (holdings.length === 0) return { ...EMPTY_EXPOSURE }

  const bucketTotals = new Map<BetaBucket, number>()
  let totalValue = 0
  let skippedCount = 0

  for (const h of holdings) {
    const value = resolveMarketValue(h)
    if (value === null) {
      skippedCount++
      continue
    }
    const bucket = classifyBetaBucket(h.symbol)
    bucketTotals.set(bucket, (bucketTotals.get(bucket) ?? 0) + value)
    totalValue += value
  }

  if (totalValue === 0) {
    return { ...EMPTY_EXPOSURE, skippedCount }
  }

  const pct = (bucket: BetaBucket): number => {
    const v = bucketTotals.get(bucket) ?? 0
    return (v / totalValue) * 100
  }

  const highBetaPct = pct('high_beta')
  const coreIndexPct = pct('core_index')
  const megaCapPct = pct('mega_cap')
  const singleStockPct = pct('single_stock')
  const defensivePct = pct('defensive')
  const cashProxyPct = pct('cash_proxy')
  const unknownPct = pct('unknown')

  // largestTheme: largest non-unknown bucket, by value.
  const knownBuckets: BetaBucket[] = [
    'high_beta',
    'core_index',
    'mega_cap',
    'single_stock',
    'defensive',
    'cash_proxy',
  ]
  let largestTheme: string | null = null
  let largestValue = -1
  for (const b of knownBuckets) {
    const v = bucketTotals.get(b) ?? 0
    if (v > largestValue) {
      largestValue = v
      largestTheme = b
    }
  }
  // If no known bucket has any value, fall back to null.
  if (largestValue <= 0) largestTheme = null

  // concentrationWarning: any non-cash_proxy known bucket strictly > 50%.
  const concentrationWarning = knownBuckets
    .filter((b) => b !== 'cash_proxy')
    .some((b) => (bucketTotals.get(b) ?? 0) / totalValue * 100 > 50)

  return {
    highBetaPct,
    coreIndexPct,
    megaCapPct,
    singleStockPct,
    defensivePct,
    cashProxyPct,
    unknownPct,
    largestTheme,
    concentrationWarning,
    totalValue,
    skippedCount,
  }
}

export interface CombinedBuckets {
  highBeta: number
  coreIndex: number
  cash: number
}

/**
 * Collapse the six raw beta buckets into the three displayed in the UI:
 *   highBeta  = high_beta + mega_cap + single_stock
 *   coreIndex = core_index
 *   cash      = defensive + cash_proxy
 *
 * Single source of truth — `compareExposureToTarget` and the UI panel both
 * consume this so the bucket aggregation can't drift between them.
 */
export function combineBetaBuckets(exposure: PortfolioExposure): CombinedBuckets {
  return {
    highBeta: exposure.highBetaPct + exposure.megaCapPct + exposure.singleStockPct,
    coreIndex: exposure.coreIndexPct,
    cash: exposure.defensivePct + exposure.cashProxyPct,
  }
}

/**
 * Compare computed exposure against a target allocation.
 *
 * Status: |gap| <= 5 → balanced; gap > 5 → overweight; gap < -5 → underweight.
 * Unknown exposure is intentionally not compared.
 */
export function compareExposureToTarget(
  exposure: PortfolioExposure,
  target: SuggestedAllocation
): ExposureGap[] {
  const combined = combineBetaBuckets(exposure)
  const highBetaCurrent = combined.highBeta
  const coreIndexCurrent = combined.coreIndex
  const cashCurrent = combined.cash

  const computeStatus = (gap: number): ExposureGap['status'] => {
    if (gap > 5) return 'overweight'
    if (gap < -5) return 'underweight'
    return 'balanced'
  }

  const build = (
    bucket: string,
    currentPct: number,
    targetPct: number
  ): ExposureGap => {
    const gapPct = currentPct - targetPct
    return { bucket, currentPct, targetPct, gapPct, status: computeStatus(gapPct) }
  }

  return [
    build('highBeta', highBetaCurrent, target.highBetaTargetPct),
    build('coreIndex', coreIndexCurrent, target.coreIndexTargetPct),
    build('cash', cashCurrent, target.cashTargetPct),
  ]
}
