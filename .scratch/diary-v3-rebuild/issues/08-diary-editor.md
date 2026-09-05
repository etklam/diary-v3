# [08] 編輯及整理完整無交易 Diary

Status: done
Type: AFK
User stories covered: US-011, US-012, US-013, US-014, US-018, US-019, US-028

## Parent

[完整重構 PRD](../PRD.md)

## What to build

提供完整 Diary 編輯、標籤、日期、原始 thesis／risk／execution 與 Markdown 閱讀，並安全刪除無交易 Diary。

## Acceptance criteria

- [x] 建立、修改、讀取及刪除經真 DB／API／React 完成；原始判斷與正文層次清楚。
- [x] 每日唯一、canonical request／response、Markdown 安全、owner、長文及提交失敗都有行為測試。
- [x] 此票只交付無 Transaction 的刪除；有交易的歷史修改／刪除由 17 承擔，不能預先繞過帳本約束。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [04 web-session](04-web-session.md)

## Verification evidence

- `tests/integration/diary-editor.test.ts`: real PostgreSQL CRUD, ownership, daily conflicts, canonical fields, explicit clearing and unsupported relation payload checks; included in the 89 passing unit/integration checkpoint.
- `tests/e2e/diary-editor.spec.ts`: desktop/mobile flow passed 2/2, including safe Markdown, three locales, dark theme, long content, failed-save recovery and deletion focus/Escape behavior.
- Combined browser regression run passed 16 cases; two first-diary assertions needed accessible-role selectors after the expanded editor. The affected first-diary/web-session rerun then passed 6/6. This is evidence across runs, not a claim of a single 18/18 run.
- Typecheck and contracts/client drift check passed after declaring the locale fixture as readonly tuples.
- Independent finish review: `docs/design/diary-finish-review.md`.
- Ledger-aware deletion remains explicitly assigned to ticket 17; no Transaction table exists at this checkpoint.
