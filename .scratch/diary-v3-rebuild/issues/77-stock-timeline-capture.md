# [77] Capture immutable Stock Timeline Records through browser and Agent writers

Status: ready-for-agent
Execution: done
Draft reference: B01
Published: 2026-09-20


Type: AFK
User stories covered: US-049, US-050, US-072, US-073 (preserved behavior).

## What to build

Concentrate immutable Stock Timeline Record insert mapping and collision handling in one Module used within both existing browser and Agent write transactions. Deliver the complete capture-to-readback path: browser Evidence and Agent batches persist the same kind of immutable research record, and the existing owner timeline and Company research views retain content and provenance. Keep membership handling, authentication, source validation, response mapping and transaction orchestration with their current writers; mutable Stock Note writes are outside this slice.

## Acceptance criteria

- [x] Both real write paths use one Implementation for record identity, immutable insertion and collision handling. A pass-through Module that leaves the same persistence rule duplicated in both callers does not satisfy the ticket; existing database uniqueness and immutability constraints remain authoritative.
- [x] Browser capture retains Watchlist restoration, optional idempotency-key behavior and the original-record response on retry. Agent capture retains watched-only eligibility, per-record skip outcomes, required-key behavior, whole-batch atomicity and ALREADY_EXISTS on replay. Existing source vocabularies, provenance labels and response schemas remain distinct and compatible.
- [x] Preserve the Watchlist synchronization order, source-Diary ownership checks and locks, source unlink behavior, owner/Stock key scope and authentication-time key-revocation cutoff. Do not change accepted input, introduce a generic research write mechanism or combine mutable Stock Notes with immutable records.
- [x] Controlled concurrent browser and Agent submissions using the same owner, Stock and idempotency key persist exactly one original record. Altered replay cannot change the winning content or provenance; each caller returns its existing success/replay convention. Different owners or Stocks retain independent key scopes.
- [x] Existing real PostgreSQL evidence for browser retries, Agent skip cases, batch bounds, source ownership, database immutability and injected whole-batch rollback remains passing through the integrated HTTP paths.
- [x] Browser acceptance creates Evidence, retries it and reads the persisted record in the owner timeline or Company research view; Agent-created records remain readable there with their original attribution. These checks use the actual request and persistence paths, not a replacement in-memory storage Adapter.

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

Astra accepted the shared capture Module after Luna implementation and focused Sol integrity review. Both HTTP writers use `insertStockTimelineRecord` for owner/Stock/key identity, immutable insert and collision readback; each retains its original transaction orchestration and response conventions.

- `npx vitest run tests/integration/evidence.test.ts tests/integration/api-key-http.test.ts tests/integration/stock-timeline-capture.test.ts`: 12 tests passed.
- The new cross-route test was refined after Sol review to identify two actual blocked HTTP writers by current disposable database and blocker backend PID. `npx vitest run tests/integration/stock-timeline-capture.test.ts`: 1 test passed after that refinement.
- `npx playwright test tests/e2e/evidence.spec.ts tests/e2e/api-keys.spec.ts --reporter=list`: 6 desktop/mobile tests passed, including lost-response retry, original-source readback and Agent attribution.
- Typecheck, focused ESLint, `git diff --check` and `npm run contracts:check` passed.

All persistence acceptance used real disposable PostgreSQL and synthetic fixtures. No schema/wire change or production action was introduced.
