# Watchlist finish review

## Historical author inspection — 2026-09-05

Operate surface extending the existing flat green workspace, with an inline add form and ordered company rows. The original desktop light and mobile dark captures were stored in `evidence/watchlist/`. The author inspection found no page overflow and all CRUD controls available. Three locale headings were verified in the browser. This was author inspection, not an independent finish review.

The original real PostgreSQL integration run was 4/4, covering canonical company reuse, duplicate restoration, concurrent ordering, the active-only 100-item limit, ID ties, validation, CSRF and owner isolation. The original browser run was 2/2 (16.3 seconds), covering CRUD persistence, mutation failure recovery, company navigation and logout clearing. Production build/typecheck, lint and generated contracts checks passed.

The first browser run exposed a local logout race: a remounted Watchlist could read still-valid cookies before server logout completed. The session transport was corrected to reject known private API requests after local invalidation, including Watchlist, Portfolio, Trade Plans, user settings and stats; public market requests remain available. The same browser cases passed after that correction.

## Independent finish validation — 2026-09-06

Ticket 25 now supplies owner-filtered `recordCount` and `latestRecord` values. The existing PostgreSQL evidence and Watchlist suites were rerun with the disposable local database: 2 files and 8 tests passed. The focused Chrome browser suite `tests/e2e/watchlist.spec.ts` passed 2/2 in 10.1 seconds (1440px in 4.0s and 390px in 2.5s).

Each browser case creates one synthetic `UNKNOWN` research record through the authenticated API, reloads the Watchlist, and verifies `Research records: 1` plus the latest summary. The flow continues to verify duplicate prevention, persisted sort order, remove/re-add restoration, mutation recovery, company navigation, locale headings and logout clearing. No quote data is required.

The refreshed captures are [`1440.png`](evidence/watchlist/1440.png), 1440×1044, and [`390.png`](evidence/watchlist/390.png), 390×1916. Desktop shows the persisted latest summary and the empty AAPL projection without clipping. Mobile dark mode wraps the same content within the 390px viewport; the local page remains readable and the browser assertion confirmed no document-width overflow. I found no actual UI defect requiring a production change. The existing calm institutional layout remains the design basis; no aesthetic changes were made.

## Final acceptance — 2026-09-06

Root reviewed the persisted research-record fixture, the owner-filtered API path, the refreshed desktop/mobile captures and the independent finish review. Existing canonical stock, ordering, restore, owner isolation, active-only 100-item limit and no-quote evidence were accepted. Ticket 23 is complete with no production UI changes.
