# [73] Serve bounded Diary lists and private Review through the read module

Status: ready-for-agent
Execution: done
Draft reference: A10

Type: AFK
User stories covered: US-022, US-024, US-031, US-032, US-033, US-069, US-106, US-113 (preserved behavior).

## What to build

Integrate existing full-list, bounded-summary, and owner-only Review reads with the Diary reading module. Share projection ownership and association rules while keeping each consumer's purpose and privacy boundary explicit.

## Acceptance criteria

- [x] Lists preserve filters, ordering, tie-breakers, pagination, existing snapshot behavior, and count/result agreement. Association loading remains batched rather than one query per Diary.
- [x] Summary consumers remain bounded and exclude full body/private reflection where currently excluded. Review still exposes the owner's original judgment and separate retrospective fields.
- [x] Partner sharing remains governed by its existing explicit projection and excludes Transactions, Portfolio, reminders, and private Review text; consolidation must not widen that projection.
- [x] Disposable PostgreSQL and API/browser evidence covers list-to-detail, filtered Timeline, owner Review, and negative privacy cases. Projection code has one responsible module without a universal form or resource framework.

## Blocked by

- [72 — Read Diary detail and by-date views through one owned projection](72-diary-detail-read-module.md).

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

Full Diary list and owner Review now use named projections from `diary-read`; their internal association collector is private. Summary lists continue using grouped transaction/alert counts and bounded excerpts, and partner projections were left unchanged.

Focused evidence: `DATABASE_URL=postgresql://diary:diary_local@127.0.0.1:55433/diary_v3 npx vitest run tests/integration/diary-list.test.ts tests/integration/diary-review.test.ts tests/integration/diary-editor.test.ts` passed all 15 relevant tests. Focused ESLint passed. Root-owned browser and privacy acceptance remains pending.

## Final acceptance

The full integration regression passed 68 files / 243 tests; focused new read/context/execution tests passed 3 files / 5 tests. Final stable browser batch passed all owner Review, detail, Timeline and session cases (29/29 in 1.8 minutes), including cross-owner private Review denial and cross-tab sign-out. Existing bounded list and Partner privacy integration checks passed without widening their projections.

See `docs/design/convenience-follow-up-acceptance.md` for the consolidated evidence and approved design review.
