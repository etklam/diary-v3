# [81] Preserve Diary Review scheduling through shared Instant editing policy

Status: ready-for-agent
Execution: done
Draft reference: B05
Published: 2026-09-20


Type: AFK
User stories covered: US-007, US-026, US-029, US-031, US-032, US-106 (preserved behavior).

## What to build

Adopt the shared Instant editing policy in Diary Review scheduling, canonical comparison and submission. Complete the existing scheduling journey from Diary or Review into the full editor, save or clear the schedule, and read the persisted result in Diary/Review and the Review Queue. Keep retrospective Review completion and reflection separate from schedule editing.

## Acceptance criteria

- [x] Review schedule initialization, local edits, occurrence choice, canonical comparison and request conversion use ticket 79's shared policy. Domain-specific schedule clearing, validation, copy and rendering remain owned by the existing scheduling and editor Modules.
- [x] Scheduling retains device-time input, invalid/missing-hour rejection, explicit repeated-hour selection and untouched exact-Instant precision. Readback and Review Queue classification retain the current account-timezone semantics and civil-date distinction.
- [x] Set, change and clear a schedule through the existing complete Diary write flow; reload and re-fetch confirm the exact saved schedule and the corresponding queue membership. No partial write that resubmits stale unrelated Diary fields is introduced.
- [x] Scheduling an already reviewed Diary preserves its completed status, outcome, reflection and original judgment. Generic Diary writes still cannot complete or modify private Review content.
- [x] Browser acceptance retains both Diary and Review scheduling entrypoints, field focus, safe return destination, cancel/back behavior and restored-draft precedence. Cover a repeated-hour choice and an unrelated edit preserving seconds/milliseconds, with authoritative readback.
- [x] Keep full-editor create, replacement and explicit append semantics, error feedback and uncertain-write protection. Preserve existing Review and draft-lifecycle acceptance suites; do not merge Review completion or draft storage into the shared Instant Module.

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

Astra accepted the Review scheduling integration after Luna implementation and focused Sol review. Initialization and local edits adopt the shared Instant policy; existing resolution, explicit clearing, full-editor write paths and restored-draft precedence remain intact. Completion and private reflection are not moved into the shared Module.

Focused `trade-time` and `diary-editor-dirty` unit suites passed 14 tests. New browser evidence uses the next year's New York repeated hour to avoid a wall-clock-dependent Upcoming assertion; an unrelated edit preserves exact seconds/milliseconds through Diary, Review and queue readback. Existing browser acceptance covers both entrypoints, focus, cancel/return, sign-in continuation, drafts and completed-review schedule clearing, including completed status, outcome and summary preservation. Desktop/mobile screenshots are in `docs/design/evidence/architecture-deepening/review-{1440,390}.png`.

- `npx playwright test tests/e2e/alerts.spec.ts tests/e2e/review-instant.spec.ts tests/e2e/diary-review.spec.ts tests/e2e/review-queue.spec.ts tests/e2e/full-authoring-follow-up.spec.ts --reporter=list`: 26 tests passed after both integrations were complete.
- `npm run test:unit`: 697 tests passed across 78 files on the final code.
- `npm run build`: typecheck, Web client/server and API builds passed. Full ESLint and contract drift checks passed; final affected files also passed focused lint.
- Existing real PostgreSQL ledger/Alert/Review/queue acceptance: 42 tests passed across six suites; server semantics are unchanged.
- Impeccable detector returned no findings for the four affected editor files. Astra inspected desktop/mobile editor evidence; no material presentation change was introduced.

All tests use synthetic data, controlled providers and disposable local PostgreSQL. No production action was performed. Final evidence is recorded in `docs/design/architecture-deepening-acceptance.md`.
