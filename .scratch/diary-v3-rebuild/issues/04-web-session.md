# [04] 保持 Web session 並正確登出目前瀏覽器

Status: done
Type: AFK
User stories covered: US-002, US-003, US-009, US-010

## Parent

[完整重構 PRD](../PRD.md)

## What to build

讓 Web 在重新載入、access 到期及多分頁操作後保持可恢復的 session，並能從既有介面可靠登出。

## Acceptance criteria

- [x] 穩定 Web refresh、HttpOnly cookie、透明恢復與 CSRF 遵循基準；多分頁不互相撤銷。
- [x] cookie／anonymous logout 清除本機 cookies，DB cleanup 失敗仍完成登出；顯式 credential 不得借用或清除另一個 browser session。
- [x] 用真 HTTP 及瀏覽器驗證過期、malformed credential、登入失敗、logout 和資料隔離。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [03 design-shell](03-design-shell.md)

## Verification

- Real HTTP/PostgreSQL Web session suite and shared transport tests pass: root `npm test` reports 54 tests across 6 files.
- `npm run typecheck`, `npm run lint`, `npm run build` and `npm run contracts:check` pass after splitting OpenAPI generation out of runtime contracts.
- `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`: 7/7 passed, including four Web session cases for expired signed access recovery, exact draft preservation, stable refresh, cross-tab logout/private content removal, failed login and safe return paths. Existing desktop/mobile diary and design flows also pass.
- E2E scenarios have separate test-only API instances so production rate limits remain exercised without sharing quotas across unrelated tests; all use disposable PostgreSQL and synthetic accounts.
- Session decisions: [ADR 0003](../../../docs/adr/0003-stable-browser-session.md).
