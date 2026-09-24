import { describe, expect, it } from 'vitest'
import { resolveArticleReadAccess } from '../../apps/api/src/article-policy'

const published = (access: string) => ({ status: 'PUBLISHED', publishedAt: new Date('2026-09-01T00:00:00Z'), access })

describe('article read policy', () => {
  it('allows guests to read published PUBLIC articles', () => {
    expect(resolveArticleReadAccess(published('PUBLIC'), undefined)).toBe('FULL')
  })

  it('locks published MEMBER articles for guests and allows valid users', () => {
    expect(resolveArticleReadAccess(published('MEMBER'), undefined)).toBe('LOCKED')
    expect(resolveArticleReadAccess(published('MEMBER'), { role: 'USER' })).toBe('FULL')
    expect(resolveArticleReadAccess(published('MEMBER'), { role: 'ADMIN' })).toBe('FULL')
  })

  it('keeps unpublished articles unavailable except for admin preview', () => {
    const draft = { status: 'DRAFT', publishedAt: null, access: 'PUBLIC' }
    expect(resolveArticleReadAccess(draft, undefined)).toBe('NOT_FOUND')
    expect(resolveArticleReadAccess(draft, { role: 'USER' })).toBe('NOT_FOUND')
    expect(resolveArticleReadAccess(draft, { role: 'ADMIN' })).toBe('NOT_FOUND')
    expect(resolveArticleReadAccess(draft, { role: 'ADMIN' }, { allowAdminPreview: true })).toBe('FULL')
  })

  it('fails closed for unknown access values', () => {
    expect(resolveArticleReadAccess(published('PREMIUM'), { role: 'ADMIN' }, { allowAdminPreview: true })).toBe('NOT_FOUND')
  })
})

