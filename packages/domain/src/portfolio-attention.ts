/**
 * Deterministic Portfolio Attention Engine.
 *
 * This module deliberately knows nothing about Prisma, HTTP or Vue. Callers
 * provide the current holding, thesis and review projections; the engine
 * returns stable, actionable attention items for an as-of instant.
 */

export const ATTENTION_REASONS = [
  'invalidated_thesis_while_held',
  'overdue_thesis_review',
  'overdue_diary_review',
  'position_concentration',
  'missing_thesis',
] as const

export type AttentionReason = typeof ATTENTION_REASONS[number]

export const ATTENTION_PRIORITY: Record<AttentionReason, number> = {
  invalidated_thesis_while_held: 500,
  overdue_thesis_review: 400,
  overdue_diary_review: 300,
  position_concentration: 200,
  missing_thesis: 100,
}

export interface AttentionHolding {
  symbol: string
  quantity: number
  concentrationPct?: number | null
  /** A caller may explicitly mark a row inactive when quantity is unavailable. */
  active?: boolean
}

export interface AttentionThesis {
  symbol: string
  status?: string | null
  reviewDueAt?: Date | string | null
  lastReviewedAt?: Date | string | null
  latestOutcome?: string | null
}

export interface AttentionDiaryReview {
  id: string
  title: string
  reviewDueAt?: Date | string | null
  reviewStatus?: string | null
  symbol?: string | null
}

export interface PortfolioAttentionInput {
  holdings: AttentionHolding[]
  theses: AttentionThesis[]
  diaryReviews?: AttentionDiaryReview[]
  asOf?: Date
  concentrationThresholdPct?: number
  maxItems?: number
}

export interface PortfolioAttentionItem {
  id: string
  reason: AttentionReason
  targetKind: 'stock' | 'diary'
  targetId: string
  symbol: string | null
  priority: number
  action: string
  evidence: {
    concentrationPct?: number | null
    reviewDueAt?: string | null
    latestOutcome?: string | null
    title?: string
  }
  asOf: string
}

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase()
}

function parseDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function isActiveHolding(holding: AttentionHolding): boolean {
  if (holding.active === false) return false
  return holding.quantity > 0
}

function isOpenThesis(thesis: AttentionThesis): boolean {
  return String(thesis.status ?? '').trim().toLowerCase() !== 'archived'
}

/**
 * Single-source overdue rule for thesis reviews: a thesis is overdue when its
 * due date has passed the baseline instant AND no review was recorded at or
 * after that due date. Completing an overdue review sets lastReviewedAt
 * without advancing reviewDueAt, so the review dashboard and the Timeline
 * attention engine must both clear the overdue signal through this predicate.
 */
export function isThesisReviewOverdue(
  thesis: Pick<AttentionThesis, 'reviewDueAt' | 'lastReviewedAt'>,
  baseline: Date,
): boolean {
  const dueAt = parseDate(thesis.reviewDueAt)
  if (!dueAt || dueAt.getTime() >= baseline.getTime()) return false
  const lastReviewedAt = parseDate(thesis.lastReviewedAt)
  return !lastReviewedAt || lastReviewedAt.getTime() < dueAt.getTime()
}

function addItem(
  items: Map<string, PortfolioAttentionItem>,
  item: PortfolioAttentionItem,
) {
  // A target/reason pair is one actionable fact. Multiple upstream joins must
  // not produce duplicate cards in the Overview.
  if (!items.has(item.id)) items.set(item.id, item)
}

export function evaluatePortfolioAttention(input: PortfolioAttentionInput): PortfolioAttentionItem[] {
  const asOf = input.asOf ?? new Date()
  const asOfIso = asOf.toISOString()
  const concentrationThresholdPct = input.concentrationThresholdPct ?? 25
  const thesisBySymbol = new Map<string, AttentionThesis>()

  for (const rawThesis of input.theses) {
    const symbol = normalizeSymbol(rawThesis.symbol)
    if (symbol && !thesisBySymbol.has(symbol)) {
      thesisBySymbol.set(symbol, { ...rawThesis, symbol })
    }
  }

  const items = new Map<string, PortfolioAttentionItem>()

  for (const rawHolding of input.holdings) {
    if (!isActiveHolding(rawHolding)) continue

    const symbol = normalizeSymbol(rawHolding.symbol)
    if (!symbol) continue
    const thesis = thesisBySymbol.get(symbol)

    if (!thesis || String(thesis.status ?? '').trim().toLowerCase() === 'draft') {
      addItem(items, {
        id: `stock:${symbol}:missing_thesis`,
        reason: 'missing_thesis',
        targetKind: 'stock',
        targetId: symbol,
        symbol,
        priority: ATTENTION_PRIORITY.missing_thesis,
        action: `/stocks/${encodeURIComponent(symbol)}/thesis`,
        evidence: { latestOutcome: thesis?.latestOutcome ?? null },
        asOf: asOfIso,
      })
    } else {
      const dueAt = parseDate(thesis.reviewDueAt)
      if (isOpenThesis(thesis) && isThesisReviewOverdue(thesis, asOf)) {
        addItem(items, {
          id: `stock:${symbol}:overdue_thesis_review`,
          reason: 'overdue_thesis_review',
          targetKind: 'stock',
          targetId: symbol,
          symbol,
          priority: ATTENTION_PRIORITY.overdue_thesis_review,
          action: `/stocks/${encodeURIComponent(symbol)}/thesis`,
          evidence: {
            reviewDueAt: dueAt ? dueAt.toISOString() : null,
            latestOutcome: thesis.latestOutcome ?? null,
          },
          asOf: asOfIso,
        })
      }

      if (isOpenThesis(thesis) && String(thesis.latestOutcome ?? '').trim().toUpperCase() === 'INVALIDATED') {
        addItem(items, {
          id: `stock:${symbol}:invalidated_thesis_while_held`,
          reason: 'invalidated_thesis_while_held',
          targetKind: 'stock',
          targetId: symbol,
          symbol,
          priority: ATTENTION_PRIORITY.invalidated_thesis_while_held,
          action: `/stocks/${encodeURIComponent(symbol)}/thesis`,
          evidence: { latestOutcome: thesis.latestOutcome },
          asOf: asOfIso,
        })
      }
    }

    const concentrationPct = rawHolding.concentrationPct
    if (typeof concentrationPct === 'number' && Number.isFinite(concentrationPct) && concentrationPct >= concentrationThresholdPct) {
      addItem(items, {
        id: `stock:${symbol}:position_concentration`,
        reason: 'position_concentration',
        targetKind: 'stock',
        targetId: symbol,
        symbol,
        priority: ATTENTION_PRIORITY.position_concentration,
        action: `/stocks/${encodeURIComponent(symbol)}`,
        evidence: { concentrationPct },
        asOf: asOfIso,
      })
    }
  }

  for (const review of input.diaryReviews ?? []) {
    if (String(review.reviewStatus ?? '').trim().toLowerCase() === 'reviewed') continue
    const dueAt = parseDate(review.reviewDueAt)
    if (!dueAt || dueAt.getTime() >= asOf.getTime()) continue

    const targetId = String(review.id)
    addItem(items, {
      id: `diary:${targetId}:overdue_diary_review`,
      reason: 'overdue_diary_review',
      targetKind: 'diary',
      targetId,
      symbol: review.symbol ? normalizeSymbol(review.symbol) : null,
      priority: ATTENTION_PRIORITY.overdue_diary_review,
      action: `/diaries/${targetId}/review`,
      evidence: {
        reviewDueAt: dueAt.toISOString(),
        title: review.title,
      },
      asOf: asOfIso,
    })
  }

  return [...items.values()]
    .sort((a, b) => b.priority - a.priority || (a.symbol ?? '').localeCompare(b.symbol ?? '') || a.id.localeCompare(b.id))
    .slice(0, input.maxItems ?? 50)
}
