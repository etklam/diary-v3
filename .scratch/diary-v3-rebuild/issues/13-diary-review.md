# [13] 完成及修改 Diary Review

Status: done
Type: AFK
User stories covered: US-029, US-031, US-032, US-033

## Parent

[完整重構 PRD](../PRD.md)

## What to build

讓使用者安排 Diary Review、閱讀原始判斷、填寫結構化反思並完成或修改複盤。

## Acceptance criteria

- [x] outcome 與至少一項有效反思的驗證、none／pending／reviewed lifecycle 及伺服器時間符合契約。
- [x] generic Diary 更新不能繞過完成規則；原始判斷仍可分辨，Review 文字只供 owner。
- [x] 真 DB／API／UI 覆蓋安排、完成、修改、無效反思、跨時區與越權。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [07 preferences](07-preferences.md)
- [08 diary-editor](08-diary-editor.md)

## Backend checkpoint

Owner-only GET/PATCH review routes and strict contracts implemented. `tests/integration/diary-review.test.ts` passed 4/4 using HTTP and real PostgreSQL: schedule/clear/complete/edit lifecycle, server time, meaningful reflection, generic-write bypass rejection, cross-owner/CSRF/explicit invalid Bearer, ID bounds, chronological transaction projection and original-judgment preservation. Web scheduling and Review workflow are in progress.

## Final acceptance

`docs/design/review-finish-review.md` records independent desktop/mobile ship verdict and API/browser evidence. Root 221-test/build/typecheck/lint/contracts checkpoint passed.
