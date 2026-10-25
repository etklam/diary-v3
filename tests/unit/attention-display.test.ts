import { describe, expect, it } from 'vitest'
import { ATTENTION_PRIORITY } from '@diary/domain/portfolio-attention'
import {
  attentionBandLabel,
  bandFromContractPriority,
  bandFromOverviewPriority,
  boundAttentionRuns,
  groupAttentionRuns,
} from '../../apps/web/app/attention-display'

describe('attention bands', () => {
  it('splits the contract priorities into already-wrong, dated and standing', () => {
    expect(bandFromContractPriority(ATTENTION_PRIORITY.invalidated_thesis_while_held)).toBe('high')
    expect(bandFromContractPriority(ATTENTION_PRIORITY.overdue_thesis_review)).toBe('high')
    expect(bandFromContractPriority(ATTENTION_PRIORITY.overdue_diary_review)).toBe('medium')
    expect(bandFromContractPriority(ATTENTION_PRIORITY.position_concentration)).toBe('low')
    expect(bandFromContractPriority(ATTENTION_PRIORITY.missing_thesis)).toBe('low')
  })

  it('reads the Overview scale, which runs the other way', () => {
    expect(bandFromOverviewPriority(1)).toBe('high')
    expect(bandFromOverviewPriority(2)).toBe('high')
    expect(bandFromOverviewPriority(3)).toBe('medium')
    expect(bandFromOverviewPriority(5)).toBe('medium')
    expect(bandFromOverviewPriority(6)).toBe('low')
    expect(bandFromOverviewPriority(7)).toBe('low')
  })

  it('names every band in every locale', () => {
    for (const locale of ['zh-TW', 'zh-CN', 'en']) {
      for (const band of ['high', 'medium', 'low'] as const) {
        expect(attentionBandLabel(band, locale)).toBeTruthy()
      }
    }
    // An unknown locale still names the band rather than rendering nothing.
    expect(attentionBandLabel('high', 'fr')).toBe(attentionBandLabel('high', 'en'))
  })
})

describe('grouping runs of one reason', () => {
  const rows = (...reasons: string[]) => reasons.map((reason, index) => ({ reason, id: `${reason}-${index}` }))

  it('collapses consecutive items that share a reason', () => {
    const runs = groupAttentionRuns(rows('overdue', 'missing', 'missing', 'missing'), row => row.reason)
    expect(runs.map(run => run.length)).toEqual([1, 3])
  })

  it('does not regroup across the priority order it was given', () => {
    // Reordering to merge the two "missing" runs would reorder the region to
    // suit its own rendering, which is the information the order carries.
    const runs = groupAttentionRuns(rows('missing', 'overdue', 'missing'), row => row.reason)
    expect(runs.map(run => run.length)).toEqual([1, 1, 1])
  })

  it('leaves an empty list empty', () => {
    expect(groupAttentionRuns([], () => 'x')).toEqual([])
  })
})

describe('bounding the region', () => {
  const runs = (...sizes: number[]) =>
    sizes.map((size, index) => Array.from({ length: size }, (_, item) => `${index}-${item}`))

  it('shows everything when it fits', () => {
    expect(boundAttentionRuns(runs(1, 2), 5)).toEqual({ shown: runs(1, 2), remaining: 0 })
  })

  it('counts the individual items the dropped runs account for, not the runs', () => {
    const result = boundAttentionRuns(runs(1, 1, 1, 1, 1, 3, 4), 5)
    expect(result.shown).toHaveLength(5)
    expect(result.remaining).toBe(7)
  })
})
