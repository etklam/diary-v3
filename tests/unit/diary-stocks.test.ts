import { describe, expect, it } from 'vitest'
import { DiaryStockLimitError, mergeDiaryStockSymbols } from '../../apps/api/src/diary-stocks'

describe('Diary company association limits', () => {
  it('deduplicates an append union without changing the existing order', () => {
    expect(mergeDiaryStockSymbols(['AAPL', 'MSFT'], ['MSFT', 'NVDA'])).toEqual(['AAPL', 'MSFT', 'NVDA'])
  })

  it('rejects an append that would exceed the persisted ten-symbol limit', () => {
    const existing = Array.from({ length: 10 }, (_, index) => `SYM${index}`)
    expect(() => mergeDiaryStockSymbols(existing, ['NVDA'])).toThrow(DiaryStockLimitError)
    expect(() => mergeDiaryStockSymbols(existing, ['NVDA'])).toThrow(/at most 10 company symbols/)
  })
})
