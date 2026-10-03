# [75] Recover full Diary and Review drafts through one lifecycle

Status: ready-for-agent
Execution: done
Draft reference: A12

Type: AFK
User stories covered: US-002, US-003, US-018, US-031, US-032, US-102 (preserved behavior).

## What to build

Consolidate account-and-Diary draft storage, expiry, debounce, restore pause, flush, and session-invalidation ordering across the full Diary editor and Diary Review. Keep dirty detection, payload normalization, restore merging, and save reconciliation owned by each form. Leave Quick Diary's uncertain-append recovery outside this refactor.

## Acceptance criteria

- [x] Preserve existing 24-hour expiry, 600ms debounce, restore/discard choice, and unmount flushing. Invalid or unavailable storage remains recoverable without blocking the form.
- [x] Automatic session expiry preserves eligible work; explicit and cross-tab sign-out clears it and suppresses late writeback. Another account cannot restore or see that draft.
- [x] Successful save/Review completion cannot resurrect a stale draft. Research defaults, full-editor restored input, and Review-specific reflection merging retain their distinct precedence.
- [x] Browser evidence covers both forms across reload, expiry/sign-in/restore, discard, rapid exit, successful save, and cross-tab sign-out. Reuse existing behavior tests and add only uncovered lifecycle regressions; avoid a configuration-heavy generic form engine.

## Blocked by

- Existing [63 — Research to Diary context handoff](63-research-diary-handoff.md): preserve the accepted full-editor context and recovery behavior.

## Delivery constraints

- All slices are AFK under the existing authorization: Astra owns architecture and design decisions and final acceptance, Luna owns implementation, and Sol provides focused independent review where useful. Routine agent design review is not a human blocker. No production cutover is authorized.
- Every slice completes its affected path through actual persistence, API/client, and UI or CLI consumers, with appropriate runnable evidence. A presentation change does not require inventing a database migration or new endpoint. No separate infrastructure-only or test-only tickets are needed.
- Each UI slice records an Astra brief before implementation: retain the existing typography, semantic light/dark colors, spacing tokens, reading widths, and focus treatment; define changed ordering and interactions. Verify desktop/mobile, all three locales, keyboard/focus, long content, and the relevant empty/loading/error states. Material deviations return to Astra.
- Preserve owner isolation, valid date and decimal semantics, original judgment versus private Review, safe Markdown, account-scoped drafts, explicit append, uncertain-write safeguards, and canonical research source returns. ADRs 0001, 0006, 0007, 0008, 0010, and 0011 constrain the affected slices.
- Use synthetic browser fixtures, real disposable PostgreSQL for integrity/concurrency, and controlled provider fixtures. Record commands and outcomes in each ticket before marking execution complete. Generated contracts/client/OpenAPI must remain consistent whenever an API contract is actually changed.
- A completed blocker is a scheduling condition. Shared files alone are not a product dependency; coordinate ownership when independent slices overlap.


## Comments

Published on 2026-09-19 after the user instructed “fix all ticket”, approving all thirteen slices and implementation. The parent PRD is unchanged.

## Final acceptance

Final stable browser batch passed all full editor recovery, Review restore/discard/re-arm, automatic expiry/re-login, successful cleanup and cross-tab sign-out cases (29/29 overall). The new real React lifecycle harness passed separately (1/1, 7 seconds), covering key-bound A/B snapshots, unmount flushing, suppression re-arming and explicit flush. New full-save cleanup and in-flight append restore checks also passed. Unit regression: 77 files / 692 tests passed.

See `docs/design/convenience-follow-up-acceptance.md` for commands and consolidated evidence.
