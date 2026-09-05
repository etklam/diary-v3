import { describe, expect, it } from 'vitest'
import { isRankScope } from '../../packages/domain/src/market-rotation/types'

describe('isRankScope', () => {
  it('accepts only V1 rank scopes', () => {
    expect(isRankScope('sectors')).toBe(true)
    expect(isRankScope('indexes')).toBe(true)
    expect(isRankScope('core')).toBe(true)
    expect(isRankScope('all')).toBe(false)
    expect(isRankScope('global')).toBe(false)
    expect(isRankScope('mixed')).toBe(false)
  })
})
