# [67] Read a saved Diary with clear original-judgment states

Status: ready-for-agent
Execution: done
Draft reference: A04

Type: AFK
User stories covered: US-012, US-018, US-028, US-031, US-032, US-033, US-054, US-098.

## What to build

Put the readable saved Diary and a nearby Edit action first. Replace three all-empty original-judgment sections with one accurate missing-state summary. Apply the same distinction between original judgment and retrospective Review when reading a Review. Evidence capture presentation is a separate slice.

## Acceptance criteria

- [x] A short saved Diary has a clear complete reading state and reachable Edit action; all-empty, partially filled, and fully filled original judgments render accurately without hiding existing information.
- [x] Private reflection remains separate from original content, and no Review or other private fields enter a Partner or summary projection.
- [x] Browser evidence covers short/long content, completed/pending Review, loading/failure, mobile reading, and keyboard focus. Follow the nearby Edit action, save a change, and verify the reread result. Preserve canonical Company/source return links.

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

## Implementation evidence

- Added a reusable `OriginalJudgment` reading component and three-locale missing-state copy.
- Diary reading now keeps the Edit action beside the title, consolidates all-empty original judgment fields, omits only empty individual fields in partial records, and keeps Review in its own section.
- Added browser coverage for empty, partial, and complete original judgment states, long content, keyboard focus, mobile overflow, and rereading after an edit in `tests/e2e/diary-discovery.spec.ts`.
- Scoped ESLint passes for the reading source and affected browser tests. Root owns the serial browser run and final visual acceptance.

## Final acceptance

Original-judgment reading passed the Diary discovery/detail suite, then the final stable Review/detail browser rerun. Desktop/mobile visual inspection accepted the missing, partial and populated reading states; the nearby Edit/save/reread path passed. Final stable authoring, Review, session, detail and Timeline batch: 29/29 passed in 1.8 minutes.

See `docs/design/convenience-follow-up-acceptance.md` for the consolidated evidence and approved design review.
