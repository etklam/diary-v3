import { describe, expect, it } from 'vitest'
import { diarySearchSnippet } from '../../apps/api/src/diary-search.js'

describe('diarySearchSnippet', () => {
  it('returns a bounded content excerpt with offsets relative to the excerpt', () => {
    const result = diarySearchSnippet([{ source: 'content', value: 'Before '.repeat(80) + 'target phrase' }], 'target phrase', 40)
    expect(result?.source).toBe('content')
    expect(result?.text).toContain('target phrase')
    expect(result && result.text.slice(result.matchStart, result.matchEnd)).toBe('target phrase')
    expect(result?.text.length).toBeLessThanOrEqual(42)
  })

  it('reports the source of a title, tag or symbol match', () => {
    expect(diarySearchSnippet([{ source: 'title', value: 'AAPL thesis' }, { source: 'tag', value: 'earnings' }], 'earnings')?.source).toBe('tag')
    expect(diarySearchSnippet([{ source: 'symbol', value: '2330' }], '330')?.source).toBe('symbol')
  })

  it('keeps substring and case-insensitive semantics for multilingual text', () => {
    const result = diarySearchSnippet([{ source: 'content', value: '需求仍未確認回升。' }], '未確認')
    expect(result).toMatchObject({ text: '需求仍未確認回升。', matchStart: 3, matchEnd: 6 })
  })

  it('maps case-fold expansions back to original offsets and preserves emoji boundaries', () => {
    const expanded = diarySearchSnippet([{ source: 'content', value: 'İXtarget' }], 'target')
    expect(expanded).toMatchObject({ matchStart: 2, matchEnd: 8 })
    expect(expanded?.text.slice(expanded.matchStart, expanded.matchEnd)).toBe('target')
    const emoji = diarySearchSnippet([{ source: 'content', value: '🙂'.repeat(160) + 'needle' + 'x'.repeat(160) }], 'needle', 24)
    expect(emoji?.text).toBeDefined()
    expect(emoji?.text).not.toMatch(/[\uD800-\uDFFF]/u)
    expect(emoji && emoji.text.slice(emoji.matchStart, emoji.matchEnd)).toBe('needle')
  })

  it('keeps a maximum-length query intact when the match is late in a long field', () => {
    const query = 'q'.repeat(500)
    const value = 'prefix '.repeat(80) + query + ' suffix'.repeat(80)
    const result = diarySearchSnippet([{ source: 'content', value }], query)
    expect(result).toBeDefined()
    expect(result!.text.length).toBeLessThanOrEqual(502)
    expect(result!.matchEnd).toBeLessThanOrEqual(result!.text.length)
    expect(result!.text.slice(result!.matchStart, result!.matchEnd)).toBe(query)
  })

  it('rounds context around a long query without splitting a surrogate pair', () => {
    const query = 'q'.repeat(498)
    const value = '🙂'.repeat(100) + query + '🙂'.repeat(100)
    const result = diarySearchSnippet([{ source: 'content', value }], query)
    expect(result).toBeDefined()
    expect(result!.text.length).toBeLessThanOrEqual(502)
    expect(result!.text.slice(result!.matchStart, result!.matchEnd)).toBe(query)
    expect(result!.text).not.toMatch(/[\uD800-\uDFFF]/u)
  })
})
