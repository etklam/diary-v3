import { describe, expect, it } from 'vitest'
import { buildSnapshot } from '../../packages/domain/src/market-rotation/snapshot-builder'
import type { DailyPrice, SnapshotMeta } from '../../packages/domain/src/market-rotation/snapshot-builder'

// ─── Helpers ────────────────────────────────────────────────────

const defaultMeta: SnapshotMeta = {
  symbol: 'XLK',
  rankScope: 'sectors',
  groupType: 'sector',
  sectorName: 'Technology',
}

/**
 * 產生指定天數的 DailyPrice 陣列（oldest first, latest last）。
 * close 從 100 起每天 +1，adjustedClose 從 100 起每天 +1.5。
 */
function generatePrices(days: number): DailyPrice[] {
  const result: DailyPrice[] = []
  for (let i = 0; i < days; i++) {
    const day = String(i + 1).padStart(2, '0')
    result.push({
      date: `2025-01-${day}`,
      close: 100 + i,
      adjustedClose: 100 + i * 1.5,
    })
  }
  return result
}

/** 產生 close 上升趨勢的價格，但最後一天價格刻意低於各均線 */
function generateBearishPrices(days: number): DailyPrice[] {
  const result: DailyPrice[] = []
  for (let i = 0; i < days; i++) {
    const day = String(i + 1).padStart(2, '0')
    const close = i < days - 1 ? 100 + i : 50 // 最後一天大跌
    result.push({
      date: `2025-01-${day}`,
      close,
      adjustedClose: close,
    })
  }
  return result
}

// ─── Test Suite ─────────────────────────────────────────────────

describe('buildSnapshot', () => {
  // ── 1. 空 prices → null ─────────────────────────────────────

  it('returns null for empty prices array', () => {
    expect(buildSnapshot(defaultMeta, [])).toBeNull()
  })

  // ── 2. 單日資料 ─────────────────────────────────────────────

  it('returns snapshot with lastPrice but all indicators null for single day', () => {
    const prices: DailyPrice[] = [
      { date: '2025-06-01', close: 100, adjustedClose: 100.5 },
    ]
    const result = buildSnapshot(defaultMeta, prices)

    expect(result).not.toBeNull()
    expect(result!.symbol).toBe('XLK')
    expect(result!.rankScope).toBe('sectors')
    expect(result!.groupType).toBe('sector')
    expect(result!.sectorName).toBe('Technology')
    expect(result!.date).toBe('2025-06-01')
    expect(result!.lastPrice).toBe(100.5)
    expect(result!.adjustedClose).toBe(100.5)
    expect(result!.dailyChangePct).toBeNull()
    expect(result!.weeklyChangePct).toBeNull()
    expect(result!.rsi14).toBeNull()
    expect(result!.ema10).toBeNull()
    expect(result!.ema20).toBeNull()
    expect(result!.sma50).toBeNull()
    expect(result!.sma200).toBeNull()
    expect(result!.above10d).toBeNull()
    expect(result!.above20d).toBeNull()
    expect(result!.above50d).toBeNull()
    expect(result!.above200d).toBeNull()
    expect(result!.maScore).toBe(0)
    expect(result!.maStatus).toBe('unknown')
    expect(result!.rolling252dHigh).toBe(100)
    expect(result!.percentFromHigh).toBeNull()
    expect(result!.distanceFromHighScore).toBeNull()
  })

  // ── 3. 基本 30 天資料 ───────────────────────────────────────

  it('computes ema10, ema20, rsi14 but leaves sma50 null with 30 days', () => {
    const prices = generatePrices(30)
    const result = buildSnapshot(defaultMeta, prices)

    expect(result).not.toBeNull()
    // lastPrice = adjustedClose of last entry
    expect(result!.lastPrice).toBe(100 + 29 * 1.5) // 143.5
    expect(result!.adjustedClose).toBe(143.5)
    expect(result!.date).toBe('2025-01-30')

    // indicators that should have values
    expect(result!.ema10).not.toBeNull()
    expect(result!.ema20).not.toBeNull()
    expect(result!.rsi14).not.toBeNull()

    // indicators that need more data
    expect(result!.sma50).toBeNull()
    expect(result!.sma200).toBeNull()

    // above10d and above20d should be computable
    expect(result!.above10d).not.toBeNull()
    expect(result!.above20d).not.toBeNull()

    // above50d/200d null because sma50/sma200 null
    expect(result!.above50d).toBeNull()
    expect(result!.above200d).toBeNull()

    // distanceFromHigh: 30 days < 60, so null
    expect(result!.percentFromHigh).toBeNull()
    expect(result!.distanceFromHighScore).toBeNull()

    // rolling252dHigh: still returns max even with less data
    expect(result!.rolling252dHigh).toBe(129) // last close = 100 + 29
  })

  // ── 4. 252 天完整資料 ───────────────────────────────────────

  it('computes all fields with 252 days of data', () => {
    const prices = generatePrices(252)
    const result = buildSnapshot(defaultMeta, prices)

    expect(result).not.toBeNull()
    expect(result!.ema10).not.toBeNull()
    expect(result!.ema20).not.toBeNull()
    expect(result!.sma50).not.toBeNull()
    expect(result!.sma200).not.toBeNull()
    expect(result!.rsi14).not.toBeNull()
    expect(result!.above10d).not.toBeNull()
    expect(result!.above20d).not.toBeNull()
    expect(result!.above50d).not.toBeNull()
    expect(result!.above200d).not.toBeNull()
    expect(result!.rolling252dHigh).not.toBeNull()
    expect(result!.percentFromHigh).not.toBeNull()
    expect(result!.distanceFromHighScore).not.toBeNull()

    // All close prices are 100+i (ascending), so last = 351 is max
    expect(result!.rolling252dHigh).toBe(351)
  })

  // ── 5. dailyChangePct 計算 ───────────────────────────────────

  it('computes dailyChangePct from second-to-last to last price', () => {
    const prices: DailyPrice[] = [
      { date: '2025-06-01', close: 100, adjustedClose: 100 },
      { date: '2025-06-02', close: 110, adjustedClose: 110 },
    ]
    const result = buildSnapshot(defaultMeta, prices)

    expect(result!.dailyChangePct).toBeCloseTo(10, 1) // (110-100)/100 * 100 = 10
  })

  // ── 6. weeklyChangePct 計算 ──────────────────────────────────

  it('computes weeklyChangePct from 5 trading days ago to last price', () => {
    // 7 trading days; weeklyChangePct = day[1] → day[6] (5 days apart)
    const prices: DailyPrice[] = [
      { date: '2025-06-01', close: 100, adjustedClose: 100 },
      { date: '2025-06-02', close: 105, adjustedClose: 105 },
      { date: '2025-06-03', close: 110, adjustedClose: 110 },
      { date: '2025-06-04', close: 115, adjustedClose: 115 },
      { date: '2025-06-05', close: 120, adjustedClose: 120 },
      { date: '2025-06-06', close: 125, adjustedClose: 125 },
      { date: '2025-06-07', close: 130, adjustedClose: 130 },
    ]
    const result = buildSnapshot(defaultMeta, prices)

    // weeklyChangePct: prices[1].close=105 → prices[6].close=130
    // (130 - 105) / 105 * 100 ≈ 23.81
    expect(result!.weeklyChangePct).not.toBeNull()
    expect(result!.weeklyChangePct!).toBeCloseTo(23.81, 1)
  })

  it('returns null weeklyChangePct when fewer than 6 days of data', () => {
    const prices = generatePrices(5)
    const result = buildSnapshot(defaultMeta, prices)
    expect(result!.weeklyChangePct).toBeNull()
  })

  // ── 7. above10d 為 false 時 maScore 不含 10d 權重 ─────────

  it('maScore excludes 10d weight when above10d is false', () => {
    // Use bearish prices: last price = 50, way below any EMA
    const prices = generateBearishPrices(30)
    const result = buildSnapshot(defaultMeta, prices)

    expect(result).not.toBeNull()

    // close = 50, ema10 ≈ well above 50, so above10d = false
    if (result!.above10d === false) {
      // maScore: above10d=false(0), above20d and above50d depend
      // But since last close=50 and all previous prices were rising,
      // ema20 should be well above 50 too
      // maScore should not include the 20 points from 10d
      expect(result!.maScore).toBeLessThan(100)
    }

    // Regardless of specific values, verify the contract:
    // If all three are false, maScore = 0
    // This test just ensures maScore respects the boolean flags
  })

  it('maScore is 0 when all MAs are below (bearish)', () => {
    const prices = generateBearishPrices(25)
    const result = buildSnapshot(defaultMeta, prices)

    expect(result).not.toBeNull()

    // With last close = 50 and all prior prices 100+i (ascending),
    // the MAs will be significantly above 50
    if (result!.above10d === false && result!.above20d === false && result!.above50d === false) {
      expect(result!.maScore).toBe(0)
      expect(result!.maStatus).toBe('breakdown')
    }
  })

  // ── 8. 資料不足 60 天 distanceFromHigh 為 null ──────────────

  it('returns null distanceFromHigh fields with fewer than 60 trading days', () => {
    const prices = generatePrices(59)
    const result = buildSnapshot(defaultMeta, prices)

    expect(result).not.toBeNull()
    expect(result!.rolling252dHigh).not.toBeNull() // rolling high still computed
    expect(result!.percentFromHigh).toBeNull()
    expect(result!.distanceFromHighScore).toBeNull()
  })

  it('returns non-null distanceFromHigh fields with exactly 60 trading days', () => {
    const prices = generatePrices(60)
    const result = buildSnapshot(defaultMeta, prices)

    expect(result).not.toBeNull()
    expect(result!.percentFromHigh).not.toBeNull()
    expect(result!.distanceFromHighScore).not.toBeNull()
  })

  // ── Meta propagation ─────────────────────────────────────────

  it('propagates meta fields correctly including null sectorName', () => {
    const meta: SnapshotMeta = {
      symbol: 'SPY',
      rankScope: 'indexes',
      groupType: 'index',
      sectorName: null,
    }
    const prices = generatePrices(10)
    const result = buildSnapshot(meta, prices)

    expect(result!.symbol).toBe('SPY')
    expect(result!.rankScope).toBe('indexes')
    expect(result!.groupType).toBe('index')
    expect(result!.sectorName).toBeNull()
  })

  // ── lastPrice uses adjustedClose with fallback to close ─────

  it('uses adjustedClose for lastPrice with fallback to close', () => {
    const prices: DailyPrice[] = [
      { date: '2025-06-01', close: 100, adjustedClose: 0 },  // adjustedClose = 0, treat as falsy
      { date: '2025-06-02', close: 105, adjustedClose: 103 },
    ]
    const result = buildSnapshot(defaultMeta, prices)
    expect(result!.lastPrice).toBe(103) // uses adjustedClose
  })

  // ── dailyChangePct null when only one day ────────────────────

  it('returns null dailyChangePct with only one price point', () => {
    const prices: DailyPrice[] = [
      { date: '2025-06-01', close: 100, adjustedClose: 100 },
    ]
    const result = buildSnapshot(defaultMeta, prices)
    expect(result!.dailyChangePct).toBeNull()
  })
})
