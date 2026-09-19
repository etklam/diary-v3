# Architecture deepening acceptance

Date: 2026-09-20
Scope: tickets 77–81
Direction and acceptance: Astra. Implementation: parallel Luna agents. Independent review: Sol.

## Delivered Modules

| Module | Shared Implementation | Knowledge retained by callers |
| --- | --- | --- |
| `apps/api/src/stock-timeline-capture.ts` | Immutable record mapping, owner/Stock/key identity, insert and collision readback | Browser Watchlist restoration; Agent eligibility, source ownership, batch orchestration and replay outcomes |
| `apps/api/src/stock-note-read.ts` | Accepted-link and author-direction sharing policy plus authorized row acquisition | Standalone response/pagination and denial; Company Hub attribution and ten-note projection; both callers retain their read snapshots |
| `apps/web/app/trade-time.ts` | Exact Instant initialization, local edit invalidation, occurrence choices and resolution | Transaction fields and ledger rules; Alert messages and recurrence; Review schedule clearing; all form rendering and draft lifecycle |

Deleting these Modules would distribute the persistence, permission or time-editing rules back across their callers. The interfaces do not introduce a generic research writer, Partner authorization framework or form engine.

## Preserved behavior

- Browser and Agent capture keep their distinct response conventions, source vocabularies and labels. The concurrency test holds a real advisory lock, identifies both blocked HTTP writers by database and blocker PID, then verifies one immutable winner and independent owner/Stock scopes.
- Stock Note authorization remains inside read-only repeatable-read transactions. A denied selected partner receives 403 before Stock lookup. Hub preview omits inaccessible authors without counting the entire matching set.
- The existing CompanyContext UI does not separately render the Hub `notes` array. Acceptance inspects the real browser-triggered Hub response and the visible Company Notes reader; no extra UI or realtime revocation guarantee is added.
- Untouched local minutes preserve exact seconds, milliseconds and the selected repeated-hour occurrence. A local edit clears the old selection. Existing conversion rejects missing hours and handles non-hour transitions.
- Recurring Alerts retain account-timezone 09:00 scheduling. Review completion and private reflection remain separate from schedule editing. Existing full-editor create, replacement, explicit append, omitted collections and uncertain-write recovery remain owned by their original Modules.

## Validation

- Capture integration: 12 tests passed; the scoped concurrency refinement passed its focused rerun.
- Stock Note, Partner and Company Hub integration: 14 tests passed.
- Ledger, Alert, Diary Review and Review Queue integration: 42 tests passed across six suites.
- Capture/browser Agent acceptance: 6 tests passed.
- Transaction and full-authoring browser acceptance: 17 tests passed.
- Stock Note browser acceptance: all 9 selected cases passed across the initial run and the two-case corrected rerun. The initial run exposed a partial-object assertion error and encountered an unfinished parallel editor edit; both affected cases passed after correction.
- Final Alert/Review and full-authoring browser batch: 26 tests passed. Across all batches, 48 distinct browser cases passed in 15 files; repeated full-authoring cases are counted only once.
- Full unit suite: 697 tests passed across 78 files on final code. Full ESLint, typecheck, Web/API builds and contract drift checks passed.
- Impeccable detector over the four affected editor files: no findings.

All five tickets are accepted and marked `Execution: done`, with all 30 acceptance criteria checked. Each local ticket records its exact acceptance commands. Sol reviewed capture integrity, directional sharing and final Alert/Review time semantics without unresolved findings. Tests use synthetic fixtures, controlled providers and disposable local PostgreSQL. No production services or real user data are used.

## Presentation

The preservation brief is [architecture-deepening-brief.md](architecture-deepening-brief.md). Transaction and Review desktop/mobile captures in `evidence/architecture-deepening/`, plus the existing Alert editor captures in `evidence/alerts/`, retain the native inputs, full-precision UTC labels, layout hierarchy and mobile stacking. Full-page and fieldset captures can include sticky navigation at the captured scroll position; the field rendering is unchanged. No stylesheet, copy, locale or theme changes are part of this refactor.
