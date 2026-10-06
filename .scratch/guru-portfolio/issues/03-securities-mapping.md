# [03] Normalize securities and resolve filing identities

Status: ready-for-agent
Execution: done
Type: AFK

## Parent

[Guru Portfolio PRD](../PRD.md)

## What to build

Add a stable securities master, identifier records, source-backed CUSIP/FIGI resolution, audited manual overrides, and identity links for corporate actions.

## Acceptance criteria

- [x] Securities and identifiers are persisted independently of ticker; identity supports CUSIP, FIGI, issuer/class, exchange, security type, sector, industry, status, and source provenance.
- [x] Resolution states are MATCHED, AMBIGUOUS, UNRESOLVED, and MANUAL_OVERRIDE, with a reason and mapping coverage available per filing.
- [x] Admin can search and resolve ambiguous/unresolved positions, record an override with actor/time/source, and correct or supersede it without erasing history.
- [x] Corporate-action identity links can represent ticker change, merger, spin-off, delisting, split, and share-class continuity. Comparisons can distinguish continuity from a true exit/entry.
- [x] Unresolved/ambiguous rows remain inspectable and do not fail ingestion; no ticker is fabricated from issuer text.
- [x] Fixtures cover reused or ambiguous identifiers, ticker changes, same-issuer classes, mergers/spin-offs, delisted securities, and override precedence.

## Blocked by

- [02 13F ingestion](02-13f-ingestion.md)

## Open decision

Automatic security remapping will not use an unconfigured third-party corporate-action feed. Ticket 03 accepts only Admin-entered identity links with a required evidence URL to an issuer announcement or SEC filing, manually verified by the Admin actor/time; the UI will state that the source is manually verified. Ticker and split continuity links may preserve comparable identity only when a verified link and, for splits, a positive share-conversion ratio are recorded. Merger and spin-off links record a transformation relationship but never imply one-to-one share comparability. Historical comparison must mark these transformations as non-comparable until a later, source-backed policy provides explicit conversion semantics. Automatic historical remapping remains disabled.

This is the minimum identity-link policy for this ticket. A licensed corporate-action source can be evaluated as a separate approved capability without changing existing manual-link provenance.

## Verification evidence

- PostgreSQL integration: `npx vitest run tests/integration/institutional-security-mapping.test.ts tests/integration/guru-13f-ingestion.test.ts` — 2 files, 3 tests passed against disposable databases. Covers security creation → durable refresh job → worker re-resolution → filing coverage; exact identifiers, reused/conflicting IDs, report-period validity, unresolved rows, override history, DB constraints, and identity-event corrections.
- Unit tests: `npx vitest run tests/unit/institutional-security-mapping.test.ts tests/unit/guru-13f-parser.test.ts` — 2 files, 5 tests passed.
- Browser acceptance: `npx playwright test tests/e2e/admin-institutional-mappings.spec.ts` — 1 test passed with synthetic API data on desktop and mobile, including override history and horizontal-overflow checks. Screenshots: [1440px](../../../docs/design/evidence/admin-institutional-mappings/1440.png), [390px](../../../docs/design/evidence/admin-institutional-mappings/390.png).
- `npm run typecheck`, `npm run contracts:check`, scoped ESLint, and `git diff --check` passed.
- DB state constraint `institutional_security_mapping_refresh_jobs_state_valid` requires PENDING without a lease/completion timestamp, RUNNING with a lease and no completion timestamp, and COMPLETE without a lease with a completion timestamp; integration verifies the database rejects RUNNING without a lease.

## Implementation decisions

- `stocks` remains the diary/workflow ticker directory; institutional securities have stable IDs and dated identifiers of their own.
- Exact CUSIP/FIGI identifiers and report-period validity may resolve automatically. Issuer text is display/search evidence only and never creates an identifier or ticker.
- Mapping changes are append-only, holding-scoped overrides with actor, timestamp, reason, source URL, and supersession lineage. Historical parsed holdings are not rewritten.
- Corporate-action links carry an issuer/SEC source URL. Ticker change preserves identity; split requires a verified new-shares-per-old-share ratio; class continuity requires explicit comparability and a ratio; merger/spin-off transformations stay non-comparable; delisting has no successor.
- No automated corporate-action feed or historical remap is enabled in this ticket.
