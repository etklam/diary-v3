# [64] Write Quick Diary content before optional setup

Status: ready-for-agent
Execution: done
Draft reference: A01

Type: AFK
User stories covered: US-015, US-016, US-017, US-098, US-100, US-102, US-103.

## What to build

Make the existing Quick Diary page and global dialog immediately writable. Show the writing area before optional templates and metadata, with a compact editable date and create/append destination summary. A visible existing destination title replaces the misleading editable title when appending to an occupied date. Preserve the existing capture features and actual save behavior.

## Acceptance criteria

- [x] In the 390×844 mobile fixture, writing is available without scrolling past optional setup. The desktop keyboard shortcut focuses content; pointer/touch opening does not unnecessarily force the mobile keyboard.
- [x] Date/destination changes remain explicit and accessible. Append shows the authoritative target title; an empty date still supports entering a new title. Stale date-lookups cannot overwrite newer selections.
- [x] Free writing, templates, Company links, snippets, voice, source context, and draft Restore/Discard remain reachable and preserve their existing semantics.
- [x] Existing sticky save, loading/error feedback, uncertain-result protection, and server-confirmed create/append work in browser tests. Read the saved Diary through the real API to verify title, body, tags, and Company links.

## Blocked by

- Existing [63 — Research to Diary context handoff](63-research-diary-handoff.md): finish its capture UI and end-to-end acceptance before reorganizing that flow.

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

Content-first desktop/mobile visual confirmation passed 2/2 in 12.1 seconds at 1440×900 and 390×844. The complete textarea is available in the first viewport, optional details remain collapsed, pointer entry works, and Ctrl+J focuses Restore before moving to Content after restoration. The final visual correction restores visible mobile primary-save colors and hides the duplicate visual label. Quick templates, snippets, voice, related trades, Company associations and drafts passed their existing browser suites. All 18 research-handoff cases have passing evidence; no uncertain append replay occurs.

See `docs/design/convenience-follow-up-acceptance.md` for reproducible commands and consolidated review.
