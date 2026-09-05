import { describe, expect, it } from 'vitest'
import type { MarketRotationMonitorRow } from '../../packages/domain/src/market-rotation/monitor'
import { compareRotationRows, filterAndSortRotationRows } from '../../packages/domain/src/market-rotation/view'

function row(overrides: Partial<MarketRotationMonitorRow> = {}): MarketRotationMonitorRow {
  return {
    symbol: 'AAA', name: 'AAA', groupType: 'sector', sectorName: 'Technology', lastPrice: 100,
    rsi14: 55, above20d: true, above50d: true, maStatus: 'bullish_stack', percentFromHigh: -2,
    rotationScore: 90, rotationScoreDelta2W: 4, rotationRank: 1, rankDelta2W: 2, rsiDelta2W: 3,
    twoWeekPerformancePct: 5, twoWeekTrend: [], signal: 'turning_strong', signalStatus: 'complete',
    ...overrides,
  }
}

describe('market rotation view controls', () => {
  it('filters every source filter against row fields', () => {
    const rows = [
      row({ symbol: 'UP', rankDelta2W: 2, above50d: true, percentFromHigh: -2, signal: 'turning_strong' }),
      row({ symbol: 'DOWN', rankDelta2W: -2, above50d: false, percentFromHigh: -12, signal: 'losing_momentum' }),
      row({ symbol: 'EXT', rankDelta2W: 0, percentFromHigh: -1, signal: 'strong_but_extended' }),
    ]
    expect(filterAndSortRotationRows(rows, 'turning_strong', 'symbol', 'asc').map(item => item.symbol)).toEqual(['UP'])
    expect(filterAndSortRotationRows(rows, 'losing_momentum', 'symbol', 'asc').map(item => item.symbol)).toEqual(['DOWN'])
    expect(filterAndSortRotationRows(rows, 'rank_up', 'symbol', 'asc').map(item => item.symbol)).toEqual(['UP'])
    expect(filterAndSortRotationRows(rows, 'rank_down', 'symbol', 'asc').map(item => item.symbol)).toEqual(['DOWN'])
    expect(filterAndSortRotationRows(rows, 'above_50d', 'symbol', 'asc').map(item => item.symbol)).toEqual(['EXT', 'UP'])
    expect(filterAndSortRotationRows(rows, 'below_50d', 'symbol', 'asc').map(item => item.symbol)).toEqual(['DOWN'])
    expect(filterAndSortRotationRows(rows, 'near_high', 'symbol', 'asc').map(item => item.symbol)).toEqual(['EXT', 'UP'])
    expect(filterAndSortRotationRows(rows, 'extended', 'symbol', 'asc').map(item => item.symbol)).toEqual(['EXT'])
  })

  it('keeps nulls explicit and ties stable by symbol in either direction', () => {
    const rows = [row({ symbol: 'ZZZ', rsi14: null }), row({ symbol: 'AAA', rsi14: null }), row({ symbol: 'MID', rsi14: 50 })]
    expect(filterAndSortRotationRows(rows, 'all', 'rsi14', 'asc').map(item => item.symbol)).toEqual(['AAA', 'ZZZ', 'MID'])
    expect(filterAndSortRotationRows(rows, 'all', 'rsi14', 'desc').map(item => item.symbol)).toEqual(['MID', 'AAA', 'ZZZ'])
    expect(compareRotationRows(row({ symbol: 'AAA', rotationRank: null }), row({ symbol: 'BBB', rotationRank: null }), 'rotationRank', 'asc')).toBeLessThan(0)
    expect(compareRotationRows(row({ symbol: 'AAA', rotationRank: null }), row({ symbol: 'BBB', rotationRank: null }), 'rotationRank', 'desc')).toBeLessThan(0)
  })
})
