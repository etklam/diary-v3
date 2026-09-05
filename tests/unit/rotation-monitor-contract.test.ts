import { describe, expect, it } from 'vitest'
import {
  marketRotationMonitorQuerySchema,
  marketRotationMonitorResponseSchema,
  marketRotationMonitorRowSchema,
} from '../../packages/contracts/src/rotation-monitor.js'

const ratio = { count: 0, total: 0, ratio: null }
const summary = {
  marketState: 'unknown', breadthCondition: 'unknown', breadthConfirmation: 'unknown',
  above20d: ratio, above50d: ratio, averageRsi: null,
}
const fixture = {
  asOfDate: '2026-09-04', comparisonDate: null, marketStateAsOfDate: null, summaryAsOfDate: '2026-09-04', rankScope: 'sectors',
  marketState: 'unknown', breadthCondition: 'unknown', breadthConfirmation: 'unknown',
  summary,
  summaryCards: { above20d: ratio, above50d: ratio, averageRsi: null, marketState: 'unknown' },
  charts: { topImproving: [], bottomWeakening: [] },
  rows: [], topImproving: [], bottomWeakening: [],
  dataQuality: {
    asOfDate: '2026-09-04', comparisonDate: null, rankScope: 'sectors', rowCount: 0,
    completeSignalCount: 0, coverageRatio: 0, isQualified: false,
    expectedSymbolCount: 11, actualSymbolCount: 0, scoreVersion: 'v1',
  },
  currentMarketSummary: 'Insufficient data',
}
const row = {
  symbol: 'SPY', name: 'Fixture ETF', groupType: 'core_etf', sectorName: null,
  lastPrice: 123.456789, rsi14: null, above20d: null, above50d: null,
  maStatus: 'unknown', percentFromHigh: null, rotationScore: null,
  rotationScoreDelta2W: null, rotationRank: null, rankDelta2W: null,
  rsiDelta2W: null, twoWeekPerformancePct: null,
  twoWeekTrend: [{ date: '2026-09-04', value: null }],
  signal: null, signalStatus: 'insufficient_data',
}

describe('rotation monitor wire contract', () => {
  it('defaults to sectors and validates all supported scopes strictly', () => {
    expect(marketRotationMonitorQuerySchema.parse({})).toEqual({ scope: 'sectors' })
    for (const scope of ['sectors', 'indexes', 'core']) {
      expect(marketRotationMonitorQuerySchema.parse({ scope })).toEqual({ scope })
    }
    for (const query of [{ scope: 'all' }, { scope: ['core'] }, { extra: true }]) {
      expect(marketRotationMonitorQuerySchema.safeParse(query).success).toBe(false)
    }
  })

  it('accepts the complete source response and requires its compatibility fields', () => {
    expect(marketRotationMonitorResponseSchema.parse(fixture)).toEqual(fixture)
    const populated = { ...fixture, rows: [row], topImproving: [row], charts: { topImproving: [row], bottomWeakening: [] } }
    expect(marketRotationMonitorResponseSchema.parse(populated)).toEqual(populated)
    expect(marketRotationMonitorResponseSchema.safeParse({ ...fixture, summaryCards: undefined }).success).toBe(false)
    expect(marketRotationMonitorResponseSchema.safeParse({ ...fixture, asOfDate: '2026-02-30' }).success).toBe(false)
  })

  it('preserves nullable finite analytics and all source group types without rounding', () => {
    for (const groupType of ['sector', 'index', 'core', 'core_etf', 'mega_cap', 'single_stock']) {
      expect(marketRotationMonitorRowSchema.parse({ ...row, groupType }).lastPrice).toBe(123.456789)
    }
    for (const lastPrice of [Infinity, NaN, '123.456789']) {
      expect(marketRotationMonitorRowSchema.safeParse({ ...row, lastPrice }).success).toBe(false)
    }
    expect(marketRotationMonitorRowSchema.safeParse({ ...row, rotationRank: -1 }).success).toBe(false)
    expect(marketRotationMonitorRowSchema.safeParse({ ...row, rotationRank: 0 }).success).toBe(false)
    expect(marketRotationMonitorRowSchema.safeParse({ ...row, twoWeekTrend: [{ date: '2026-02-30', value: 1 }] }).success).toBe(false)
  })
})
