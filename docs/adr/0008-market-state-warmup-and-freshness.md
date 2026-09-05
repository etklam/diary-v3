# Market state warmup and freshness

Status: accepted for ticket 44 on 2026-09-06

The frozen breadth formulas remain the calculation baseline: daily 4% moves, 40-day moving-average breadth, 5/10-day up/down ratios and the documented regime precedence. The source implementation can emit `above40dPct = 0` during the first 39 observations even when the configured universe has 100% current-price coverage. Treating that zero as a completed measurement incorrectly reports `risk_off` during warmup.

The replacement keeps metrics that are actually available. Up/down counts are retained as soon as a prior price exists; 5-day and 10-day ratios remain nullable until their respective eligible history windows exist; 40-day breadth is calculated from the eligible symbols and remains nullable only when no symbol has a 40-day observation. A regime and score are produced only when the 40-day series covers at least 90% of the configured universe and the 10-day ratio is available. This preserves partial evidence without converting missing history into zero or a risk state. Coverage of current prices remains a separate value, and `isStale` remains the persisted coverage flag (`coverage < 90`); no clock-based age cutoff is introduced.

The batch invariant is that a persisted regime and score are written only after those availability gates pass. The public snapshot and rotation monitor resolve a row with `isStale = true`, coverage below 90%, or a missing/invalid persisted regime to `unknown`; the reader uses that canonical persisted regime and does not rederive state from every nullable metric. They preserve the row date as `marketStateAsOfDate`, distinct from ranking and sector-summary dates. Guidance is generated from the resolved canonical state and never exposes the stored regime field.

Regression evidence:

- `tests/unit/market-state.test.ts` covers one-day warmup, the 39/40-observation boundary, 8/10 versus 9/10 (80% versus exact 90%) 40-day eligibility, formula boundaries and source normalization.
- `tests/integration/market-state-http.test.ts` covers guest 404/no-store, stale/under-covered snapshots, history and transactional rerun upserts.
- `tests/integration/market-state-batch.test.ts` covers price-first refresh, recalculation of existing rows, database failure propagation and advisory locking.
- `tests/integration/market-state-monitor.test.ts` covers date-aligned fresh versus stale monitor context.
