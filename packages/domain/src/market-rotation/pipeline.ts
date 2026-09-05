/**
 * Snapshot pipeline — pure function orchestrator that strings together
 * the full calculation chain:
 *
 *   raw prices → buildSnapshot → enrichScopes → enrichWithComparison
 *
 * Comparison data comes from previously persisted snapshots (DB),
 * not from raw prices. This avoids the chicken-and-egg problem
 * where comparison snapshots would also need their own comparison data
 * to compute rotationScore and rotationRank.
 *
 * No IO, no Prisma, no side effects.
 */

import type { DailyPrice, SnapshotData } from './snapshot-builder.js'
import { buildSnapshot } from './snapshot-builder.js'
import { enrichScopes, type EnrichedSnapshot } from './scope-enrichment.js'
import { enrichWithComparison, type EnrichedSnapshotInput, type FinalSnapshot } from './comparison-enrichment.js'
import type { BetaBucket, GroupType, RankScope } from './types.js'

// ─── Universe config ─────────────────────────────────────────────

export interface UniverseSymbol {
  symbol: string
  rankScope: RankScope
  groupType: GroupType
  sectorName: string | null
  /** Thematic tag (e.g. "AI / Semi", "Defensive"). Optional for legacy V1 entries. */
  theme?: string
  /** Beta / risk bucket used by allocation layers. Optional for legacy V1 entries. */
  betaBucket?: BetaBucket
}

// ─── Pipeline input / output ─────────────────────────────────────

export interface SymbolPrices {
  meta: UniverseSymbol
  prices: DailyPrice[]
}

export interface PipelineResult {
  latest: FinalSnapshot[]
  snapshots: SnapshotData[]
  enriched: EnrichedSnapshot[]
}

// ─── Main pipeline ───────────────────────────────────────────────

/**
 * Run the full snapshot pipeline for a set of symbols.
 *
 * Step 1: Build raw snapshots from historical prices.
 * Step 2: Enrich with scope-local percentiles.
 * Step 3: Enrich with 2-week comparison data from persisted snapshots.
 *
 * @param symbolPrices         Price data for each symbol (latest date).
 * @param comparisonSnapshots  Optional previously persisted snapshots for 2W deltas.
 *                              These should already have rotationScore and rotationRank.
 * @returns                    Pipeline result with snapshots at each stage.
 */
export function runSnapshotPipeline(
  symbolPrices: SymbolPrices[],
  comparisonSnapshots?: EnrichedSnapshotInput[],
): PipelineResult {
  // Step 1: Build raw snapshots
  const snapshots: SnapshotData[] = []
  for (const { meta, prices } of symbolPrices) {
    const snapshot = buildSnapshot(meta, prices)
    if (snapshot) {
      snapshots.push(snapshot)
    }
  }

  // Step 2: Scope enrichment (percentiles)
  const enriched = enrichScopes(snapshots)

  // Step 3: 2W comparison enrichment
  let latest: FinalSnapshot[]
  if (comparisonSnapshots && comparisonSnapshots.length > 0) {
    latest = enrichWithComparison(
      enriched.map((snapshot): EnrichedSnapshotInput => ({ ...snapshot })),
      comparisonSnapshots,
    )
  }
  else {
    // No comparison data — wrap enriched as-is (2W fields all null)
    latest = enriched.map((snap): FinalSnapshot => ({
      ...snap,
      twoWeekPerformancePct: null,
      twoWeekPerformancePercentile: null,
      rsiDelta2W: null,
      rotationScoreDelta2W: null,
      rankDelta2W: null,
      signal: null,
      signalStatus: 'insufficient_data' as const,
    }))
  }

  return { latest, snapshots, enriched }
}
