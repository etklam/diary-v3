# [70] Reuse recent tags across Quick and full Diary authoring

Status: ready-for-agent
Execution: done
Draft reference: A07

Type: AFK
User stories covered: US-013, US-015, US-018, US-098, US-100. Recent-tag memory is an enhancement to these stories.

## What to build

Offer up to eight recently saved tag chips in both authoring flows, plus the existing explicit whole-tag input. Reuse a tag with one action and show whether it is already selected. Keep this bounded browser convenience isolated per account. Suggestions never initialize capture fields or override restored input; they change selection only after an explicit user action.

## Acceptance criteria

- [x] Only authoritatively successful saves update recent history; failed or uncertain writes do not. The most recently saved unique tags appear first, with deterministic bounded ordering.
- [x] Selecting/removing a chip produces the same canonical tag array as manual entry. A tag containing a comma remains one tag, and long/multilingual tags stay usable.
- [x] Account changes cannot reveal another account's history. Explicit sign-out clears that account's local history consistently with existing private local-data rules; unavailable/corrupt storage does not prevent writing.
- [x] Browser evidence saves and reuses tags across Quick/full authoring, reads back the exact array, and verifies account isolation and keyboard access. Preserve restored draft selection and research defaults.

## Blocked by

None — can start immediately. Explicit suggestions do not depend on capture-default initialization.

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

Real browser saves verified whole comma-containing tags across Quick/full authoring, exact API arrays, explicit chip selection, account isolation and sign-out clearing at desktop/mobile widths. Recent-tag editing captures were taken before save and accepted. The 21-case Quick/company/daily batch passed, as did the two final layout/tag/focus cases (12.1 seconds). Only authoritative success remembers tags; malformed or unavailable local storage does not prevent ordinary writing.

See `docs/design/convenience-follow-up-acceptance.md` for reproducible commands and consolidated review.
