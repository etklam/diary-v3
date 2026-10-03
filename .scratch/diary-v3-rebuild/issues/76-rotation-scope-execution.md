# [76] Run Rotation scopes through shared execution with compatible outcomes

Status: ready-for-agent
Execution: done
Draft reference: A13

Type: AFK
User stories covered: US-079, US-082, US-097, US-110, US-111, US-113 (preserved behavior).

## What to build

Concentrate selected-scope expansion, ordered execution, accumulated results, and stop-on-failure behavior for the CLI and administrator HTTP batch entrypoint. Keep their intentionally different response/error policies at their existing boundaries. This slice consolidates execution without unifying external failure contracts.

## Acceptance criteria

- [x] Single-scope and all-scope runs preserve sectors → indexes → core ordering, stop after failure, and retain successful persisted work. Do not introduce an all-scope transaction or parallel provider execution.
- [x] CLI retains its job metadata, partial results, failure envelope, and error total based on symbol count minus upserts plus the failed-run increment. HTTP retains its schema, error-array totals on success, ordinary thrown errors, and busy 409 behavior.
- [x] Administrator authentication, no-store behavior, per-scope locking, idempotent reruns, and existing structured operational evidence remain intact.
- [x] Controlled-provider and real PostgreSQL evidence covers success, failure on a later scope, busy scope, rerun, CLI outcome, HTTP outcome, and reading the successfully persisted snapshot through the public monitor.

## Blocked by

None — can start immediately.

## Delivery constraints

- All slices are AFK under the existing authorization: Astra owns architecture and design decisions and final acceptance, Luna owns implementation, and Sol provides focused independent review where useful. Routine agent design review is not a human blocker. No production cutover is authorized.
- Every slice completes its affected path through actual persistence, API/client, and UI or CLI consumers, with appropriate runnable evidence. A presentation change does not require inventing a database migration or new endpoint. No separate infrastructure-only or test-only tickets are needed.
- Each UI slice records an Astra brief before implementation: retain the existing typography, semantic light/dark colors, spacing tokens, reading widths, and focus treatment; define changed ordering and interactions. Verify desktop/mobile, all three locales, keyboard/focus, long content, and the relevant empty/loading/error states. Material deviations return to Astra.
- Preserve owner isolation, valid date and decimal semantics, original judgment versus private Review, safe Markdown, account-scoped drafts, explicit append, uncertain-write safeguards, and canonical research source returns. ADRs 0001, 0006, 0007, 0008, 0010, and 0011 constrain the affected slices.
- Use synthetic browser fixtures, real disposable PostgreSQL for integrity/concurrency, and controlled provider fixtures. Record commands and outcomes in each ticket before marking execution complete. Generated contracts/client/OpenAPI must remain consistent whenever an API contract is actually changed.
- A completed blocker is a scheduling condition. Shared files alone are not a product dependency; coordinate ownership when independent slices overlap.


## Comments

Published on 2026-09-19 after the user instructed “fix all ticket”, approving all thirteen slices and implementation. The parent PRD is unchanged.

## Execution evidence

Added a shared ordered scope executor for CLI and administrator HTTP. It preserves sectors → indexes → core order, stop-on-failure, partial persisted results, per-scope locking, and the distinct CLI/HTTP error and total policies. Nullish thrown failures are covered by a regression test and remain failures. A real HTTP/PostgreSQL controlled-provider test proves a later indexes failure leaves sectors readable and never starts core.

Focused evidence: `npx vitest run tests/unit/rotation-monitor.test.ts tests/unit/rotation-monitor-contract.test.ts tests/unit/rotation-summary.test.ts tests/unit/rotation-command.test.ts` passed 33/33; `DATABASE_URL=postgresql://diary:diary_local@127.0.0.1:55433/diary_v3 npx vitest run tests/integration/rotation-execution-http.test.ts tests/integration/rotation-admin-http.test.ts tests/integration/rotation-batch.test.ts` passed all rotation integration tests. Focused ESLint passed.

## Root acceptance

Accepted on 2026-09-19 after independent backend review corrections and focused real PostgreSQL evidence. The complete integration regression passed 68 files / 243 tests; subsequent focused backend validation passed 15 files / 64 tests including controlled snapshot and later-scope failure cases. Typecheck passed. Browser consumer evidence: `npx playwright test tests/e2e/market-rotation.spec.ts tests/e2e/portfolio-exposure.spec.ts --reporter=list` passed 6/6; Diary editor, response-loss, discovery and detail-review browser suites also passed. Contract generation checks passed without API contract changes. See `docs/design/convenience-follow-up-acceptance.md` for the remaining cross-feature acceptance work.
