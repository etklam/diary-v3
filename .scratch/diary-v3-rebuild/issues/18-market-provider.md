# [18] 在 Company 查看報價與歷史價格

Status: done
Type: AFK
User stories covered: US-047, US-089

## Parent

[完整重構 PRD](../PRD.md)

## What to build

開啟股票 Company 的最小行情視圖，經公開／受保護的既有行情入口取得最新與歷史資料。

## Acceptance criteria

- [x] quote／historical 維持 guest 可用；Company 的個人持倉、Watchlist、研究捕捉仍需 User。公開 request 若帶無效顯式 credential 仍 fail closed，symbol normalization、canonical wire／資料時間／缺值正確。
- [x] Yahoo queue、concurrency、timeout、TTL／stale-on-error 與既有批次上限由一個 provider 邊界擁有。
- [x] 受控 upstream 驗證正常、429、timeout、partial、alias／unknown symbol，CI 不依賴即時行情。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [04 web-session](04-web-session.md)

## Implementation checkpoint

Provider and public HTTP routes are mounted with injected fixtures, shared credential resolution, IP limit and freshness metadata. `tests/unit/market-data.test.ts` passed 17/17, including real installed SDK cancellation through controlled fetch; `tests/integration/market-http.test.ts` passed 5/5 with disposable PostgreSQL and actual HTTP. OpenAPI and typed client include both public market paths. Authorized legacy corrections are recorded in ADR 0007.

Company UI and browser verification are in progress; do not treat this backend checkpoint as completion of the vertical slice.

## Completed vertical slice

Company `/stocks/:symbol` quote/history UI passed three Chrome E2E cases with controlled fixtures. Desktop/mobile independent review disposition ship is recorded in `docs/design/market-finish-review.md`; navigation now selects all symbol/alias routes.

The additional authenticated `/api/market/spx-session` endpoint preserves the complete canonical summary and classification precedence, with shared queue/cache and New York session matching. Provider/session unit suites passed 32/32 and true HTTP/PostgreSQL suite passed 7/7. OpenAPI/client include all three market routes. Production Web/API build and contracts drift check passed after integration. The Quick Diary consumer's functional verification is tracked under 09.
