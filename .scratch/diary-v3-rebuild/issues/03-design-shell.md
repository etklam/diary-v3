# [03] 確認投資研究桌的代表性設計與 App shell

Status: done
Type: AFK
User stories covered: US-015, US-023, US-047, US-098, US-099, US-100, US-102, US-103

## Parent

[完整重構 PRD](../PRD.md)

## What to build

以現有可用的 Diary 流程呈現全新 Web 視覺，提供 Overview、Quick Diary、Company／Review 的桌面與手機代表樣板，確認可延伸的導航與設計語言。

## Acceptance criteria

- [x] 至少一條樣板操作連接真 Diary API；尚未實作的 Company／Review 僅用明確標示的合成內容展示，不聲稱功能完成。
- [x] 依使用者授權自主確定整體方向及主要互動，並保留設計與 review 證據；包含長內容、缺資料、空／載入／錯誤、三語、主題、keyboard／focus 與手機操作。
- [x] 按 Impeccable 完成有界檢查、finish review 與實際設計記錄；後續 AFK UI 依已確認方向自行實作，只有實質偏離才重開設計決策。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [02 first-diary](02-first-diary.md)

## Decisions

使用者已授權拆分後由 subagents 並行實作並暫時離開；本票由 agent 完成設計決策及独立覆核，無須等待同步設計確認。

## Verification

- Independent finish review: docs/design/finish-review.md; all three material findings resolved, ship verdict limited to this representative design slice. Shipped reviewer/documenter roles were unavailable; separate independent worker agents performed these passes.
- Actual design record: DESIGN.md, .impeccable/design.json, docs/design/documentation-note.md. Future unimplemented layouts and known literal-copy gaps are explicitly not promoted to reusable design rules.
- Evidence: docs/design/evidence/round-1 and round-2. Two bounded visual rounds; Quick dialog viewport-only replacements correct full-page capture artifacts, with no extra polish loop.
- Playwright: 3 tests passed; real register/login/create/reload plus Quick create at 1440/390px; field-validation failure retains content; native dialog Escape/return focus; three languages at 1440/390/320px across Overview/Company/Review; keyboard navigation, empty state, theme persistence and route focus.
- Impeccable static TSX/CSS detector ran once, returned [] in docs/design/detector.json. This is not a claim of automated runtime contrast coverage.
- Company, Overview and Review content is clearly synthetic design evidence, not completion of those business features. User authorization allowed autonomous design decisions while away.
