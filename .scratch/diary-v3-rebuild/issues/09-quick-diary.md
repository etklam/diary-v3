# [09] 以 Quick Diary 模板捕捉並併發追加

Status: done
Type: AFK
User stories covered: US-015, US-016, US-017

## Parent

[完整重構 PRD](../PRD.md)

## What to build

由全域快捷入口開啟 Quick Diary，切換自由書寫與現有模板，建立新 Diary 或追加至當日。

## Acceptance criteria

- [x] 所有既有模板、快捷鍵及開關／提交流程可用，表單回饋與手機操作符合設計。
- [x] 同時建立或追加在真 PostgreSQL 不產生重複日記或覆寫有效內容；失敗保持清楚的可恢復狀態。
- [x] 驗證新建預設行為、append、模板切換及競爭衝突；Web／Native 共用同一 Diary 用例。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [08 diary-editor](08-diary-editor.md)

## Company-context checkpoint

Root real PostgreSQL/API `diary-stocks.test.ts` 4/4 and desktop/mobile `company-context.spec.ts` 2/2 passed. Covers normalized unique links, raw draft preservation/restoration, distinction from template text, append union, scalar-edit preservation, explicit replacement/clear, isolation and cascade. Recent-trade selector worker domain 11/11 and browser 2/2 passed before usage interruption. Independent final capture review remains.

## Final acceptance

Independent review and runnable evidence: `docs/design/quick-finish-review.md`.
