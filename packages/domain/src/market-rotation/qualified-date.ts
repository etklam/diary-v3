// ─── Domain constants (ADR-0004) ─────────────────────────────────────────

/**
 * Minimum fraction of the canonical universe that must have snapshots for a
 * date to be considered "qualified". ADR-0004 fixes this at 90%.
 */
export const QUALIFICATION_THRESHOLD_RATIO = 0.9 as const

/**
 * Number of qualified snapshot positions to step back from the most recent
 * qualified date when resolving the 2W comparison date. ADR-0004 fixes this
 * at 10 (approximately two trading weeks).
 */
export const COMPARISON_OFFSET = 10 as const

// ─── Types ───────────────────────────────────────────────────────────────

/**
 * Minimal shape returned by Prisma's `groupBy({ by: ['date'], _count })`.
 * Using a structural type keeps this module Prisma-agnostic.
 */
export interface DateCountGroup {
  date: Date
  count: number
}

/**
 * Snapshot coverage for a date that is about to be persisted.
 *
 * A batch run knows the number of successfully generated snapshots before the
 * rows are written. That candidate date must participate in the comparison
 * window when it already satisfies the scope qualification threshold.
 */
export interface SnapshotDateCoverage {
  date: Date
  snapshotCount: number
}

/**
 * Canonical qualified-date sequence and its two-week boundary.
 *
 * `qualifiedDatesDesc` is the single source sequence: newest first. Both the
 * latest snapshot date and the comparison date are derived from it so callers
 * cannot accidentally apply the offset to two different sequences.
 */
export interface QualifiedDateWindow {
  qualifiedDatesDesc: Date[]
  latestDate: Date | null
  comparisonDate: Date | null
}

// ─── Pure logic ──────────────────────────────────────────────────────────

/**
 * Compute the minimum snapshot count required for a date to qualify.
 *
 * @param universeSize - Number of canonical symbols in the rank scope.
 * @returns `ceil(universeSize * QUALIFICATION_THRESHOLD_RATIO)`, floored to 1
 *          so a degenerate universe (size 0) still has a sane threshold.
 */
export function computeThreshold(universeSize: number): number {
  if (universeSize <= 0) return 1
  return Math.ceil(universeSize * QUALIFICATION_THRESHOLD_RATIO)
}

/**
 * Return whether a snapshot count meets the scope's qualification threshold.
 */
export function isQualifiedSnapshotCount(snapshotCount: number, universeSize: number): boolean {
  return snapshotCount >= computeThreshold(universeSize)
}

/**
 * Filter `groups` down to the dates that meet the qualification threshold.
 *
 * This is a PURE function — it does not re-sort the input. Callers are
 * responsible for passing in the order they expect out (Prisma's `groupBy`
 * with `orderBy: { date: 'desc' }` yields descending order, which is what
 * `pickComparisonDate` expects).
 *
 * @param groups - Snapshot-count-per-date records (any order).
 * @param universeSize - Canonical universe size for the rank scope.
 * @returns Qualified dates in the SAME order as the input.
 */
export function filterQualifiedDates(
  groups: readonly DateCountGroup[],
  universeSize: number,
): Date[] {
  const threshold = computeThreshold(universeSize)
  return groups
    .filter(group => group.count >= threshold)
    .map(group => group.date)
}

/**
 * Pick the 2W comparison date from a desc-sorted list of qualified dates.
 *
 * Contract:
 *   - Input MUST be sorted descending (most recent first). This matches the
 *     output of `filterQualifiedDates` when fed a Prisma `groupBy` with
 *     `orderBy: { date: 'desc' }`.
 *   - `offset=0` returns the most recent qualified date.
 *   - `offset=N` returns the (N+1)-th most recent qualified date.
 *   - Returns `null` when the list is empty or shorter than `offset + 1`.
 *
 * @param qualifiedDatesDesc - Qualified dates sorted descending.
 * @param offset - Positions back from the most recent qualified date.
 *                 Defaults to `COMPARISON_OFFSET` (=10) per ADR-0004.
 */
export function pickComparisonDate(
  qualifiedDatesDesc: readonly Date[],
  offset: number = COMPARISON_OFFSET,
): Date | null {
  return qualifiedDatesDesc[offset] ?? null
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/**
 * Pick the newest qualified date from snapshots produced by the current
 * batch run. The input may contain a partial set of candidate dates when
 * symbols have different latest price dates.
 */
export function pickLatestQualifiedCandidate(
  candidates: readonly SnapshotDateCoverage[],
  universeSize: number,
): SnapshotDateCoverage | null {
  return candidates
    .filter(candidate => isQualifiedSnapshotCount(candidate.snapshotCount, universeSize))
    .slice()
    .sort((a, b) => b.date.getTime() - a.date.getTime())[0] ?? null
}

/**
 * Resolve the canonical qualified-date window.
 *
 * `candidateDate` is included only when `candidateIsQualified` is true. This
 * is the pre-persistence bridge used by snapshot generation: it makes the
 * newly generated date occupy its proper position before applying the
 * accepted ten-qualified-date offset. Existing dates are de-duplicated by
 * calendar date so retrying a batch cannot shift the window.
 */
export function resolveQualifiedDateWindow(
  qualifiedDatesDesc: readonly Date[],
  options: {
    candidateDate?: Date | null
    candidateIsQualified?: boolean
    offset?: number
  } = {},
): QualifiedDateWindow {
  const byDate = new Map<string, Date>()
  for (const date of qualifiedDatesDesc) {
    byDate.set(dateKey(date), date)
  }

  if (options.candidateDate && options.candidateIsQualified) {
    const key = dateKey(options.candidateDate)
    if (!byDate.has(key)) {
      byDate.set(key, options.candidateDate)
    }
  }

  const dates = [...byDate.values()].sort((a, b) => b.getTime() - a.getTime())

  return {
    qualifiedDatesDesc: dates,
    latestDate: dates[0] ?? null,
    comparisonDate: pickComparisonDate(dates, options.offset),
  }
}

