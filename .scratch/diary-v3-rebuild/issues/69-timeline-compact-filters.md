# [69] Read recent Timeline entries before expanding date filters

Status: ready-for-agent
Execution: done
Draft reference: A06

Type: AFK
User stories covered: US-024, US-026, US-098, US-100, US-102.

## What to build

Use a compact date-filter summary on mobile so recent Diaries appear earlier. Disclose exact date controls on demand and keep applied filters visible and clearable. Reuse the existing Timeline query and navigation semantics.

## Acceptance criteria

- [x] With the standard one-Diary fixture at 390×844, a Diary entry begins in the first viewport before optional filter controls are expanded; long headings and other locales remain operable.
- [x] Users can expand, apply, inspect, and clear an inclusive date range with keyboard or touch. Applied ranges are not hidden inside a closed disclosure.
- [x] Reload, shared URLs, pagination if present, and browser back/forward preserve the exact current filter semantics and focus behavior. Invalid/empty/loading/failed results remain distinct.
- [x] Browser evidence follows a filtered entry into the correct Diary and back to the same Timeline context. Do not add unsupported tag filters or change the read projection.

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

- Timeline date controls now use a native details disclosure; active bounds remain visible in the summary and a clear action removes the exact URL filters.
- Existing query, pagination, stale-response, loading, invalid, failure, navigation, and back/forward behavior remain in the same route contract.
- Updated `tests/e2e/timeline.spec.ts` and `tests/e2e/diary-discovery.spec.ts` for collapsed/active desktop and mobile screenshot batches, applied-range visibility, clear semantics, and return navigation.
- Scoped ESLint passes for the Timeline source and affected browser tests. Root owns the serial browser run and final visual acceptance.

## Final acceptance

Final stable browser run passed all three Timeline cases, including 390px locale/filter interactions and browser-back page/scroll restoration. Desktop/mobile visual confirmation accepted the compact disclosure, visible active bounds and chevron. Command: npx playwright test tests/e2e/diary-editor.spec.ts tests/e2e/diary-editor-ux.spec.ts tests/e2e/diary-response-loss.spec.ts tests/e2e/diary-review.spec.ts tests/e2e/web-session.spec.ts tests/e2e/diary-detail-review.spec.ts tests/e2e/timeline.spec.ts --reporter=list --max-failures=4 — 29/29 passed in 1.8 minutes.

See `docs/design/convenience-follow-up-acceptance.md` for the consolidated evidence and approved design review.
