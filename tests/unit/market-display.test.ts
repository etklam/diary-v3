import { describe, expect, it } from 'vitest'
import {
  formatAmount,
  formatSignedAmount,
  formatDay,
  formatInstantIn,
  formatInstantUtc,
  formatMarketValue,
  formatMarketValueWithSuffix,
  formatNeutralValue,
  formatPercent,
  formatQuantity,
  formatSignedPercent,
  marketClass,
  marketDirection,
} from '../../apps/web/app/market-display'

const locales = ['en-US', 'zh-TW', 'zh-CN'] as const

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

describe('unsigned figure display', () => {
  it('pads amounts to two decimals and groups thousands', () => {
    expect(formatAmount('en-US', '182.4')).toBe('182.40')
    expect(formatAmount('en-US', '215')).toBe('215.00')
    expect(formatAmount('en-US', '2918.4')).toBe('2,918.40')
    expect(formatAmount('en-US', 3892.4)).toBe('3,892.40')
    expect(formatAmount('en-US', '-4.5')).toBe('-4.50')
    expect(formatAmount('en-US', '-0.001')).toBe('-0.001')
    // Rounds away entirely, and must not come back as a negative zero.
    expect(formatAmount('en-US', '-0.00001')).toBe('0.00')
  })

  it('keeps an exact API decimal but rounds a computed float', () => {
    // A string is a decimal somebody committed to: 21.85 / 2 shares is 10.925, and
    // rounding it to 10.93 would print a cost basis that multiplies out to 21.86.
    expect(formatAmount('en-US', '10.925')).toBe('10.925')
    expect(formatAmount('en-US', '21.85')).toBe('21.85')
    expect(formatAmount('en-US', '103.333333')).toBe('103.3333')
    expect(formatSignedAmount('en-US', '10.925')).toBe('+10.925')
    // A number's tail is float arithmetic, so it stops at two decimals.
    expect(formatAmount('en-US', 123456850743.8265)).toBe('123,456,850,743.83')
    expect(formatAmount('en-US', 1234567.891)).toBe('1,234,567.89')
    expect(formatSignedAmount('en-US', 10.925)).toBe('+10.93')
  })

  it('trims padded quantity zeros and keeps four decimals', () => {
    expect(formatQuantity('en-US', '24.0000')).toBe('24')
    expect(formatQuantity('en-US', '24')).toBe('24')
    expect(formatQuantity('en-US', '0.5000')).toBe('0.5')
    expect(formatQuantity('en-US', '1.23456')).toBe('1.2346')
    expect(formatQuantity('en-US', '10000.1')).toBe('10,000.1')
  })

  it('clamps percentages to two decimals', () => {
    expect(formatPercent('en-US', '74.976878')).toBe('74.98%')
    expect(formatPercent('en-US', 10)).toBe('10.00%')
    expect(formatSignedPercent('en-US', '10.000000')).toBe('+10.00%')
    expect(formatSignedPercent('en-US', '-3.456')).toBe('-3.46%')
    expect(formatSignedPercent('en-US', '0.000')).toBe('0.00%')
  })

  it('carries rounding into the integer digits without a float round trip', () => {
    expect(formatAmount('en-US', '9.99999')).toBe('10.00')
    expect(formatAmount('en-US', '999.99995')).toBe('1,000.00')
    expect(formatQuantity('en-US', '0.99999')).toBe('1')
    // Beyond Number.MAX_SAFE_INTEGER: the digit string is preserved exactly.
    expect(formatAmount('en-US', '9007199254740993.555')).toBe('9,007,199,254,740,993.555')
  })

  it('returns the unknown marker rather than a zero for missing figures', () => {
    for (const format of [formatAmount, formatQuantity, formatPercent, formatSignedPercent]) {
      expect(format('en-US', null)).toBe('—')
      expect(format('en-US', undefined)).toBe('—')
      expect(format('en-US', '')).toBe('—')
      expect(format('en-US', 'n/a')).toBe('—')
      expect(format('en-US', Number.NaN)).toBe('—')
    }
  })

  it('formats the same value identically in every supported locale', () => {
    for (const locale of locales) {
      expect(formatAmount(locale, '182.4')).toBe('182.40')
      expect(formatAmount(locale, '2918.4')).toBe('2,918.40')
      expect(formatQuantity(locale, '24.0000')).toBe('24')
      expect(formatPercent(locale, '74.976878')).toBe('74.98%')
    }
  })
})

describe('instant display', () => {
  it('renders one format per role', () => {
    expect(formatDay('2026-09-04')).toBe('2026-09-04')
    expect(formatDay('2026-09-04T15:00:00.000Z')).toBe('2026-09-04')
    expect(formatInstantUtc('en-US', '2026-09-04T15:00:00.000Z')).toBe('Sep 4, 2026, 3:00 PM UTC')
    expect(formatInstantIn('en-US', '2026-09-04T15:00:00.000Z', 'Asia/Taipei')).toBe('Sep 4, 2026, 11:00 PM')
  })

  it('marks missing and unparseable instants as unknown', () => {
    expect(formatDay(null)).toBe('—')
    expect(formatDay('not-a-date')).toBe('—')
    expect(formatInstantUtc('en-US', undefined)).toBe('—')
    expect(formatInstantUtc('en-US', 'not-a-date')).toBe('—')
    expect(formatInstantIn('en-US', '', 'UTC')).toBe('—')
  })
})
