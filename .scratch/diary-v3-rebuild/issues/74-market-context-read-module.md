# [74] Read Portfolio market context without building a full monitor

Status: ready-for-agent
Execution: done
Draft reference: A11

Type: AFK
User stories covered: US-041, US-042, US-077, US-079, US-080, US-082, US-089 (preserved behavior).

## What to build

Give Portfolio exposure and Market Rotation Monitor a shared read module for persisted Market State, Sector Breadth, allocation, and provenance dates. Keep ranking, comparison trends, and monitor-only summary construction in the monitor path.

## Acceptance criteria

- [x] Portfolio no longer invokes the complete monitor to obtain market context and does not execute its comparison-history work. Verify the bounded read behavior with controlled query evidence rather than a claimed latency improvement.
- [x] Both consumers use the persisted canonical regime, the existing 90%/availability gates, and explicit unknown values. Rank snapshot, Market State, and sector-summary dates remain separate.
- [x] Missing/stale/under-covered market context preserves the existing best-effort holdings response and allocation uncertainty. No new upstream request occurs merely because a page is opened.
- [x] Real PostgreSQL/API/browser fixtures verify mixed dates, absent sectors, qualified comparison history, unknown state, and holdings fallback, while existing monitor rankings/trends remain compatible.

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

Added `readPersistedMarketContext`, a transaction-accepting reader that owns persisted breadth, selected scope and sector snapshots, canonical dates, summary/leadership calculations, and beta policy for both Portfolio context and the full Rotation Monitor. Portfolio only reads persisted breadth plus current qualified sector rows; Monitor retains comparison-history and trend-series work. Stale or under-covered breadth still resolves to `unknown` while holdings remain available.

Focused evidence: `DATABASE_URL=postgresql://diary:diary_local@127.0.0.1:55433/diary_v3 npx vitest run tests/integration/market-context.test.ts tests/integration/portfolio-exposure.test.ts tests/integration/market-state-monitor.test.ts tests/integration/rotation-monitor.test.ts` passed. The market-context integration proof recorded two rotation snapshot queries (qualified-date aggregate plus current rows) and no explicit comparison-history projection. Focused ESLint passed.

## Root acceptance

Accepted on 2026-09-19 after independent backend review corrections and focused real PostgreSQL evidence. The complete integration regression passed 68 files / 243 tests; subsequent focused backend validation passed 15 files / 64 tests including controlled snapshot and later-scope failure cases. Typecheck passed. Browser consumer evidence: `npx playwright test tests/e2e/market-rotation.spec.ts tests/e2e/portfolio-exposure.spec.ts --reporter=list` passed 6/6; Diary editor, response-loss, discovery and detail-review browser suites also passed. Contract generation checks passed without API contract changes. See `docs/design/convenience-follow-up-acceptance.md` for the remaining cross-feature acceptance work.
