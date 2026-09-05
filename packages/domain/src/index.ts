/** Calendar dates represent a day, never an instant in a local timezone. */
export function currentUtcDate(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export { calculateFinancialFreedom, calculateFireNumber, withdrawalRatePresets } from './fire';
export type { FinancialFreedomInput, FinancialFreedomResult, YearlyProjection, WithdrawalRatePreset } from './fire';
export { calendarDateInTimezone } from './calendar-date';

export * from './quick-types';
export * from './quick-localization';
export * from './quick-template';
export * from './quick-snippets';
export { deriveQuickTitle, mergeQuickTemplate } from './quick-composer';
export { mergeTimelineEntries,groupTimelineEntries,projectTimelineEntry,diaryExcerpt } from './timeline';
export { calculatePositionSizing, positionSizingStrategies, validatePositionSizingRatios } from './position-sizing';
export type {
  PositionSizingBatch,
  PositionSizingInput,
  PositionSizingOutput,
  PositionSizingRounding,
  PositionSizingStrategy,
  PositionSizingStrategyId,
  PositionSizingSummary,
} from './position-sizing';
