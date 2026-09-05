# [14] 建立及追蹤 Trade Plan 至日記關聯

Status: done
Type: AFK
User stories covered: US-034, US-035, US-036, US-037

## Parent

[完整重構 PRD](../PRD.md)

## What to build

完成 Trade Plan 的建立、風險欄位編輯、狀態更新、搜尋／分頁及本人 Diary 關聯。

## Acceptance criteria

- [x] 進場區間、停損、目標、部位限制、失效條件及 numeric wire 正確往返。
- [x] 既有 lifecycle、篩選／分頁及 optional Diary 關聯依 owner 約束處理，跨帳戶連結被拒絕。
- [x] 用 UI 建立至狀態更新並回看 Diary；測無效狀態、錯誤、刪除與未關聯情境。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [07 preferences](07-preferences.md)
- [08 diary-editor](08-diary-editor.md)

## Browser checkpoint

Root completed desktop/mobile `tests/e2e/trade-plans.spec.ts`: 2/2 passed (17.0 seconds), exact decimals beyond JS safe integers, invalid zone feedback, create/status update, owner Diary link/unlink, preserved input on failure/retry, filters, three locales and deletion. An initial test filled the previous list page's same-named Symbol field before navigation completed; the test now waits for the new route and heading. No product change was needed. Four captures in `docs/design/evidence/trade-plans/` await independent finish review.

## Final acceptance

Independent review and runnable evidence: `docs/design/trade-plans-finish-review.md`.
