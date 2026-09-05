/**
 * Universe configuration — defines which symbols belong to each rank scope.
 *
 * Scopes:
 *   - sectors: 11 US sector ETFs (SPDR Select Sector)
 *   - indexes: 8 benchmark index ETFs
 *   - core:    T2 — split into two percentile pools:
 *                * core_etf pool  (13 ETFs incl. defensive + cash proxy)
 *                * mega_cap_stock pool (7 mega cap + 3 single stock)
 *
 * T2 changes:
 *   - groupType union expanded: sector | index | core_etf | mega_cap | single_stock
 *   - Every core entry now carries `theme` and `betaBucket`.
 *   - Sectors / indexes entries keep their legacy V1 shape (no theme/betaBucket).
 */

import type { UniverseSymbol } from './pipeline.js'
import type { BetaBucket, GroupType } from './types.js'

export interface UniverseEntry extends UniverseSymbol {
  name: string
}

// ─── Sectors: 11 US sector ETFs ─────────────────────────────────

const SECTORS_UNIVERSE: UniverseEntry[] = [
  { symbol: 'XLK', name: 'Technology', rankScope: 'sectors', groupType: 'sector', sectorName: 'Technology' },
  { symbol: 'XLF', name: 'Financials', rankScope: 'sectors', groupType: 'sector', sectorName: 'Financials' },
  { symbol: 'XLE', name: 'Energy', rankScope: 'sectors', groupType: 'sector', sectorName: 'Energy' },
  { symbol: 'XLU', name: 'Utilities', rankScope: 'sectors', groupType: 'sector', sectorName: 'Utilities' },
  { symbol: 'XLP', name: 'Consumer Staples', rankScope: 'sectors', groupType: 'sector', sectorName: 'Consumer Staples' },
  { symbol: 'XLY', name: 'Consumer Discretionary', rankScope: 'sectors', groupType: 'sector', sectorName: 'Consumer Discretionary' },
  { symbol: 'XLI', name: 'Industrials', rankScope: 'sectors', groupType: 'sector', sectorName: 'Industrials' },
  { symbol: 'XLV', name: 'Health Care', rankScope: 'sectors', groupType: 'sector', sectorName: 'Health Care' },
  { symbol: 'XLB', name: 'Materials', rankScope: 'sectors', groupType: 'sector', sectorName: 'Materials' },
  { symbol: 'XLC', name: 'Communication Services', rankScope: 'sectors', groupType: 'sector', sectorName: 'Communication Services' },
  { symbol: 'XLRE', name: 'Real Estate', rankScope: 'sectors', groupType: 'sector', sectorName: 'Real Estate' },
]

// ─── Indexes: 8 benchmark index ETFs ───────────────────────────

const INDEXES_UNIVERSE: UniverseEntry[] = [
  { symbol: 'SPY', name: 'S&P 500', rankScope: 'indexes', groupType: 'index', sectorName: null },
  { symbol: 'QQQ', name: 'Nasdaq 100', rankScope: 'indexes', groupType: 'index', sectorName: null },
  { symbol: 'DIA', name: 'Dow Jones', rankScope: 'indexes', groupType: 'index', sectorName: null },
  { symbol: 'IWM', name: 'Russell 2000', rankScope: 'indexes', groupType: 'index', sectorName: null },
  { symbol: 'RSP', name: 'S&P 500 Equal Weight', rankScope: 'indexes', groupType: 'index', sectorName: null },
  { symbol: 'VTI', name: 'US Total Market', rankScope: 'indexes', groupType: 'index', sectorName: null },
  { symbol: 'VEA', name: 'Developed ex-US', rankScope: 'indexes', groupType: 'index', sectorName: null },
  { symbol: 'VWO', name: 'Emerging Markets', rankScope: 'indexes', groupType: 'index', sectorName: null },
]

// ─── Core — core_etf pool (13 ETFs incl. defensive + cash proxy) ──

const CORE_ETF_UNIVERSE: UniverseEntry[] = [
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF', rankScope: 'core', groupType: 'core_etf', sectorName: 'Broad Market', theme: 'Core Index', betaBucket: 'core_index' },
  { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', rankScope: 'core', groupType: 'core_etf', sectorName: 'Broad Market', theme: 'Core Index', betaBucket: 'core_index' },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust', rankScope: 'core', groupType: 'core_etf', sectorName: 'Broad Market', theme: 'Core Index', betaBucket: 'core_index' },
  { symbol: 'QQQM', name: 'Invesco NASDAQ 100 ETF', rankScope: 'core', groupType: 'core_etf', sectorName: 'Broad Market', theme: 'Core Index', betaBucket: 'core_index' },
  { symbol: 'SOXX', name: 'iShares Semiconductor ETF', rankScope: 'core', groupType: 'core_etf', sectorName: 'Semiconductor', theme: 'AI / Semi', betaBucket: 'high_beta' },
  { symbol: 'SMH', name: 'VanEck Semiconductor ETF', rankScope: 'core', groupType: 'core_etf', sectorName: 'Semiconductor', theme: 'AI / Semi', betaBucket: 'high_beta' },
  { symbol: 'XLK', name: 'Technology Select Sector ETF', rankScope: 'core', groupType: 'core_etf', sectorName: 'Technology', theme: 'Tech', betaBucket: 'high_beta' },
  { symbol: 'IGV', name: 'iShares Expanded Tech-Software ETF', rankScope: 'core', groupType: 'core_etf', sectorName: 'Software', theme: 'Software', betaBucket: 'high_beta' },
  // Defensive
  { symbol: 'XLP', name: 'Consumer Staples Select Sector ETF', rankScope: 'core', groupType: 'core_etf', sectorName: 'Consumer Staples', theme: 'Defensive', betaBucket: 'defensive' },
  { symbol: 'XLU', name: 'Utilities Select Sector ETF', rankScope: 'core', groupType: 'core_etf', sectorName: 'Utilities', theme: 'Defensive', betaBucket: 'defensive' },
  { symbol: 'TLT', name: 'iShares 20+ Year Treasury Bond ETF', rankScope: 'core', groupType: 'core_etf', sectorName: 'Bonds', theme: 'Defensive', betaBucket: 'defensive' },
  // Cash proxy
  { symbol: 'BIL', name: 'SPDR Bloomberg 1-3 Month T-Bill ETF', rankScope: 'core', groupType: 'core_etf', sectorName: 'Cash', theme: 'Cash Proxy', betaBucket: 'cash_proxy' },
  { symbol: 'SGOV', name: 'iShares 0-3 Month Treasury Bond ETF', rankScope: 'core', groupType: 'core_etf', sectorName: 'Cash', theme: 'Cash Proxy', betaBucket: 'cash_proxy' },
]

// ─── Core — mega_cap + single_stock pool (10 single stocks) ────

const MEGA_CAP_UNIVERSE: UniverseEntry[] = [
  { symbol: 'NVDA', name: 'NVIDIA Corporation', rankScope: 'core', groupType: 'mega_cap', sectorName: 'Semiconductor', theme: 'AI / Semi', betaBucket: 'mega_cap' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', rankScope: 'core', groupType: 'mega_cap', sectorName: 'Software', theme: 'AI / Cloud', betaBucket: 'mega_cap' },
  { symbol: 'AAPL', name: 'Apple Inc.', rankScope: 'core', groupType: 'mega_cap', sectorName: 'Hardware', theme: 'Hardware', betaBucket: 'mega_cap' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', rankScope: 'core', groupType: 'mega_cap', sectorName: 'Internet', theme: 'AI / Ads', betaBucket: 'mega_cap' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', rankScope: 'core', groupType: 'mega_cap', sectorName: 'Internet', theme: 'Cloud / E-com', betaBucket: 'mega_cap' },
  { symbol: 'META', name: 'Meta Platforms Inc.', rankScope: 'core', groupType: 'mega_cap', sectorName: 'Internet', theme: 'AI / Ads', betaBucket: 'mega_cap' },
  { symbol: 'TSLA', name: 'Tesla Inc.', rankScope: 'core', groupType: 'mega_cap', sectorName: 'Auto', theme: 'EV / AI', betaBucket: 'mega_cap' },
  { symbol: 'MU', name: 'Micron Technology', rankScope: 'core', groupType: 'single_stock', sectorName: 'Semiconductor', theme: 'Memory', betaBucket: 'single_stock' },
  { symbol: 'PLTR', name: 'Palantir Technologies', rankScope: 'core', groupType: 'single_stock', sectorName: 'Software', theme: 'AI / Data', betaBucket: 'single_stock' },
  { symbol: 'CRWV', name: 'CoreWeave Inc.', rankScope: 'core', groupType: 'single_stock', sectorName: 'Cloud', theme: 'AI / Cloud', betaBucket: 'single_stock' },
]

// ─── Public API ─────────────────────────────────────────────────

export function getSectorsUniverse(): UniverseEntry[] {
  return SECTORS_UNIVERSE
}

export function getIndexesUniverse(): UniverseEntry[] {
  return INDEXES_UNIVERSE
}

/**
 * Returns the combined core universe (core_etf + mega_cap/single_stock).
 * The percentile pipeline splits these two pools internally; this view is
 * intended for symbol listing / fetching prices, not for ranking.
 */
export function getCoreUniverse(): UniverseEntry[] {
  return [...CORE_ETF_UNIVERSE, ...MEGA_CAP_UNIVERSE]
}

/**
 * Returns the core_etf percentile pool.
 */
export function getCoreEtfPool(): UniverseEntry[] {
  return CORE_ETF_UNIVERSE
}

/**
 * Returns the mega_cap + single_stock percentile pool.
 */
export function getMegaCapStockPool(): UniverseEntry[] {
  return MEGA_CAP_UNIVERSE
}

export function getUniverseForScope(scope: 'sectors' | 'indexes' | 'core'): UniverseEntry[] {
  switch (scope) {
    case 'sectors':
      return getSectorsUniverse()
    case 'indexes':
      return getIndexesUniverse()
    case 'core':
      return getCoreUniverse()
  }
}

/**
 * Returns all unique symbols across every scope.
 * A symbol appearing in multiple scopes is listed only once
 * (first occurrence wins). Iteration order: sectors → indexes → core.
 */
export function getAllSymbols(): UniverseEntry[] {
  const seen = new Set<string>()
  const result: UniverseEntry[] = []

  for (const scope of ['sectors', 'indexes', 'core'] as const) {
    for (const entry of getUniverseForScope(scope)) {
      if (!seen.has(entry.symbol)) {
        seen.add(entry.symbol)
        result.push(entry)
      }
    }
  }

  return result
}

// Re-export type aliases for downstream consumers that want the union
// without importing from multiple modules.
export type { GroupType, BetaBucket }
