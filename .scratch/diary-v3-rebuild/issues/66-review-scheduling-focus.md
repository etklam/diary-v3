# [66] Open Review scheduling at the requested field

Status: ready-for-agent
Execution: done
Draft reference: A03

Type: AFK
User stories covered: US-029, US-026, US-100, US-102.

## What to build

Make Schedule Review and Change Review schedule open the existing Diary editor at its scheduling field, focus that field when it is ready, and return to the originating Diary or Review after save/cancel. Keep the normal full-editor entry unchanged.

## Acceptance criteria

- [x] Both entrypoints, direct links, and browser back/forward reach the intended field after loading on desktop/mobile without an unrelated jump to the top.
- [x] Save and cancel preserve a safe return destination and existing unsaved-change guards. A restored draft is not overwritten by navigation intent or focus handling.
- [x] Set, change, and clear a schedule through the existing authorized write flow; reopening the record and Review queue shows the persisted result with correct date/time semantics.
- [x] Browser evidence covers keyboard focus, validation failure, cancel/back, and a reviewed Diary whose completed state remains intact. This slice does not introduce a partial update that submits stale unrelated Diary fields.

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

## Final acceptance

Final stable browser batch passed 29/29 (1.8 minutes), including desktop/mobile scheduling and Review save/return. New full-authoring follow-ups passed the schedule focus captures and guest continuation/cancel/clear-on-completed-Review case. The latter verifies review completion remains intact after clearing its schedule. Desktop/mobile form visual inspection accepted the existing layout.

See `docs/design/convenience-follow-up-acceptance.md` for commands and consolidated evidence.
