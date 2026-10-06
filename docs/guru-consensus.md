# Guru consensus, stock rankings, and sector direction

These prepared read models summarize disclosed ordinary-share holdings across the tracked Guru cohort. They are derived from effective 13F snapshots and portfolio analytics; they do not represent the full portfolio or current activity of any manager.

## Quarter cohort and data quality

Each result is scoped to one exact reported quarter. The denominator is the active tracked-Guru set for that quarter. The snapshot records READY, PARTIAL, ERROR, SUPERSEDED, PENDING, and no-filing counts, plus the number of managers eligible for comparison. Only an active READY effective portfolio contributes current holders and actions. A missing or partial portfolio is never counted as a non-holder or seller.

- Quarter coverage is `READY managers / active tracked managers`.
- Mapping coverage is `mapped source rows / all source rows` across the eligible filing data.
- Stock holder breadth is `current READY holders / READY managers`; the API returns both counts.
- The stock's comparable current holder count and prior holder count use only managers with an eligible READY-to-READY comparison. `holderCountChange` is their difference. The API also returns the all-READY current holder count so these denominators remain explicit.
- Average and median quantity-change percentages use only comparable action rows with a known share-change percentage. The sample count is returned beside the values.

Status and source coverage are read from prepared snapshots. A non-READY state never silently becomes a zero holding count. The SEC source and reported period are included in every API response and stock CSV export.

## Stock consensus rules

The consensus stock universe contains mapped securities held as ordinary shares (`SH` with no Put/Call exposure). Principal amounts, puts, calls, and unresolved security identities do not enter stock-holder counts or stock rankings. Position weights still use the portfolio analytics denominator, which includes all reported filing rows; the weights are not percentages of only the ordinary-share subset.

The existing deterministic share-count change engine supplies NEW, ADD, STRONG_ADD, UNCHANGED, REDUCE, STRONG_REDUCE, and EXIT actions. For consensus counts, strong additions are grouped with additions and strong reductions with reductions. Market-value changes never create an action.

- `netBuyerCount = NEW + ADD − REDUCE − EXIT`; unchanged actions contribute zero.
- ACCUMULATION means net buyers are positive; DISTRIBUTION means net buyers are negative; NEUTRAL means net buyers equal zero. The label is null when the quarter has no action data for that stock.
- `quarterTrend` compares holder breadth only within comparable READY portfolios: RISING for a positive comparable holder change, FALLING for a negative change, STABLE for zero, and UNAVAILABLE when no comparable pair exists.
- Aggregate weight sums each READY holder's disclosed portfolio weight. Average portfolio weight divides that sum by current READY holders with the stock. The result is not an asset-weighted ownership estimate across managers.
- Stock rankings use prepared rows and stable security identity. `/gurus/stocks` supports most held, most added, most reduced, most new, most exited, largest aggregate weight, fastest rising interest, and fastest falling interest.

## Sector, industry, and theme rules

Sector and industry are security-master metadata. Missing classifications are retained in the explicit `Unclassified` group. Themes come only from explicit, versioned security mappings, sourced from an admin mapping or existing research metadata; the system does not ask AI to assign securities to themes. Securities with no theme mapping are not added to a guessed theme.

- Buyer and seller counts are distinct managers with at least one qualifying stock action in the group, not counts of filing rows.
- Group direction is Increasing when buyers outnumber sellers, Reducing when sellers outnumber buyers, and Stable on a tie. It is null when the group has no eligible action data.
- New, add, reduce, and exit counts count stock positions. Strong adds/reductions join their corresponding action group.
- Current and previous aggregate weights are sums of manager portfolio-weight percentages across the group. Weight change is calculated only for comparable READY managers and is a percentage-point difference, not a return.
- Allocation coverage returns the number and share of active tracked managers represented in the comparable allocation. Quarter coverage is reported separately.
- Theme mapping version and content participate in the input hash. Any mapping change queues historical quarter rebuilds.

## Prepared rebuilds and traceability

`guru-consensus-v1` is calculated by the deterministic domain package from current and previous effective holdings, portfolio analytics, action rows, status state, security classifications, ticker identifiers, and active theme mappings. PostgreSQL triggers enqueue quarter rebuilds when those inputs or the active Guru cohort change. The durable queue is retry-safe; a global advisory lock prevents concurrent workers from rebuilding the same read model. Matching input hashes are idempotent no-ops.

The prepared tables are `guru_consensus_snapshots`, `guru_stock_consensus`, and `guru_sector_consensus`. Each snapshot stores its formula version, input hash, structured context hash, mapping hash, reported-period cohort and mapping coverage. The API reads these rows; it does not parse SEC documents, recalculate the universe, or generate AI prose during a request.

When structured consensus inputs change, the worker updates the prepared quarter in place, replaces only its stock and group child rows, and changes the context hash. It does not delete or rewrite AI generation records. Once Guru Analysis persists those generations, consumers compare each stored input hash with this current context hash before treating a report as current; old generations remain available as history. AI generation and prompt lineage belong to the separate Guru Analysis and shared prompt modules.

## Read endpoints

- `GET /api/gurus/consensus` returns quarter coverage, stock holder/action metrics, deterministic classification, breadth trend, filters, sort, and pagination.
- `GET /api/gurus/stocks` provides the supported stock rankings using the same prepared quarter snapshot.
- `GET /api/gurus/stocks.csv` exports the selected stock ranking with reported quarter, SEC source, quarter coverage, and mapping coverage. Fields are quoted and formula-leading text is escaped.
- `GET /api/gurus/sectors` returns sector, industry, or theme direction and allocation evidence.

The web views are `/gurus/consensus`, `/gurus/stocks`, and `/gurus/sectors`. Desktop uses a horizontally scrollable ledger table; mobile uses cards with the same counts and coverage. All three retain the 13F delay disclosure, reported quarter, cohort coverage, and mapping coverage.
