# [71] Continue from a confirmed Quick Diary save

Status: ready-for-agent
Execution: done
Draft reference: A08

Type: AFK
User stories covered: US-015, US-017, US-018, US-020, US-026, US-102. Persistent continuation choices are an enhancement to these stories.

## What to build

After an authoritative Quick Diary save, offer quiet explicit actions to open the saved Diary, edit details or Transactions, or start another note. Retain the source-return action when a valid research source exists. Keep the success state available until the user acts or dismisses it.

## Acceptance criteria

- [x] Every destination uses the confirmed saved Diary identity, including same-day append. The result is not guessed from the submitted date or a stale lookup.
- [x] No action automatically replays a write, navigates away, or expires after a fixed timeout. Ambiguous writes remain in recovery instead of presenting success actions.
- [x] Starting another note intentionally resets the saved draft and follows the existing date/Company/source defaults; a second successful note can be saved and read back without duplicate submission.
- [x] Browser evidence covers create, append, delayed success, response loss, all continuation choices, keyboard focus, and canonical source return. Both the Quick page and dialog have a coherent completion flow.

## Blocked by

- Existing [63 — Research to Diary context handoff](63-research-diary-handoff.md): extends its confirmed-save and source-return flow.

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

All Quick continuation cases passed at desktop/mobile widths, including canonical source return, confirmed append identity, New note followed by a second save, real API readback and durable uncertain-result recovery. The research-handoff delayed response/double-submit case passed after updating its test to explicitly open the saved Diary. The built-artifact release suite passed 9/9 in 12.4 seconds, including Company capture and the complete Diary mainline. Saved actions and final editing visuals were accepted.

See `docs/design/convenience-follow-up-acceptance.md` for reproducible commands and consolidated review.
