import type { PortfolioAttentionItem, PortfolioAttentionResponse, PortfolioAttentionReason } from '@diary/contracts/portfolio-attention'
import type { PortfolioValuationResponse } from '@diary/contracts/portfolio'
import { diarySummaryListResponseSchema } from '@diary/contracts/diary-summary'
import type { ReviewGroups, ReviewItem } from '@diary/contracts/review-queue'
import { tradePlanListResponseSchema } from '@diary/contracts/trade-plan'
import type { StockWatchlistResponse } from '@diary/contracts/watchlist'
import type { z } from 'zod'

type DiarySummaryListResponse = z.infer<typeof diarySummaryListResponseSchema>
type TradePlanListResponse = z.infer<typeof tradePlanListResponseSchema>

export type OverviewReviewBucket = 'overdue' | 'today'
export type OverviewAttentionRow = {
  key: string
  source: 'attention' | 'reviews'
  reason: PortfolioAttentionReason | 'review'
  reviewBucket: OverviewReviewBucket | null
  targetType: 'stock' | 'diary' | 'thesis'
  targetId: string
  symbol: string | null
  title: string
  href: string
  dueAt: string | null
  concentrationPct: number | null
  priority: number
}

const priority: Record<PortfolioAttentionReason | 'overdue_thesis' | 'overdue_diary' | 'today_thesis' | 'today_diary', number> = {
  invalidated_thesis_while_held: 1,
  overdue_thesis_review: 2,
  overdue_diary_review: 3,
  overdue_thesis: 2,
  overdue_diary: 3,
  today_thesis: 4,
  today_diary: 5,
  position_concentration: 6,
  missing_thesis: 7,
}

function normalizedSymbol(value: string | null | undefined) {
  return value?.trim().toUpperCase() ?? ''
}

function reviewKey(item: ReviewItem | PortfolioAttentionItem) {
  if ('targetKind' in item) {
    if (item.targetKind === 'diary') return `review:diary:${item.targetId}`
    const symbol = normalizedSymbol(item.symbol)
    return symbol ? `review:thesis:${symbol}` : `review:thesis:id:${item.targetId}`
  }
  if (item.targetType === 'diary') return `review:diary:${item.id}`
  const symbol = normalizedSymbol(item.symbol)
  return symbol ? `review:thesis:${symbol}` : `review:thesis:id:${item.thesisId}`
}

function attentionHref(item: PortfolioAttentionItem) {
  if (item.targetKind === 'diary') return `/diaries/${item.targetId}/review`
  return item.reason === 'position_concentration'
    ? `/stocks/${encodeURIComponent(item.targetId)}`
    : `/stocks/${encodeURIComponent(item.targetId)}/thesis`
}

function attentionRow(item: PortfolioAttentionItem): OverviewAttentionRow {
  const review = item.reason === 'overdue_thesis_review' || item.reason === 'overdue_diary_review'
  return {
    key: review ? reviewKey(item) : `${item.targetKind}:${item.targetId}:${item.reason}`,
    source: 'attention',
    reason: item.reason,
    reviewBucket: null,
    targetType: item.targetKind,
    targetId: item.targetId,
    symbol: item.symbol,
    title: item.evidence.title ?? item.symbol ?? item.targetId,
    href: attentionHref(item),
    dueAt: item.evidence.reviewDueAt ?? null,
    concentrationPct: item.evidence.concentrationPct ?? null,
    priority: priority[item.reason],
  }
}

function queueRow(item: ReviewItem, reviewBucket: OverviewReviewBucket): OverviewAttentionRow {
  const thesis = item.targetType === 'thesis'
  const symbol = thesis ? normalizedSymbol(item.symbol) || null : null
  const targetId = item.targetType === 'diary' ? item.id : symbol ?? item.thesisId
  return {
    key: reviewKey(item),
    source: 'reviews',
    reason: 'review',
    reviewBucket,
    targetType: item.targetType,
    targetId,
    symbol,
    title: item.title,
    href: item.targetType === 'diary'
      ? `/diaries/${item.id}/review`
      : symbol ? `/stocks/${encodeURIComponent(symbol)}/thesis` : '/reviews?target=thesis',
    dueAt: item.reviewDueAt,
    concentrationPct: null,
    priority: priority[`${reviewBucket}_${thesis ? 'thesis' : 'diary'}`],
  }
}

/**
 * Build the bounded current-action list. Review queue rows replace equivalent
 * attention rows so account-local bucket semantics win over UTC-only evidence.
 */
export function buildOverviewAttentionRows(
  attention: PortfolioAttentionResponse | null,
  reviews: ReviewGroups | null,
): OverviewAttentionRow[] {
  const rows = new Map<string, OverviewAttentionRow>()
  for (const item of attention?.items ?? []) {
    const row = attentionRow(item)
    if (!rows.has(row.key)) rows.set(row.key, row)
  }
  for (const bucket of ['overdue', 'today'] as const) {
    for (const item of reviews?.[bucket] ?? []) rows.set(reviewKey(item), queueRow(item, bucket))
  }
  return [...rows.values()].sort((left, right) => {
    if (left.priority !== right.priority) return left.priority - right.priority
    const leftDue = left.dueAt ? Date.parse(left.dueAt) : Number.MAX_SAFE_INTEGER
    const rightDue = right.dueAt ? Date.parse(right.dueAt) : Number.MAX_SAFE_INTEGER
    if (leftDue !== rightDue) return leftDue - rightDue
    const target = `${left.targetType}:${left.targetId}`.localeCompare(`${right.targetType}:${right.targetId}`)
    return target || left.key.localeCompare(right.key)
  })
}

export function isOverviewFirstUse(input: {
  attention: PortfolioAttentionResponse
  reviews: ReviewGroups
  recent: DiarySummaryListResponse
  valuation: PortfolioValuationResponse
  plans: TradePlanListResponse
  watchlist: StockWatchlistResponse
}): boolean {
  const { attention, reviews, recent, valuation, plans, watchlist } = input
  return attention.items.length === 0
    && Object.values(reviews.counts).every(count => count === 0)
    && recent.pagination.total === 0
    && plans.pagination.total === 0
    && valuation.valuation.valuationStatus === 'empty'
    && valuation.valuation.totalHoldings === 0
    && watchlist.items.length === 0
}
