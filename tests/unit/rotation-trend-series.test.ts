import { describe, expect, it } from 'vitest'
import {
  buildNormalizedTrendSeries,
} from '../../packages/domain/src/market-rotation/trend-series'

// ─── buildNormalizedTrendSeries ──────────────────────────────────

describe('buildNormalizedTrendSeries', () => {
  it('normalizes prices relative to comparison date (base = 100)', () => {
    // comparison date price = 100, other days 110 and 105
    const qualifiedDates = ['2026-06-13', '2026-06-14', '2026-06-15']
    const priceMap = new Map<string, number | null>([
      ['SYMBOL:2026-06-13', 100],
      ['SYMBOL:2026-06-14', 110],
      ['SYMBOL:2026-06-15', 105],
    ])

    const result = buildNormalizedTrendSeries({
      symbol: 'SYMBOL',
      qualifiedDates,
      priceBySymbolDate: priceMap,
      comparisonDate: '2026-06-13',
    })

    expect(result).toEqual([
      { date: '2026-06-13', value: 100 },
      { date: '2026-06-14', value: 110 },
      { date: '2026-06-15', value: 105 },
    ])
  })

  it('first point is always 100 (comparison date)', () => {
    const qualifiedDates = ['2026-06-13', '2026-06-15']
    const priceMap = new Map<string, number | null>([
      ['SYMBOL:2026-06-13', 42.5],
      ['SYMBOL:2026-06-15', 85],
    ])

    const result = buildNormalizedTrendSeries({
      symbol: 'SYMBOL',
      qualifiedDates,
      priceBySymbolDate: priceMap,
      comparisonDate: '2026-06-13',
    })

    expect(result[0]!).toEqual({ date: '2026-06-13', value: 100 })
    // 85 / 42.5 * 100 = 200
    expect(result[1]!).toEqual({ date: '2026-06-15', value: 200 })
  })

  it('returns all null values when comparison date price is missing (base = null)', () => {
    const qualifiedDates = ['2026-06-13', '2026-06-14', '2026-06-15']
    const priceMap = new Map<string, number | null>([
      // comparison date entry missing entirely
      ['SYMBOL:2026-06-14', 110],
      ['SYMBOL:2026-06-15', 105],
    ])

    const result = buildNormalizedTrendSeries({
      symbol: 'SYMBOL',
      qualifiedDates,
      priceBySymbolDate: priceMap,
      comparisonDate: '2026-06-13',
    })

    expect(result).toEqual([
      { date: '2026-06-13', value: null },
      { date: '2026-06-14', value: null },
      { date: '2026-06-15', value: null },
    ])
  })

  it('returns all null values when comparison date price is explicitly null', () => {
    const qualifiedDates = ['2026-06-13', '2026-06-15']
    const priceMap = new Map<string, number | null>([
      ['SYMBOL:2026-06-13', null],
      ['SYMBOL:2026-06-15', 105],
    ])

    const result = buildNormalizedTrendSeries({
      symbol: 'SYMBOL',
      qualifiedDates,
      priceBySymbolDate: priceMap,
      comparisonDate: '2026-06-13',
    })

    expect(result).toEqual([
      { date: '2026-06-13', value: null },
      { date: '2026-06-15', value: null },
    ])
  })

  it('returns all null values when base price is zero', () => {
    const qualifiedDates = ['2026-06-13', '2026-06-15']
    const priceMap = new Map<string, number | null>([
      ['SYMBOL:2026-06-13', 0],
      ['SYMBOL:2026-06-15', 105],
    ])

    const result = buildNormalizedTrendSeries({
      symbol: 'SYMBOL',
      qualifiedDates,
      priceBySymbolDate: priceMap,
      comparisonDate: '2026-06-13',
    })

    expect(result).toEqual([
      { date: '2026-06-13', value: null },
      { date: '2026-06-15', value: null },
    ])
  })

  it('produces null for a mid-series missing price while other points compute normally', () => {
    const qualifiedDates = ['2026-06-13', '2026-06-14', '2026-06-15']
    const priceMap = new Map<string, number | null>([
      ['SYMBOL:2026-06-13', 100],
      // 2026-06-14 missing
      ['SYMBOL:2026-06-15', 105],
    ])

    const result = buildNormalizedTrendSeries({
      symbol: 'SYMBOL',
      qualifiedDates,
      priceBySymbolDate: priceMap,
      comparisonDate: '2026-06-13',
    })

    expect(result).toEqual([
      { date: '2026-06-13', value: 100 },
      { date: '2026-06-14', value: null },
      { date: '2026-06-15', value: 105 },
    ])
  })

  it('produces null when a mid-series price is explicitly null', () => {
    const qualifiedDates = ['2026-06-13', '2026-06-14', '2026-06-15']
    const priceMap = new Map<string, number | null>([
      ['SYMBOL:2026-06-13', 100],
      ['SYMBOL:2026-06-14', null],
      ['SYMBOL:2026-06-15', 105],
    ])

    const result = buildNormalizedTrendSeries({
      symbol: 'SYMBOL',
      qualifiedDates,
      priceBySymbolDate: priceMap,
      comparisonDate: '2026-06-13',
    })

    expect(result).toEqual([
      { date: '2026-06-13', value: 100 },
      { date: '2026-06-14', value: null },
      { date: '2026-06-15', value: 105 },
    ])
  })

  it('last point minus 100 equals twoWeekPerformancePct', () => {
    // base = 80, latest = 88 → normalized = 110, performance = +10%
    const qualifiedDates = ['2026-06-13', '2026-06-15']
    const priceMap = new Map<string, number | null>([
      ['SYMBOL:2026-06-13', 80],
      ['SYMBOL:2026-06-15', 88],
    ])

    const result = buildNormalizedTrendSeries({
      symbol: 'SYMBOL',
      qualifiedDates,
      priceBySymbolDate: priceMap,
      comparisonDate: '2026-06-13',
    })

    const lastValue = result[result.length - 1]?.value
    expect(lastValue).toBe(110)
    // twoWeekPerformancePct = lastNormalizedValue - 100
    expect(lastValue! - 100).toBe(10)
  })

  it('handles empty qualifiedDates', () => {
    const result = buildNormalizedTrendSeries({
      symbol: 'SYMBOL',
      qualifiedDates: [],
      priceBySymbolDate: new Map(),
      comparisonDate: '2026-06-13',
    })

    expect(result).toEqual([])
  })

  it('rounds to 4 decimal places (precision contract)', () => {
    // base = 3, price = 10 → 10/3 * 100 = 333.3333...
    const qualifiedDates = ['2026-06-13', '2026-06-15']
    const priceMap = new Map<string, number | null>([
      ['SYMBOL:2026-06-13', 3],
      ['SYMBOL:2026-06-15', 10],
    ])

    const result = buildNormalizedTrendSeries({
      symbol: 'SYMBOL',
      qualifiedDates,
      priceBySymbolDate: priceMap,
      comparisonDate: '2026-06-13',
    })

    expect(result[1]?.value).toBe(333.3333)
  })

  it('handles decimal base and prices correctly', () => {
    // base = 210.30, price = 231.33
    // JS floating point: 231.33 / 210.30 = 1.1000000... → normalized = 110
    const qualifiedDates = ['2026-06-13', '2026-06-15']
    const priceMap = new Map<string, number | null>([
      ['SYMBOL:2026-06-13', 210.30],
      ['SYMBOL:2026-06-15', 231.33],
    ])

    const result = buildNormalizedTrendSeries({
      symbol: 'SYMBOL',
      qualifiedDates,
      priceBySymbolDate: priceMap,
      comparisonDate: '2026-06-13',
    })

    expect(result[0]?.value).toBe(100)
    expect(result[1]?.value).toBe(110)
  })
})
