import { describe, expect, it } from 'vitest'
import {
  calculatePositionSizing,
  positionSizingStrategies,
  validatePositionSizingRatios,
} from '../../packages/domain/src/position-sizing'

describe('position sizing frozen formula', () => {
  it('keeps the four source strategies and validates their ratio totals', () => {
    expect(positionSizingStrategies.map(strategy => [...strategy.ratios])).toEqual([
      [40, 30, 20, 10],
      [20, 20, 30, 20, 10],
      [30, 30, 30, 10],
      [10, 20, 30, 40],
    ])
    expect(validatePositionSizingRatios([40, 30, 20, 10])).toEqual({ sum: 100, isValid: true })
    expect(validatePositionSizingRatios([40, 30, 20])).toEqual({ sum: 90, isValid: false })
  })

  it('preserves reserve cash, whole-share batches and source summary values', () => {
    const output = calculatePositionSizing({
      capital: 10_000,
      stockPrice: 33,
      ratios: [40, 30, 20, 10],
      reserveCashPercent: 10,
      roundingMode: 'down',
    })
    expect(output.results.map(row => ({ ratio: row.ratio, shares: row.shares, actualAmount: row.actualAmount }))).toEqual([
      { ratio: 40, shares: 109, actualAmount: 3_597 },
      { ratio: 30, shares: 81, actualAmount: 2_673 },
      { ratio: 20, shares: 54, actualAmount: 1_782 },
      { ratio: 10, shares: 27, actualAmount: 891 },
    ])
    expect(output.summary).toMatchObject({
      totalShares: 271,
      totalInvested: 8_943,
      reservedCash: 1_000,
      unallocatedCash: 57,
      totalRemainingCash: 1_057,
      isOverBudget: false,
    })
    expect(output.summary?.utilizationRate).toBeCloseTo(89.43)
    expect(output.results.every(row => Object.values(row).every(value => Number.isFinite(value)))).toBe(true)
  })

  it('adjusts the last up-rounded batch and preserves its warning', () => {
    const output = calculatePositionSizing({
      capital: 1_000,
      stockPrice: 60,
      ratios: [40, 30, 20, 10],
      reserveCashPercent: 0,
      roundingMode: 'up',
    })
    expect(output.results.map(row => row.shares)).toEqual([7, 5, 4, 0])
    expect(output.summary?.totalInvested).toBe(960)
    expect(output.warnings).toContain('Final batch shares were adjusted to avoid exceeding the budget')
    const overBudget = calculatePositionSizing({ capital: 1_000, stockPrice: 99, ratios: [40, 30, 20, 10], reserveCashPercent: 0, roundingMode: 'up' })
    expect(overBudget.summary?.isOverBudget).toBe(true)
    expect(overBudget.summary?.overBudgetAmount).toBe(386)
  })

  it('returns an explicit empty result for zero inputs and rejects unsafe values', () => {
    expect(calculatePositionSizing({ capital: 0, stockPrice: 10, ratios: [100], reserveCashPercent: 0, roundingMode: 'down' })).toMatchObject({
      results: [], summary: null,
    })
    for (const input of [
      { capital: Number.NaN, stockPrice: 10, ratios: [100], reserveCashPercent: 0, roundingMode: 'down' as const },
      { capital: 100, stockPrice: 10, ratios: [-1, 101], reserveCashPercent: 0, roundingMode: 'down' as const },
      { capital: 100, stockPrice: 10, ratios: [100], reserveCashPercent: 101, roundingMode: 'down' as const },
    ]) expect(() => calculatePositionSizing(input)).toThrow(RangeError)
  })
})
