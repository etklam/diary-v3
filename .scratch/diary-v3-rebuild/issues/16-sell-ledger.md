# [16] 記錄賣出並計算損益與剩餘持倉

Status: done
Type: AFK
User stories covered: US-020, US-038, US-040

## Parent

[完整重構 PRD](../PRD.md)

## What to build

在 Diary 記錄 SELL Transaction，顯示部分或全部賣出後的成本、已實現結果及剩餘持倉。

## Acceptance criteria

- [x] 賣出、清倉、同日排序、相關交易欄位與 rounding 使用來源公式。
- [x] 驗證完整時間帳本；超賣、跨帳戶及非法數量被拒絕且不留下部分寫入。
- [x] 以 UI／API／真 DB 固定帳本驗證成本與已實現結果，非決定性欄位只做明確映射。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [15 buy-ledger](15-buy-ledger.md)

## Acceptance evidence

Backend HTTP/PostgreSQL, browser workflow and independent desktop/mobile review are recorded in `docs/design/sell-and-corrections-finish-review.md`. Later relation slices extend deletion coverage when introduced.
