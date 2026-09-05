import { describe, expect, it } from 'vitest'
import { runSnapshotPipeline, type SymbolPrices } from '../../packages/domain/src/market-rotation/pipeline'
import type { EnrichedSnapshotInput } from '../../packages/domain/src/market-rotation/comparison-enrichment'
import type { DailyPrice } from '../../packages/domain/src/market-rotation/snapshot-builder'

// ─── Test helpers ────────────────────────────────────────────────

function makeTrendingPrices(baseDate: string, days: number, startPrice: number, trend: number): DailyPrice[] {
  const prices: DailyPrice[] = []
  const date = new Date(baseDate)

  for (let i = 0; i < days; i++) {
    const d = new Date(date)
    d.setDate(d.getDate() + i)
    const price = startPrice + trend * i
    prices.push({
      date: d.toISOString().slice(0, 10),
      close: price,
      adjustedClose: price,
    })
  }

  return prices
}

// Simulate a persisted comparison snapshot from DB (with full rotationScore/rank)
function makeComparisonSnapshot(
  symbol: string,
  adjustedClose: number,
  rsi14: number,
  maStatus: string,
  rotationScore: number,
  rotationRank: number,
): EnrichedSnapshotInput {
  return {
    symbol,
    rankScope: 'sectors',
    adjustedClose,
    rsi14,
    rsiPercentile: 50,
    maScore: 50,
    maScorePercentile: 50,
    distanceFromHighScore: 80,
    distanceFromHighScorePercentile: 60,
    rotationScore,
    rotationRank,
    maStatus,
    percentFromHigh: -5,
  }
}

// ─── Tests ───────────────────────────────────────────────────────

describe('runSnapshotPipeline', () => {
  it('builds and enriches snapshots without comparison data', () => {
    const symbolPrices: SymbolPrices[] = [
      {
        meta: { symbol: 'XLK', rankScope: 'sectors', groupType: 'sector', sectorName: 'Technology' },
        prices: makeTrendingPrices('2026-01-01', 60, 100, 0.5),
      },
      {
        meta: { symbol: 'XLU', rankScope: 'sectors', groupType: 'sector', sectorName: 'Utilities' },
        prices: makeTrendingPrices('2026-01-01', 60, 80, -0.3),
      },
    ]

    const result = runSnapshotPipeline(symbolPrices)

    // Step 1: Raw snapshots
    expect(result.snapshots).toHaveLength(2)
    expect(result.snapshots[0]!.symbol).toBe('XLK')
    expect(result.snapshots[1]!.symbol).toBe('XLU')

    // Step 2: Enriched with percentiles
    expect(result.enriched).toHaveLength(2)
    expect(result.enriched[0]!.rsiPercentile).not.toBeNull()

    // Step 3: No comparison → 2W fields null
    expect(result.latest).toHaveLength(2)
    expect(result.latest[0]!.twoWeekPerformancePct).toBeNull()
    expect(result.latest[0]!.signal).toBeNull()
    expect(result.latest[0]!.signalStatus).toBe('insufficient_data')
  })

  it('runs full pipeline with persisted comparison snapshots', () => {
    const latestPrices: SymbolPrices[] = [
      {
        meta: { symbol: 'XLK', rankScope: 'sectors', groupType: 'sector', sectorName: 'Technology' },
        prices: makeTrendingPrices('2026-01-01', 60, 100, 0.5),
      },
      {
        meta: { symbol: 'XLU', rankScope: 'sectors', groupType: 'sector', sectorName: 'Utilities' },
        prices: makeTrendingPrices('2026-01-01', 60, 80, -0.3),
      },
    ]

    // Comparison: persisted snapshots from 2 weeks ago
    const comparisonSnapshots: EnrichedSnapshotInput[] = [
      makeComparisonSnapshot('XLK', 90, 55, 'healthy_pullback', 60, 2),
      makeComparisonSnapshot('XLU', 82, 48, 'neutral', 55, 1),
    ]

    const result = runSnapshotPipeline(latestPrices, comparisonSnapshots)

    // 2W performance should be computed
    expect(result.latest).toHaveLength(2)
    const xlk = result.latest.find(s => s.symbol === 'XLK')!
    expect(xlk.twoWeekPerformancePct).not.toBeNull()
    expect(xlk.twoWeekPerformancePercentile).not.toBeNull()

    // Rotation score should be computed (all 4 components available)
    expect(xlk.rotationScore).not.toBeNull()
    expect(xlk.rotationRank).not.toBeNull()

    // Signal should be computed
    expect(xlk.signalStatus).toBe('complete')
    expect(xlk.signal).not.toBeNull()
  })

  it('skips symbols with empty prices', () => {
    const symbolPrices: SymbolPrices[] = [
      {
        meta: { symbol: 'XLK', rankScope: 'sectors', groupType: 'sector', sectorName: 'Technology' },
        prices: makeTrendingPrices('2026-01-01', 60, 100, 0.5),
      },
      {
        meta: { symbol: 'XLU', rankScope: 'sectors', groupType: 'sector', sectorName: 'Utilities' },
        prices: [], // empty
      },
    ]

    const result = runSnapshotPipeline(symbolPrices)

    expect(result.snapshots).toHaveLength(1)
    expect(result.snapshots[0]!.symbol).toBe('XLK')
  })

  it('handles empty input', () => {
    const result = runSnapshotPipeline([])

    expect(result.snapshots).toEqual([])
    expect(result.enriched).toEqual([])
    expect(result.latest).toEqual([])
  })

  it('computes rankDelta2W with correct sign (positive = improving)', () => {
    // XLK trending up strongly → should have better rank in latest
    // XLU trending down → should have worse rank in latest
    const latestPrices: SymbolPrices[] = [
      {
        meta: { symbol: 'XLK', rankScope: 'sectors', groupType: 'sector', sectorName: 'Technology' },
        prices: makeTrendingPrices('2026-01-01', 60, 100, 1.0),
      },
      {
        meta: { symbol: 'XLU', rankScope: 'sectors', groupType: 'sector', sectorName: 'Utilities' },
        prices: makeTrendingPrices('2026-01-01', 60, 100, -1.0),
      },
    ]

    // Comparison: XLU was rank 1 (stronger), XLK was rank 2 (weaker)
    const comparisonSnapshots: EnrichedSnapshotInput[] = [
      makeComparisonSnapshot('XLK', 100, 45, 'short_term_weakness', 40, 2),
      makeComparisonSnapshot('XLU', 100, 60, 'bullish_stack', 70, 1),
    ]

    const result = runSnapshotPipeline(latestPrices, comparisonSnapshots)

    const xlk = result.latest.find(s => s.symbol === 'XLK')!
    const xlu = result.latest.find(s => s.symbol === 'XLU')!

    // XLK improved (was rank 2, now rank 1)
    // rankDelta2W = comparisonRank - currentRank = 2 - 1 = 1 (positive)
    expect(xlk.rankDelta2W).toBeGreaterThan(0)
    // XLU weakened (was rank 1, now rank 2)
    // rankDelta2W = 1 - 2 = -1 (negative)
    expect(xlu.rankDelta2W).toBeLessThan(0)
  })

  it('preserves all original snapshot fields through the pipeline', () => {
    const symbolPrices: SymbolPrices[] = [
      {
        meta: { symbol: 'XLK', rankScope: 'sectors', groupType: 'sector', sectorName: 'Technology' },
        prices: makeTrendingPrices('2026-01-01', 60, 100, 0.5),
      },
    ]

    const result = runSnapshotPipeline(symbolPrices)
    const final = result.latest[0]!

    // Original fields from buildSnapshot
    expect(final.symbol).toBe('XLK')
    expect(final.rankScope).toBe('sectors')
    expect(final.groupType).toBe('sector')
    expect(final.sectorName).toBe('Technology')
    expect(final.lastPrice).not.toBeNull()
    expect(final.rsi14).not.toBeNull()
    expect(final.ema10).not.toBeNull()

    // Enriched fields
    expect(final).toHaveProperty('rsiPercentile')
    expect(final).toHaveProperty('maScorePercentile')
    expect(final).toHaveProperty('distanceFromHighScorePercentile')
  })
})
