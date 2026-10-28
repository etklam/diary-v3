import { describe, expect, it } from 'vitest'
import type { PortfolioAttentionItem, PortfolioAttentionResponse } from '@diary/contracts/portfolio-attention'
import type { PortfolioValuationResponse } from '@diary/contracts/portfolio'
import type { ReviewGroups, ReviewItem } from '@diary/contracts/review-queue'
import type { StockWatchlistResponse } from '@diary/contracts/watchlist'
import { buildOverviewAttentionRows, isOverviewFirstUse } from '../../apps/web/app/overview-logic'

const attentionItem = (overrides: Partial<PortfolioAttentionItem> = {}): PortfolioAttentionItem =>
  ({
    id: 'attention:1',
    reason: 'overdue_diary_review',
    targetKind: 'diary',
    targetId: '7',
    symbol: null,
    priority: 1,
    action: 'Review this diary',
    evidence: { title: 'Demand review', reviewDueAt: '2026-09-11T16:00:00Z' },
    asOf: '2026-09-12T00:00:00Z',
    ...overrides,
  }) as PortfolioAttentionItem

const diaryReview = (overrides: Partial<ReviewItem> = {}): ReviewItem =>
  ({
    targetType: 'diary',
    id: '7',
    title: 'Demand review',
    date: '2026-09-05',
    thesis: 'Demand should recover.',
    risk: 'The evidence may change.',
    reviewDueAt: '2026-09-11T16:00:00Z',
    reviewStatus: 'pending',
    reviewedAt: null,
    reviewOutcome: null,
    stockSymbols: [],
    ...overrides,
  }) as ReviewItem

const thesisReview = (overrides: Partial<ReviewItem> = {}): ReviewItem =>
  ({
    targetType: 'thesis',
    id: 'thesis:12',
    thesisId: '12',
    title: 'AAPL · Investment thesis',
    date: '2026-09-05T00:00:00Z',
    thesis: 'Demand should recover.',
    risk: null,
    reviewDueAt: '2026-09-12T01:00:00Z',
    reviewStatus: 'pending',
    reviewedAt: null,
    reviewOutcome: null,
    symbol: 'AAPL',
    thesisStatus: 'ACTIVE',
    latestReviewOutcome: null,
    portfolioDecision: null,
    ...overrides,
  }) as ReviewItem

const attentionResponse = (items: PortfolioAttentionItem[]): PortfolioAttentionResponse => ({
  items,
  asOf: '2026-09-12T00:00:00Z',
  coverage: { valuationStatus: 'complete', complete: true, priced: 1, total: 1 },
})

const emptyReviews: ReviewGroups = {
  counts: { overdue: 0, today: 0, upcoming: 0, unscheduled: 0, completed: 0 },
  unscheduled: [],
  overdue: [],
  today: [],
  upcoming: [],
  completed: [],
}

const emptyValuation: PortfolioValuationResponse = {
  holdings: [],
  valuation: {
    totalHoldings: 0,
    totalCost: 0,
    currentMarketValue: null,
    unrealizedAmount: null,
    unrealizedPct: null,
    totalDayChange: null,
    totalDayChangePercent: null,
    largestPositionPct: null,
    top3ConcentrationPct: null,
    activePositionCount: 0,
    concentrationWarning: false,
    largestPositionSymbol: null,
    pricedPositionCount: 0,
    unpricedPositionCount: 0,
    pricedCostBasis: 0,
    unpricedCostBasis: 0,
    quoteCoveragePct: 0,
    valuationAsOf: null,
    staleQuoteCount: 0,
    valuationStatus: 'empty',
    unsupportedMetrics: ['ytdReturn', 'realCashPercentage', 'sectorConcentration'],
  },
  quoteErrors: [],
  marketState: null,
}

describe('overview attention projection', () => {
  it('uses the account-local review row when an earlier UTC due time is also today', () => {
    const rows = buildOverviewAttentionRows(attentionResponse([attentionItem()]), {
      ...emptyReviews,
      counts: { ...emptyReviews.counts, today: 1 },
      today: [diaryReview()],
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ source: 'reviews', reviewBucket: 'today', key: 'review:diary:7' })
  })

  it('keeps distinct reasons for one target while sorting by the accepted priority', () => {
    const rows = buildOverviewAttentionRows(
      attentionResponse([
        attentionItem({
          id: 'attention:review',
          reason: 'overdue_thesis_review',
          targetKind: 'stock',
          targetId: 'AAPL',
          symbol: 'AAPL',
          evidence: { title: 'AAPL', reviewDueAt: '2026-09-11T01:00:00Z' },
        }),
        attentionItem({
          id: 'attention:missing',
          reason: 'missing_thesis',
          targetKind: 'stock',
          targetId: 'AAPL',
          symbol: 'AAPL',
          evidence: { title: 'AAPL' },
        }),
        attentionItem({
          id: 'attention:concentration',
          reason: 'position_concentration',
          targetKind: 'stock',
          targetId: 'AAPL',
          symbol: 'AAPL',
          evidence: { title: 'AAPL', concentrationPct: 42 },
        }),
        attentionItem({
          id: 'attention:invalidated',
          reason: 'invalidated_thesis_while_held',
          targetKind: 'stock',
          targetId: 'AAPL',
          symbol: 'AAPL',
          evidence: { title: 'AAPL' },
        }),
      ]),
      { ...emptyReviews, counts: { ...emptyReviews.counts, today: 1 }, today: [thesisReview()] },
    )

    expect(rows).toHaveLength(4)
    expect(rows.map(row => row.reason)).toEqual([
      'invalidated_thesis_while_held',
      'review',
      'position_concentration',
      'missing_thesis',
    ])
    expect(rows[1]).toMatchObject({ source: 'reviews', reviewBucket: 'today', key: 'review:thesis:AAPL', priority: 4 })
    expect(rows[2]).toMatchObject({ concentrationPct: 42, key: 'stock:AAPL:position_concentration' })
  })
})

describe('overview first-use projection', () => {
  const watchItem = {
    id: 'w1',
    status: 'WATCHING',
    sortOrder: 0,
    pinned: false,
    updatedAt: '2026-09-12T00:00:00Z',
    stock: { symbol: 'AAPL', name: null },
    recordCount: 0,
    latestRecord: null,
  } as StockWatchlistResponse['items'][number]

  const emptyInput = {
    attention: attentionResponse([]),
    reviews: emptyReviews,
    recent: { data: [], pagination: { page: 1, limit: 3, total: 0, totalPages: 0 } },
    valuation: emptyValuation,
    plans: { data: [], pagination: { page: 1, limit: 5, total: 0, totalPages: 0 } },
    watchlist: { items: [] },
  }

  it('requires completed reviews to be empty too', () => {
    expect(isOverviewFirstUse(emptyInput)).toBe(true)
    expect(
      isOverviewFirstUse({
        ...emptyInput,
        reviews: { ...emptyReviews, counts: { ...emptyReviews.counts, completed: 1 } },
      }),
    ).toBe(false)
  })

  // Ticket 136. Before it, every one of the six had to have resolved, so a slow
  // or failed section hid the welcome screen from the accounts it exists for.
  describe('with resources that have not resolved', () => {
    it('answers from the diary count alone when nothing else has arrived', () => {
      expect(isOverviewFirstUse({ recent: emptyInput.recent })).toBe(true)
    })

    it('treats an unresolved supporting resource as unknown, not as content', () => {
      for (const absent of ['attention', 'reviews', 'valuation', 'plans', 'watchlist'] as const) {
        expect(isOverviewFirstUse({ ...emptyInput, [absent]: null })).toBe(true)
      }
    })

    it('still defers to a resolved resource that holds content', () => {
      expect(
        isOverviewFirstUse({
          ...emptyInput,
          attention: null,
          watchlist: { items: [watchItem] },
        }),
      ).toBe(false)
      expect(
        isOverviewFirstUse({
          ...emptyInput,
          reviews: null,
          plans: { data: [], pagination: { page: 1, limit: 5, total: 2, totalPages: 1 } },
        }),
      ).toBe(false)
    })

    // A count that never arrived is not evidence of an empty account; showing
    // the welcome there would claim something the page does not know.
    it('is false while the diary count is unresolved', () => {
      expect(isOverviewFirstUse({ recent: null })).toBe(false)
      expect(isOverviewFirstUse({ ...emptyInput, recent: null })).toBe(false)
    })

    it('is false once the diary count reports an entry, whatever else is unknown', () => {
      expect(
        isOverviewFirstUse({
          recent: { data: [], pagination: { page: 1, limit: 3, total: 1, totalPages: 1 } },
        }),
      ).toBe(false)
    })
  })
})
