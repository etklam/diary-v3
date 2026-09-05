# [12] 由 Calendar 定位及開啟 Diary

Status: done
Type: AFK
User stories covered: US-007, US-025

## Parent

[完整重構 PRD](../PRD.md)

## What to build

由月份日曆查看活動並進入指定日期的 Diary，維持該頁既有時區與日期窗口。

## Acceptance criteria

- [x] 月份切換、日期標記、選日及目標 Diary 均由真資料驗證。
- [x] civil date 與 instant 不混用；跨月、DST、正負 UTC 時區依來源窗口呈現。
- [x] 空月份、長內容入口、手機與鍵盤導航可完成。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [07 preferences](07-preferences.md)
- [08 diary-editor](08-diary-editor.md)

## Backend checkpoint

Mounted `GET /api/diaries/activity` with an inclusive 1–371 civil-day window, owner-only projection and actual Transaction counts. `tests/integration/diary-activity.test.ts` passed 2/2 using HTTP and disposable PostgreSQL, including positive/negative UTC timezones, DST day, month endpoints, leap date, maximum range and private-field exclusion. Undismissed Alert counts must be added by ticket 31 when that relation becomes writable.

Holiday provider, shared calendar helpers and Web/month navigation/heatmap are implemented. Final browser verification passed 2/2; see independent review below.

## Acceptance evidence

Activity HTTP/PostgreSQL 2/2, holiday HTTP 4/4, calendar domain 10/10 and final browser 2/2 passed; independent review: `docs/design/calendar-finish-review.md`. Root integrated checkpoint: 27 test files / 197 tests and production build passed.
