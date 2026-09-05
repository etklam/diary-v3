// Runnable check for the ticket61 fixture: seed invariants plus the rotation
// verifier accepting a well-formed monitor response and rejecting tampered ones.
import { describe, expect, it } from 'vitest'
import {
  CORE_UNIVERSE,
  FIXTURE,
  civilDaysBefore,
  diaryTitle,
  rotationSnapshotRows,
  verifyDiarySearch,
  verifyRotationMonitor,
} from './performance-fixture'

function monitorResponse() {
  const all = rotationSnapshotRows()
  const latest = all.filter(row => row.date === civilDaysBefore(0))
  const nameBySymbol = new Map(CORE_UNIVERSE.map(entry => [entry.symbol, entry.name]))
  return {
    asOfDate: civilDaysBefore(0),
    comparisonDate: civilDaysBefore(FIXTURE.comparisonOffset),
    rankScope: FIXTURE.rotationScope,
    marketState: 'unknown',
    rows: latest.map(row => ({
      ...row,
      name: nameBySymbol.get(row.symbol)!,
      signal: null,
      twoWeekTrend: Array.from({ length: FIXTURE.comparisonOffset + 1 }, (_, index) => ({
        date: civilDaysBefore(FIXTURE.comparisonOffset - index),
        value: 100,
      })),
    })),
  }
}

describe('performance fixture self-check', () => {
  it('seeds unique dates × unique core symbols', () => {
    const rows = rotationSnapshotRows()
    expect(rows).toHaveLength(FIXTURE.rotationDates * CORE_UNIVERSE.length)
    expect(new Set(rows.map(row => row.date))).toHaveLength(FIXTURE.rotationDates)
    expect(new Set(rows.map(row => row.symbol))).toHaveLength(CORE_UNIVERSE.length)
    expect(new Set(rows.map(row => `${row.date}:${row.symbol}`))).toHaveLength(rows.length)
  })

  it('rotation verifier accepts the well-formed monitor response', () => {
    expect(verifyRotationMonitor(monitorResponse())).toBe(true)
  })

  it('rotation verifier rejects tampered values, missing rows and short trends', () => {
    const good = monitorResponse()
    const tampered = structuredClone(good)
    tampered.rows[0]!.rsi14 = 12.34
    expect(verifyRotationMonitor(tampered)).toContain('rsi14')

    const dropped = structuredClone(good)
    dropped.rows = dropped.rows.slice(1)
    expect(verifyRotationMonitor(dropped)).toContain('rows count')

    const shortTrend = structuredClone(good)
    shortTrend.rows[3]!.twoWeekTrend = shortTrend.rows[3]!.twoWeekTrend.slice(1)
    expect(verifyRotationMonitor(shortTrend)).toContain('trend points')

    const shifted = structuredClone(good)
    shifted.comparisonDate = civilDaysBefore(9)
    expect(verifyRotationMonitor(shifted)).toContain('comparisonDate')

    const nonfinite = structuredClone(good) as { rows: Array<Record<string, unknown>> }
    nonfinite.rows[5]!.rotationScore = 'not-a-number'
    expect(verifyRotationMonitor(nonfinite)).toContain('rotationScore')
  })

  it('diary-search verifier expects the 20 newest marker rows in date-desc order', () => {
    const page = Array.from({ length: FIXTURE.pageSize }, (_, position) => ({ title: diaryTitle(position * 10) }))
    expect(verifyDiarySearch({ pagination: { total: FIXTURE.searchTotal }, data: page })).toBe(true)
    const reordered = [page[1], page[0], ...page.slice(2)]
    expect(verifyDiarySearch({ pagination: { total: FIXTURE.searchTotal }, data: reordered })).toContain('row 0 title')
    expect(verifyDiarySearch({ pagination: { total: 99 }, data: page })).toContain('matched total')
  })
})
