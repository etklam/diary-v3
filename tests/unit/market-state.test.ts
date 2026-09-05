import { describe, expect, it } from 'vitest'
import { calcAboveMaPct, calcRatioNDaily, countMove4Pct } from '../../packages/domain/src/market-state/breadth'
import { determineRegime } from '../../packages/domain/src/market-state/regime'
import { calculateBreadthRows, parseDailyPrices } from '../../packages/domain/src/market-state/update-breadth-utils'
import { uniqueSymbols } from '../../packages/domain/src/market-state/seed-universe-utils'

const warmupSymbols = Array.from({ length: 10 }, (_, index) => `S${index}`)
const warmupHistory = Array.from({ length: 9 }, (_, index) => ({
  date: new Date(Date.UTC(2026, 7, index + 1)), up4Count: 1, down4Count: 1,
}))

function warmupFixture(observations: number, eligibleSymbols = warmupSymbols.length) {
  const dates = Array.from({ length: observations }, (_, index) => new Date(Date.UTC(2026, 7, index + 1)))
  const prices = warmupSymbols.flatMap((symbol, symbolIndex) => {
    const symbolDates = symbolIndex < eligibleSymbols ? dates : dates.slice(-1)
    return symbolDates.map(date => ({ symbol, date, adjustedClose: 100 + dates.indexOf(date) }))
  })
  return { dates, prices }
}

describe('market state breadth formulas', () => {
  it('counts boundary 4% moves and guards invalid previous prices', () => {
    expect(countMove4Pct([
      { close: 104, previousClose: 100 }, { close: 96, previousClose: 100 },
      { close: 100, previousClose: 0 }, { close: 100, previousClose: -1 },
    ])).toEqual({ up4Count: 1, down4Count: 1 })
  })

  it('uses the configured universe as the moving-average denominator', () => {
    expect(calcAboveMaPct([{ close: 101, sma: 100 }, { close: 99, sma: 100 }], 4)).toBe(25)
    expect(calcAboveMaPct([], 4)).toBe(0)
  })

  it('uses only the trailing ratio window and a one-count denominator guard', () => {
    expect(calcRatioNDaily([{ up4Count: 100, down4Count: 1 }, { up4Count: 2, down4Count: 1 }, { up4Count: 4, down4Count: 1 }], 2)).toBe(3)
    expect(calcRatioNDaily([{ up4Count: 2, down4Count: 0 }, { up4Count: 3, down4Count: 0 }], 10)).toBe(5)
  })

  it('preserves regime precedence and score boundaries', () => {
    expect(determineRegime({ up4Count: 5, down4Count: 15, universeCount: 100, above40dPct: 45, ratio10d: 1 }).regime).toBe('risk_off')
    expect(determineRegime({ up4Count: 10, down4Count: 5, universeCount: 100, above40dPct: 50, ratio10d: 2 })).toMatchObject({ regime: 'risk_on', isThrust: true })
    expect(determineRegime({ up4Count: 6, down4Count: 4, universeCount: 100, above40dPct: 45, ratio10d: 1 }).regime).toBe('neutral')
  })

  it('keeps warmup state unknown while preserving available price coverage and moves', () => {
    const dates = [new Date('2026-09-04T00:00:00Z')]
    const rows = calculateBreadthRows([
      { symbol: 'AAA', date: new Date('2026-09-03T00:00:00Z'), adjustedClose: 100 },
      { symbol: 'AAA', date: dates[0]!, adjustedClose: 105 },
      { symbol: 'BBB', date: dates[0]!, adjustedClose: 100 },
    ], ['AAA', 'BBB'], dates, [])
    expect(rows[0]).toMatchObject({ coveragePct: 100, up4Count: 1, down4Count: 0, above40dPct: null, ratio10d: null, regime: null, score: null, isStale: false })
  })

  it.each([
    { eligibleSymbols: 8, expectedAbove40dPct: 80, expectedRegime: null },
    { eligibleSymbols: 9, expectedAbove40dPct: 90, expectedRegime: 'classified' },
  ])('gates regime at the 90% 40-day eligibility boundary ($eligibleSymbols/10)', ({ eligibleSymbols, expectedAbove40dPct, expectedRegime }) => {
    const { dates, prices } = warmupFixture(40, eligibleSymbols)
    const row = calculateBreadthRows(prices, warmupSymbols, [dates.at(-1)!], warmupHistory)[0]
    expect(row?.above40dPct).toBe(expectedAbove40dPct)
    expect(row?.ratio10d).toBe(1)
    if (expectedRegime === null) {
      expect(row?.regime).toBeNull()
      expect(row?.score).toBeNull()
    } else {
      expect(row?.regime).not.toBeNull()
      expect(row?.score).not.toBeNull()
    }
  })

  it.each([
    { observations: 39, expectedAbove40dPct: null, expectedRegime: null },
    { observations: 40, expectedAbove40dPct: 100, expectedRegime: 'classified' },
  ])('gates 40-day moving-average state at the observation boundary ($observations observations)', ({ observations, expectedAbove40dPct, expectedRegime }) => {
    const { dates, prices } = warmupFixture(observations)
    const row = calculateBreadthRows(prices, warmupSymbols, [dates.at(-1)!], warmupHistory)[0]
    expect(row?.coveragePct).toBe(100)
    expect(row?.above40dPct).toBe(expectedAbove40dPct)
    if (expectedRegime === null) expect(row?.regime).toBeNull()
    else expect(row?.regime).not.toBeNull()
  })

  it('normalizes source symbols and daily quote dates without accepting invalid prices', () => {
    expect(uniqueSymbols([' msft ', 'AAPL', 'MSFT', ''])).toEqual(['AAPL', 'MSFT'])
    expect(parseDailyPrices('ABC', [{ date: new Date('2026-09-04T16:00:00Z'), open: 1, high: 2, low: 1, close: 2, adjclose: null, volume: 4 }])).toMatchObject([{ date: new Date('2026-09-04T00:00:00Z'), adjustedClose: 2, volume: 4n }])
  })
})
