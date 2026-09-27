import { describe, expect, it } from 'vitest'
import { tradePlanExecutionUpdateSchema } from '../../packages/contracts/src/trade-plan-execution'
import { calculateTradePlanExecution } from '../../packages/domain/src/trade-plan-execution'

const baseline = {
  symbol: 'ABC', entryPrice: '100', entryZoneLow: '100', entryZoneHigh: '105', maxPositionSize: '10',
}

describe('trade plan execution comparison', () => {
  it('calculates a quantity-weighted buy average and ignores sells', () => {
    expect(calculateTradePlanExecution({
      baseline,
      baselineIsOutdated: false,
      transactions: [
        { type: 'BUY', quantity: '10', price: '100' },
        { type: 'BUY', quantity: '5', price: '110' },
        { type: 'SELL', quantity: '4', price: '120' },
      ],
    })).toEqual({
      comparisonStatus: 'ready', buyQuantity: '15', averageExecutionPrice: '103.333333',
      entryPriceDelta: '3.333333', entryPriceDeltaPercent: '3.33', entryZoneRelation: 'inside',
    })
  })

  it('keeps entry-zone boundaries inclusive and reports outside values', () => {
    expect(calculateTradePlanExecution({ baseline, baselineIsOutdated: false, transactions: [{ type: 'BUY', quantity: '1', price: '100' }] }).entryZoneRelation).toBe('inside')
    expect(calculateTradePlanExecution({ baseline, baselineIsOutdated: false, transactions: [{ type: 'BUY', quantity: '1', price: '105' }] }).entryZoneRelation).toBe('inside')
    expect(calculateTradePlanExecution({ baseline, baselineIsOutdated: false, transactions: [{ type: 'BUY', quantity: '1', price: '99.999999' }] }).entryZoneRelation).toBe('below')
    expect(calculateTradePlanExecution({ baseline, baselineIsOutdated: false, transactions: [{ type: 'BUY', quantity: '1', price: '105.000001' }] }).entryZoneRelation).toBe('above')
  })

  it('does not emit a false zero for missing baseline or missing buys', () => {
    expect(calculateTradePlanExecution({ baseline: null, baselineIsOutdated: false, transactions: [] })).toMatchObject({ comparisonStatus: 'unconfirmed', buyQuantity: null, averageExecutionPrice: null, entryPriceDelta: null, entryZoneRelation: 'unavailable' })
    expect(calculateTradePlanExecution({ baseline, baselineIsOutdated: false, transactions: [{ type: 'SELL', quantity: '1', price: '100' }] })).toMatchObject({ comparisonStatus: 'unavailable', buyQuantity: null, averageExecutionPrice: null, entryPriceDelta: null, entryZoneRelation: 'unavailable' })
    expect(calculateTradePlanExecution({ baseline: { ...baseline, entryPrice: null }, baselineIsOutdated: false, transactions: [{ type: 'BUY', quantity: '1', price: '100' }] })).toMatchObject({ averageExecutionPrice: '100', entryPriceDelta: null, entryPriceDeltaPercent: null })
  })

  it('rounds signed percentage deltas away from zero consistently', () => {
    expect(calculateTradePlanExecution({ baseline, baselineIsOutdated: false, transactions: [{ type: 'BUY', quantity: '1', price: '98.765' }] }).entryPriceDeltaPercent).toBe('-1.24')
    expect(calculateTradePlanExecution({ baseline, baselineIsOutdated: true, transactions: [{ type: 'BUY', quantity: '1', price: '100' }] }).comparisonStatus).toBe('outdated')
  })
})

describe('trade plan execution write contract', () => {
  it('rejects duplicate transaction links before reaching the API', () => {
    expect(tradePlanExecutionUpdateSchema.safeParse({ transactionIds: ['1', '1'] }).success).toBe(false)
    expect(tradePlanExecutionUpdateSchema.safeParse({ transactionIds: ['1'], baselineVersion: 1, expectedExecutionRevision: 2 }).success).toBe(true)
  })
})
