/**
 * 2W comparison enrichment for Market Rotation Monitor.
 *
 * Takes scope-enriched snapshots for the latest and comparison dates,
 * computes 2-week performance, deltas, final rotation scores/ranks,
 * and rotation signals.
 *
 * Pure function — no Prisma, no IO, no side effects.
 */

import {
  calculatePercentile,
  calculateRotationScore,
  assignRotationRanks,
  type RankableRow,
} from './calculations.js'
import { getRotationSignal, type MaStatus } from './signal.js'
import { calculatePerformance } from './indicators.js'

// ─── Input / Output types ───────────────────────────────────────

/**
 * Snapshot enriched with scope-level percentiles.
 * This is the output of scope-enrichment — we define it here
 * to avoid importing scope-enrichment.ts.
 */
export interface EnrichedSnapshotInput {
  symbol: string
  rankScope: string
  adjustedClose: number | null
  rsi14: number | null
  rsiPercentile: number | null
  maScore: number
  maScorePercentile: number | null
  distanceFromHighScore: number | null
  distanceFromHighScorePercentile: number | null
  rotationScore: number | null
  rotationRank: number | null
  maStatus: string
  percentFromHigh: number | null
  // Allow extra fields to pass through
  [key: string]: unknown
}

export interface FinalSnapshot {
  symbol: string
  // 2W performance
  twoWeekPerformancePct: number | null
  twoWeekPerformancePercentile: number | null
  // 2W deltas
  rsiDelta2W: number | null
  rotationScoreDelta2W: number | null
  rankDelta2W: number | null
  // Rotation score & rank (final, with 2W component)
  rotationScore: number | null
  rotationRank: number | null
  // Signal
  signal: string | null
  signalStatus: string
  // Original fields preserved
  [key: string]: unknown
}

// ─── Internal intermediate type ─────────────────────────────────

interface IntermediateRow {
  symbol: string
  latest: EnrichedSnapshotInput
  comparison: EnrichedSnapshotInput | undefined
  twoWeekPerformancePct: number | null
  twoWeekPerformancePercentile: number | null
  rotationScore: number | null
  rotationRank: number | null
  rsiDelta2W: number | null
  rotationScoreDelta2W: number | null
  rankDelta2W: number | null
  signal: string | null
  signalStatus: string
}

// ─── Main function ──────────────────────────────────────────────

/**
 * Enrich latest snapshots with 2-week comparison data.
 *
 * @param latest       Snapshots for the latest date (enriched with scope percentiles)
 * @param comparison   Snapshots for the comparison date (enriched with scope percentiles)
 * @returns            FinalSnapshots with 2W performance, deltas, score, rank, and signal
 */
export function enrichWithComparison(
  latest: EnrichedSnapshotInput[],
  comparison: EnrichedSnapshotInput[],
): FinalSnapshot[] {
  if (latest.length === 0) return []

  // Step 1: Build comparison symbol map (last occurrence wins for duplicates)
  const comparisonMap = new Map<string, EnrichedSnapshotInput>()
  for (const snap of comparison) {
    comparisonMap.set(snap.symbol, snap)
  }

  // Step 2: Calculate 2W performance for each latest snapshot
  const rows: IntermediateRow[] = latest.map((snap) => {
    const comp = comparisonMap.get(snap.symbol)

    const twoWeekPerformancePct = computePerformance(snap, comp)

    return {
      symbol: snap.symbol,
      latest: snap,
      comparison: comp,
      twoWeekPerformancePct,
      twoWeekPerformancePercentile: null, // computed in step 3
      rotationScore: null,
      rotationRank: null,
      rsiDelta2W: null,
      rotationScoreDelta2W: null,
      rankDelta2W: null,
      signal: null,
      signalStatus: 'insufficient_data',
    }
  })

  // Step 3: Calculate scope-local performance percentiles
  const perfValues = rows
    .map(r => r.twoWeekPerformancePct)
    .filter((v): v is number => v !== null)

  for (const row of rows) {
    if (row.twoWeekPerformancePct !== null && perfValues.length > 0) {
      row.twoWeekPerformancePercentile = calculatePercentile(perfValues, row.twoWeekPerformancePct)
    }
  }

  // Step 4: Calculate final rotation scores
  for (const row of rows) {
    const snap = row.latest
    row.rotationScore = calculateRotationScore({
      rsiPercentile: snap.rsiPercentile,
      twoWeekPerformancePercentile: row.twoWeekPerformancePercentile,
      maScorePercentile: snap.maScorePercentile,
      distanceFromHighScorePercentile: snap.distanceFromHighScorePercentile,
    })
  }

  // Step 5: Assign rotation ranks
  const rankable: RankableRow[] = rows.map(r => ({
    symbol: r.symbol,
    rotationScore: r.rotationScore,
  }))
  const ranked = assignRotationRanks(rankable)
  const rankMap = new Map(ranked.map(r => [r.symbol, r.rotationRank]))

  for (const row of rows) {
    row.rotationRank = rankMap.get(row.symbol) ?? null
  }

  // Step 6: Calculate deltas
  for (const row of rows) {
    const comp = row.comparison
    if (!comp) continue

    // rsiDelta2W = latest.rsi14 - comparison.rsi14
    if (row.latest.rsi14 != null && comp.rsi14 != null) {
      row.rsiDelta2W = row.latest.rsi14 - comp.rsi14
    }

    // rotationScoreDelta2W = current.rotationScore - comparison.rotationScore
    if (row.rotationScore != null && comp.rotationScore != null) {
      row.rotationScoreDelta2W = row.rotationScore - comp.rotationScore
    }

    // rankDelta2W = comparison.rotationRank - current.rotationRank (positive = improving)
    if (row.rotationRank != null && comp.rotationRank != null) {
      row.rankDelta2W = comp.rotationRank - row.rotationRank
    }
  }

  // Step 7: Calculate signals
  for (const row of rows) {
    const snap = row.latest
    const signalResult = getRotationSignal({
      maStatus: snap.maStatus as MaStatus,
      rsi: snap.rsi14,
      percentFromHigh: snap.percentFromHigh,
      rankDelta2W: row.rankDelta2W,
      rsiDelta2W: row.rsiDelta2W,
      twoWeekPerformancePct: row.twoWeekPerformancePct,
    })
    row.signal = signalResult.signal
    row.signalStatus = signalResult.signalStatus
  }

  // Step 8: Build final snapshots preserving original fields
  return rows.map((row): FinalSnapshot => {
    const { latest, comparison, ...enrichedFields } = row
    void comparison
    return {
      ...latest,
      ...enrichedFields,
    }
  })
}

// ─── Helpers ────────────────────────────────────────────────────

function computePerformance(
  latest: EnrichedSnapshotInput,
  comparison: EnrichedSnapshotInput | undefined,
): number | null {
  if (!comparison) return null
  if (latest.adjustedClose == null || comparison.adjustedClose == null) return null
  return calculatePerformance(comparison.adjustedClose, latest.adjustedClose)
}
