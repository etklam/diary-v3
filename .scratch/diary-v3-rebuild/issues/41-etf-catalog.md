# [41] 管理 ETF Catalog 與歷史資料初始化

Status: done
Type: AFK
User stories covered: US-076, US-097

## Parent

[完整重構 PRD](../PRD.md)

## What to build

管理員新增或初始化既有 ETF Catalog、取得並持久化研究所需歷史資料、查看結果及刪除 ETF。

## Acceptance criteria

- [x] 依來源的 symbol 驗證、歷史頻率／範圍、唯一性、必要 seed 與刪除關聯處理。
- [x] API 與管理畫面有明確成功／失敗／資料筆數，只有 Admin 可操作。
- [x] 真 DB＋受控 provider 驗證初始化、重跑、刪除及資料失敗；ETF 不寫入個人股票帳本。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [18 market-provider](18-market-provider.md)

## ETF persistence checkpoint

Read frozen etf-admin-queries and initialization/seed handlers plus Etf/EtfPrice/EtfWatchlist schema. Source initializes five years of monthly prices, skips null closes, falls back missing OHLC/adjusted close to close, seeds 24 common ETFs and cascades catalog deletion into prices/watchlists.

Added separate etfs, etf_prices and etf_watchlists tables in migration 0016. Canonical uppercase symbol uniqueness, exact numeric(10,4) prices, calendar-date strings, per-ETF/date uniqueness and owner/ETF watchlist uniqueness preserve intent without touching stocks/transactions. Monthly volume uses bigint instead of legacy Int to avoid 32-bit overflow.

Disposable PostgreSQL schema test passed (594ms), covering concurrent symbol uniqueness, malformed canonical symbols, four-decimal precision, 5-billion volume, duplicate price/watchlist rejection, owner cascade retaining master/prices, master deletion cascading prices and no stock-ledger writes. Raw pg DATE test assertion now explicitly selects date::text to avoid driver timezone conversion; Drizzle schema already uses string date mode. Typecheck/lint passed. Remaining: controlled monthly provider, seed/contracts/admin API/UI, rerun/delete/failure acceptance.

## Monthly provider and management contracts checkpoint

Extended the existing queued Yahoo provider with five-year interval=1mo history, using the same cancellation/cache/error machinery. Monthly projection skips null closes, falls back missing OHLC/adjusted close to close, sorts/deduplicates calendar days, accepts large safe-integer volumes and rejects malformed dates/negative volumes/out-of-storage-range prices. Monthly requests bypass fresh cache for explicit initialization; cached fallback is marked stale and must be rejected as initialization success by the pending Admin handler.

Added strict shared Admin ETF create/list/seed/delete/initialize response contracts and the 24-entry common ETF seed copied from the frozen source. Preserved source symbol trim/uppercase/20 limit, optional name normalization and explicit admin skipValidation option. Provider unit tests passed 2/2 (10.20s), covering exact request range/frequency, null filtering/fallbacks, ordering, 5-billion volume, malformed data and stale fallback. Typecheck/lint passed for provider changes; new contract/seed files await the next integration check. Admin routes/UI not yet implemented.

## ETF Admin API checkpoint

Added admin-only list/create/seed/delete/initialize routes and generated OpenAPI/fetch operations. Guest and API-key transports lack session user and reject; ordinary Users receive AUTH_FORBIDDEN. Create supports provider validation or explicit skipValidation, catches concurrent symbol duplicates via unique insert, and seed is rerunnable with 24 entries. Initialization fetches outside transaction, rejects stale fallback, locks the current master row before insert and skips existing dates. Delete locks master and reports relation counts before cascade. DB errors remain DB errors instead of being mislabeled as provider failures.

Synthetic-provider HTTP/PostgreSQL suites passed 2/2 (1.34s): seed 24 then 0, concurrent initialize 2/0, sorted date range, stale provider failure preserving stored rows, accurate price/watchlist deletion counts, post-delete 404 and empty stocks table; user/guest/key denial, CSRF, normalization and concurrent create 200/409. Fixed list correlated subquery qualification discovered by the relation-count assertion. Contract generation/typecheck/lint passed before that SQL-only correction. Remaining: provider/DB failure and deletion races, full symbol errors, Admin UI and independent review.

## Initialization race and failure checkpoint

ETF Admin HTTP suite expanded to 4/4 passing (1.78s). A controlled upstream gate pauses history retrieval while the catalog is deleted; released initialization returns 404 and inserts no prices. Injected second-price failure returns 500 with zero rows, then a normal retry adds both prices. Invalid symbol returns validation 400 and missing history returns provider 502. Tests use only synthetic fixtures. Typecheck/lint passed.

Monthly provider now checks the four-decimal rounded value against numeric(10,4) capacity, so 999999.99999 is rejected before it rounds to an unrepresentable 1000000.0000. Monthly unit suite passed 2/2 (12.18s), including this boundary. Admin UI and browser authorization/initialization/deletion flow remain next; no ticket completion claimed.

## ETF Admin UI checkpoint

Added /admin/etf with three locales, create/name/skip-validation controls, common seed, refresh, history initialization/rerun result with date range, relation counts, deletion confirmation and counts, loading/error/retry/login states. Settings exposes an Admin-only catalog link based on authenticated /auth/me; route authorization remains server-enforced.

Disposable E2E server now seeds one explicitly synthetic Admin account and provides controlled monthly bars; no production authorization bypass was added. Chrome flow passed (6.0s): seed 24, initialize two monthly prices, rerun adds zero, 1440/390 no overflow, delete reports removed prices, create new catalog entry. Screenshots captured under docs/design/evidence/etf-admin (not yet visually inspected). Typecheck/lint passed for page implementation; latest Settings link checks follow. Remaining: visual inspection, full error/locale/ordinary-user browser checks, and independent review.

## UI recovery and access checkpoint

ETF Admin browser suite passed 2/2 (7.3s): initialization transport failure preserves zero count and retry succeeds; list refresh failure removes operational controls until successful retry; English/Traditional/Simplified headings update; an ordinary account’s direct /admin/etf URL shows denial with no create button and Settings has no Admin link. Existing seed/reinitialize/delete/create flows still pass.

Primary viewed mobile full-list screenshot, but rendering downscaled 358x5226 to 140x2048; only overall wrapping/structure is confirmed, not detailed visual QA. Focused viewport screenshots and independent review remain pending. Ticket remains in-progress.

## Completion fixes checkpoint

Admin inputs now keep the shared 20-character symbol and 255-character name limits connected to inline `aria-invalid`/`aria-describedby` feedback. Catalog rows expose a symbol-bearing accessible row name with initialize/delete actions; deletion confirmation includes the exact ETF symbol. The focused keyboard boundary flow fills the 20-character symbol and 255-character name, then presses Enter on the name input to submit; it passed at 1440px and 390px with no horizontal overflow. Captures are `docs/design/evidence/etf-admin/focused-1440.png` and `focused-390.png`.

Targeted Chrome runs passed the existing admin flow and ordinary-user denial flow (2/2), plus the long-input keyboard flow (1/1). Root acceptance combined the independent source/formula review, focused visual review, and the real PostgreSQL/provider evidence recorded above.

## Final acceptance evidence

2026-09-06 root acceptance confirmed all three criteria. The real PostgreSQL suites cover seed reruns, concurrent initialization, provider failures, deletion counts/cascade behavior, ownership/authorization, and an empty stock ledger; the controlled provider never uses production data. The browser evidence covers the Admin seed/initialize/rerun/delete/create flows, ordinary-user denial, three locales, 20-character symbols, 255-character names, Enter submission, and focused 1440px/390px captures. See [`docs/design/etf-finish-review.md`](../../../docs/design/etf-finish-review.md) for the consolidated review record.
