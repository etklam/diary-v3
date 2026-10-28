/**
 * How an attention list expresses what it already knows.
 *
 * The API returns items ordered by priority and the rendering used to throw
 * that away: every row was the same weight, so the only expression of urgency
 * was row order — invisible to someone scanning, and invisible to a screen
 * reader reading linearly. These two functions are the whole of the fix that
 * can be shared: the band a row belongs to, and the runs of one reason that
 * should collapse into a single row (ticket 119).
 */

export type AttentionBand = 'high' | 'medium' | 'low'

const bandCopy = {
  en: { high: 'Urgent', medium: 'Time-bound', low: 'Standing' },
  'zh-TW': { high: '緊急', medium: '有期限', low: '持續' },
  'zh-CN': { high: '紧急', medium: '有期限', low: '持续' },
} as const

/**
 * The band, as a word.
 *
 * Ticket 119 drew the band as the weight of the rule at each row's leading
 * edge and added this word so a screen reader got it too. Ticket 140 found the
 * drawn half carried nothing — 1px against 3px of low-chroma grey, on rows
 * rarely adjacent in the same band — and retired it. This word stays, and is
 * now the only carrier besides the row label and the ordering: linear reading
 * cannot see order, which was always the real gap.
 */
export function attentionBandLabel(band: AttentionBand, locale: string): string {
  return (bandCopy[locale as keyof typeof bandCopy] ?? bandCopy.en)[band]
}

/**
 * `ATTENTION_PRIORITY` in `@diary/domain/portfolio-attention` runs 500 down to
 * 100, higher being more urgent: an invalidated thesis on a held position and
 * an overdue thesis review are the two that mean something is already wrong; an
 * overdue diary review is time-bound; concentration and a missing thesis are
 * standing conditions that will still be true tomorrow.
 */
export function bandFromContractPriority(priority: number): AttentionBand {
  if (priority >= 400) return 'high'
  if (priority >= 300) return 'medium'
  return 'low'
}

/**
 * The Overview merges attention items with the review queue and renumbers them
 * 1 (most urgent) to 7, so its scale runs the other way. 1–2 are the two
 * already-wrong cases, 3–5 are everything dated, 6–7 are standing conditions.
 */
export function bandFromOverviewPriority(priority: number): AttentionBand {
  if (priority <= 2) return 'high'
  if (priority <= 5) return 'medium'
  return 'low'
}

/**
 * Consecutive items sharing a reason, as one run each.
 *
 * Only *consecutive* ones: the list is ordered by priority and that order is
 * the point, so regrouping across it would reorder the region to suit its own
 * rendering. Three "Missing thesis" rows in a row become one row with three
 * subjects; the same reason reappearing later in the order stays where it is.
 */
export function groupAttentionRuns<T>(items: readonly T[], keyOf: (item: T) => string): T[][] {
  const runs: T[][] = []
  for (const item of items) {
    const current = runs[runs.length - 1]
    if (current && keyOf(current[0]!) === keyOf(item)) current.push(item)
    else runs.push([item])
  }
  return runs
}

/**
 * The runs that fit, and how many individual items the rest account for.
 *
 * The contract allows 50 items. Fifty rows on a workspace is a second page, not
 * an attention region, so the region shows a few and names the remainder rather
 * than silently stopping — a truncated list that says nothing reads as a
 * complete one.
 */
export function boundAttentionRuns<T>(runs: T[][], limit: number): { shown: T[][]; remaining: number } {
  if (runs.length <= limit) return { shown: runs, remaining: 0 }
  const shown = runs.slice(0, limit)
  return { shown, remaining: runs.slice(limit).reduce((total, run) => total + run.length, 0) }
}
