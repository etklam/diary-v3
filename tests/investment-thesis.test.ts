import { expect, it } from 'vitest'
import { deriveInvestmentThesisHealth, replaceInvestmentThesis } from '@diary/domain/investment-thesis'
const now = new Date('2026-09-05T10:00:00Z')
it('preserves full replacement, activation requirements and first activation timestamp', () => {
  expect(() => replaceInvestmentThesis({ status: 'ACTIVE', summary: 'Only summary' }, null, now)).toThrow()
  const active = replaceInvestmentThesis({ status: 'ACTIVE', summary: ' Thesis ', whyIOwnIt: ' Reason ', risks: '   ' }, null, now)
  expect(active).toMatchObject({ status: 'ACTIVE', summary: 'Thesis', whyIOwnIt: 'Reason', risks: null, activatedAt: now.toISOString(), archivedAt: null })
  expect(replaceInvestmentThesis({}, active.activatedAt, now)).toMatchObject({ status: 'DRAFT', summary: null, whyIOwnIt: null, reviewDueAt: null, activatedAt: active.activatedAt })
  const archived = replaceInvestmentThesis({ status: 'ARCHIVED' }, active.activatedAt, now)
  expect(archived.archivedAt).toBe(now.toISOString())
  expect(replaceInvestmentThesis({ status: 'ACTIVE', summary: 'New', whyIOwnIt: 'New' }, archived.activatedAt, new Date('2027-01-01T00:00:00Z'))).toMatchObject({ activatedAt: active.activatedAt, archivedAt: null })
})
it('uses source health precedence and strict overdue boundary', () => {
  const base = { status: 'ACTIVE' as const, latestReviewOutcome: null, reviewDueAt: now.toISOString() }
  expect(deriveInvestmentThesisHealth(base, now)).toBe('healthy')
  expect(deriveInvestmentThesisHealth(base, new Date(now.getTime() + 1))).toBe('needs_review')
  expect(deriveInvestmentThesisHealth({ ...base, latestReviewOutcome: 'INVALIDATED' }, now)).toBe('invalidated')
  expect(deriveInvestmentThesisHealth({ ...base, status: 'DRAFT', latestReviewOutcome: 'INVALIDATED' }, now)).toBe('draft')
  expect(deriveInvestmentThesisHealth({ ...base, status: 'ARCHIVED', latestReviewOutcome: 'INVALIDATED' }, now)).toBe('archived')
})
