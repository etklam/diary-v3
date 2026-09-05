# FIRE calculation precision and boundaries

Status: accepted

The user authorized correcting legacy bugs while preserving feature intent. The frozen `lib/financialFreedom.ts` remains the formula reference: nominal monthly compounding with contributions at month end, no intermediate rounding, and a withdrawal target derived from annual expenses and withdrawal rate. Money displays retain whole-unit rounding and years retain one decimal place.

The old fractional-year search could run an additional contribution month while reporting the preceding month. The replacement searches whole months, including the 100-year boundary, and returns null when that horizon cannot reach the target. The attainment date includes those months and clamps month ends instead of truncating to whole years. UTC date arithmetic is deterministic across runtimes.

Projection always contains the first ten years for the existing copy/export capability, including when the target has already been reached. It retains a 50-year ceiling and five full years after attainment. Invalid, nonfinite or overflowing inputs produce a validation failure rather than infinity or a misleading achieved result.

Unused legacy inflation and retirement-year options are not exposed as working assumptions. This remains the same nominal accumulation model; it does not add inflation-adjusted returns, drawdown simulation or an API/persistence layer.

`tests/unit/fire.test.ts` contains fixed frozen-model first- and tenth-year values, presentation rounding, attainment-month/date, month-end, no-growth, horizon, age and invalid-input regressions. UI and copy acceptance remain pending in ticket 48.
