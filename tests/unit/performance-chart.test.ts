import { describe, expect, it } from 'vitest'
import { MIN_CHART_POINTS, chartAxisLabels, chartBarWidth } from '../../apps/web/app/performance-chart'

describe('performance chart cardinality', () => {
  it('does not draw a chart below three points', () => {
    expect(MIN_CHART_POINTS).toBe(3)
  })

  it('caps a bar so one category cannot render as a slab', () => {
    // The old formula was `640 / count * 0.7` uncapped: one category drew a
    // 448px bar against a 160px plot height, which read as a rendering failure.
    expect(640 / 1 * 0.7).toBe(448)
    expect(chartBarWidth(1)).toBe(48)
    expect(chartBarWidth(2)).toBe(48)
    expect(chartBarWidth(MIN_CHART_POINTS)).toBe(48)
  })

  it('leaves dense charts exactly as they were', () => {
    // At ten categories the uncapped width is already below the cap, so the
    // populated case this page was built against is unchanged.
    expect(chartBarWidth(10)).toBeCloseTo(44.8, 6)
    expect(chartBarWidth(20)).toBeCloseTo(22.4, 6)
    expect(chartBarWidth(40)).toBeCloseTo(11.2, 6)
  })

  it('prints one centred label when every point carries the same one', () => {
    const same = [{ label: '2026-09' }, { label: '2026-09' }, { label: '2026-09' }]
    expect(chartAxisLabels(same)).toEqual(['2026-09'])
    expect(chartAxisLabels([{ label: 'AAPL' }])).toEqual(['AAPL'])
  })

  it('prints both ends when they differ', () => {
    expect(chartAxisLabels([{ label: '2026-01' }, { label: '2026-02' }, { label: '2026-04' }]))
      .toEqual(['2026-01', '2026-04'])
  })

  it('has no labels to print for an empty series', () => {
    expect(chartAxisLabels([])).toEqual([])
  })
})
