/**
 * 2W Trend Sparkline — pure function for comparison-date-normalized series.
 *
 * Formula (ADR-0004):
 *   normalized_value = price_on_date / price_on_comparison_date * 100
 *   twoWeekPerformancePct = latestNormalizedValue - 100
 *
 * Rules:
 *   - Missing prices (null or absent) produce null points (no interpolation).
 *   - If the comparison-date price is null, zero, or missing, the entire
 *     series is null (there is no valid base to normalize against).
 *   - First point corresponds to the comparison date (value = 100 when base
 *     is valid); the last point corresponds to the latest qualified date.
 *
 * Pure function — no Prisma, no IO, no side effects.
 */

import { roundMetric } from './round.js'

// ─── Types ──────────────────────────────────────────────────────

export interface TrendPoint {
  date: string
  value: number | null
}

export interface BuildTrendSeriesInput {
  /** Symbol being normalized (used to build the price-map lookup key). */
  symbol: string
  /** Qualified dates in ascending order (oldest first). */
  qualifiedDates: string[]
  /**
   * Price lookup keyed by `${symbol}:${date}`.
   * Value is the price (number) or null when the price is missing.
   * Absent key is treated the same as null.
   */
  priceBySymbolDate: Map<string, number | null>
  /** Comparison date string (YYYY-MM-DD). Must be the first qualified date. */
  comparisonDate: string
}

// ─── Helpers ────────────────────────────────────────────────────

function buildKey(symbol: string, date: string): string {
  return `${symbol}:${date}`
}

// ─── Main function ──────────────────────────────────────────────

/**
 * Build a comparison-date-normalized trend series for a single symbol.
 *
 * @returns Array of { date, value } points.  Null values are emitted for
 *          dates with missing prices or when the base (comparison-date)
 *          price is invalid.
 */
export function buildNormalizedTrendSeries(
  input: BuildTrendSeriesInput,
): TrendPoint[] {
  const { symbol, qualifiedDates, priceBySymbolDate, comparisonDate } = input

  if (qualifiedDates.length === 0) return []

  // Resolve the base price from the comparison date.
  const base
    = priceBySymbolDate.get(buildKey(symbol, comparisonDate)) ?? null

  // If base is invalid, every point in the series is null.
  const baseValid = base != null && base > 0

  return qualifiedDates.map((date) => {
    if (!baseValid) {
      return { date, value: null }
    }

    const price = priceBySymbolDate.get(buildKey(symbol, date)) ?? null

    if (price == null) {
      return { date, value: null }
    }

    return { date, value: roundMetric((price / base) * 100) }
  })
}
