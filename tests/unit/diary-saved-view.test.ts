import { describe, expect, it } from 'vitest'
import { diarySavedViewCreateRequestSchema, diarySavedViewQuerySchema, diarySavedViewUpdateRequestSchema } from '@diary/contracts/diary-saved-view'

describe('diary saved view contracts', () => {
  it('keeps pagination and unknown fields out of persisted query state', () => {
    expect(diarySavedViewQuerySchema.safeParse({ page: 2 }).success).toBe(false)
    expect(diarySavedViewCreateRequestSchema.safeParse({ name: 'Research', query: { sortBy: 'date-desc' } }).success).toBe(true)
  })

  it('enforces supported date ranges and non-empty update patches', () => {
    expect(diarySavedViewQuerySchema.safeParse({ dateFrom: '2026-02-01', dateTo: '2026-01-01' }).success).toBe(false)
    expect(diarySavedViewUpdateRequestSchema.safeParse({}).success).toBe(false)
    expect(diarySavedViewUpdateRequestSchema.safeParse({ name: 'Renamed' }).success).toBe(true)
  })
})
