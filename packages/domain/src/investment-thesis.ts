import { saveInvestmentThesisRequestSchema, type InvestmentThesisHealth, type InvestmentThesisStatus, type ThesisReviewOutcome } from '@diary/contracts/investment-thesis'

export function deriveInvestmentThesisHealth(thesis: {
  status: InvestmentThesisStatus
  latestReviewOutcome: ThesisReviewOutcome | null
  reviewDueAt: string | null
}, asOf: Date): InvestmentThesisHealth {
  if (thesis.status === 'ARCHIVED') return 'archived'
  if (thesis.status === 'DRAFT') return 'draft'
  if (thesis.latestReviewOutcome === 'INVALIDATED') return 'invalidated'
  if (thesis.reviewDueAt && new Date(thesis.reviewDueAt).getTime() < asOf.getTime()) return 'needs_review'
  return 'healthy'
}

/** Source PUT is full replacement; omitted status explicitly resets to DRAFT. */
export function replaceInvestmentThesis(input: unknown, activatedAt: string | null, now: Date) {
  const value = saveInvestmentThesisRequestSchema.parse(input)
  const clean = (text: string | null | undefined) => text?.trim() || null
  const status = value.status ?? 'DRAFT'
  return {
    status,
    summary: clean(value.summary), whyIOwnIt: clean(value.whyIOwnIt),
    growthDrivers: clean(value.growthDrivers), risks: clean(value.risks),
    invalidationConditions: clean(value.invalidationConditions), expectedHoldingPeriod: clean(value.expectedHoldingPeriod),
    reviewDueAt: value.reviewDueAt ?? null,
    activatedAt: status === 'ACTIVE' ? activatedAt ?? now.toISOString() : activatedAt,
    archivedAt: status === 'ARCHIVED' ? now.toISOString() : null,
  }
}
