import { describe, expect, it } from 'vitest'
import { formatExactDecimal, formatSignedDecimal, formatSignedPercent } from '../../apps/web/app/guru-format.js'

describe('Guru portfolio number formatting', () => {
  it('groups exact integers without retaining a decimal point for zero fractions', () => {
    expect(formatExactDecimal('1200.00000000', 'en')).toBe('1,200')
  })

  it('keeps significant decimal digits and the sign without binary rounding', () => {
    expect(formatExactDecimal('-123456789012345678.450000', 'en')).toBe('-123,456,789,012,345,678.45')
    expect(formatSignedDecimal('500.2500', 'en')).toBe('+500.25')
  })

  it('shows a plus sign for positive share and weight changes', () => {
    expect(formatSignedPercent('7.5000', 'en')).toBe('+7.5%')
    expect(formatSignedPercent('-7.5000', 'en')).toBe('-7.5%')
  })
})
