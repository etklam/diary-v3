# [23] 管理股票 Watchlist

Status: done
Type: AFK
User stories covered: US-045, US-046

## Parent

[完整重構 PRD](../PRD.md)

## What to build

由 Watchlist 新增、更新追蹤狀態、排序／閱讀並移除股票，開啟對應 Company。

## Acceptance criteria

- [x] canonical Stock 與本人 Watchlist 的建立及唯一性正確，不產生重複主檔。
- [x] 既有狀態、分頁／排序、symbol 驗證、duplicate 及越權行為對等。
- [x] UI CRUD、重新載入後持久化及無報價情境可驗收。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [18 market-provider](18-market-provider.md)

## Implementation checkpoint — 2026-09-05 (historical)

- Added canonical-stock Watchlist schema/migration 0007, shared runtime contracts, OpenAPI/native-compatible generated client and authenticated GET/POST/PATCH/DELETE routes.
- Preserved source archive/restore semantics, POST 200, duplicate identity/order, WATCHING-only list, limit 100 and sortOrder/ID ordering. The source route has no page query contract; no incompatible pagination wrapper was introduced.
- Intentional correction: owner-scoped transactional advisory lock prevents concurrent creates allocating the same next sort order; database owner/stock uniqueness remains authoritative. True PostgreSQL tests exercise concurrent duplicates and different symbols.
- React `/stocks/watchlist` supports add, explicit sort order, remove, restore, error recovery, three locales and company navigation without requiring a quote.
- PostgreSQL integration 4/4; Playwright desktop/mobile 2/2 (16.3s); build/typecheck, lint and contracts check passed. Browser regression also covers clearing private rows on logout.
- Ticket 25 now supplies owner-filtered recordCount/latestRecord values in a consistent snapshot. At this checkpoint, independent finish review and final UI quality evidence remained. See `docs/design/watchlist-finish-review.md`.

### Evidence projection integrated

Ticket 25 backend now provides real owner-filtered counts/latest records in a consistent snapshot. API tests cover private foreign records, event-time ordering and same-time ID ties. Remaining projection UI evidence will accompany the capture browser flow.

### Finish validation — 2026-09-06

- Added one authenticated synthetic `UNKNOWN` evidence record to the existing 1440px and 390px Watchlist browser fixtures; after reload both cases assert `Research records: 1` and the latest summary. No production code changed.
- Existing PostgreSQL Watchlist/evidence integration suites: 2 files, 8 tests passed. Focused Chrome `tests/e2e/watchlist.spec.ts`: 2/2 passed in 10.1 seconds (1440px 4.0s, 390px 2.5s).
- Refreshed [`docs/design/evidence/watchlist/1440.png`](../../../docs/design/evidence/watchlist/1440.png) at 1440×1044 and [`docs/design/evidence/watchlist/390.png`](../../../docs/design/evidence/watchlist/390.png) at 390×1916. Desktop and mobile show the persisted latest record; the mobile browser assertion confirms no document-width overflow.
- Independent review found no actual UI defect and made no aesthetic or production changes. Root accepted the evidence and marked the ticket complete.

### Final acceptance — 2026-09-06

Root reviewed the persisted research-record fixture, owner-filtered API path, refreshed desktop/mobile captures and independent finish review. Existing canonical stock, ordering, restore, owner isolation, active-only 100-item limit and no-quote evidence were accepted. All three acceptance criteria are checked.
