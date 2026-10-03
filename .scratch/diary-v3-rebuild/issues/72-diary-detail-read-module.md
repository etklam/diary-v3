# [72] Read Diary detail and by-date views through one owned projection

Status: ready-for-agent
Execution: done
Draft reference: A09

Type: AFK
User stories covered: US-012, US-014, US-020, US-021, US-028, US-036, US-106, US-107, US-113 (preserved behavior).

## What to build

Concentrate owner-scoped Diary loading, association ordering, projection-specific assembly, serialization, and snapshot policy behind a Diary reading module for detail and by-date reads. Integrate both existing HTTP paths and their browser/client consumers in this slice.

## Acceptance criteria

- [x] Existing authorized reads preserve response fields, decimal/date formats, empty arrays, missing-record outcomes, and their distinct association projections. Cross-owner access remains rejected.
- [x] Each detail/by-date read performs owner-scoped Diary existence, all associations included by that projection, and serialization from one read-only repeatable-read transaction. The snapshot is fixed by its first database read; existing missing-record/ownership outcomes and distinct association sets remain unchanged. Verify a self-consistent aggregate under a controlled concurrent update with real PostgreSQL rather than timing-only sleeps, and record this intentional consistency strengthening in the relevant ADR.
- [x] Routes no longer assemble related Transactions, Trade Plans, Company links, and Alerts independently. Keep useful owner-scoped batched readers; do not replace them with pass-through wrappers.
- [x] HTTP/client and browser evidence reads the same saved record by identity and date. Contract compatibility, representative associations, and bounded query behavior pass. No current race or speedup is claimed without evidence.

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

Implemented the owner-scoped `diary-read` module. Detail and by-date responses now establish the Diary row and all projection associations in one read-only `repeatable read` transaction; the full PUT response retains the committed `updateDiary` result serialization and linked Trade Plan fetch. Full list association loading is batched through the same module while by-date keeps its existing no-Trade-Plan projection.

Focused evidence: `DATABASE_URL=postgresql://diary:diary_local@127.0.0.1:55433/diary_v3 npx vitest run tests/integration/diary-read.test.ts tests/integration/diary-list.test.ts tests/integration/diary-review.test.ts tests/integration/diary-editor.test.ts` passed 18 tests, including real PostgreSQL concurrent detail/by-date snapshots and bounded association queries. Focused ESLint passed. Root-owned browser acceptance remains pending.

## Root acceptance

Accepted on 2026-09-19 after independent backend review corrections and focused real PostgreSQL evidence. The complete integration regression passed 68 files / 243 tests; subsequent focused backend validation passed 15 files / 64 tests including controlled snapshot and later-scope failure cases. Typecheck passed. Browser consumer evidence: `npx playwright test tests/e2e/market-rotation.spec.ts tests/e2e/portfolio-exposure.spec.ts --reporter=list` passed 6/6; Diary editor, response-loss, discovery and detail-review browser suites also passed. Contract generation checks passed without API contract changes. See `docs/design/convenience-follow-up-acceptance.md` for the remaining cross-feature acceptance work.
