import { describe, expect, it } from 'vitest'
import {
  computePortfolioExposure,
  compareExposureToTarget,
  type PortfolioExposure,
  type SuggestedAllocation,
} from '../packages/domain/src/portfolio-exposure'
import type { PortfolioHolding as Holding } from '@diary/contracts/portfolio'

// ─── Helpers ──────────────────────────────────────────────────────────────
function makeHolding(
  symbol: string,
  totalCost: number,
  overrides: Partial<Holding> = {}
): Holding {
  return {
    symbol,
    quantity: 10,
    avgCost: totalCost / 10,
    totalCost,
    ...overrides,
  }
}

function sumPct(e: PortfolioExposure): number {
  return (
    e.highBetaPct +
    e.coreIndexPct +
    e.megaCapPct +
    e.singleStockPct +
    e.defensivePct +
    e.cashProxyPct +
    e.unknownPct
  )
}

const ALL_ZERO: PortfolioExposure = {
  highBetaPct: 0,
  coreIndexPct: 0,
  megaCapPct: 0,
  singleStockPct: 0,
  defensivePct: 0,
  cashProxyPct: 0,
  unknownPct: 0,
  largestTheme: null,
  concentrationWarning: false,
  totalValue: 0,
  skippedCount: 0,
}

// ─── computePortfolioExposure ────────────────────────────────────────────
describe('computePortfolioExposure', () => {
  describe('empty input', () => {
    it('AC1: empty holdings → all zero, largestTheme = null', () => {
      const result = computePortfolioExposure([])
      expect(result).toEqual(ALL_ZERO)
    })

    it('totalValue = 0 when holdings have no value', () => {
      const result = computePortfolioExposure([makeHolding('QQQ', 0)])
      expect(result).toEqual(ALL_ZERO)
    })
  })

  describe('all known tickers', () => {
    it('AC2: sum of all buckets = 100', () => {
      const holdings: Holding[] = [
        makeHolding('QQQ', 1000),
        makeHolding('SOXX', 1000),
        makeHolding('NVDA', 1000),
      ]
      const result = computePortfolioExposure(holdings)
      expect(Math.round(sumPct(result) * 100) / 100).toBe(100)
    })

    it('uses the raw holding cost basis as the exposure proxy', () => {
      const holdings: Holding[] = [
        makeHolding('QQQ', 1000),
        makeHolding('SOXX', 3000),
      ]
      const result = computePortfolioExposure(holdings)
      expect(result.totalValue).toBe(4000)
      expect(result.coreIndexPct).toBeCloseTo(25, 2)
      expect(result.highBetaPct).toBeCloseTo(75, 2)
    })
  })

  describe('all unknown tickers', () => {
    it('AC3: unknownPct = 100', () => {
      const holdings: Holding[] = [
        makeHolding('FOO', 500),
        makeHolding('BAR', 500),
      ]
      const result = computePortfolioExposure(holdings)
      expect(result.unknownPct).toBeCloseTo(100, 2)
      expect(result.largestTheme).toBeNull()
    })
  })

  describe('mixed known/unknown', () => {
    it('AC4: distributes by market value proportion', () => {
      const holdings: Holding[] = [
        makeHolding('QQQ', 1000),
        makeHolding('UNKNOWN_TICKER', 1000),
      ]
      const result = computePortfolioExposure(holdings)
      expect(result.coreIndexPct).toBeCloseTo(50, 2)
      expect(result.unknownPct).toBeCloseTo(50, 2)
    })
  })

  describe('case insensitivity', () => {
    it('AC5: nVdA and NVDA map to same bucket', () => {
      const holdings: Holding[] = [
        makeHolding('nVdA', 500),
        makeHolding('NVDA', 500),
      ]
      const result = computePortfolioExposure(holdings)
      expect(result.megaCapPct).toBeCloseTo(100, 2)
      expect(result.unknownPct).toBe(0)
    })
  })

  describe('concentrationWarning boundary', () => {
    it('AC6: exactly 50% → false', () => {
      const holdings: Holding[] = [
        makeHolding('QQQ', 500),
        makeHolding('SOXX', 500),
      ]
      const result = computePortfolioExposure(holdings)
      expect(result.coreIndexPct).toBeCloseTo(50, 2)
      expect(result.highBetaPct).toBeCloseTo(50, 2)
      expect(result.concentrationWarning).toBe(false)
    })

    it('AC6: 50.01% → true', () => {
      // QQQ 5000.01 / SOXX 4999.99 → QQQ ratio slightly over 50
      const holdings: Holding[] = [
        makeHolding('QQQ', 5000.01),
        makeHolding('SOXX', 4999.99),
      ]
      const result = computePortfolioExposure(holdings)
      expect(result.coreIndexPct).toBeGreaterThan(50)
      expect(result.concentrationWarning).toBe(true)
    })

    it('cash_proxy > 50% does NOT trigger warning', () => {
      const holdings: Holding[] = [
        makeHolding('BIL', 9000),
        makeHolding('QQQ', 1000),
      ]
      const result = computePortfolioExposure(holdings)
      expect(result.cashProxyPct).toBeCloseTo(90, 2)
      expect(result.concentrationWarning).toBe(false)
    })
  })

  describe('largestTheme', () => {
    it('returns largest non-unknown bucket name', () => {
      const holdings: Holding[] = [
        makeHolding('QQQ', 600),
        makeHolding('SOXX', 300),
        makeHolding('BIL', 100),
      ]
      const result = computePortfolioExposure(holdings)
      expect(result.largestTheme).toBe('core_index')
    })

    it('returns null when all unknown', () => {
      const holdings: Holding[] = [makeHolding('FOO', 1000)]
      const result = computePortfolioExposure(holdings)
      expect(result.largestTheme).toBeNull()
    })

    it('returns null when empty', () => {
      const result = computePortfolioExposure([])
      expect(result.largestTheme).toBeNull()
    })
  })

  describe('totalValue', () => {
    it('sums all holdings market value', () => {
      const holdings: Holding[] = [
        makeHolding('QQQ', 1000),
        makeHolding('SOXX', 1000),
      ]
      const result = computePortfolioExposure(holdings)
      expect(result.totalValue).toBeCloseTo(2000, 2)
    })
  })

  // ─── Critical gap from eng review (2026-06-18) ────────────────────────
  // Source: `Number(tx.quantity)` in lib/position-state.ts can emit NaN when a Decimal
  // is malformed; the raw holding's totalCost may then carry NaN/Infinity values.
  // Those holdings must be skipped + counted, never silently allowed to
  // produce Infinity in the resulting percentages.
  describe('invalid holdings (NaN / Infinity guard)', () => {
    it('all-invalid holdings → ALL_ZERO with skippedCount = N', () => {
      const holdings: Holding[] = [
        makeHolding('QQQ', NaN),
        makeHolding('SOXX', Infinity),
      ]
      const result = computePortfolioExposure(holdings)
      expect(result.totalValue).toBe(0)
      expect(result.highBetaPct).toBe(0)
      expect(result.coreIndexPct).toBe(0)
      expect(result.unknownPct).toBe(0)
      expect(result.concentrationWarning).toBe(false)
      expect(Number.isFinite(result.totalValue)).toBe(true)
      expect(result.skippedCount).toBe(2)
    })

    it('mixed valid + invalid: valid holdings determine percentages, invalid counted', () => {
      const holdings: Holding[] = [
        makeHolding('QQQ', 1000), // valid → core_index
        makeHolding('SOXX', 1000), // valid → high_beta
        makeHolding('NVDA', NaN), // invalid
      ]
      const result = computePortfolioExposure(holdings)
      expect(result.totalValue).toBeCloseTo(2000, 2)
      expect(result.coreIndexPct).toBeCloseTo(50, 2)
      expect(result.highBetaPct).toBeCloseTo(50, 2)
      expect(result.megaCapPct).toBe(0)
      expect(result.skippedCount).toBe(1)
    })

    it('result is always finite even when every numeric source is NaN', () => {
      const holdings: Holding[] = [
        makeHolding('QQQ', NaN, { avgCost: NaN }),
      ]
      const result = computePortfolioExposure(holdings)
      const allPcts = [
        result.highBetaPct, result.coreIndexPct, result.megaCapPct,
        result.singleStockPct, result.defensivePct, result.cashProxyPct,
        result.unknownPct,
      ]
      expect(allPcts.every(Number.isFinite)).toBe(true)
      expect(Number.isFinite(result.totalValue)).toBe(true)
      expect(result.skippedCount).toBe(1)
    })
  })
})

// ─── compareExposureToTarget ──────────────────────────────────────────────
describe('compareExposureToTarget', () => {
  const target: SuggestedAllocation = {
    highBetaTargetPct: 40,
    coreIndexTargetPct: 40,
    cashTargetPct: 20,
  }

  function makeExposure(partial: Partial<PortfolioExposure>): PortfolioExposure {
    return {
      highBetaPct: 0,
      coreIndexPct: 0,
      megaCapPct: 0,
      singleStockPct: 0,
      defensivePct: 0,
      cashProxyPct: 0,
      unknownPct: 0,
      largestTheme: null,
      concentrationWarning: false,
      totalValue: 0,
      skippedCount: 0,
      ...partial,
    }
  }

  describe('bucket mapping', () => {
    it('maps high_beta + mega_cap + single_stock → highBeta', () => {
      const exposure = makeExposure({
        highBetaPct: 20,
        megaCapPct: 10,
        singleStockPct: 5,
      })
      const gaps = compareExposureToTarget(exposure, target)
      const highBeta = gaps.find((g) => g.bucket === 'highBeta')!
      expect(highBeta.currentPct).toBeCloseTo(35, 2)
    })

    it('AC8: maps defensive + cash_proxy → cash', () => {
      const exposure = makeExposure({
        defensivePct: 10,
        cashProxyPct: 5,
      })
      const gaps = compareExposureToTarget(exposure, target)
      const cash = gaps.find((g) => g.bucket === 'cash')!
      expect(cash.currentPct).toBeCloseTo(15, 2)
    })

    it('maps core_index → coreIndex', () => {
      const exposure = makeExposure({ coreIndexPct: 50 })
      const gaps = compareExposureToTarget(exposure, target)
      const coreIndex = gaps.find((g) => g.bucket === 'coreIndex')!
      expect(coreIndex.currentPct).toBeCloseTo(50, 2)
    })

    it('does not include unknown bucket', () => {
      const exposure = makeExposure({ unknownPct: 100 })
      const gaps = compareExposureToTarget(exposure, target)
      expect(gaps.find((g) => g.bucket === 'unknown')).toBeUndefined()
    })
  })

  describe('gap calculation', () => {
    it('gapPct = currentPct - targetPct', () => {
      const exposure = makeExposure({ highBetaPct: 50 })
      const gaps = compareExposureToTarget(exposure, target)
      const highBeta = gaps.find((g) => g.bucket === 'highBeta')!
      expect(highBeta.gapPct).toBeCloseTo(10, 2)
    })
  })

  describe('status boundary', () => {
    it('AC7: gap = +5 → balanced', () => {
      const exposure = makeExposure({ highBetaPct: 45 })
      const gaps = compareExposureToTarget(exposure, target)
      const highBeta = gaps.find((g) => g.bucket === 'highBeta')!
      expect(highBeta.gapPct).toBeCloseTo(5, 2)
      expect(highBeta.status).toBe('balanced')
    })

    it('AC7: gap = -5 → balanced', () => {
      const exposure = makeExposure({ highBetaPct: 35 })
      const gaps = compareExposureToTarget(exposure, target)
      const highBeta = gaps.find((g) => g.bucket === 'highBeta')!
      expect(highBeta.gapPct).toBeCloseTo(-5, 2)
      expect(highBeta.status).toBe('balanced')
    })

    it('gap > +5 → overweight', () => {
      const exposure = makeExposure({ highBetaPct: 50 })
      const gaps = compareExposureToTarget(exposure, target)
      const highBeta = gaps.find((g) => g.bucket === 'highBeta')!
      expect(highBeta.status).toBe('overweight')
    })

    it('gap < -5 → underweight', () => {
      const exposure = makeExposure({ highBetaPct: 20 })
      const gaps = compareExposureToTarget(exposure, target)
      const highBeta = gaps.find((g) => g.bucket === 'highBeta')!
      expect(highBeta.status).toBe('underweight')
    })
  })

  describe('returns all 3 buckets', () => {
    it('has highBeta, coreIndex, cash', () => {
      const gaps = compareExposureToTarget(makeExposure({}), target)
      const buckets = gaps.map((g) => g.bucket).sort()
      expect(buckets).toEqual(['cash', 'coreIndex', 'highBeta'])
    })
  })
})

it('skips corrupt negative cost instead of creating negative or inflated bucket weights', () => {
  const result = computePortfolioExposure([makeHolding('QQQ', 100), makeHolding('SOXX', -50)])
  expect(result).toMatchObject({ totalValue: 100, coreIndexPct: 100, highBetaPct: 0, skippedCount: 1 })
})

it('keeps the full cost denominator regardless of missing, zero or different quotes', () => {
  const result = computePortfolioExposure([
    makeHolding('QQQ', 100, { price: 0 }), makeHolding('SOXX', 100, { price: 1000 }), makeHolding('UNMAPPED', 200),
  ])
  expect(result).toMatchObject({ totalValue: 400, coreIndexPct: 25, highBetaPct: 25, unknownPct: 50 })
})
