# [47] 計算 Position Sizing 並交接至 Diary／Trade Plan

Status: done
Type: AFK
User stories covered: US-036, US-050, US-083

## Parent

[完整重構 PRD](../PRD.md)

## What to build

提供所有既有部位計算策略、reserve cash 與 rounding，並複製 Markdown、建立／追加 Diary 或預填 Trade Plan。

## Acceptance criteria

- [x] 固定輸入得出既有結果，零／非法輸入與策略切換不產生無效數字。
- [x] 使用真 Diary／Trade Plan API 完成既有交接，內容及風險欄位保持一致。
- [x] 純計算留在 domain／client，不新增無需要的 API 或 table；驗證本地化及手機操作。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [09 quick-diary](09-quick-diary.md)
- [14 trade-plans](14-trade-plans.md)

## Root acceptance — 2026-09-06

Astra reviewed the source-derived four strategies, reserve and rounding calculations, existing two-decimal monetary Trade Plan prefill contract and the corrected overbudget UI/Markdown warning. Domain4/4 tests passed; Chrome2/2 passed in21.2s with real Diary create/append and persisted content, Trade Plan editor prefill, clipboard recovery, invalid input and keyboard/local table scrolling. Trade Plan preparation intentionally does not submit a plan; its existing API/editor behavior belongs to ticket14. Root inspected1440/light and390/dark captures and accepted the established input/result layout without another cosmetic pass. Targeted lint passed. Both blockers are done.
