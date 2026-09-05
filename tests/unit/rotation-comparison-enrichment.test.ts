import { describe, expect, it } from 'vitest'
import { enrichWithComparison, type EnrichedSnapshotInput } from '../../packages/domain/src/market-rotation/comparison-enrichment'

// ─── Helpers ─────────────────────────────────────────────────────

function makeSnapshot(overrides: Partial<EnrichedSnapshotInput> & { symbol: string }): EnrichedSnapshotInput {
  return {
    rankScope: 'sectors',
    adjustedClose: 100,
    rsi14: 55,
    rsiPercentile: 60,
    maScore: 70,
    maScorePercentile: 65,
    distanceFromHighScore: 80,
    distanceFromHighScorePercentile: 75,
    rotationScore: null,
    rotationRank: null,
    maStatus: 'bullish_stack',
    percentFromHigh: -2,
    ...overrides,
  }
}

describe('enrichWithComparison', () => {
  // ─── Case 1: Basic 3 symbols with full comparison data ───────
  describe('basic 3 symbols with comparison data', () => {
    it('calculates correct 2W performance, percentile, score, rank, and signal', () => {
      const latest: EnrichedSnapshotInput[] = [
        makeSnapshot({ symbol: 'SPY', adjustedClose: 110, rsi14: 65, rsiPercentile: 70, maScorePercentile: 60, distanceFromHighScorePercentile: 75 }),
        makeSnapshot({ symbol: 'QQQ', adjustedClose: 220, rsi14: 55, rsiPercentile: 55, maScorePercentile: 70, distanceFromHighScorePercentile: 80 }),
        makeSnapshot({ symbol: 'IWM', adjustedClose: 55, rsi14: 40, rsiPercentile: 30, maScorePercentile: 40, distanceFromHighScorePercentile: 50 }),
      ]

      const comparison: EnrichedSnapshotInput[] = [
        makeSnapshot({ symbol: 'SPY', adjustedClose: 100, rsi14: 60, rotationScore: 70, rotationRank: 1 }),
        makeSnapshot({ symbol: 'QQQ', adjustedClose: 200, rsi14: 50, rotationScore: 65, rotationRank: 2 }),
        makeSnapshot({ symbol: 'IWM', adjustedClose: 50, rsi14: 45, rotationScore: 40, rotationRank: 3 }),
      ]

      const result = enrichWithComparison(latest, comparison)

      // 2W performance
      expect(result[0]!.twoWeekPerformancePct).toBeCloseTo(10, 4)   // (110-100)/100 * 100
      expect(result[1]!.twoWeekPerformancePct).toBeCloseTo(10, 4)   // (220-200)/200 * 100
      expect(result[2]!.twoWeekPerformancePct).toBeCloseTo(10, 4)   // (55-50)/50 * 100

      // All three have the same performance so they share the same percentile
      // Percentile for a value that equals others: (below / total) * 100
      // All three are 10, so below count = 0, percentile = 0
      expect(result[0]!.twoWeekPerformancePercentile).toBeCloseTo(0, 1)
      expect(result[1]!.twoWeekPerformancePercentile).toBeCloseTo(0, 1)
      expect(result[2]!.twoWeekPerformancePercentile).toBeCloseTo(0, 1)

      // rotationScore should be computed (all 4 components present)
      expect(result[0]!.rotationScore).not.toBeNull()
      expect(result[1]!.rotationScore).not.toBeNull()
      expect(result[2]!.rotationScore).not.toBeNull()

      // rotationRank should be assigned (all have scores)
      expect(result[0]!.rotationRank).not.toBeNull()
      expect(result[1]!.rotationRank).not.toBeNull()
      expect(result[2]!.rotationRank).not.toBeNull()

      // RSI deltas
      expect(result[0]!.rsiDelta2W).toBe(5)    // 65 - 60
      expect(result[1]!.rsiDelta2W).toBe(5)    // 55 - 50
      expect(result[2]!.rsiDelta2W).toBe(-5)   // 40 - 45

      // rotationScoreDelta2W
      expect(result[0]!.rotationScoreDelta2W).not.toBeNull()
      expect(result[1]!.rotationScoreDelta2W).not.toBeNull()
      expect(result[2]!.rotationScoreDelta2W).not.toBeNull()

      // rankDelta2W = comparisonRank - currentRank
      // Ranks depend on rotation scores, but the deltas should be numbers
      expect(result[0]!.rankDelta2W).not.toBeNull()
      expect(result[1]!.rankDelta2W).not.toBeNull()
      expect(result[2]!.rankDelta2W).not.toBeNull()

      // Signal should be computed
      expect(result[0]!.signal).not.toBeNull()
      expect(result[0]!.signalStatus).toBe('complete')
    })

    it('preserves original fields from input', () => {
      const latest: EnrichedSnapshotInput[] = [
        makeSnapshot({ symbol: 'SPY', adjustedClose: 110, extraField: 'hello' }),
      ]

      const comparison: EnrichedSnapshotInput[] = [
        makeSnapshot({ symbol: 'SPY', adjustedClose: 100 }),
      ]

      const result = enrichWithComparison(latest, comparison)
      expect((result[0]!).extraField).toBe('hello')
      expect((result[0]!).rankScope).toBe('sectors')
      expect((result[0]!).rsi14).toBe(55)
    })
  })

  // ─── Case 2: Symbol with no comparison data → 2W fields all null ─
  it('returns null 2W fields for symbols without comparison data', () => {
    const latest: EnrichedSnapshotInput[] = [
      makeSnapshot({ symbol: 'SPY', adjustedClose: 110 }),
      makeSnapshot({ symbol: 'NEW_ETF', adjustedClose: 50 }),
    ]

    const comparison: EnrichedSnapshotInput[] = [
      makeSnapshot({ symbol: 'SPY', adjustedClose: 100, rotationScore: 60, rotationRank: 1 }),
    ]

    const result = enrichWithComparison(latest, comparison)

    // SPY has comparison
    expect(result[0]!.twoWeekPerformancePct).toBeCloseTo(10, 4)
    expect(result[0]!.rsiDelta2W).not.toBeNull()

    // NEW_ETF has no comparison
    expect(result[1]!.twoWeekPerformancePct).toBeNull()
    expect(result[1]!.rsiDelta2W).toBeNull()
    expect(result[1]!.rotationScoreDelta2W).toBeNull()
    expect(result[1]!.rankDelta2W).toBeNull()
    expect(result[1]!.signal).toBeNull()
    expect(result[1]!.signalStatus).toBe('insufficient_data')
  })

  // ─── Case 3: Partial null adjustedClose → twoWeekPerformancePct is null ──
  it('returns null twoWeekPerformancePct when adjustedClose is null on either side', () => {
    const latest: EnrichedSnapshotInput[] = [
      makeSnapshot({ symbol: 'SPY', adjustedClose: null }),
      makeSnapshot({ symbol: 'QQQ', adjustedClose: 220 }),
    ]

    const comparison: EnrichedSnapshotInput[] = [
      makeSnapshot({ symbol: 'SPY', adjustedClose: 100, rotationScore: 60, rotationRank: 1 }),
      makeSnapshot({ symbol: 'QQQ', adjustedClose: null, rotationScore: 55, rotationRank: 2 }),
    ]

    const result = enrichWithComparison(latest, comparison)

    // SPY: latest adjustedClose is null → performance null
    expect(result[0]!.twoWeekPerformancePct).toBeNull()

    // QQQ: comparison adjustedClose is null → performance null
    expect(result[1]!.twoWeekPerformancePct).toBeNull()
  })

  // ─── Case 4: rotationScore complete → rank correct ────────────
  it('assigns correct ranks when all rotationScores are present', () => {
    const latest: EnrichedSnapshotInput[] = [
      makeSnapshot({ symbol: 'A', adjustedClose: 110, rsiPercentile: 90, maScorePercentile: 90, distanceFromHighScorePercentile: 90 }),
      makeSnapshot({ symbol: 'B', adjustedClose: 110, rsiPercentile: 50, maScorePercentile: 50, distanceFromHighScorePercentile: 50 }),
      makeSnapshot({ symbol: 'C', adjustedClose: 110, rsiPercentile: 10, maScorePercentile: 10, distanceFromHighScorePercentile: 10 }),
    ]

    const comparison: EnrichedSnapshotInput[] = [
      makeSnapshot({ symbol: 'A', adjustedClose: 100, rotationScore: 70, rotationRank: 2 }),
      makeSnapshot({ symbol: 'B', adjustedClose: 100, rotationScore: 80, rotationRank: 1 }),
      makeSnapshot({ symbol: 'C', adjustedClose: 100, rotationScore: 60, rotationRank: 3 }),
    ]

    const result = enrichWithComparison(latest, comparison)

    // All have performance, so all should have rotationScore
    expect(result.every(r => r.rotationScore !== null)).toBe(true)
    expect(result.every(r => r.rotationRank !== null)).toBe(true)

    // A should have highest score → rank 1
    const ranked = [...result].sort((a, b) => (a.rotationRank ?? 999) - (b.rotationRank ?? 999))
    expect(ranked[0]!.symbol).toBe('A')
    expect(ranked[0]!.rotationRank).toBe(1)
    expect(ranked[2]!.symbol).toBe('C')
    expect(ranked[2]!.rotationRank).toBe(3)
  })

  // ─── Case 5: breaking_down signal ────────────────────────────
  it('triggers breaking_down signal when maStatus is breakdown and conditions met', () => {
    const latest: EnrichedSnapshotInput[] = [
      makeSnapshot({
        symbol: 'XLF',
        adjustedClose: 90,
        rsi14: 35,
        maStatus: 'breakdown',
        percentFromHigh: -15,
      }),
    ]

    const comparison: EnrichedSnapshotInput[] = [
      makeSnapshot({
        symbol: 'XLF',
        adjustedClose: 100,
        rsi14: 40,
        rotationScore: 60,
        rotationRank: 1,
      }),
    ]

    const result = enrichWithComparison(latest, comparison)

    // Performance is negative (90 vs 100 = -10%), maStatus is breakdown, rsiDelta2W = -5
    // breaking_down: breakdown + (rankWeakening || rsiWeakening || performanceWeakening)
    expect(result[0]!.twoWeekPerformancePct).toBeCloseTo(-10, 4)
    expect(result[0]!.rsiDelta2W).toBe(-5)
    expect(result[0]!.signal).toBe('breaking_down')
    expect(result[0]!.signalStatus).toBe('complete')
  })

  // ─── Case 6: insufficient_data → signal=null, signalStatus='insufficient_data' ─
  it('returns insufficient_data when comparison fields are missing', () => {
    const latest: EnrichedSnapshotInput[] = [
      makeSnapshot({ symbol: 'SPY', adjustedClose: 110, maStatus: 'unknown' }),
    ]

    const comparison: EnrichedSnapshotInput[] = [
      makeSnapshot({ symbol: 'SPY', adjustedClose: 100, rotationScore: 60, rotationRank: 1 }),
    ]

    const result = enrichWithComparison(latest, comparison)

    expect(result[0]!.signal).toBeNull()
    expect(result[0]!.signalStatus).toBe('insufficient_data')
  })

  // ─── Case 7: Empty latest → empty result ──────────────────────
  it('returns empty array for empty latest input', () => {
    const result = enrichWithComparison([], [
      makeSnapshot({ symbol: 'SPY', adjustedClose: 100 }),
    ])
    expect(result).toEqual([])
  })

  // ─── Case 8: Empty comparison → all 2W fields null, signal insufficient_data ─
  it('returns all null 2W fields when comparison is empty', () => {
    const latest: EnrichedSnapshotInput[] = [
      makeSnapshot({ symbol: 'SPY', adjustedClose: 110 }),
      makeSnapshot({ symbol: 'QQQ', adjustedClose: 220 }),
    ]

    const result = enrichWithComparison(latest, [])

    expect(result).toHaveLength(2)
    for (const r of result) {
      expect(r.twoWeekPerformancePct).toBeNull()
      expect(r.twoWeekPerformancePercentile).toBeNull()
      expect(r.rsiDelta2W).toBeNull()
      expect(r.rotationScoreDelta2W).toBeNull()
      expect(r.rankDelta2W).toBeNull()
      expect(r.rotationScore).toBeNull()
      expect(r.rotationRank).toBeNull()
      expect(r.signal).toBeNull()
      expect(r.signalStatus).toBe('insufficient_data')
    }
  })

  // ─── Case 9: rankDelta2W direction = comparisonRank - currentRank ──
  it('calculates rankDelta2W as comparison rank minus current rank (positive = improving)', () => {
    const latest: EnrichedSnapshotInput[] = [
      // A: will get a high rotationScore → rank 1 in latest
      makeSnapshot({ symbol: 'A', adjustedClose: 110, rsiPercentile: 90, maScorePercentile: 90, distanceFromHighScorePercentile: 90 }),
      // B: will get a low rotationScore → rank 2 in latest
      makeSnapshot({ symbol: 'B', adjustedClose: 110, rsiPercentile: 30, maScorePercentile: 30, distanceFromHighScorePercentile: 30 }),
    ]

    const comparison: EnrichedSnapshotInput[] = [
      // A was rank 3 in comparison (lower)
      makeSnapshot({ symbol: 'A', adjustedClose: 100, rotationScore: 30, rotationRank: 3 }),
      // B was rank 1 in comparison (higher)
      makeSnapshot({ symbol: 'B', adjustedClose: 100, rotationScore: 80, rotationRank: 1 }),
    ]

    const result = enrichWithComparison(latest, comparison)

    // A: now rank 1, was rank 3 → rankDelta2W = 3 - 1 = 2 (positive = improved)
    const a = result.find(r => r.symbol === 'A')!
    expect(a.rotationRank).toBe(1)
    expect(a.rankDelta2W).toBe(2) // 3 - 1 = 2

    // B: now rank 2, was rank 1 → rankDelta2W = 1 - 2 = -1 (negative = worsened)
    const b = result.find(r => r.symbol === 'B')!
    expect(b.rotationRank).toBe(2)
    expect(b.rankDelta2W).toBe(-1) // 1 - 2 = -1
  })

  // ─── Case 10: Percentile is scope-local ───────────────────────
  it('calculates twoWeekPerformancePercentile from scope-local performance values', () => {
    const latest: EnrichedSnapshotInput[] = [
      makeSnapshot({ symbol: 'SPY', adjustedClose: 120, rsiPercentile: 60, maScorePercentile: 60, distanceFromHighScorePercentile: 60 }),
      makeSnapshot({ symbol: 'QQQ', adjustedClose: 210, rsiPercentile: 50, maScorePercentile: 50, distanceFromHighScorePercentile: 50 }),
      makeSnapshot({ symbol: 'IWM', adjustedClose: 45, rsiPercentile: 40, maScorePercentile: 40, distanceFromHighScorePercentile: 40 }),
    ]

    const comparison: EnrichedSnapshotInput[] = [
      makeSnapshot({ symbol: 'SPY', adjustedClose: 100, rotationScore: 60, rotationRank: 1 }),
      makeSnapshot({ symbol: 'QQQ', adjustedClose: 200, rotationScore: 50, rotationRank: 2 }),
      makeSnapshot({ symbol: 'IWM', adjustedClose: 50, rotationScore: 40, rotationRank: 3 }),
    ]

    const result = enrichWithComparison(latest, comparison)

    // SPY: +20%, QQQ: +5%, IWM: -10%
    expect(result[0]!.twoWeekPerformancePct).toBeCloseTo(20, 4)
    expect(result[1]!.twoWeekPerformancePct).toBeCloseTo(5, 4)
    expect(result[2]!.twoWeekPerformancePct).toBeCloseTo(-10, 4)

    // Percentile is scope-local: calculated from [20, 5, -10]
    // SPY (20): below = 2 (5 and -10) → 2/3 * 100 ≈ 66.67
    expect(result[0]!.twoWeekPerformancePercentile).toBeCloseTo(66.67, 1)
    // QQQ (5): below = 1 (-10) → 1/3 * 100 ≈ 33.33
    expect(result[1]!.twoWeekPerformancePercentile).toBeCloseTo(33.33, 1)
    // IWM (-10): below = 0 → 0/3 * 100 = 0
    expect(result[2]!.twoWeekPerformancePercentile).toBeCloseTo(0, 1)
  })

  // ─── Additional edge cases ─────────────────────────────────────

  it('does not mutate input arrays', () => {
    const latest: EnrichedSnapshotInput[] = [
      makeSnapshot({ symbol: 'SPY', adjustedClose: 110 }),
    ]
    const comparison: EnrichedSnapshotInput[] = [
      makeSnapshot({ symbol: 'SPY', adjustedClose: 100, rotationScore: 60, rotationRank: 1 }),
    ]

    const latestCopy = JSON.parse(JSON.stringify(latest))
    const comparisonCopy = JSON.parse(JSON.stringify(comparison))

    enrichWithComparison(latest, comparison)

    expect(latest).toEqual(latestCopy)
    expect(comparison).toEqual(comparisonCopy)
  })

  it('handles single symbol with full data', () => {
    const latest: EnrichedSnapshotInput[] = [
      makeSnapshot({ symbol: 'SPY', adjustedClose: 105 }),
    ]
    const comparison: EnrichedSnapshotInput[] = [
      makeSnapshot({ symbol: 'SPY', adjustedClose: 100, rotationScore: 60, rotationRank: 1 }),
    ]

    const result = enrichWithComparison(latest, comparison)
    expect(result).toHaveLength(1)
    expect(result[0]!.twoWeekPerformancePct).toBeCloseTo(5, 4)
    expect(result[0]!.twoWeekPerformancePercentile).toBeCloseTo(0, 1) // Only 1 value
    expect(result[0]!.rotationScore).not.toBeNull()
    expect(result[0]!.rotationRank).toBe(1)
  })

  it('calculates rotationScoreDelta2W correctly', () => {
    const latest: EnrichedSnapshotInput[] = [
      makeSnapshot({ symbol: 'SPY', adjustedClose: 110, rsiPercentile: 80, maScorePercentile: 70, distanceFromHighScorePercentile: 60 }),
    ]
    const comparison: EnrichedSnapshotInput[] = [
      makeSnapshot({ symbol: 'SPY', adjustedClose: 100, rotationScore: 50, rotationRank: 1 }),
    ]

    const result = enrichWithComparison(latest, comparison)

    // rotationScoreDelta2W = currentScore - comparisonScore
    expect(result[0]!.rotationScoreDelta2W).not.toBeNull()
    expect(result[0]!.rotationScoreDelta2W).toBeCloseTo(
      result[0]!.rotationScore! - 50,
      4,
    )
  })

  it('returns null rotationScore when any percentile component is missing', () => {
    const latest: EnrichedSnapshotInput[] = [
      makeSnapshot({
        symbol: 'SPY',
        adjustedClose: 110,
        rsiPercentile: null, // missing!
        maScorePercentile: 70,
        distanceFromHighScorePercentile: 60,
      }),
    ]

    const comparison: EnrichedSnapshotInput[] = [
      makeSnapshot({ symbol: 'SPY', adjustedClose: 100, rotationScore: 50, rotationRank: 1 }),
    ]

    const result = enrichWithComparison(latest, comparison)

    expect(result[0]!.twoWeekPerformancePct).toBeCloseTo(10, 4)
    // rotationScore should be null because rsiPercentile is null
    expect(result[0]!.rotationScore).toBeNull()
    expect(result[0]!.rotationRank).toBeNull()
    expect(result[0]!.rotationScoreDelta2W).toBeNull()
    expect(result[0]!.rankDelta2W).toBeNull()
  })

  it('handles duplicate symbols in comparison by using the last one', () => {
    const latest: EnrichedSnapshotInput[] = [
      makeSnapshot({ symbol: 'SPY', adjustedClose: 110 }),
    ]

    const comparison: EnrichedSnapshotInput[] = [
      makeSnapshot({ symbol: 'SPY', adjustedClose: 100, rotationScore: 60, rotationRank: 1 }),
      makeSnapshot({ symbol: 'SPY', adjustedClose: 95, rotationScore: 55, rotationRank: 2 }),
    ]

    const result = enrichWithComparison(latest, comparison)

    // Should use last occurrence (95)
    expect(result[0]!.twoWeekPerformancePct).toBeCloseTo(
      ((110 - 95) / 95) * 100,
      4,
    )
  })
})
