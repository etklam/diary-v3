/**
 * Round a market-rotation metric to 4 decimal places.
 *
 * Used by RSI, percentile, MA score, distance-from-high score, rotation
 * score, normalized trend values, and breadth ratios. Single source so a
 * precision change (e.g. switching to 2 dp for display) propagates everywhere.
 */
export function roundMetric(value: number): number {
  return Math.round(value * 10000) / 10000
}
