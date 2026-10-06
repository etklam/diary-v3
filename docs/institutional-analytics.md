# Guru portfolio analytics

The analytics engine works from immutable effective 13F snapshots and reports disclosed portfolio data. It does not estimate assets under management or infer transaction dates or prices.

## Position identity and reported value

- Normalize each filing row to USD before aggregation: `USD` is unchanged and `THOUSANDS_USD` is multiplied by 1,000.
- The reported portfolio denominator includes every effective row, including unresolved securities, principal amounts, and Put/Call exposures. It is not AUM.
- Aggregate mapped rows by stable security ID, quantity type (`SH` or `PRN`), and Put/Call exposure. Keep each unresolved row separate by its source-row key; never group unresolved rows by issuer text.
- Position weight is reported USD value divided by the reported portfolio denominator. Sector and industry allocations use that same denominator and expose unclassified value as a residual.
- Rank positions by reported USD value, descending, with the stable position key as the tie-breaker.
- Top-one, top-five, and top-ten concentration are the summed weights of the corresponding highest-value positions.
- HHI is `10,000 × sum(position weight as a fraction squared)`, so a fully concentrated portfolio is 10,000 and an evenly spread portfolio is lower.

## Quarter changes

- Compare only adjacent calendar quarters whose effective snapshots are both READY. A baseline, missing/non-READY prior quarter, or non-adjacent quarter has no inferred action.
- Compare stable mapped identities with the same quantity type and Put/Call exposure. An incomplete mapping set may still compare identities present in both periods, but it suppresses inferred NEW and EXIT actions.
- NEW requires a current mapped identity absent from a complete adjacent prior portfolio. EXIT requires a prior mapped identity absent from a complete adjacent current portfolio.
- Share-count percentage thresholds are exact decimal comparisons: STRONG_ADD at or above +50%; ADD above +5%; UNCHANGED from -5% through +5%; REDUCE below -5%; STRONG_REDUCE at or below -50%. A zero-to-positive comparable holding is NEW. Thresholds are server/domain configuration, never user input.
- Reported-value changes, portfolio-weight changes, and rank changes are displayed independently. They never classify a position action.
- A verified split or share-class conversion adjusts the prior comparable quantity by the recorded conversion factor. The output retains both the reported prior quantity and the comparable prior quantity, plus the corporate-action event IDs used. Explicit non-comparable mergers, spin-offs, and delistings suppress false entry/exit inferences.
- Largest additions are ranked by current disclosed portfolio weight; largest reductions are ranked by prior disclosed portfolio weight. Ties use the stable position key.

## Disclosed-weight turnover

Turnover is one-half the L1 distance between normalized position weights across stable comparable identities, including confirmed entries and exits:

`disclosed-weight churn = 0.5 × sum(abs(current position weight − prior position weight))`

It is labeled disclosed-weight churn, not transaction turnover. It is unavailable unless both adjacent snapshots are READY, every effective row has a stable mapped identity, corporate-action continuity is unambiguous, and both reported-value denominators are positive. LOW is below 10%; MODERATE is 10% through below 30%; HIGH is 30% or above.

## Rebuilds and lineage

Effective-snapshot and effective-period-state change events drive an at-least-once analytics worker. State changes are emitted only when a published snapshot exists and its period status or reason actually changes. A successful event rebuilds the changed quarter and its next quarter, because a corrected prior snapshot changes the next quarter's comparison. `inputHash` includes the effective snapshot identities and hashes, relevant effective-period state, analytics version, action thresholds, prepared holdings and classifications, and relevant corporate-action events. A matching input hash is an idempotent no-op. A changed hash replaces the prepared analytics and change rows; it does not delete prior AI generations.

`contextHash` is a separate downstream freshness hint. It hashes the normalized analytics result and data-quality state while omitting source IDs and audit-only corporate-action event IDs. A parser or lineage change can therefore rebuild prepared data without claiming that an AI's structured research context changed. AI consumers still hash their complete structured context before serving or regenerating prose.

The fixed analytics version is stored with each prepared quarter. Any intentional formula change requires a new version and a historical rebuild from effective snapshots; SEC documents do not need to be downloaded again.
