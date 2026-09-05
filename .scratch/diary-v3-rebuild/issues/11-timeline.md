# [11] 按日期閱讀 Diary Timeline

Status: done
Type: AFK
User stories covered: US-024, US-026

## Parent

[完整重構 PRD](../PRD.md)

## What to build

提供連續 Diary Timeline、日期篩選及記錄入口，讓使用者按時間回看原始判斷。

## Acceptance criteria

- [x] 以有界 API 取得並按既有日期與排序規則呈現，閱讀可進入正確 Diary。
- [x] 保留原始內容和必要摘要；私人 Review 文字不加入公共或精簡 Timeline 投影。
- [x] 驗證長文、多日期、空範圍、部分讀取失敗及桌面／手機閱讀。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [07 preferences](07-preferences.md)
- [08 diary-editor](08-diary-editor.md)

## Acceptance evidence

Domain 4/4 and final browser 2/2 passed; independent review: `docs/design/timeline-finish-review.md`. Related later projections remain assigned in `docs/design/timeline-integration.md`. Root integrated checkpoint: 27 test files / 197 tests and production build passed.
