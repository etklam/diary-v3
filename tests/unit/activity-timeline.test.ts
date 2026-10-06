import { describe, expect, it } from 'vitest'
import { groupActivityDays, groupActivityEvents, mergeActivityEvents } from '@diary/domain'
import { ACTIVITY_GROUP_KINDS, ACTIVITY_KIND_RANK, activityTimelineQuerySchema } from '@diary/contracts/activity-timeline'
import { destinationLabel, destinations, matchScore, symbolCandidate } from '../../apps/web/app/destinations'

describe('activity event grouping', () => {
  it('orders a day by kind — diary, trades, then reviews — and ties by descending id', () => {
    const events = [
      { id: 'REVIEW:4', date: '2026-05-10', kind: 'REVIEW' as const },
      { id: 'TRADE:9', date: '2026-05-10', kind: 'TRADE' as const },
      { id: 'TRADE:12', date: '2026-05-10', kind: 'TRADE' as const },
      { id: 'DIARY:4', date: '2026-05-10', kind: 'DIARY' as const },
      { id: 'DIARY:3', date: '2026-04-30', kind: 'DIARY' as const },
    ]
    expect(groupActivityEvents(events)).toEqual([
      { period: '2026-05', entries: [
        { id: 'DIARY:4', date: '2026-05-10', kind: 'DIARY' },
        { id: 'TRADE:12', date: '2026-05-10', kind: 'TRADE' },
        { id: 'TRADE:9', date: '2026-05-10', kind: 'TRADE' },
        { id: 'REVIEW:4', date: '2026-05-10', kind: 'REVIEW' },
      ] },
      { period: '2026-04', entries: [{ id: 'DIARY:3', date: '2026-04-30', kind: 'DIARY' }] },
    ])
  })

  it('compares ids beyond the safe integer range without precision loss', () => {
    const events = [
      { id: 'DIARY:9007199254740993', date: '2026-05-10', kind: 'DIARY' as const },
      { id: 'DIARY:9007199254740992', date: '2026-05-10', kind: 'DIARY' as const },
    ]
    expect(groupActivityEvents(events)[0]!.entries.map(event => event.id))
      .toEqual(['DIARY:9007199254740993', 'DIARY:9007199254740992'])
  })

  it('keeps the first record for an id repeated within or across pages', () => {
    expect(mergeActivityEvents(
      [{ id: 'DIARY:1', title: 'Original' }],
      [{ id: 'DIARY:1', title: 'Overlap' }, { id: 'TRADE:1', title: 'New' }, { id: 'TRADE:1', title: 'Duplicate' }],
    )).toEqual([{ id: 'DIARY:1', title: 'Original' }, { id: 'TRADE:1', title: 'New' }])
  })

  it('never collides ids across kinds that share a source row id', () => {
    // A diary and its own completed review are both row 7; the feed shows both.
    expect(mergeActivityEvents([], [{ id: 'DIARY:7' }, { id: 'REVIEW:7' }])).toHaveLength(2)
  })

  it('ranks every kind, and every reading group maps to known kinds', () => {
    expect(new Set(Object.values(ACTIVITY_KIND_RANK)).size).toBe(4)
    for (const kinds of Object.values(ACTIVITY_GROUP_KINDS)) {
      for (const kind of kinds) expect(ACTIVITY_KIND_RANK[kind]).toBeGreaterThan(0)
    }
  })

  it('collapses a month into days that keep the within-day reading order', () => {
    const events = [
      { id: 'REVIEW:4', date: '2026-05-10', kind: 'REVIEW' as const },
      { id: 'TRADE:9', date: '2026-05-10', kind: 'TRADE' as const },
      { id: 'DIARY:4', date: '2026-05-10', kind: 'DIARY' as const },
      { id: 'DIARY:2', date: '2026-05-08', kind: 'DIARY' as const },
    ]
    const [month] = groupActivityEvents(events)
    expect(groupActivityDays(month!.entries)).toEqual([
      { date: '2026-05-10', entries: [
        { id: 'DIARY:4', date: '2026-05-10', kind: 'DIARY' },
        { id: 'TRADE:9', date: '2026-05-10', kind: 'TRADE' },
        { id: 'REVIEW:4', date: '2026-05-10', kind: 'REVIEW' },
      ] },
      { date: '2026-05-08', entries: [{ id: 'DIARY:2', date: '2026-05-08', kind: 'DIARY' }] },
    ])
  })

  it('groups nothing into nothing', () => {
    expect(groupActivityDays([])).toEqual([])
  })

  it('rejects a reversed range and an oversized page', () => {
    expect(activityTimelineQuerySchema.safeParse({ dateFrom: '2026-03-02', dateTo: '2026-03-01' }).success).toBe(false)
    expect(activityTimelineQuerySchema.safeParse({ limit: '101' }).success).toBe(false)
    expect(activityTimelineQuerySchema.safeParse({ group: 'alerts' }).success).toBe(false)
    expect(activityTimelineQuerySchema.parse({})).toEqual({ page: 1, limit: 20 })
  })
})

describe('command palette matching', () => {
  it('prefers a contiguous hit, then an earlier one, over a scattered one', () => {
    expect(matchScore('Trade plans', 'trade')).toBe(0)
    expect(matchScore('Strategy performance', 'performance')).toBe(9)
    // Scattered subsequences all rank behind every contiguous hit.
    expect(matchScore('Trade plans', 'trpl')!).toBeGreaterThan(999)
    expect(matchScore('Trade plans', 'zzz')).toBeNull()
  })

  it('matches a contained run of CJK characters', () => {
    expect(matchScore('複盤隊列', '複盤')).toBe(0)
    expect(matchScore('複盤隊列', '隊列')).toBe(2)
    expect(matchScore('複盤隊列', '持倉')).toBeNull()
  })

  it('treats an empty query as a match so the list has a resting state', () => {
    expect(matchScore('Holdings', '')).toBe(0)
  })

  it('reaches routes the sidebar has no slot for', () => {
    const paths = new Set(destinations('en').map(destination => destination.path))
    for (const path of [
      '/strategy-performance', '/etf/watchlist', '/settings/api-keys', '/settings/security',
      '/partners/compare', '/tools/sec-filings', '/tools/position-sizing', '/admin/gurus',
    ]) expect(paths).toContain(path)
  })

  it('keeps administration destinations flagged so a USER never sees them', () => {
    const admin = destinations('en').filter(destination => destination.admin)
    expect(admin.length).toBeGreaterThan(0)
    for (const destination of admin) expect(destination.path.startsWith('/admin/')).toBe(true)
  })

  it('names quick capture by its verb, not the library it shares a noun with', () => {
    const quick = destinations('zh-TW').find(destination => destination.path === '/diaries/quick')!
    expect(destinationLabel(quick, 'zh-TW')).toBe('快速記錄')
    const library = destinations('zh-TW').find(destination => destination.path === '/diaries')!
    expect(destinationLabel(library, 'zh-TW')).toBe('日記庫')
  })

  it('accepts a plausible ticker and rejects prose', () => {
    expect(symbolCandidate('aapl')).toBe('AAPL')
    expect(symbolCandidate(' brk.b ')).toBe('BRK.B')
    expect(symbolCandidate('持倉')).toBeNull()
    expect(symbolCandidate('')).toBeNull()
    expect(symbolCandidate('toolongsymbolhere')).toBeNull()
  })
})
