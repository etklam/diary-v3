import { describe, expect, it } from 'vitest'
import { BETA_BUCKET_MAP, classifyBetaBucket } from '../packages/domain/src/beta-buckets'

describe('BETA_BUCKET_MAP', () => {
  it('contains core_index tickers', () => {
    expect(BETA_BUCKET_MAP.QQQ).toBe('core_index')
    expect(BETA_BUCKET_MAP.QQQM).toBe('core_index')
    expect(BETA_BUCKET_MAP.VOO).toBe('core_index')
    expect(BETA_BUCKET_MAP.SPY).toBe('core_index')
  })

  it('contains high_beta tickers', () => {
    expect(BETA_BUCKET_MAP.SOXX).toBe('high_beta')
    expect(BETA_BUCKET_MAP.SMH).toBe('high_beta')
    expect(BETA_BUCKET_MAP.IGV).toBe('high_beta')
    expect(BETA_BUCKET_MAP.XLK).toBe('high_beta')
  })

  it('contains mega_cap tickers', () => {
    expect(BETA_BUCKET_MAP.NVDA).toBe('mega_cap')
    expect(BETA_BUCKET_MAP.MSFT).toBe('mega_cap')
    expect(BETA_BUCKET_MAP.META).toBe('mega_cap')
    expect(BETA_BUCKET_MAP.AMZN).toBe('mega_cap')
    expect(BETA_BUCKET_MAP.GOOGL).toBe('mega_cap')
    expect(BETA_BUCKET_MAP.AAPL).toBe('mega_cap')
    expect(BETA_BUCKET_MAP.TSLA).toBe('mega_cap')
  })

  it('contains single_stock tickers', () => {
    expect(BETA_BUCKET_MAP.MU).toBe('single_stock')
    expect(BETA_BUCKET_MAP.PLTR).toBe('single_stock')
    expect(BETA_BUCKET_MAP.CRWV).toBe('single_stock')
  })

  it('contains defensive tickers', () => {
    expect(BETA_BUCKET_MAP.XLP).toBe('defensive')
    expect(BETA_BUCKET_MAP.XLU).toBe('defensive')
    expect(BETA_BUCKET_MAP.TLT).toBe('defensive')
  })

  it('contains cash_proxy tickers', () => {
    expect(BETA_BUCKET_MAP.BIL).toBe('cash_proxy')
    expect(BETA_BUCKET_MAP.SGOV).toBe('cash_proxy')
  })
})

describe('classifyBetaBucket', () => {
  it('returns core_index for QQQ', () => {
    expect(classifyBetaBucket('QQQ')).toBe('core_index')
  })

  it('returns high_beta for SOXX', () => {
    expect(classifyBetaBucket('SOXX')).toBe('high_beta')
  })

  it('returns mega_cap for NVDA', () => {
    expect(classifyBetaBucket('NVDA')).toBe('mega_cap')
  })

  it('returns unknown for unclassified ticker', () => {
    expect(classifyBetaBucket('UNKNOWN')).toBe('unknown')
  })

  it('is case insensitive (nVdA === NVDA)', () => {
    expect(classifyBetaBucket('nVdA')).toBe('mega_cap')
    expect(classifyBetaBucket('nvda')).toBe('mega_cap')
    expect(classifyBetaBucket('qqq')).toBe('core_index')
    expect(classifyBetaBucket('Soxx')).toBe('high_beta')
  })

  it('returns unknown for empty string', () => {
    expect(classifyBetaBucket('')).toBe('unknown')
  })
})
