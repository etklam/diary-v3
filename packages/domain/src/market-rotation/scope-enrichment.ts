/**
 * Scope-level enrichment — pure function that takes raw snapshots
 * for a single date & rank scope and enriches each with scope-local
 * percentiles.
 *
 * No IO, no Prisma, no side effects.
 * rotationScore and rotationRank are always null here because
 * twoWeekPerformancePercentile requires cross-date comparison data
 * that is only available in enrichWithComparison().
 *
 * T2 change: for the `core` rank scope, snapshots are split into two
 * percentile pools — `core_etf` and `mega_cap_stock` (mega_cap +
 * single_stock combined) — so that high-volatility single stocks do
 * not dominate the ETF percentile distribution. Sectors and indexes
 * scopes retain their legacy single-pool behavior.
 */

import type { SnapshotData } from './snapshot-builder.js'
import { calculatePercentile, calculateRotationScore } from './calculations.js'

// ─── Types ────────────────────────────────────────────────────

export interface EnrichedSnapshot extends SnapshotData {
  rsiPercentile: number | null
  maScorePercentile: number | null
  distanceFromHighScorePercentile: number | null
  rotationScore: number | null
  rotationRank: number | null
}

// ─── Pool classification ──────────────────────────────────────

/**
 * Returns the percentile-pool key for a snapshot.
 *
 * - `sectors` / `indexes` scopes: one pool per scope (legacy).
 * - `core` scope: split by groupType into `core_etf` vs `mega_cap_stock`.
 *   Unknown / legacy `core` groupType defaults to `core_etf` to preserve
 *   backwards compatibility with previously persisted snapshots.
 */
function getPoolKey(snapshot: SnapshotData): string {
  if (snapshot.rankScope !== 'core') {
    return snapshot.rankScope
  }

  switch (snapshot.groupType) {
    case 'mega_cap':
    case 'single_stock':
      return 'core:mega_cap_stock'
    case 'core_etf':
    case 'core':
    default:
      return 'core:core_etf'
  }
}

// ─── Implementation ───────────────────────────────────────────

/**
 * Given raw snapshots for a single date, enrich each with pool-local
 * percentiles, rotation score, and rotation rank.
 *
 * Input snapshots must all belong to the same date and rank scope.
 * For the `core` rank scope, entries are further split into two pools
 * (core_etf vs mega_cap_stock) before percentile computation.
 * Two-week performance percentile is NOT computed here — it requires
 * comparison data from a different date.
 */
export function enrichScopes(snapshots: SnapshotData[]): EnrichedSnapshot[] {
  if (snapshots.length === 0) return []

  // Group snapshots by their percentile pool key
  const poolMap = new Map<string, SnapshotData[]>()
  for (const snap of snapshots) {
    const key = getPoolKey(snap)
    const list = poolMap.get(key)
    if (list) {
      list.push(snap)
    }
    else {
      poolMap.set(key, [snap])
    }
  }

  const enriched: EnrichedSnapshot[] = []

  for (const [key, pool] of poolMap) {
    // Collect non-null values for each metric within the pool
    const allNonNullRsi14 = pool
      .map(s => s.rsi14)
      .filter((v): v is number => v !== null)
    const allMaScores = pool.map(s => s.maScore)
    const allNonNullDistScores = pool
      .map(s => s.distanceFromHighScore)
      .filter((v): v is number => v !== null)

    for (const snapshot of pool) {
      const rsiPercentile = snapshot.rsi14 !== null
        ? calculatePercentile(allNonNullRsi14, snapshot.rsi14)
        : null

      const maScorePercentile = calculatePercentile(allMaScores, snapshot.maScore)

      const distanceFromHighScorePercentile = snapshot.distanceFromHighScore !== null
        ? calculatePercentile(allNonNullDistScores, snapshot.distanceFromHighScore)
        : null

      // rotationScore requires all 4 components — twoWeekPerformancePercentile
      // is not available at this stage, so rotationScore is always null.
      const rotationScore = calculateRotationScore({
        rsiPercentile,
        twoWeekPerformancePercentile: null,
        maScorePercentile,
        distanceFromHighScorePercentile,
      })

      enriched.push({
        ...snapshot,
        rsiPercentile,
        maScorePercentile,
        distanceFromHighScorePercentile,
        rotationScore,
        rotationRank: null as number | null,
      })
    }
    // pool key is used only for grouping; no per-pool output emission
    void key
  }

  return enriched
}
