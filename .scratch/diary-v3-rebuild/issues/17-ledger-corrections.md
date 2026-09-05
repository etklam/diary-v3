# [17] 修改歷史交易或刪除 Diary 後保持帳本有效

Status: done
Type: AFK
User stories covered: US-018, US-019, US-020, US-038, US-040

## Parent

[完整重構 PRD](../PRD.md)

## What to build

允許使用者編輯／刪除歷史 Transaction 或整篇 Diary，並重新取得一致的完整帳本結果。

## Acceptance criteria

- [x] 先驗證 projected chronological ledger；會破壞後續交易的改動被拒絕。
- [x] Diary、Transaction 與當時已有關聯在 transaction 中一致更新或 rollback，無跨使用者關聯漂移。
- [x] 用歷史插入、修改、刪除、併發寫入與中途失敗 fixtures 驗證，再由 UI 回看結果；後續新增關聯的票延伸刪除驗收。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [16 sell-ledger](16-sell-ledger.md)

## Acceptance evidence

Backend HTTP/PostgreSQL, browser workflow and independent desktop/mobile review are recorded in `docs/design/sell-and-corrections-finish-review.md`. Later relation slices extend deletion coverage when introduced.
