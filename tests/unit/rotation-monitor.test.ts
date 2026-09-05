import { describe, expect, it } from 'vitest'
import { buildMarketRotationMonitorPayload } from '../../packages/domain/src/market-rotation/monitor'
import type { MarketRotationMonitorRow } from '../../packages/domain/src/market-rotation/monitor'

/** Helper to build a minimal row with sensible defaults. */
function makeRow(overrides: Partial<MarketRotationMonitorRow> & { symbol: string }): MarketRotationMonitorRow {
  return {
    name: overrides.symbol,
    groupType: 'sector',
    sectorName: null,
    lastPrice: null,
    rsi14: null,
    above20d: null,
    above50d: null,
    maStatus: 'unknown',
    percentFromHigh: null,
    rotationScore: null,
    rotationScoreDelta2W: null,
    rotationRank: null,
    rankDelta2W: null,
    rsiDelta2W: null,
    twoWeekPerformancePct: null,
    twoWeekTrend: [],
    signal: null,
    signalStatus: 'insufficient_data',
    ...overrides,
  }
}

describe('buildMarketRotationMonitorPayload', () => {
  it('builds a sectors dashboard payload from latest snapshot rows', () => {
    const payload = buildMarketRotationMonitorPayload({
      asOfDate: '2026-06-09',
      comparisonDate: '2026-05-22',
      rankScope: 'sectors',
      marketState: 'risk_on',
      rows: [
        {
          symbol: 'XLK',
          name: 'Technology Select Sector SPDR Fund',
          groupType: 'sector',
          sectorName: 'Technology',
          lastPrice: 252.34,
          rsi14: 71.2,
          above20d: true,
          above50d: true,
          maStatus: 'bullish_stack',
          percentFromHigh: -2.1,
          rotationScore: 92.4,
          rotationScoreDelta2W: 9.1,
          rotationRank: 1,
          rankDelta2W: 3,
          rsiDelta2W: 6.2,
          twoWeekPerformancePct: 4.8,
          twoWeekTrend: [],
          signal: 'strong_but_extended',
          signalStatus: 'complete',
        },
        {
          symbol: 'XLF',
          name: 'Financial Select Sector SPDR Fund',
          groupType: 'sector',
          sectorName: 'Financials',
          lastPrice: 51.22,
          rsi14: 58.3,
          above20d: true,
          above50d: true,
          maStatus: 'healthy_pullback',
          percentFromHigh: -5.5,
          rotationScore: 77.1,
          rotationScoreDelta2W: 2.4,
          rotationRank: 2,
          rankDelta2W: 1,
          rsiDelta2W: 1.1,
          twoWeekPerformancePct: 1.9,
          twoWeekTrend: [],
          signal: 'neutral',
          signalStatus: 'complete',
        },
        {
          symbol: 'XLU',
          name: 'Utilities Select Sector SPDR Fund',
          groupType: 'sector',
          sectorName: 'Utilities',
          lastPrice: 69.87,
          rsi14: 38.5,
          above20d: false,
          above50d: false,
          maStatus: 'breakdown',
          percentFromHigh: -11.4,
          rotationScore: 21.2,
          rotationScoreDelta2W: -12.8,
          rotationRank: 3,
          rankDelta2W: -2,
          rsiDelta2W: -7.5,
          twoWeekPerformancePct: -3.2,
          twoWeekTrend: [],
          signal: 'breaking_down',
          signalStatus: 'complete',
        },
      ],
    })

    expect(payload.summary).toEqual({
      marketState: 'risk_on',
      breadthCondition: 'constructive',
      breadthConfirmation: 'confirming',
      above20d: { count: 2, total: 3, ratio: 0.6667 },
      above50d: { count: 2, total: 3, ratio: 0.6667 },
      averageRsi: 56,
    })
    expect(payload).toMatchObject({
      asOfDate: '2026-06-09',
      comparisonDate: '2026-05-22',
      rankScope: 'sectors',
      marketState: 'risk_on',
      breadthCondition: 'constructive',
      breadthConfirmation: 'confirming',
    })
    expect(payload.summaryCards.marketState).toBe('risk_on')
    expect(payload.charts.topImproving.map(row => row.symbol)).toEqual(['XLK', 'XLF'])

    expect(payload.rows.map(row => row.symbol)).toEqual(['XLK', 'XLF', 'XLU'])
    expect(payload.rows[0]!).toMatchObject({
      symbol: 'XLK',
      rankDelta2W: 3,
      signal: 'strong_but_extended',
    })
    expect(payload.topImproving.map(row => row.symbol)).toEqual(['XLK', 'XLF'])
    expect(payload.bottomWeakening.map(row => row.symbol)).toEqual(['XLU'])
    expect(payload.dataQuality).toEqual({
      asOfDate: '2026-06-09',
      comparisonDate: '2026-05-22',
      rankScope: 'sectors',
      rowCount: 3,
      completeSignalCount: 3,
      coverageRatio: 0.2727,
      isQualified: false,
      expectedSymbolCount: 11,
      actualSymbolCount: 3,
      scoreVersion: 'v1',
    })
  })

  // --- Boundary: empty rows ---

  it('handles empty rows array with null summary metrics', () => {
    const payload = buildMarketRotationMonitorPayload({
      asOfDate: '2026-06-09',
      comparisonDate: '2026-05-22',
      rankScope: 'sectors',
      marketState: 'risk_on',
      rows: [],
    })

    expect(payload.summary.averageRsi).toBeNull()
    expect(payload.rows).toEqual([])
    expect(payload.topImproving).toEqual([])
    expect(payload.bottomWeakening).toEqual([])
    expect(payload.dataQuality.rowCount).toBe(0)
  })

  // --- Boundary: null comparisonDate ---

  it('passes null comparisonDate through to dataQuality', () => {
    const payload = buildMarketRotationMonitorPayload({
      asOfDate: '2026-06-09',
      comparisonDate: null,
      rankScope: 'sectors',
      marketState: 'neutral',
      rows: [],
    })

    expect(payload.dataQuality.comparisonDate).toBeNull()
  })

  it('uses sector summary rows for breadth cards when active rank scope is not sectors', () => {
    const payload = buildMarketRotationMonitorPayload({
      asOfDate: '2026-06-09',
      comparisonDate: '2026-05-22',
      rankScope: 'indexes',
      marketState: 'risk_on',
      rows: [
        makeRow({ symbol: 'SPY', groupType: 'index', rotationRank: 1, above50d: false, rsi14: 40 }),
        makeRow({ symbol: 'QQQ', groupType: 'index', rotationRank: 2, above50d: false, rsi14: 42 }),
      ],
      summaryRows: [
        makeRow({ symbol: 'XLK', above20d: true, above50d: true, rsi14: 70 }),
        makeRow({ symbol: 'XLF', above20d: true, above50d: true, rsi14: 60 }),
        makeRow({ symbol: 'XLU', above20d: false, above50d: false, rsi14: 50 }),
      ],
    })

    expect(payload.rows.map(row => row.symbol)).toEqual(['SPY', 'QQQ'])
    expect(payload.summary.above50d).toEqual({ count: 2, total: 3, ratio: 0.6667 })
    expect(payload.summary.averageRsi).toBe(60)
  })

  it('keeps the summary date null when a non-sector scope has no sector summary', () => {
    const payload = buildMarketRotationMonitorPayload({
      asOfDate: '2026-06-09',
      comparisonDate: null,
      summaryAsOfDate: null,
      rankScope: 'core',
      marketState: 'unknown',
      rows: [makeRow({ symbol: 'SPY', groupType: 'core_etf', rotationRank: 1 })],
      summaryRows: [],
    })

    expect(payload.summaryAsOfDate).toBeNull()
  })

  it('uses the active observation date for a sector summary', () => {
    const payload = buildMarketRotationMonitorPayload({
      asOfDate: '2026-06-09',
      comparisonDate: null,
      rankScope: 'sectors',
      marketState: 'unknown',
      rows: [makeRow({ symbol: 'XLK', rotationRank: 1 })],
    })

    expect(payload.summaryAsOfDate).toBe('2026-06-09')
  })

  // --- Boundary: rows with null rotationRank (and null rankDelta2W) excluded from topImproving / bottomWeakening ---

  it('excludes rows with null rotationRank and null rankDelta2W from topImproving and bottomWeakening', () => {
    const payload = buildMarketRotationMonitorPayload({
      asOfDate: '2026-06-09',
      comparisonDate: '2026-05-22',
      rankScope: 'sectors',
      marketState: 'risk_on',
      rows: [
        makeRow({ symbol: 'XLK', rotationRank: null, rankDelta2W: null }),
        makeRow({ symbol: 'XLF', rotationRank: null, rankDelta2W: null }),
      ],
    })

    // Both rows have null rankDelta2W, so they cannot satisfy > 0 or < 0 filters
    expect(payload.topImproving).toEqual([])
    expect(payload.bottomWeakening).toEqual([])
  })

  // --- Boundary: tie-breaking by rotationScoreDelta2W ---

  it('breaks ties in topImproving by rotationScoreDelta2W when rankDelta2W is equal', () => {
    const payload = buildMarketRotationMonitorPayload({
      asOfDate: '2026-06-09',
      comparisonDate: '2026-05-22',
      rankScope: 'sectors',
      marketState: 'risk_on',
      rows: [
        makeRow({ symbol: 'XLB', rankDelta2W: 2, rotationScoreDelta2W: 5 }),
        makeRow({ symbol: 'XLK', rankDelta2W: 2, rotationScoreDelta2W: 10 }),
        makeRow({ symbol: 'XLU', rankDelta2W: -3, rotationScoreDelta2W: -5 }),
      ],
    })

    // Both XLB and XLK have rankDelta2W=2, tie-break by rotationScoreDelta2W descending
    expect(payload.topImproving.map(r => r.symbol)).toEqual(['XLK', 'XLB'])
  })
})
