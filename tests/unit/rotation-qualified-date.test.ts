import { describe, expect, it } from 'vitest'

import {
  COMPARISON_OFFSET,
  QUALIFICATION_THRESHOLD_RATIO,
  computeThreshold,
  filterQualifiedDates,
  pickComparisonDate,
  resolveQualifiedDateWindow,
} from '../../packages/domain/src/market-rotation/qualified-date'

describe('lib/market-rotation/qualified-date', () => {
  // ─── Constants (ADR-0004 contract) ──────────────────────────────────────

  describe('constants', () => {
    it('exposes QUALIFICATION_THRESHOLD_RATIO = 0.9 per ADR-0004', () => {
      expect(QUALIFICATION_THRESHOLD_RATIO).toBe(0.9)
    })

    it('exposes COMPARISON_OFFSET = 10 per ADR-0004 (2W comparison window)', () => {
      expect(COMPARISON_OFFSET).toBe(10)
    })
  })

  // ─── computeThreshold ───────────────────────────────────────────────────

  describe('computeThreshold', () => {
    it('returns ceil(universeSize * 0.9) for 10-symbol universe (=9)', () => {
      // The canonical example from ADR-0004: 10 symbols, 90% threshold = 9
      expect(computeThreshold(10)).toBe(9)
    })

    it('returns 10 for 11-symbol universe (sectors scope)', () => {
      expect(computeThreshold(11)).toBe(10)
    })

    it('returns 8 for 8-symbol universe (indexes/core scope)', () => {
      // ceil(8 * 0.9) = ceil(7.2) = 8
      expect(computeThreshold(8)).toBe(8)
    })

    it('floors to 1 when universeSize is 0 (defensive fallback)', () => {
      // Matches the getComparisonDate legacy fallback (threshold = 1 when size = 0)
      expect(computeThreshold(0)).toBe(1)
    })

    it('handles single-symbol universe (threshold = 1)', () => {
      expect(computeThreshold(1)).toBe(1)
    })
  })

  // ─── filterQualifiedDates ───────────────────────────────────────────────

  describe('filterQualifiedDates', () => {
    it('keeps dates whose count >= threshold (10 symbols → need 9)', () => {
      // universe of 10 → threshold = 9
      // 2026-06-10 has 9 → qualified
      // 2026-06-09 has 10 → qualified
      // 2026-06-08 has 8 → not qualified
      const groups = [
        { date: new Date('2026-06-10'), count: 9 },
        { date: new Date('2026-06-09'), count: 10 },
        { date: new Date('2026-06-08'), count: 8 },
      ]

      const result = filterQualifiedDates(groups, 10)

      expect(result).toEqual([
        new Date('2026-06-10'),
        new Date('2026-06-09'),
      ])
    })

    it('90% boundary: exactly ceil(N*0.9) qualifies (10 → 9 ok)', () => {
      const groups = [{ date: new Date('2026-06-10'), count: 9 }]
      expect(filterQualifiedDates(groups, 10)).toEqual([new Date('2026-06-10')])
    })

    it('90% boundary: below ceil(N*0.9) is rejected (10 → 8 not ok)', () => {
      const groups = [{ date: new Date('2026-06-10'), count: 8 }]
      expect(filterQualifiedDates(groups, 10)).toEqual([])
    })

    it('preserves input order (caller responsible for desc sort)', () => {
      // Pure function MUST NOT re-sort — that is the caller's responsibility.
      // Passing ascending order in, expecting ascending order out.
      const groups = [
        { date: new Date('2026-06-08'), count: 10 },
        { date: new Date('2026-06-09'), count: 10 },
        { date: new Date('2026-06-10'), count: 10 },
      ]

      const result = filterQualifiedDates(groups, 10)

      expect(result).toEqual([
        new Date('2026-06-08'),
        new Date('2026-06-09'),
        new Date('2026-06-10'),
      ])
    })

    it('returns empty array when no group meets the threshold', () => {
      const groups = [
        { date: new Date('2026-06-10'), count: 3 },
        { date: new Date('2026-06-09'), count: 5 },
      ]
      expect(filterQualifiedDates(groups, 10)).toEqual([])
    })

    it('returns empty array for empty input', () => {
      expect(filterQualifiedDates([], 10)).toEqual([])
    })
  })

  // ─── pickComparisonDate ─────────────────────────────────────────────────

  describe('pickComparisonDate', () => {
    const fifteenDates = Array.from(
      { length: 15 },
      (_, i) => new Date(`2026-06-${String(15 - i).padStart(2, '0')}`),
    )
      // input is DESC (most recent first), matching Prisma groupBy orderBy
      // fifteenDates[0]  = 2026-06-15 (most recent)
      // fifteenDates[14] = 2026-06-01 (oldest)

    it('returns the date at offset=10 (the 11th most recent qualified date)', () => {
      // ADR-0004: 2W comparison = latest qualified − 10 positions back
      const result = pickComparisonDate(fifteenDates, 10)
      // fifteenDates[10] = 2026-06-05
      expect(result).toEqual(new Date('2026-06-05'))
    })

    it('uses COMPARISON_OFFSET (=10) as default offset', () => {
      const result = pickComparisonDate(fifteenDates)
      expect(result).toEqual(new Date('2026-06-05'))
    })

    it('offset=0 returns the most recent qualified date', () => {
      expect(pickComparisonDate(fifteenDates, 0)).toEqual(new Date('2026-06-15'))
    })

    it('returns null when qualifiedDates is empty', () => {
      expect(pickComparisonDate([], 10)).toBeNull()
    })

    it('returns null when fewer qualified dates than offset', () => {
      // Only 5 qualified dates, offset=10 exceeds → null
      const fiveDates = fifteenDates.slice(0, 5)
      expect(pickComparisonDate(fiveDates, 10)).toBeNull()
    })

    it('returns null when qualifiedDates length equals offset (boundary)', () => {
      // Exactly 10 dates, offset=10 → index 10 doesn't exist → null
      const tenDates = fifteenDates.slice(0, 10)
      expect(pickComparisonDate(tenDates, 10)).toBeNull()
    })

    it('returns the oldest date when offset = length − 1', () => {
      // 15 dates, offset = 14 → last element
      expect(pickComparisonDate(fifteenDates, 14)).toEqual(new Date('2026-06-01'))
    })
  })

  // ─── Integration: filterQualifiedDates → pickComparisonDate ─────────────

  describe('integration (filter + pick)', () => {
    it('end-to-end: groups → qualified dates → comparison date at offset 10', () => {
      // 11-symbol sectors universe, threshold = 10
      // 15 days total, day 2026-06-14 only has 9 (below threshold)
      const groups = Array.from({ length: 15 }, (_, i) => ({
        date: new Date(`2026-06-${String(15 - i).padStart(2, '0')}`),
        count: i === 1 ? 9 : 11, // simulate one under-coverage day
      }))

      const qualified = filterQualifiedDates(groups, 11)
      // 14 qualified dates (one dropped)
      expect(qualified).toHaveLength(14)

      const comparison = pickComparisonDate(qualified, 10)
      // After dropping 2026-06-14, the desc order is:
      //   [06-15, 06-13, 06-12, 06-11, 06-10, 06-09, 06-08, 06-07, 06-06, 06-05, 06-04, ...]
      //   index:   0     1     2     3     4     5     6     7     8     9    10
      // offset 10 → 06-04
      expect(comparison).toEqual(new Date('2026-06-04'))
    })

    it('keeps the same comparison boundary before and after persisting a new qualified date', () => {
      const newSnapshotDate = new Date('2026-06-15')
      const alreadyPersisted = Array.from({ length: 10 }, (_, index) => ({
        date: new Date(`2026-06-${String(14 - index).padStart(2, '0')}`),
        count: 11,
      }))

      const beforePersistence = resolveQualifiedDateWindow(
        alreadyPersisted.map(group => group.date),
        {
          candidateDate: newSnapshotDate,
          candidateIsQualified: true,
        },
      )
      const afterPersistence = resolveQualifiedDateWindow([
        newSnapshotDate,
        ...alreadyPersisted.map(group => group.date),
      ])

      // The new date is position 0, so offset 10 is 2026-06-05 in both cases.
      expect(beforePersistence.qualifiedDatesDesc).toHaveLength(11)
      expect(beforePersistence.comparisonDate).toEqual(new Date('2026-06-05'))
      expect(afterPersistence.comparisonDate).toEqual(beforePersistence.comparisonDate)
      expect(afterPersistence.latestDate).toEqual(newSnapshotDate)
    })
  })
})
