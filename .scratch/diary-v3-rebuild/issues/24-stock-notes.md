# [24] 維護 Company 的目前 Stock Note

Status: done
Type: AFK
User stories covered: US-048, US-054

## Parent

[完整重構 PRD](../PRD.md)

## What to build

由 Company 建立、更新及刪除目前有效的 Stock Note，並保留作者與來源。

## Acceptance criteria

- [x] Note 是可變觀點，更新同一內容不偽裝成不可變歷史。
- [x] 所有既有欄位、排序／分頁、owner 與來源標示對等。
- [x] UI／API／DB 覆蓋建立、修改、刪除、長內容及權限拒絕。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [23 watchlist](23-watchlist.md)

## Backend checkpoint — 2026-09-05 (historical)

- Migration 0009 adds Stock Notes with owner/company foreign keys and date/ID indexes; shared runtime contracts and generated standard-fetch client added.
- GET/POST/PUT/DELETE retain source-compatible method/status, full content, source labels, partial updates, date/ID descending pagination and USER-only edits/deletes. Canonical company/Watchlist creation and note insertion share one transaction. Mutation locks the owner-bound row.
- Three real PostgreSQL tests passed (3.34s): long content, scalar update preservation, no synthetic timeline events, pagination/ties/origin filters, Agent protection, wrong-symbol/owner 404, CSRF and invalid Bearer.
- At this checkpoint, partner reads were still described as pending the sharing module; the later existing partner API/browser evidence is recorded below.
- At this checkpoint, React CRUD/read interface, browser flows, sharing integration and independent design review remained.

## React checkpoint — 2026-09-05 (historical)

Company now includes Stock Notes: Markdown reading/preview, create/edit, UTC date input preserving original sub-minute precision when unchanged, account-timezone read display, origin filter, 20-item pagination, delete confirmation and unsaved navigation guard. Failed mutation retains the editor. Two desktop/mobile browser cases passed (14.7s); detector clean. At this checkpoint, remaining browser coverage and independent review were recorded in `docs/design/stock-notes-finish-review.md`; later partner sharing evidence is recorded below.

### Additional browser verification

The focused pagination/unsaved scenario passed (13.1s): 21 real persisted notes, date/ID ordering, page 2, final-page deletion returning to page 1, unchanged `.123Z` instant preserved after title edit, both cancel and confirm unsaved navigation, and logout clearing all note rows. The editor capture was saved during that run.

## Finish validation — 2026-09-06

- Updated the existing owner browser fixture to write refreshed section captures to `docs/design/evidence/stock-notes/1440.png` (960×741) and `docs/design/evidence/stock-notes/390.png` (358×832). The existing editor capture remains `.impeccable/review/stock-notes-editor.png` (960×555); all three were inspected.
- Focused Chrome `tests/e2e/stock-notes.spec.ts`: 3/3 passed in 17.7 seconds (1440px 5.9s, 390px 2.9s, pagination/unsaved 3.7s). No product code changed.
- Existing API evidence: `tests/integration/stock-notes.test.ts` 3/3 and `tests/integration/partner-http.test.ts` 7/7 recorded. Existing partner UI evidence: `tests/e2e/partners.spec.ts` covers Agent note display, read-only controls, private evidence isolation and revocation; no new mobile partner matrix was added.
- Independent inspection found no actual UI defect and made no aesthetic changes. Root accepted the Stock Notes evidence; this does not mark the broader partner tickets complete.

## Final acceptance — 2026-09-06

Root reviewed the refreshed reading/editor captures, existing API/source behavior and the 3/3 focused browser result. The mutable USER note lifecycle, Agent read-only projection, owner/privacy boundaries, pagination/time precision and actual accepted-link stock-note sharing behavior were accepted. All three acceptance criteria are checked. Broader partner ticket status is unchanged.
