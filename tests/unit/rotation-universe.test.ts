import { describe, expect, it } from 'vitest'
import {
  getSectorsUniverse,
  getIndexesUniverse,
  getCoreUniverse,
  getUniverseForScope,
  getAllSymbols,
} from '../../packages/domain/src/market-rotation/universe'

// ─── Helpers ────────────────────────────────────────────────────

const EXCLUDED_FROM_SECTORS = ['SPY', 'MAGS', 'QQQE', 'RSP'] as const

const EXPECTED_SECTOR_SYMBOLS = [
  'XLK', 'XLF', 'XLE', 'XLU', 'XLP', 'XLY', 'XLI', 'XLV', 'XLB', 'XLC', 'XLRE',
] as const

const EXPECTED_INDEX_SYMBOLS = [
  'SPY', 'QQQ', 'DIA', 'IWM', 'RSP', 'VTI', 'VEA', 'VWO',
] as const

// ─── Sectors ────────────────────────────────────────────────────

describe('getSectorsUniverse', () => {
  it('excludes non-sector ETFs: SPY, MAGS, QQQE, RSP', () => {
    const universe = getSectorsUniverse()
    for (const symbol of EXCLUDED_FROM_SECTORS) {
      expect(universe.map(e => e.symbol)).not.toContain(symbol)
    }
  })

  it('contains the 11 SPDR sector ETFs with XLRE as Real Estate', () => {
    const universe = getSectorsUniverse()
    const symbols = universe.map(e => e.symbol)
    for (const symbol of EXPECTED_SECTOR_SYMBOLS) {
      expect(symbols).toContain(symbol)
    }
  })

  it('does not use VNQ as the sector canonical Real Estate ETF', () => {
    expect(getSectorsUniverse().map(e => e.symbol)).not.toContain('VNQ')
  })

  it('has 11 entries', () => {
    expect(getSectorsUniverse()).toHaveLength(11)
  })

  it('every entry has rankScope="sectors"', () => {
    for (const entry of getSectorsUniverse()) {
      expect(entry.rankScope).toBe('sectors')
    }
  })

  it('every entry has groupType="sector"', () => {
    for (const entry of getSectorsUniverse()) {
      expect(entry.groupType).toBe('sector')
    }
  })

  it('every entry has a non-empty name', () => {
    for (const entry of getSectorsUniverse()) {
      expect(entry.name.length).toBeGreaterThan(0)
    }
  })

  it('every entry has a non-null sectorName', () => {
    for (const entry of getSectorsUniverse()) {
      expect(entry.sectorName).not.toBeNull()
    }
  })

  it('has no duplicate symbols', () => {
    const symbols = getSectorsUniverse().map(e => e.symbol)
    expect(new Set(symbols).size).toBe(symbols.length)
  })
})

// ─── Indexes ────────────────────────────────────────────────────

describe('getIndexesUniverse', () => {
  it('contains all 8 benchmark index ETFs', () => {
    const universe = getIndexesUniverse()
    const symbols = universe.map(e => e.symbol)
    for (const symbol of EXPECTED_INDEX_SYMBOLS) {
      expect(symbols).toContain(symbol)
    }
  })

  it('has 8 entries', () => {
    expect(getIndexesUniverse()).toHaveLength(8)
  })

  it('every entry has rankScope="indexes"', () => {
    for (const entry of getIndexesUniverse()) {
      expect(entry.rankScope).toBe('indexes')
    }
  })

  it('every entry has groupType="index"', () => {
    for (const entry of getIndexesUniverse()) {
      expect(entry.groupType).toBe('index')
    }
  })

  it('every entry has a non-empty name', () => {
    for (const entry of getIndexesUniverse()) {
      expect(entry.name.length).toBeGreaterThan(0)
    }
  })

  it('has no duplicate symbols', () => {
    const symbols = getIndexesUniverse().map(e => e.symbol)
    expect(new Set(symbols).size).toBe(symbols.length)
  })
})

// ─── Core (T2: split into core_etf + mega_cap/single_stock pools) ──

const EXPECTED_CORE_ETF_SYMBOLS = [
  'SPY', 'VOO', 'QQQ', 'QQQM', 'SOXX', 'SMH', 'XLK', 'IGV',
  'XLP', 'XLU', 'TLT', 'BIL', 'SGOV',
] as const

const EXPECTED_MEGA_CAP_SYMBOLS = [
  'NVDA', 'MSFT', 'AAPL', 'GOOGL', 'AMZN', 'META', 'TSLA',
] as const

const EXPECTED_SINGLE_STOCK_SYMBOLS = ['MU', 'PLTR', 'CRWV'] as const

describe('getCoreUniverse', () => {
  it('has 23 entries (13 core ETF + 7 mega cap + 3 single stock)', () => {
    expect(getCoreUniverse()).toHaveLength(23)
  })

  it('contains all 13 core ETF pool symbols', () => {
    const symbols = getCoreUniverse().map(e => e.symbol)
    for (const symbol of EXPECTED_CORE_ETF_SYMBOLS) {
      expect(symbols).toContain(symbol)
    }
  })

  it('contains all 7 mega cap symbols', () => {
    const symbols = getCoreUniverse().map(e => e.symbol)
    for (const symbol of EXPECTED_MEGA_CAP_SYMBOLS) {
      expect(symbols).toContain(symbol)
    }
  })

  it('contains all 3 single stock symbols', () => {
    const symbols = getCoreUniverse().map(e => e.symbol)
    for (const symbol of EXPECTED_SINGLE_STOCK_SYMBOLS) {
      expect(symbols).toContain(symbol)
    }
  })

  it('every entry has rankScope="core"', () => {
    for (const entry of getCoreUniverse()) {
      expect(entry.rankScope).toBe('core')
    }
  })

  it('every entry has a groupType in {core_etf, mega_cap, single_stock}', () => {
    const allowed = ['core_etf', 'mega_cap', 'single_stock'] as const
    for (const entry of getCoreUniverse()) {
      expect(allowed).toContain(entry.groupType)
    }
  })

  it('assigns core_etf groupType to the 13 ETF pool entries', () => {
    const universe = getCoreUniverse()
    for (const symbol of EXPECTED_CORE_ETF_SYMBOLS) {
      const entry = universe.find(e => e.symbol === symbol)
      expect(entry, `expected ${symbol} in core universe`).toBeDefined()
      expect(entry!.groupType).toBe('core_etf')
    }
  })

  it('assigns mega_cap groupType to the mega cap entries', () => {
    const universe = getCoreUniverse()
    for (const symbol of EXPECTED_MEGA_CAP_SYMBOLS) {
      const entry = universe.find(e => e.symbol === symbol)
      expect(entry, `expected ${symbol} in core universe`).toBeDefined()
      expect(entry!.groupType).toBe('mega_cap')
    }
  })

  it('assigns single_stock groupType to MU/PLTR/CRWV', () => {
    const universe = getCoreUniverse()
    for (const symbol of EXPECTED_SINGLE_STOCK_SYMBOLS) {
      const entry = universe.find(e => e.symbol === symbol)
      expect(entry, `expected ${symbol} in core universe`).toBeDefined()
      expect(entry!.groupType).toBe('single_stock')
    }
  })

  it('every entry has a non-empty theme', () => {
    for (const entry of getCoreUniverse()) {
      expect(entry.theme!.length).toBeGreaterThan(0)
    }
  })

  it('every entry has a betaBucket from the allowed union', () => {
    const allowed = [
      'core_index', 'high_beta', 'mega_cap', 'single_stock',
      'defensive', 'cash_proxy',
    ] as const
    for (const entry of getCoreUniverse()) {
      expect(allowed).toContain(entry.betaBucket)
    }
  })

  it('core ETF pool count = 13', () => {
    const pool = getCoreUniverse().filter(e => e.groupType === 'core_etf')
    expect(pool).toHaveLength(13)
  })

  it('mega cap + single stock pool count = 10', () => {
    const pool = getCoreUniverse().filter(e =>
      e.groupType === 'mega_cap' || e.groupType === 'single_stock',
    )
    expect(pool).toHaveLength(10)
  })

  it('has no duplicate symbols', () => {
    const symbols = getCoreUniverse().map(e => e.symbol)
    expect(new Set(symbols).size).toBe(symbols.length)
  })
})

// ─── getUniverseForScope ───────────────────────────────────────

describe('getUniverseForScope', () => {
  it('returns sectors universe for "sectors"', () => {
    expect(getUniverseForScope('sectors')).toEqual(getSectorsUniverse())
  })

  it('returns indexes universe for "indexes"', () => {
    expect(getUniverseForScope('indexes')).toEqual(getIndexesUniverse())
  })

  it('returns core universe for "core"', () => {
    expect(getUniverseForScope('core')).toEqual(getCoreUniverse())
  })
})

// ─── getAllSymbols ──────────────────────────────────────────────

describe('getAllSymbols', () => {
  it('contains all unique symbols across all scopes', () => {
    const all = getAllSymbols()
    const symbols = all.map(e => e.symbol)

    // Sectors symbols
    for (const symbol of EXPECTED_SECTOR_SYMBOLS) {
      expect(symbols).toContain(symbol)
    }

    // Indexes symbols (includes SPY, RSP which are NOT in sectors)
    for (const symbol of EXPECTED_INDEX_SYMBOLS) {
      expect(symbols).toContain(symbol)
    }
  })

  it('lists each symbol only once even if it appears in multiple scopes', () => {
    const all = getAllSymbols()
    const symbols = all.map(e => e.symbol)
    // SPY and RSP appear in indexes but not sectors; still should be unique
    expect(new Set(symbols).size).toBe(symbols.length)
  })

  it('returns the correct total count (11 sectors + 8 indexes + 23 core - shared symbols)', () => {
    const all = getAllSymbols()
    // sectors (11) + indexes (8) + core (23) = 42, minus overlaps
    // (XLK, XLP, XLU appear in both sectors and core_etf; SPY, QQQ in indexes and core_etf)
    // first-occurrence wins: sectors takes XLK/XLP/XLU, indexes takes SPY/QQQ
    // → core adds 23 - 5 = 18 new symbols
    // total = 11 + 8 + 18 = 37
    expect(all).toHaveLength(37)
  })
})
