# [79] Preserve exact Transaction Instants through shared editing policy

Status: ready-for-agent
Execution: done
Draft reference: B03
Published: 2026-09-20


Type: AFK
User stories covered: US-018, US-020, US-038, US-106 (preserved behavior).

## What to build

Deepen the existing trade-time Module with the common editing policy for paired device-local time and exact Instant values, and integrate it into Transaction authoring, canonical comparison and submission. Complete the existing BUY/SELL path from editing through Diary persistence and transaction/ledger readback. This is the first working caller of the shared policy; Alert and Review adoption is delivered by the following independent slices.

## Acceptance criteria

- [x] Transaction editing uses one shared Implementation for local-time edits, clearing an obsolete occurrence, resolving an explicit repeated-hour choice and preserving an unchanged exact Instant. Keep Transaction fields, decimal validation, labels, JSX, draft storage and ledger rules owned by their existing Modules.
- [x] Retain native datetime-local input in the device timezone. Invalid civil times and missing DST hours remain rejected; a repeated hour requires an explicit valid occurrence. Non-hour timezone transitions retain their existing calculation semantics.
- [x] Leaving the displayed local minute unchanged preserves the stored Instant's seconds, milliseconds and chosen DST occurrence; changing local time invalidates an obsolete choice. The editor's dirty comparison and submitted value follow the same shared policy.
- [x] Real browser acceptance creates and edits BUY/SELL Transactions, rejects a missing hour, selects a repeated occurrence and edits an unrelated field without changing an exact persisted Instant. Read back the saved Diary and relevant ledger result through the current contracts, retaining decimal strings, transaction identity and authoritative ledger validation.
- [x] Integrate every existing Transaction submission mode affected by this policy, including full-editor create, replacement and explicit append. Preserve uncertain-append safeguards, draft recovery, omission/replacement semantics and error feedback; use existing suites for behaviors unchanged by the consolidation.
- [x] Retain the conversion tests and add a focused shared-policy regression for edit → invalidate occurrence → choose → resolve, plus untouched-precision preservation. The Module remains small and browser-owned: no generic form engine, new time library, new platform abstraction or speculative Adapter is added.

## Blocked by

None — can start immediately.

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

Astra accepted the shared policy after Luna implementation and focused Sol review. `InstantEdit`, `instantEditFromInstant` and `changeInstantLocalValue` own initialization and edit invalidation; existing conversion, choice and canonical resolution remain shared. Transaction payloads, draft storage and ledger rules keep their existing owners.

- `npx vitest run tests/unit/trade-time.test.ts tests/unit/diary-editor-dirty.test.ts`: 13 tests passed.
- `npx playwright test tests/e2e/transaction-instant.spec.ts tests/e2e/buy-ledger.spec.ts tests/e2e/sell-ledger.spec.ts tests/e2e/ledger-corrections.spec.ts tests/e2e/full-authoring-follow-up.spec.ts --reporter=list`: 17 tests passed.
- `npx vitest run tests/integration/buy-ledger.test.ts tests/integration/sell-ledger.test.ts tests/integration/ledger-corrections.test.ts tests/integration/alerts.test.ts tests/integration/diary-review.test.ts tests/integration/review-queue.test.ts`: 42 tests passed across six suites using disposable PostgreSQL.
- Typecheck, focused ESLint and `npm run contracts:check` passed.
- Astra inspected desktop/mobile editor captures in `docs/design/evidence/architecture-deepening/transaction-{1440,390}.png`; native controls, occurrence labels, hierarchy and mobile stacking remain intact.

Tickets 80 and 81 may now begin. No production services or real user data were used.
