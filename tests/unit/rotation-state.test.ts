import { describe, expect, it } from 'vitest'
import { toMarketState } from '../../packages/domain/src/market-rotation/state'

describe('toMarketState', () => {
  it('maps existing internal regime values to canonical market state values', () => {
    expect(toMarketState('BULLISH_THRUST')).toBe('risk_on')
    expect(toMarketState('RISK_ON')).toBe('risk_on')
    expect(toMarketState('NEUTRAL')).toBe('neutral')
    expect(toMarketState('RISK_OFF')).toBe('defensive')
    expect(toMarketState('CAPITULATION_WATCH')).toBe('risk_off')
    expect(toMarketState(null)).toBe('unknown')
    expect(toMarketState('NOT_A_REGIME')).toBe('unknown')
  })

  it('returns unknown for undefined input', () => {
    expect(toMarketState(undefined)).toBe('unknown')
  })
})
