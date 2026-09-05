import { describe, expect, it } from 'vitest'
import {
  ATTENTION_PRIORITY,
  evaluatePortfolioAttention,
  type PortfolioAttentionInput,
} from '../packages/domain/src/portfolio-attention'

const AS_OF = new Date('2026-08-11T00:00:00.000Z')

function evaluate(overrides: Partial<PortfolioAttentionInput> = {}) {
  return evaluatePortfolioAttention({
    holdings: [{ symbol: ' msft ', quantity: 10, concentrationPct: 12 }],
    theses: [{ symbol: 'MSFT', status: 'active' }],
    asOf: AS_OF,
    ...overrides,
  })
}

describe('evaluatePortfolioAttention', () => {
  it('returns missing thesis for an active holding with no current thesis', () => {
    const items = evaluate({ theses: [] })

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      id: 'stock:MSFT:missing_thesis',
      reason: 'missing_thesis',
      targetKind: 'stock',
      symbol: 'MSFT',
    })
  })

  it('treats a draft thesis as missing while preserving its outcome evidence', () => {
    const items = evaluate({ theses: [{ symbol: 'MSFT', status: 'draft', latestOutcome: 'UNCLEAR' }] })

    expect(items[0]).toMatchObject({ reason: 'missing_thesis', evidence: { latestOutcome: 'UNCLEAR' } })
  })

  it('surfaces an overdue thesis review at the supplied as-of instant', () => {
    const items = evaluate({
      theses: [{ symbol: 'MSFT', status: 'active', reviewDueAt: '2026-08-10T23:59:59.000Z' }],
    })

    expect(items[0]).toMatchObject({ reason: 'overdue_thesis_review', symbol: 'MSFT' })
    expect(items[0]?.priority).toBe(ATTENTION_PRIORITY.overdue_thesis_review)
  })

  it('does not classify a due date exactly at as-of as overdue', () => {
    const items = evaluate({
      theses: [{ symbol: 'MSFT', status: 'active', reviewDueAt: AS_OF }],
    })

    expect(items).toEqual([])
  })

  it('clears overdue once a review is recorded at/after the due date', () => {
    // completeThesisReview sets lastReviewedAt without advancing
    // reviewDueAt — the overdue signal must flip off on that alone.
    const reviewedAfterDue = evaluate({
      theses: [{
        symbol: 'MSFT',
        status: 'active',
        reviewDueAt: '2026-08-10T23:59:59.000Z',
        lastReviewedAt: '2026-08-10T23:59:59.000Z',
        latestOutcome: 'ON_TRACK',
      }],
    })
    const staleReviewOnly = evaluate({
      theses: [{
        symbol: 'MSFT',
        status: 'active',
        reviewDueAt: '2026-08-10T23:59:59.000Z',
        lastReviewedAt: '2026-08-09T00:00:00.000Z',
        latestOutcome: 'ON_TRACK',
      }],
    })

    expect(reviewedAfterDue).toEqual([])
    expect(staleReviewOnly[0]).toMatchObject({ reason: 'overdue_thesis_review', symbol: 'MSFT' })
  })

  it('flips attention from overdue to clear when an overdue review is completed', () => {
    // Regression for the user-visible bug: reviewDueAt stays in the past,
    // only lastReviewedAt moves to "now" — the overdue card must disappear.
    const overdueThesis = {
      symbol: 'MSFT',
      status: 'active',
      reviewDueAt: '2026-08-10T23:59:59.000Z',
      latestOutcome: null,
    }
    const before = evaluate({ theses: [{ ...overdueThesis, lastReviewedAt: null }] })
    const after = evaluate({
      theses: [{ ...overdueThesis, lastReviewedAt: AS_OF.toISOString() }],
    })

    expect(before.map(item => item.reason)).toEqual(['overdue_thesis_review'])
    expect(after).toEqual([])
  })

  it('surfaces an invalidated thesis while the holding is still active', () => {
    const items = evaluate({
      theses: [{ symbol: 'MSFT', status: 'active', latestOutcome: 'INVALIDATED' }],
    })

    expect(items[0]).toMatchObject({ reason: 'invalidated_thesis_while_held' })
  })

  it('does not surface archived or closed holdings as thesis attention', () => {
    const archived = evaluate({
      theses: [{ symbol: 'MSFT', status: 'archived', latestOutcome: 'INVALIDATED' }],
    })
    const closed = evaluate({ holdings: [{ symbol: 'MSFT', quantity: 0, concentrationPct: 50 }] })

    expect(archived).toEqual([])
    expect(closed).toEqual([])
  })

  it('surfaces concentration only at or above the default threshold', () => {
    const below = evaluate({ holdings: [{ symbol: 'MSFT', quantity: 1, concentrationPct: 24.99 }] })
    const at = evaluate({ holdings: [{ symbol: 'MSFT', quantity: 1, concentrationPct: 25 }] })

    expect(below).toEqual([])
    expect(at[0]).toMatchObject({ reason: 'position_concentration', evidence: { concentrationPct: 25 } })
  })

  it('surfaces overdue Diary Reviews and skips completed or future reviews', () => {
    const items = evaluate({
      holdings: [],
      theses: [],
      diaryReviews: [
        { id: '1', title: 'Old decision', reviewDueAt: '2026-08-10T00:00:00.000Z', reviewStatus: 'pending' },
        { id: '2', title: 'Completed', reviewDueAt: '2026-08-01T00:00:00.000Z', reviewStatus: 'reviewed' },
        { id: '3', title: 'Future', reviewDueAt: '2026-08-12T00:00:00.000Z', reviewStatus: 'pending' },
      ],
    })

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      id: 'diary:1:overdue_diary_review',
      targetKind: 'diary',
      evidence: { title: 'Old decision' },
    })
  })

  it('deduplicates repeated upstream rows and sorts by priority then symbol', () => {
    const items = evaluate({
      holdings: [
        { symbol: 'msft', quantity: 1, concentrationPct: 30 },
        { symbol: ' MSFT ', quantity: 2, concentrationPct: 30 },
        { symbol: 'AAPL', quantity: 1, concentrationPct: 30 },
      ],
      theses: [
        { symbol: 'MSFT', status: 'active', latestOutcome: 'INVALIDATED' },
        { symbol: 'MSFT', status: 'active', latestOutcome: 'INVALIDATED' },
        { symbol: 'AAPL', status: 'active', latestOutcome: 'INVALIDATED' },
      ],
    })

    expect(items.map(item => item.id)).toEqual([
      'stock:AAPL:invalidated_thesis_while_held',
      'stock:MSFT:invalidated_thesis_while_held',
      'stock:AAPL:position_concentration',
      'stock:MSFT:position_concentration',
    ])
  })

  it('applies maxItems after deterministic sorting', () => {
    const items = evaluate({
      holdings: [
        { symbol: 'MSFT', quantity: 1, concentrationPct: 30 },
        { symbol: 'AAPL', quantity: 1, concentrationPct: 30 },
      ],
      theses: [
        { symbol: 'MSFT', status: 'active', latestOutcome: 'INVALIDATED' },
        { symbol: 'AAPL', status: 'active', latestOutcome: 'INVALIDATED' },
      ],
      maxItems: 1,
    })

    expect(items).toHaveLength(1)
    expect(items[0]?.symbol).toBe('AAPL')
  })
})

it('does not turn non-finite concentration into an actionable fact', () => {
  expect(evaluate({ holdings: [{ symbol: 'MSFT', quantity: 1, concentrationPct: Infinity }] })).toEqual([])
})
