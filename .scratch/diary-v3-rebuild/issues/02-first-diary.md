# [02] 由空資料庫註冊登入並寫下首篇 Diary

Status: done
Type: AFK
User stories covered: US-001, US-010, US-011, US-012, US-014, US-106, US-109, US-113

## Parent

[完整重構 PRD](../PRD.md)

## What to build

建立最小可運行 React Web、API、PostgreSQL 與共用 client，讓使用者註冊登入後建立並閱讀自己的無交易 Diary。

## Acceptance criteria

- [x] 從空 PostgreSQL migration／必要 seed 到啟動 Web／API 可重現；採 PRD 的模組與 server-only 依賴邊界。
- [x] React 表單經真 HTTP 寫入再讀取；每日唯一、owner 隔離、基本 cookie／CSRF、canonical ID／日期／錯誤已生效。
- [x] 此流程有真 DB 整合及瀏覽器測試；lint、typecheck、build、contracts／client drift 與測試納入最小 CI。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [01 baseline](01-baseline.md)

## Verification

- Ticket 01 baseline complete: frozen source, real legacy HTTP/MariaDB flow and 114-story mapping.
- PostgreSQL migrations applied from an empty random test database. `npm test`: 9 passed (7 true HTTP/PG integration + 2 rate-limiter units). Covers daily-unique race, owner isolation, canonical wire, CSRF, digest storage, generated client, password byte limit, ID bounds and DB outage.
- `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`: first-diary desktop 1440px and mobile 390px passed, including register/login/create/reload and subsequent Quick Diary save. Error fixture verifies retained content and field association before real API retry. Browser channel fallback used because matching Chromium CDN timed out.
- `npm run lint`, `npm run typecheck`, `npm run contracts:check`, Web SSR/client build and compiled API build passed. Compiled API started directly with Node and returned canonical 401/requestId on unauthenticated /api/auth/me; smoke server stopped.
- Root CI workflow runs equivalent gates against disposable PostgreSQL. Remote CI has not yet run; no commit or push is claimed.
- Known old bugs deliberately corrected per user instruction; see docs/adr/0001-parity-baseline-and-contract-corrections.md.
- UI visual-world completeness remains ticket 03; Web stable refresh and native JSON session remain tickets 04/05.
