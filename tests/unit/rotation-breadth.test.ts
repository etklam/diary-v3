import { describe, expect, it } from 'vitest'
import { getBreadthCondition, getBreadthConfirmation } from '../../packages/domain/src/market-rotation/breadth'

describe('getBreadthCondition', () => {
  it('classifies sectors above 50d ratio into canonical breadth conditions', () => {
    expect(getBreadthCondition(0.7)).toBe('broad_participation')
    expect(getBreadthCondition(0.5)).toBe('constructive')
    expect(getBreadthCondition(0.35)).toBe('narrowing')
    expect(getBreadthCondition(0.349)).toBe('weak_breadth')
    expect(getBreadthCondition(null)).toBe('unknown')
  })

  it('returns unknown for NaN input', () => {
    expect(getBreadthCondition(NaN)).toBe('unknown')
  })

  it('returns unknown for undefined input', () => {
    expect(getBreadthCondition(undefined)).toBe('unknown')
  })
})

describe('getBreadthConfirmation', () => {
  it('compares sector breadth against market state posture', () => {
    expect(getBreadthConfirmation('risk_on', 0.5)).toBe('confirming')
    expect(getBreadthConfirmation('risk_on', 0.35)).toBe('mixed')
    expect(getBreadthConfirmation('risk_on', 0.349)).toBe('warning')

    expect(getBreadthConfirmation('neutral', 0.5)).toBe('confirming')
    expect(getBreadthConfirmation('neutral', 0.7)).toBe('mixed')

    expect(getBreadthConfirmation('defensive', 0.499)).toBe('confirming')
    expect(getBreadthConfirmation('defensive', 0.5)).toBe('mixed')
    expect(getBreadthConfirmation('defensive', 0.7)).toBe('warning')

    expect(getBreadthConfirmation('risk_off', 0.349)).toBe('confirming')
    expect(getBreadthConfirmation('risk_off', 0.35)).toBe('mixed')
    expect(getBreadthConfirmation('risk_off', 0.5)).toBe('warning')

    expect(getBreadthConfirmation('unknown', 0.8)).toBe('unknown')
    expect(getBreadthConfirmation('risk_on', null)).toBe('unknown')
  })

  it('returns mixed for neutral state when ratio is below 35%', () => {
    expect(getBreadthConfirmation('neutral', 0.34)).toBe('mixed')
  })

  it('returns mixed for neutral state when ratio is above 70%', () => {
    expect(getBreadthConfirmation('neutral', 0.71)).toBe('mixed')
  })

  it('returns confirming for neutral state when ratio is within 35%-70% range', () => {
    expect(getBreadthConfirmation('neutral', 0.69)).toBe('confirming')
  })

  it('returns unknown for neutral state when ratio is null', () => {
    expect(getBreadthConfirmation('neutral', null)).toBe('unknown')
  })
})
