# [15] 記錄買入 Transaction 並查看成本持倉

Status: done
Type: AFK
User stories covered: US-020, US-038

## Parent

[完整重構 PRD](../PRD.md)

## What to build

在 Diary 記錄 BUY Transaction，重新開啟後從持倉畫面看到數量與成本。

## Acceptance criteria

- [x] Transaction 與 Diary 同 owner 的複合約束、numeric 精度及原子寫入從第一筆交易生效。
- [x] 單筆、多筆買入的成本與持倉結果符合 fixtures，無交易 Diary 仍正常。
- [x] UI → HTTP → PostgreSQL → 持倉的完整測試通過；此票不聲稱 SELL 或行情估值已完成。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [08 diary-editor](08-diary-editor.md)

## Verification evidence

- `tests/integration/buy-ledger.test.ts`: 8/8 true PostgreSQL cases covering atomic create/append, composite ownership, exact large/repeating decimal costs, invalid precision, current BUY-only boundary, chronological reopened/list transactions and concurrent creation/aggregation.
- BUY browser flow: 2/2 desktop/mobile cases pass, including failed-submit retention, two entries, exact API-backed holdings and device-timezone/DST disambiguation.
- Root independent review identified one mobile column-visibility issue; worker corrected it and bounding-box assertions plus root recapture review resolved it. See `docs/design/buy-finish-review.md`.
- Root integrated checkpoint: 24 test files / 183 tests passed; production Web/API build, typecheck, ESLint and contracts/client drift checks passed.
- Source precision corrections and later SELL/delete invariants are recorded in ADR 0006. SELL, valuation and historical correction remain later tickets.
