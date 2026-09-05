# Stock Notes finish review

## Historical author inspection — 2026-09-05

Stock Notes extends the existing Company workspace. The original author inspection found Markdown reading, origin/date labels and owner edit/delete actions available without page overflow; the detector returned no findings. The first browser run exposed a duplicate sibling React key between Notes and Evidence; distinct component keys were added before the passing run.

The original browser run was 2/2 (14.7 seconds), covering create, reload, Markdown rendering/raw HTML suppression, UTC capture/account-timezone display, failed edit preserving content then retry, origin filtering, three locales and deletion. The later pagination/unsaved/logout scenario passed in 13.1 seconds and included precise unchanged instants, final-page deletion recovery and the existing editor capture.

## Existing API and partner evidence

The existing recorded API evidence is in `tests/integration/stock-notes.test.ts` (3/3): long-content atomic creation and mutable update; date/ID pagination, origin filtering and USER-only protection for Agent notes; owner/symbol binding, strict input, CSRF and invalid-Bearer boundaries. Partner sharing evidence is in `tests/integration/partner-http.test.ts` (7/7 recorded), including `shared notes require the other side flag and disappear after revocation or unlinking` and `company hub merges only authorized partner notes without partner private context`.

The existing browser partner evidence is in `tests/e2e/partners.spec.ts`: the two-account sharing flow creates an API-key Agent note, selects the partner in Company notes, verifies the note content and Agent label, confirms no edit/delete/create controls or private evidence, then verifies revocation clears the view. `tests/e2e/stock-notes.spec.ts` contains the owner CRUD/error/locale flows and the pagination/precise-time/unsaved-navigation/logout flow.

## Independent finish validation — 2026-09-06

The focused Chrome suite `tests/e2e/stock-notes.spec.ts` passed 3/3 in 17.7 seconds: 1440px owner flow in 5.9s, 390px owner flow in 2.9s, and pagination/unsaved navigation in 3.7s. The owner flow still covers Markdown/raw-HTML handling, account-timezone display, mutation recovery, origin filtering, three locales and deletion. The pagination flow covers 21 persisted notes, date/ID ordering, exact `.123Z` preservation, both unsaved-navigation choices and logout clearing.

The refreshed section captures are [`1440.png`](evidence/stock-notes/1440.png), 960×741, and [`390.png`](evidence/stock-notes/390.png), 358×832. The existing editor capture is [stock-notes-editor.png](../../.impeccable/review/stock-notes-editor.png), 960×555. Desktop and mobile retain the reading order of title, date/source, body and actions; the mobile dark capture stays within its section width, and the browser assertion confirmed no document-width overflow. The editor capture keeps title/date above the long Markdown field and actions below it. I found no actual UI defect requiring a production change and made no aesthetic changes.

## Final acceptance — 2026-09-06

Root reviewed the refreshed reading/editor captures, the existing API/source behavior and the 3/3 focused browser result. The mutable USER note lifecycle, Agent read-only projection, owner/privacy boundaries, pagination/time precision and actual accepted-link stock-note sharing behavior were accepted. This records the Stock Notes slice only; it does not mark the broader partner tickets complete. Ticket 24 is complete with no production UI changes.
