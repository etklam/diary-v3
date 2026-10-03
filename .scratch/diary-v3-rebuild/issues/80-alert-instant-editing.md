# [80] Preserve Diary Alert Instants through shared editing policy

Status: ready-for-agent
Execution: done
Draft reference: B04
Published: 2026-09-20


Type: AFK
User stories covered: US-007, US-021, US-055, US-056, US-057, US-106 (preserved behavior).

## What to build

Adopt the shared Instant editing policy in Diary Alert fields, canonical comparison and submission. Complete the current reminder path from Diary authoring through persisted one-off or recurring Alerts and their existing readback. Keep message validation, recurrence, root/child lifecycle and list-replacement decisions within the Alert and Diary Modules.

## Acceptance criteria

- [x] All affected Alert time initialization, local edits, occurrence selection, canonical comparison and request conversion use ticket 79's shared policy instead of a second Implementation.
- [x] One-off Alert editing stays in device time, rejects missing or invalid local times, requires a repeated-hour choice and preserves untouched exact seconds/milliseconds through save and reload.
- [x] WEEK/MONTH generation retains account-timezone 09:00 semantics, weekday and cutoff rules, root/child relationships and existing cancellation behavior. Device-time editing is not substituted for recurrence scheduling.
- [x] An unchanged Alert collection remains omitted where currently required, preserving dismissed occurrences and existing series. Explicit edits and clearing retain the current replacement semantics; exact-Instant canonicalization cannot fabricate a dirty collection or silently discard a real change.
- [x] Browser and real PostgreSQL evidence covers saving and editing a one-off Alert with a repeated-hour Instant, an account timezone different from the device timezone, recurrence creation and an unchanged-Alert full-editor save. Read back actual persisted reminders and retain existing recurrence/cancellation tests.
- [x] Full-editor create, replacement and explicit append retain their current Alert payload semantics, draft recovery, uncertain-write protection, labels and keyboard flow. Do not redesign the reminder form or broaden the shared Module into recurrence or message policy.

## Blocked by

- [79 — Preserve exact Transaction Instants through shared editing policy](79-transaction-instant-editing.md).

## Delivery constraints

- Astra owns architecture direction and final acceptance; Luna owns implementation and test fixes. Use a focused Sol review for integrity, privacy and time semantics. Routine agent review is not a human blocker. No production cutover is included.
- Each ticket completes its affected persistence, contract, HTTP/client and browser paths with runnable evidence. Existing schema and wire behavior should remain compatible; do not invent migrations or endpoint changes merely to touch every layer.
- Keep runtime contracts and native compatibility, owner isolation, immutable evidence, directional Partner sharing, decimal precision, civil dates and exact UTC Instants. ADRs 0001, 0006 and 0011 constrain this work.
- Retain the current presentation, native datetime-local controls, labels, focus, error feedback, three locales and theme behavior. Domain payload validation, copy, rendering and draft lifecycle stay in their existing owning Modules. Any material visual change needs an Astra brief and acceptance under DESIGN and Impeccable.
- Use synthetic browser fixtures, controlled provider responses and real disposable PostgreSQL for persistence, concurrency, permissions and rollback. Never use real user data or production services.
- Reuse existing behavioral suites and add only meaningful consolidation regressions. Record commands and results before marking execution complete. Run relevant type, lint and contract checks for affected paths.

## Comments

Published on 2026-09-20 after the user approved the five-slice breakdown and authorized publication. The source architecture review rated this opportunity Worth exploring; this ticket makes no claim of an observed defect. The original PRD is unchanged. Implementation acceptance remains pending.

## Implementation acceptance — 2026-09-20

Astra accepted the Alert integration after Luna implementation and focused Sol review. Initialization uses `instantEditFromInstant`; local edits use `changeInstantLocalValue` with explicit mapping back to the existing draft fields. Canonicalization and request conversion retain the existing shared resolver. Account-timezone recurrence, root/child selection, dismissed occurrences and unchanged-list omission remain intact.

Focused `alert-fields` and `trade-time` unit suites passed 7 tests. Browser acceptance includes WEEK/MONTH creation, dismissal, unchanged collection IDs, explicit clearing, missing-hour rejection and exact repeated-hour preservation after a message edit. Desktop/mobile Alert editor captures remain in `docs/design/evidence/alerts/`.

- `npx playwright test tests/e2e/alerts.spec.ts tests/e2e/review-instant.spec.ts tests/e2e/diary-review.spec.ts tests/e2e/review-queue.spec.ts tests/e2e/full-authoring-follow-up.spec.ts --reporter=list`: 26 tests passed after both integrations were complete.
- `npm run test:unit`: 697 tests passed across 78 files on the final code.
- `npm run build`: typecheck, Web client/server and API builds passed. Full ESLint and contract drift checks passed; final affected files also passed focused lint.
- Existing real PostgreSQL ledger/Alert/Review/queue acceptance: 42 tests passed across six suites; server semantics are unchanged.
- Impeccable detector returned no findings for the four affected editor files. Astra inspected desktop/mobile editor evidence; no material presentation change was introduced.

All tests use synthetic data, controlled providers and disposable local PostgreSQL. No production action was performed. Final evidence is recorded in `docs/design/architecture-deepening-acceptance.md`.
