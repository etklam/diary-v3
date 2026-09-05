/**
 * Beta bucket classification for portfolio exposure analysis.
 *
 * Hardcoded mapping of common US-listed tickers to coarse beta buckets.
 * Symbols not in the map fall through to the `unknown` bucket, which is
 * surfaced in the UI as "Unclassified — manual review" (handled by T7).
 */

export type BetaBucket =
  | 'core_index'
  | 'high_beta'
  | 'mega_cap'
  | 'single_stock'
  | 'defensive'
  | 'cash_proxy'
  | 'unknown'

export const BETA_BUCKET_MAP: Record<string, BetaBucket> = {
  // core_index
  QQQ: 'core_index',
  QQQM: 'core_index',
  VOO: 'core_index',
  SPY: 'core_index',

  // high_beta
  SOXX: 'high_beta',
  SMH: 'high_beta',
  IGV: 'high_beta',
  XLK: 'high_beta',

  // mega_cap
  NVDA: 'mega_cap',
  MSFT: 'mega_cap',
  META: 'mega_cap',
  AMZN: 'mega_cap',
  GOOGL: 'mega_cap',
  AAPL: 'mega_cap',
  TSLA: 'mega_cap',

  // single_stock
  MU: 'single_stock',
  PLTR: 'single_stock',
  CRWV: 'single_stock',

  // defensive
  XLP: 'defensive',
  XLU: 'defensive',
  TLT: 'defensive',

  // cash_proxy
  BIL: 'cash_proxy',
  SGOV: 'cash_proxy',
}

/**
 * Classify a ticker symbol into a beta bucket.
 *
 * Symbol matching is case-insensitive (`nVdA` and `NVDA` resolve to the same bucket).
 * Unknown symbols return `'unknown'`.
 */
export function classifyBetaBucket(symbol: string): BetaBucket {
  if (!symbol) return 'unknown'
  return BETA_BUCKET_MAP[symbol.toUpperCase()] ?? 'unknown'
}
