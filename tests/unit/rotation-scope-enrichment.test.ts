import { describe, expect, it } from 'vitest'
import { enrichScopes } from '../../packages/domain/src/market-rotation/scope-enrichment'
import type { SnapshotData } from '../../packages/domain/src/market-rotation/snapshot-builder'

// ─── Helpers ──────────────────────────────────────────────────

function makeSnapshot(overrides: Partial<SnapshotData> & { symbol: string }): SnapshotData {
  return {
    rankScope: 'sectors',
    groupType: 'sector',
    sectorName: null,
    date: '2025-01-15',
    lastPrice: 100,
    adjustedClose: 100,
    dailyChangePct: 1.5,
    weeklyChangePct: 3.0,
    rsi14: 60,
    ema10: 98,
    ema20: 96,
    sma50: 94,
    sma200: 90,
    above10d: true,
    above20d: true,
    above50d: true,
    above200d: true,
    maScore: 100,
    maStatus: 'bullish_stack',
    rolling252dHigh: 105,
    percentFromHigh: -4.76,
    distanceFromHighScore: 76.2,
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────

describe('enrichScopes', () => {
  it('computes correct percentiles for 3 sector snapshots', () => {
    const snapshots: SnapshotData[] = [
      makeSnapshot({ symbol: 'XLK', rsi14: 80, maScore: 100, distanceFromHighScore: 90 }),
      makeSnapshot({ symbol: 'XLU', rsi14: 40, maScore: 50, distanceFromHighScore: 60 }),
      makeSnapshot({ symbol: 'XLF', rsi14: 60, maScore: 70, distanceFromHighScore: 75 }),
    ]

    const result = enrichScopes(snapshots)

    // XLK has the highest values across the board
    const xlk = result.find(r => r.symbol === 'XLK')!
    expect(xlk.rsiPercentile).toBeCloseTo(66.67, 1)  // 2/3 * 100
    expect(xlk.maScorePercentile).toBeCloseTo(66.67, 1)
    expect(xlk.distanceFromHighScorePercentile).toBeCloseTo(66.67, 1)

    // XLU has the lowest
    const xlu = result.find(r => r.symbol === 'XLU')!
    expect(xlu.rsiPercentile).toBe(0)
    expect(xlu.maScorePercentile).toBe(0)
    expect(xlu.distanceFromHighScorePercentile).toBe(0)

    // XLF is in the middle
    const xlf = result.find(r => r.symbol === 'XLF')!
    expect(xlf.rsiPercentile).toBeCloseTo(33.33, 1) // 1/3 * 100
    expect(xlf.maScorePercentile).toBeCloseTo(33.33, 1)
    expect(xlf.distanceFromHighScorePercentile).toBeCloseTo(33.33, 1)
  })

  it('handles partial null rsi14 — only non-null values used for percentile, null snapshot gets null percentile', () => {
    const snapshots: SnapshotData[] = [
      makeSnapshot({ symbol: 'XLK', rsi14: 80, maScore: 100, distanceFromHighScore: 90 }),
      makeSnapshot({ symbol: 'XLU', rsi14: null, maScore: 50, distanceFromHighScore: 60 }),
      makeSnapshot({ symbol: 'XLF', rsi14: 40, maScore: 70, distanceFromHighScore: 75 }),
    ]

    const result = enrichScopes(snapshots)

    const xlk = result.find(r => r.symbol === 'XLK')!
    expect(xlk.rsiPercentile).toBe(50) // 1 out of 2 non-null is below (40 < 80)

    const xlu = result.find(r => r.symbol === 'XLU')!
    expect(xlu.rsiPercentile).toBeNull() // rsi14 is null → percentile is null

    const xlf = result.find(r => r.symbol === 'XLF')!
    expect(xlf.rsiPercentile).toBe(0) // no non-null value is below 40
  })

  it('returns all null percentiles and null rotationScore when all indicators are null', () => {
    const snapshots: SnapshotData[] = [
      makeSnapshot({
        symbol: 'XLK',
        rsi14: null,
        maScore: 0,         // maScore is never null in SnapshotData
        distanceFromHighScore: null,
      }),
      makeSnapshot({
        symbol: 'XLU',
        rsi14: null,
        maScore: 0,
        distanceFromHighScore: null,
      }),
    ]

    const result = enrichScopes(snapshots)

    for (const r of result) {
      expect(r.rsiPercentile).toBeNull()
      expect(r.distanceFromHighScorePercentile).toBeNull()
      expect(r.rotationScore).toBeNull()
    }

    // maScore is always a number, so maScorePercentile should still be computed
    // (both are 0, so percentile is 0)
    expect(result[0]!.maScorePercentile).toBe(0)
    expect(result[1]!.maScorePercentile).toBe(0)
  })

  it('returns empty array for empty input', () => {
    expect(enrichScopes([])).toEqual([])
  })

  it('returns percentile 0 for a single snapshot (only itself)', () => {
    const snapshots: SnapshotData[] = [
      makeSnapshot({ symbol: 'SPY', rsi14: 55, maScore: 80, distanceFromHighScore: 70 }),
    ]

    const result = enrichScopes(snapshots)

    expect(result).toHaveLength(1)
    expect(result[0]!.rsiPercentile).toBe(0)
    expect(result[0]!.maScorePercentile).toBe(0)
    expect(result[0]!.distanceFromHighScorePercentile).toBe(0)
  })

  it('sets rotationScore to null because twoWeekPerformancePercentile is missing', () => {
    const snapshots: SnapshotData[] = [
      makeSnapshot({ symbol: 'XLK', rsi14: 80, maScore: 100, distanceFromHighScore: 90 }),
      makeSnapshot({ symbol: 'XLU', rsi14: 40, maScore: 50, distanceFromHighScore: 60 }),
    ]

    const result = enrichScopes(snapshots)

    for (const r of result) {
      expect(r.rotationScore).toBeNull()
    }
  })

  it('sets rotationRank to null for all snapshots', () => {
    const snapshots: SnapshotData[] = [
      makeSnapshot({ symbol: 'XLK', rsi14: 80, maScore: 100, distanceFromHighScore: 90 }),
      makeSnapshot({ symbol: 'XLU', rsi14: 40, maScore: 50, distanceFromHighScore: 60 }),
    ]

    const result = enrichScopes(snapshots)

    for (const r of result) {
      expect(r.rotationRank).toBeNull()
    }
  })

  it('preserves all original SnapshotData fields', () => {
    const original: SnapshotData = makeSnapshot({
      symbol: 'XLK',
      rankScope: 'sectors',
      groupType: 'sector',
      sectorName: 'Technology',
      date: '2025-03-01',
      lastPrice: 250.5,
      adjustedClose: 248.3,
      dailyChangePct: 1.23,
      weeklyChangePct: -0.5,
      rsi14: 65,
      ema10: 245,
      ema20: 240,
      sma50: 235,
      sma200: 220,
      above10d: true,
      above20d: true,
      above50d: false,
      above200d: true,
      maScore: 50,
      maStatus: 'short_term_weakness',
      rolling252dHigh: 260,
      percentFromHigh: -3.65,
      distanceFromHighScore: 81.75,
    })

    const result = enrichScopes([original])

    expect(result).toHaveLength(1)
    const enriched = result[0]!

    // All original fields must be preserved exactly
    expect(enriched.symbol).toBe('XLK')
    expect(enriched.rankScope).toBe('sectors')
    expect(enriched.groupType).toBe('sector')
    expect(enriched.sectorName).toBe('Technology')
    expect(enriched.date).toBe('2025-03-01')
    expect(enriched.lastPrice).toBe(250.5)
    expect(enriched.adjustedClose).toBe(248.3)
    expect(enriched.dailyChangePct).toBe(1.23)
    expect(enriched.weeklyChangePct).toBe(-0.5)
    expect(enriched.rsi14).toBe(65)
    expect(enriched.ema10).toBe(245)
    expect(enriched.ema20).toBe(240)
    expect(enriched.sma50).toBe(235)
    expect(enriched.sma200).toBe(220)
    expect(enriched.above10d).toBe(true)
    expect(enriched.above20d).toBe(true)
    expect(enriched.above50d).toBe(false)
    expect(enriched.above200d).toBe(true)
    expect(enriched.maScore).toBe(50)
    expect(enriched.maStatus).toBe('short_term_weakness')
    expect(enriched.rolling252dHigh).toBe(260)
    expect(enriched.percentFromHigh).toBe(-3.65)
    expect(enriched.distanceFromHighScore).toBe(81.75)
  })

  // ─── T2: core scope splits into core_etf vs mega_cap/single_stock pools ──

  describe('core scope pool splitting (T2)', () => {
    it('computes percentiles independently for core_etf vs mega_cap pools within core scope', () => {
      // core_etf pool: SPY=80, QQQ=60
      // mega_cap pool: NVDA=95, MSFT=50
      // calculatePercentile = below / total * 100 (total includes self)
      // Pools split → SPY pool = [80, 60]; SPY below = 1 (QQQ), total = 2 → 50
      //              NVDA pool = [95, 50]; NVDA below = 1 (MSFT), total = 2 → 50
      // Legacy single pool (4 entries): SPY below = 2 (QQQ, MSFT), total = 4 → 50
      // The split is observable when ETF vs stock outliers differ — see next test.
      const snapshots: SnapshotData[] = [
        makeSnapshot({ symbol: 'SPY', rankScope: 'core', groupType: 'core_etf', rsi14: 80, maScore: 90, distanceFromHighScore: 80 }),
        makeSnapshot({ symbol: 'QQQ', rankScope: 'core', groupType: 'core_etf', rsi14: 60, maScore: 70, distanceFromHighScore: 70 }),
        makeSnapshot({ symbol: 'NVDA', rankScope: 'core', groupType: 'mega_cap', rsi14: 95, maScore: 100, distanceFromHighScore: 95 }),
        makeSnapshot({ symbol: 'MSFT', rankScope: 'core', groupType: 'mega_cap', rsi14: 50, maScore: 60, distanceFromHighScore: 60 }),
      ]

      const result = enrichScopes(snapshots)

      const spy = result.find(r => r.symbol === 'SPY')!
      const nvda = result.find(r => r.symbol === 'NVDA')!

      // Split pool: SPY top of 2-entry core_etf pool → 1/2 = 50
      expect(spy.rsiPercentile).toBe(50)
      // Split pool: NVDA top of 2-entry mega_cap pool → 1/2 = 50
      expect(nvda.rsiPercentile).toBe(50)
    })

    it('observable split effect: low ETF vs high stock without cross-contamination', () => {
      // Legacy single pool (4 entries): XLP rsi=40, XLU rsi=35, NVDA rsi=90, TSLA rsi=85
      //   XLP below = 2 (XLU only below, but NVDA/TSLA are above) → wait recalc.
      //   values=[40,35,90,85]; XLP(40): below=1 (XLU), total=4 → 25
      // Split pools: core_etf=[40,35]; mega_cap_stock=[90,85]
      //   XLP: below=1 (XLU), total=2 → 50  ← higher than legacy 25
      //   NVDA: below=1 (TSLA), total=2 → 50  ← lower than legacy 75
      // The pool split changes relative position: defensive ETF is no longer
      // dragged down by mega-cap outliers.
      const snapshots: SnapshotData[] = [
        makeSnapshot({ symbol: 'XLP', rankScope: 'core', groupType: 'core_etf', rsi14: 40, maScore: 50, distanceFromHighScore: 40 }),
        makeSnapshot({ symbol: 'XLU', rankScope: 'core', groupType: 'core_etf', rsi14: 35, maScore: 40, distanceFromHighScore: 35 }),
        makeSnapshot({ symbol: 'NVDA', rankScope: 'core', groupType: 'mega_cap', rsi14: 90, maScore: 100, distanceFromHighScore: 90 }),
        makeSnapshot({ symbol: 'TSLA', rankScope: 'core', groupType: 'mega_cap', rsi14: 85, maScore: 90, distanceFromHighScore: 85 }),
      ]

      const result = enrichScopes(snapshots)

      const xlp = result.find(r => r.symbol === 'XLP')!
      const nvda = result.find(r => r.symbol === 'NVDA')!

      // Split pool: XLP top of 2-entry core_etf pool → 1/2 = 50
      expect(xlp.rsiPercentile).toBe(50)
      // Split pool: NVDA top of 2-entry mega_cap pool → 1/2 = 50
      expect(nvda.rsiPercentile).toBe(50)
    })

    it('treats mega_cap and single_stock as the same pool', () => {
      // mega_cap + single_stock combined pool: NVDA=90, PLTR=70
      // NVDA: below=1 (PLTR), total=2 → 50
      // PLTR: below=0, total=2 → 0
      const snapshots: SnapshotData[] = [
        makeSnapshot({ symbol: 'NVDA', rankScope: 'core', groupType: 'mega_cap', rsi14: 90, maScore: 100, distanceFromHighScore: 90 }),
        makeSnapshot({ symbol: 'PLTR', rankScope: 'core', groupType: 'single_stock', rsi14: 70, maScore: 80, distanceFromHighScore: 75 }),
      ]

      const result = enrichScopes(snapshots)
      const nvda = result.find(r => r.symbol === 'NVDA')!
      const pltr = result.find(r => r.symbol === 'PLTR')!

      expect(nvda.rsiPercentile).toBe(50)
      expect(pltr.rsiPercentile).toBe(0)
    })

    it('keeps sectors / indexes scopes unaffected (no pool splitting)', () => {
      const snapshots: SnapshotData[] = [
        makeSnapshot({ symbol: 'XLK', rankScope: 'sectors', groupType: 'sector', rsi14: 80 }),
        makeSnapshot({ symbol: 'XLU', rankScope: 'sectors', groupType: 'sector', rsi14: 40 }),
        makeSnapshot({ symbol: 'XLF', rankScope: 'sectors', groupType: 'sector', rsi14: 60 }),
      ]

      const result = enrichScopes(snapshots)
      const xlk = result.find(r => r.symbol === 'XLK')!

      // Legacy single-pool behavior: 2 out of 3 below → 66.67
      expect(xlk.rsiPercentile).toBeCloseTo(66.67, 1)
    })

    it('returns empty array for empty core scope input', () => {
      expect(enrichScopes([])).toEqual([])
    })
  })
})
