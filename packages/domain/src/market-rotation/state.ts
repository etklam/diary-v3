export type MarketState = 'risk_on' | 'neutral' | 'defensive' | 'risk_off' | 'unknown'

/**
 * Compatibility layer: converts old regime values to canonical MarketState.
 *
 * After DB migration, this can be simplified to just validate the value.
 * Handles both old SCREAMING_SNAKE_CASE regime values and new lowercase values.
 */
export function toMarketState(regime: string | null | undefined): MarketState {
  if (regime === 'risk_on' || regime === 'RISK_ON' || regime === 'BULLISH_THRUST') {
    return 'risk_on'
  }
  if (regime === 'neutral' || regime === 'NEUTRAL') {
    return 'neutral'
  }
  if (regime === 'defensive' || regime === 'RISK_OFF') {
    return 'defensive'
  }
  if (regime === 'risk_off' || regime === 'CAPITULATION_WATCH') {
    return 'risk_off'
  }
  return 'unknown'
}
