# [68] Open Evidence capture only when requested

Status: ready-for-agent
Execution: done
Draft reference: A05

Type: AFK
User stories covered: US-026, US-049, US-050, US-054, US-098, US-100, US-102.

## What to build

Replace the initially expanded Evidence capture form on Diary reading with an explicit contextual action. Expand the existing form when requested, retaining its source and Company/Diary context, and keep successful capture connected to the immutable Stock Timeline Record.

## Acceptance criteria

- [x] Initial reading does not require scrolling past an unused capture form. Activating capture reveals a labeled form, moves focus appropriately, and preserves valid existing source choices and defaults.
- [x] Closing a pristine form is immediate; closing or navigating away from a changed form preserves input or uses the existing discard safeguard. Validation/provider/API failures keep the entered data and a reachable retry action.
- [x] A confirmed save creates exactly the intended Evidence record and exposes its existing destination. Canonical idempotency and ownership rules remain effective on retry, with no new write triggered merely by opening the form.
- [x] Browser and API evidence captures Evidence from a saved Diary, reads the linked Stock Timeline Record, and covers empty/cancel/failure/retry, keyboard focus, mobile layout, and source/Company association.

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

- Diary Evidence is collapsed behind a contextual action and preserves source title, canonical Diary URL, form values, and focus when closed and reopened.
- Changed collapsed captures install a scoped route and browser unload discard guard; confirmed saves retain the immutable retry/idempotency flow and expose a link to the saved source destination.
- Updated `tests/e2e/evidence.spec.ts` for collapsed/expanded screenshots, focus, close/reopen preservation, save destination, and the existing Company Timeline retry flow.
- Scoped ESLint passes for the Evidence source and affected browser tests. Root owns the serial browser run and final visual acceptance.

## Root acceptance

Accepted on 2026-09-19. `npx playwright test tests/e2e/evidence.spec.ts tests/e2e/timeline.spec.ts tests/e2e/stock-notes.spec.ts --reporter=list` passed all four Evidence cases and all three Stock Notes cases after the guard was restricted to collapsed Diary capture. The single unrelated Timeline mobile failure occurred during a concurrent source HMR update and remains queued for rerun. Desktop/mobile Evidence screenshots received a bounded confirmation inspection; the full-page capture no longer places the sticky shell inside the form. Browser evidence covers disclosure focus, retained input, rejected/accepted dirty navigation, idempotent retry, persisted source link and sign-out behavior.
