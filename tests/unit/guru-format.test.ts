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
    // Two decimals, not the trimmed 1dp this page used to carry on its own: a
    // percentage reads the same here as on the portfolio pages. See ticket 101.
    expect(formatSignedPercent('7.5000', 'en')).toBe('+7.50%')
    expect(formatSignedPercent('-7.5000', 'en')).toBe('-7.50%')
    expect(formatSignedPercent('0.000', 'en')).toBe('0.00%')
    expect(formatSignedPercent(null, 'en')).toBe('—')
  })
})
