# [35] 整理並隨機閱讀 Discipline

Status: done
Type: AFK
User stories covered: US-061, US-062, US-063

## Parent

[完整重構 PRD](../PRD.md)

## What to build

完成 Discipline 建立、修改、刪除、排序及隨機抽取，讓使用者持續整理交易原則。

## Acceptance criteria

- [x] 所有既有欄位、owner、排序與 random 行為正確往返。
- [x] 空清單、單筆、較多資料及無效排序輸入有驗證。
- [x] UI 由建立至重排、抽取、刪除完整可用，鍵盤與手機可操作。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [04 web-session](04-web-session.md)

## Source audit and persistence foundation

Audited frozen `server/utils/discipline-queries.ts`, random/reorder/create/delete handlers and Prisma Discipline model. Content is trimmed, 1–255 characters; response fields are id/content/order/createdAt. List has no source cap, ordered by signed display_order; partial reorders are accepted. Create appends max(order)+1; random returns custom content or one of three fixed Chinese defaults with isCustom=false. Delete returns success. Import/export/share are ticket 36 obligations.

Added portable discipline write/read/reorder/random schemas and migration 0013 for owner-cascading disciplines with a composite user/order/id index and nonempty-content constraint. Reorder IDs use canonical decimal strings for native-ready precision; duplicate IDs and out-of-range PostgreSQL integers are rejected. Preserve source signed orders and partial reorder behavior; use ID as deterministic tie-breaker. Planned debt corrections: serialize owner collection writes so concurrent creates do not assign the same append rank, and keep reorder ownership validation and mutation in one transaction so concurrent deletion cannot partially apply a reorder. API and browser flows remain unimplemented.

Contract and real PostgreSQL schema tests passed (2 files / 2 cases, 1.75s): trimming, length boundary, duplicate IDs, large IDs, signed/int32 order, response owner omission, timestamps, blank/oversized content rejection and owner cascade. No ticket completion claimed.

## HTTP and concurrency checkpoint

Implemented GET/POST `/api/discipline`, GET `/random`, PATCH `/reorder`, PUT/DELETE `/:id`, preserving source response fields, fallback quotes and success statuses. Owner-only and no-store, strict input, global CSRF, stable order/id ties and partial signed reorders. Collection mutations lock the owner row even when the collection is empty; concurrent creates assign distinct successive ranks, and reorder validates every owned ID and writes inside one transaction. Appending at int32 maximum returns validation failure without insertion. Random reads select one owner row using PostgreSQL random ordering rather than transferring the entire collection.

OpenAPI and generated standard-fetch client now cover all six operations. Added `DISCIPLINE_NOT_FOUND`, local signed-out guarding and safe login return for the forthcoming discipline page.

Real HTTP/PostgreSQL suite passed 3/3 (1.83s): empty/default and single/custom random, content/edit/date/order roundtrip, signed partial reorder, owner/guest/CSRF, duplicate IDs, six simultaneous creates with distinct ranks, mixed-owner reorder leaving all rows unchanged, deterministic ties, int32 overflow and delete. A synthetic database trigger fails the second reorder write and proves the first write rolls back too. Typecheck/lint passed before final rollback case; final checks follow. React UI, browser acceptance, explicit delete/reorder concurrency coverage and independent review remain pending.

## React authoring and ordering checkpoint

Added `/discipline` and navigation with three locales, account-timezone creation dates, empty state, random custom/default reading, content creation/editing, native button-based up/down ordering and deletion. Dirty drafts guard navigation and block conflicting row actions. Edit focuses the textarea; successful keyboard reorder moves focus to the relocated principle. Failed mutations retain input and display shared error recovery. Drawn content is cleared on CRUD changes to avoid retaining a deleted/edited principle in the random display.

Desktop/mobile browser tests passed (2/2, 8.7s): login return, empty fallback, create two, keyboard move up and focus, persistence after reload, edit and focus, custom draw, all three locales, delete to empty and sign-out clearance. Typecheck/lint/build passed. Author inspected desktop light and mobile dark captures and identified a missing gap between textarea and save button; added the established 20px spacing and reran browser verification. Independent review and further failure/dirty-guard acceptance remain required; ticket stays in-progress.

Spacing correction verified: both browser cases passed again (8.2s) and the author inspected the updated mobile capture. Final code change after the successful build was only the form action margin; no production deployment performed.

## Failure and unsaved-draft browser acceptance

Added a real browser scenario that aborts the list read then retries, aborts create before transmission and verifies the draft/error focus/enabled retry, rejects dirty navigation and preserves content, saves successfully, aborts a reorder and retains the persisted ordering, then retries and succeeds. Confirmed dirty navigation discards only after acceptance.

Corrected delete recovery: a request can commit while its response is lost. The page now treats a subsequent owner-scoped DISCIPLINE_NOT_FOUND as confirming the requested absence, removing its stale row. Other failures remain errors. Browser route forwarding commits the actual DELETE then aborts delivery; a second DELETE returns 404 and clears the row. Extended failure case passed (1/1, 6.3s). Typecheck/lint passed. This does not establish safe replay for uncertain POST creates; that still needs a separate idempotency/recovery design. Longer lists, explicit delete/reorder concurrency and independent review remain pending.

## Final implementation evidence pending root acceptance

Create response loss now uses a conservative owner-list reconciliation. After a POST transport failure, the page reads the list once and accepts the write only when every pre-request row still matches its id/content/order and exactly one new row matches the submitted content at the expected append order. Otherwise the draft remains and the user receives an uncertain-result message; the client never silently replays a non-idempotent POST. The English, Traditional Chinese and Simplified Chinese copies describe this state.

Focused real PostgreSQL tests cover 128-row collections and a concurrent reorder/delete pair, asserting owner-lock serialization, no partial reorder, unique IDs and contiguous surviving orders. The browser suite also covers a 120-row narrow viewport list and a forwarded POST whose committed response is aborted: the row is reconciled, the draft clears, and the POST count remains one. The existing 10 discipline browser cases passed in the first focused run; the two recovery cases passed in the corrective focused rerun. The generated desktop/mobile captures remain under `docs/design/evidence/discipline/`. Root review is still required before changing this ticket status.

## Root acceptance — 2026-09-06

Astra accepted the source-preserving CRUD/random/partial-order contract, serialized PostgreSQL ownership/concurrency checks, 128-row collection evidence, desktop/mobile keyboard flows and conservative lost-create response recovery. The focused browser run passed ten cases; the two response-loss cases passed after correcting only their status-text locators. Prior passing cases were not repeated for that trivial test correction. Ticket04 is done.
