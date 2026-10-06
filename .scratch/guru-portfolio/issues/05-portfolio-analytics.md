# [05] Calculate deterministic portfolio analytics and changes

Status: ready-for-agent
Execution: done
Type: AFK

## Parent

[Guru Portfolio PRD](../PRD.md)

## What to build

Create versioned, pure domain calculations and persisted analytics for effective quarter snapshots, holding changes, concentration, allocation, and turnover.

## Acceptance criteria

- [x] Compare only stable, corporate-action-resolved identities with compatible class, SH/PRN unit, and Put/Call exposure.
- [x] Compute comparable quantity/share change and percentage, portfolio weight and weight change, rank and rank change, and reported-value change as separate metrics.
- [x] Classify NEW, STRONG_ADD, ADD, UNCHANGED, REDUCE, STRONG_REDUCE, and EXIT from quantity rules in the PRD; threshold configuration is server/domain-owned, not UI-owned.
- [x] Reported-value change never classifies an action. Missing/non-READY quarters and unresolved identities never become inferred EXIT rows.
- [x] Calculate reported portfolio value, holding count, top-one/top-five/top-ten concentration, HHI, sector/industry allocation, entries/exits/adds/reductions, largest position, and largest adds/reductions.
- [x] Document and version the turnover formula and Low/Moderate/High bands before surfacing turnover.
- [x] Exact decimal behavior, boundary thresholds, missing identity/quarter, unchanged holdings, and corporate-action continuity have fixed fixtures.
- [x] Analytics carry an analytics version and rebuild deterministically from effective holdings.
- [x] Persist source `inputHash` separately from normalized `contextHash`; downstream AI consumers can detect changed structured context without replacing prior generations (generation lifecycle is owned by ticket 11).
- [x] Rebuild persisted metrics when effective-period quality status changes, clearing action rows while a retained snapshot is PARTIAL or ERROR.

## Blocked by

- [04 effective snapshots](04-effective-snapshots.md)

## Open decisions

Resolved for implementation:

- Normalize each holding's reported value to USD using its preserved SEC source-unit field. The reported-portfolio denominator includes all disclosed effective rows, including PRN, Put/Call, and unresolved rows; this remains a reported 13F value, not AUM. Position weights and concentration use that denominator. Sector/industry allocation uses the same denominator and exposes unclassified value as an explicit residual.
- Analytics group resolved duplicate source rows by stable security ID, quantity type, and Put/Call exposure. Unresolved rows remain separate and visible; they are not merged by issuer text. SH and PRN quantities, and Put versus Call exposures, are never compared as one position.
- Share/quantity action thresholds are the server-owned defaults from the product specification: STRONG_ADD at >= +50%; ADD above +5% and below +50%; UNCHANGED from -5% through +5%; REDUCE below -5% and above -50%; STRONG_REDUCE at <= -50%. EXIT requires two adjacent READY snapshots with comparable mapping coverage and a previously held stable identity absent from the current snapshot. Reported-value changes never set the action.
- Portfolio weight turnover is one-half of the L1 distance between the two quarters' normalized weights for stable, comparable position identities, including confirmed entries and exits. It is labeled as disclosed-weight churn, not transaction turnover, because 13F provides neither transaction dates nor prices. If either quarter is not READY or does not have complete position mapping, the turnover value and Low/Moderate/High band are unavailable rather than inferred from partial identities.
- Bands are LOW below 10%, MODERATE from 10% through below 30%, and HIGH at 30% or above. The persisted analytics version documents the formula, denominator, comparison eligibility, and band cutoffs.
- Verified split and share-class conversion ratios adjust prior comparable quantities; raw reported prior quantity stays separately traceable. Explicit merger/spin-off/delisting records that cannot prove a comparable identity suppress false NEW/EXIT inferences and make turnover unavailable.
- Portfolio HHI uses the 0–10,000 scale. Largest adds rank by current disclosed weight; largest reductions rank by prior disclosed weight; stable position key breaks ties.
- The worker consumes durable snapshot-change events and rebuilds the changed quarter plus its following quarter. Unchanged structured inputs are idempotent no-ops; changed input hashes update prepared analytics and leave AI generation history to ticket 11.

## Verification evidence

- `npx vitest run tests/unit/guru-portfolio-analytics.test.ts tests/integration/guru-portfolio-analytics.test.ts`: 2 files, 20 tests passed against disposable PostgreSQL. Covers exact decimal thresholds, identity continuity, event retry/idempotency, prior-quarter refresh, normalized context freshness, and clearing/restoring changes when period quality becomes PARTIAL/READY.
- `npx vitest run tests/unit/guru-portfolio-analytics.test.ts tests/unit/institutional-effective-snapshots.test.ts tests/unit/institutional-security-mapping.test.ts tests/unit/guru-13f-parser.test.ts tests/unit/sec-edgar.test.ts tests/unit/sec-edgar-cancellation.test.ts tests/integration/guru-portfolio-analytics.test.ts tests/integration/institutional-effective-snapshots.test.ts tests/integration/guru-13f-ingestion.test.ts tests/integration/institutional-security-mapping.test.ts`: 10 files, 78 tests passed against disposable PostgreSQL.
- `npm run typecheck`: passed.
- `npm run contracts:check`: passed.
- Scoped ESLint across the analytics/effective-snapshot implementation, schema, and affected tests: passed.
- `git diff --check`: passed.
