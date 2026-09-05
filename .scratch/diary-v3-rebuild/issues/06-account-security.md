# [06] 修改密碼及登出所有裝置

Status: done
Type: AFK
User stories covered: US-004, US-005, US-009, US-010

## Parent

[完整重構 PRD](../PRD.md)

## What to build

由帳戶設定修改密碼或登出所有裝置，讓 Web、Native 及其他已登入 client 的舊 session 依既有規則失效。

## Acceptance criteria

- [x] 經本人授權的 UI／API 完成操作；cookie 呼叫需要 CSRF，validation 與錯誤格式一致。
- [x] tokenVersion、所有 refresh families 與舊 access JWT 的後續請求正確失效，其他使用者不受影響。
- [x] 真 HTTP 測試覆蓋 Web／Native／多裝置；Socket.IO 的即時撤銷在 33 整合本用例。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [04 web-session](04-web-session.md)
- [05 native-session](05-native-session.md)

## Evidence

- `tests/integration/account-security.test.ts`: 4 real HTTP/PostgreSQL scenarios, including deterministic revocation/login races; existing native/Web suites remain passing.
- `tests/e2e/account-security.spec.ts`: 3/3 Chrome scenarios passed, covering wrong password, password change, logout-all, cross-tab clearing, three languages and desktop/mobile themes.
- Root integration checkpoint: `npm test` 85/85; build, lint and contracts drift checks passed.
- [Security decisions](../../../docs/adr/0005-account-security-and-preferences.md), [independent visual review](../../../docs/design/security-fire-finish-review.md).
