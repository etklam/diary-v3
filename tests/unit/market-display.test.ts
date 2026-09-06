import { describe, expect, it } from 'vitest'
import { formatMarketValue, formatMarketValueWithSuffix, formatNeutralValue, marketClass, marketDirection } from '../../apps/web/app/market-display'

describe('market display semantics', () => {
  it('keeps up, down, flat and missing values distinct', () => {
    expect(marketDirection(1)).toBe('up')
    expect(marketDirection(-1)).toBe('down')
    expect(marketDirection(0)).toBe('flat')
    expect(marketDirection(null)).toBe('unknown')
    expect(marketDirection(Number.NaN)).toBe('unknown')
    expect(marketDirection('0.000')).toBe('flat')
    expect(marketDirection('-12.5')).toBe('down')
    expect(marketClass(3)).toBe('market-up')
    expect(marketClass(-3)).toBe('market-down')
    expect(marketClass(0)).toBe('market-flat')
    expect(marketClass(null)).toBe('')
  })

  it('adds a positive sign only to signed financial values', () => {
    expect(formatMarketValue('en-US', 12.5)).toBe('+12.50')
    expect(formatMarketValue('en-US', -12.5)).toBe('-12.50')
    expect(formatMarketValue('en-US', 0)).toBe('0.00')
    expect(formatMarketValue('en-US', '-0.00')).toBe('0.00')
    expect(formatMarketValue('en-US', null)).toBe('—')
    expect(formatMarketValueWithSuffix('en-US', null, '%')).toBe('—')
    expect(formatMarketValueWithSuffix('en-US', 2.5, '%')).toBe('+2.50%')
    expect(formatMarketValue('en-US', '9007199254740993.5')).toBe('+9007199254740993.5')
    expect(formatNeutralValue('en-US', 1234.5)).toBe('1,234.5')
    expect(formatNeutralValue('en-US', null)).toBe('—')
  })
})
