import { describe, expect, it } from 'vitest'
import {
  formatAmount,
  formatCompactUsd,
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

// These formatters cache their Intl objects, because building one costs about
// thirty times formatting through one and a holdings table prints a figure per
// cell. A cache is only safe if a key it does not distinguish cannot exist, so
// each of these interleaves the variants that share a function.
describe('formatter reuse', () => {
  it("does not carry one locale's conventions into the next", () => {
    // de-DE inverts both separators against en-US, so leakage in either
    // direction is visible without depending on an invisible space character.
    const order = ['en-US', 'de-DE', 'en-US', 'de-DE', 'zh-TW'] as const
    const expected = {
      'en-US': { amount: '2,918.40', neutral: '1,234.5', signed: '+12.50' },
      'de-DE': { amount: '2.918,40', neutral: '1.234,5', signed: '+12,50' },
      'zh-TW': { amount: '2,918.40', neutral: '1,234.5', signed: '+12.50' },
    }
    for (const locale of order) {
      expect(formatAmount(locale, '2918.4')).toBe(expected[locale].amount)
      expect(formatNeutralValue(locale, 1234.5)).toBe(expected[locale].neutral)
      expect(formatMarketValue(locale, 12.5)).toBe(expected[locale].signed)
    }
  })

  it('keeps one digit count from answering for another', () => {
    const signed: Record<number, string> = { 0: '+13', 2: '+12.50', 4: '+12.5000' }
    const neutral: Record<number, string> = { 0: '1,235', 2: '1,234.57', 4: '1,234.5679' }
    for (const count of [2, 4, 0, 2, 4, 0]) {
      expect(formatMarketValue('en-US', 12.5, count)).toBe(signed[count])
      expect(formatNeutralValue('en-US', 1234.56789, count)).toBe(neutral[count])
    }
  })

  it('keeps one time zone from answering for another', () => {
    const instant = '2026-09-04T15:00:00.000Z'
    const zones = ['UTC', 'Asia/Taipei', 'America/New_York', 'UTC', 'Asia/Taipei'] as const
    const expected = {
      UTC: 'Sep 4, 2026, 3:00 PM',
      'Asia/Taipei': 'Sep 4, 2026, 11:00 PM',
      'America/New_York': 'Sep 4, 2026, 11:00 AM',
    }
    for (const zone of zones) expect(formatInstantIn('en-US', instant, zone)).toBe(expected[zone])
    // The UTC role appends its own zone label; the cached formatter must not
    // have been handed the device zone by the call before it.
    expect(formatInstantUtc('en-US', instant)).toBe('Sep 4, 2026, 3:00 PM UTC')
  })

  it('returns the same string on a repeat call', () => {
    for (let index = 0; index < 3; index += 1) {
      expect(formatAmount('zh-TW', '2918.4')).toBe('2,918.40')
      expect(formatCompactUsd('en-US', 1284003117)).toBe('$1.3B')
      expect(formatQuantity('en-US', '1.23456')).toBe('1.2346')
    }
  })
})
