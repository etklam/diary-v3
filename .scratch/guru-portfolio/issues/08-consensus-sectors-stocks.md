# [08] Build consensus, stock, sector, and theme intelligence

Status: ready-for-agent
Execution: done
Type: AFK

## Parent

[Guru Portfolio PRD](../PRD.md)

## What to build

Precompute cross-Guru stock consensus, stock rankings, sector/industry direction, and explicitly mapped themes.

## Acceptance criteria

- [x] Consensus snapshots expose holder count, new/add/reduce/exit counts, net buyers, average/median comparable quantity change, average weight, weight breadth, and holder-count change.
- [x] Every result records its quarter, eligible-manager denominator, and source/coverage quality; unavailable/partial data is not silently treated as a non-holder.
- [x] ACCUMULATION/NEUTRAL/DISTRIBUTION and Increasing/Stable/Reducing classifications expose deterministic rules and constituent metrics.
- [x] /gurus/consensus and /gurus/stocks include all specified most-held/action/weight/rising-interest rankings.
- [x] Sector and industry aggregates expose buyers, sellers, entries, exits, aggregate weight/change, and holder breadth.
- [x] /gurus/sectors provides filterable sector, industry, and theme direction with buyer/seller and weight-change evidence on desktop and mobile.
- [x] Theme assignments are explicit, versioned mappings from securities or existing research metadata; no AI-generated security classification.
- [x] Rebuild is idempotent and uses prepared snapshots rather than computing the full universe per request.
- [x] Changed consensus/sector inputs invalidate affected AI context hashes without deleting prior AI generations.
- [x] Fixtures cover conflicting actions, partial coverage, zero holders, changing denominator, and multiple quarters.

## Blocked by

- [05 portfolio analytics](05-portfolio-analytics.md)

## Eligibility and classification decisions

- The cohort for an exact quarter is the active tracked-Guru set. Record the counts in each state: READY, PARTIAL, ERROR/SUPERSEDED, and no filing. Only managers with an active READY effective snapshot contribute to holder/action metrics; partial, missing, failed, or superseded data is reported separately and is never silently counted as a non-holder or seller.
- Holder breadth is `holders / READY managers`. Also expose `READY managers / active tracked managers` as quarter coverage. Show both counts with every breadth result. Average weight uses READY managers that hold the position; quantity-change averages/medians use only comparable READY-to-READY actions.
- `ACCUMULATION` means `NEW + ADD > REDUCE + EXIT`; `DISTRIBUTION` means `NEW + ADD < REDUCE + EXIT`; otherwise `NEUTRAL`. Sector/industry direction uses the same buyer/seller count comparison: Increasing when buyers exceed sellers, Reducing when sellers exceed buyers, and Stable on a tie. Always show the underlying counts; suppress the label only when no eligible READY data exists. No minimum-coverage cutoff or hidden score is used.
- For sector/industry weight changes, aggregate each READY Guru's percentage-point allocation change and show the number of READY Gurus represented plus quarter coverage. Unmapped holdings remain in an explicit unclassified allocation and do not receive an inferred sector or theme.

## Verification evidence

- `npx vitest run tests/unit/guru-consensus.test.ts` — 6 deterministic fixtures pass, including opposite actions, partial coverage, zero holders, non-comparable prior quarter, ordinary-share filtering, unclassified allocation, and malformed inputs.
- `npx vitest run tests/integration/guru-consensus.test.ts` — synthetic disposable PostgreSQL integration passes across two quarters. It verifies cohort denominators, ready-only breadth, themes, ticker mapping, all eight stock rankings, sector and CSV routes, no-op retries, and versioned-theme rebuilds that change the input/context hashes while retaining the same quarter snapshot identity.
- `npx playwright test tests/e2e/guru-intelligence.spec.ts` — the desktop/mobile browser flow passes for quarter selection, coverage, classification, search, pagination, stock ranking/CSV, sector/theme filters and sorting, and sector cards.
- `npm run typecheck`, `npm run contracts:check`, and `git diff --check` pass. Impeccable detector reports no findings on the changed Guru surfaces.
- Synthetic desktop/mobile evidence is stored in `docs/design/evidence/guru-intelligence/`; formula definitions and denominators are in `docs/guru-consensus.md`.

The context-hash portion is covered here. T11 owns persisted AI generations and must also verify that prior reports remain available after a context changes.
