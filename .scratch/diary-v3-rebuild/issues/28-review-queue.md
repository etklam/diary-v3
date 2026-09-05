# [28] 集中處理 Diary 與 Thesis Review Queue

Status: done
Type: AFK
User stories covered: US-027, US-030

## Parent

[完整重構 PRD](../PRD.md)

## What to build

在獨立 Review Queue 同時閱讀 Diary 與 Thesis 的逾期、近期及未排程項目，直接開啟相應複盤。

## Acceptance criteria

- [x] 有界 API 合併兩類結果並保持 target type、排序／分頁及使用者時區窗口。
- [x] 各分類的日期邊界、DST、已完成移出隊列及 owner 隔離有 fixtures。
- [x] UI 可跨兩類目標導航，不洩露私人 Review 文字至不相干摘要。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [13 diary-review](13-diary-review.md)
- [27 thesis-review](27-thesis-review.md)

## Source audit checkpoint

Frozen `/api/reviews` returns five arrays: unscheduled, overdue, today, upcoming, completed. Diary unscheduled means pending with no due date (not every unscheduled diary); completed Diary candidates cap at 50. ACTIVE Thesis candidates cap at 100; latest review completes a Thesis when reviewedAt >= reviewDueAt (or no due). Local-day half-open windows classify today; all merged buckets are sorted by dueAt ?? reviewedAt ?? date ascending, then source ID ordering. Original open Diary reads are unbounded: implement bounded retrieval/pagination without silently dropping reachable items. Shared queue wire schema copied; API/UI and date/DST fixtures remain pending.

## API checkpoint

Implemented GET `/api/reviews` as a single SQL snapshot with owner-filtered Diary/Thesis/latest-review projections and account-local midnight boundaries. Source candidate caps retained (50 completed Diaries, 100 ACTIVE Theses); open Diary results now use bounded per-bucket pages (page default 1, limit default 100/max 200) while retaining the five-array wire envelope. UI must expose paging so open entries remain reachable. Intentional correction: ties use target type then numeric ID, replacing legacy mixed bigint/string comparator ambiguity. No private reflection fields selected.

Three PostgreSQL scenarios passed (2.05s): all mixed categories, completed moves and decision projection, owner/credential isolation, spring 23-hour and fall 25-hour half-open days, stable multi-page reads. Typecheck passed and generated API client updated. Remaining: React queue, browser navigation/recovery, source cap coverage and independent finish review.

## React and verification checkpoint

React `/reviews` now exposes five groups, stable per-group 20-item paging, Diary/Thesis review links, original summaries, civil Diary dates, account-zone due dates, outcome and portfolio-decision labels. Three locales, request failure/retry and local logout clearing are covered. Frozen `pages/reviews/index.vue` and `components/ReviewSection.vue` were checked for displayed metadata; private reflection text is never rendered in queue summaries.

Playwright: 3 scenarios passed (10.5s), including 1440px/light and 390px/dark navigation through both real review forms, completion moves, error retry, three locales, logout and 21-item pagination/reload. PostgreSQL: 4 scenarios passed (2.47s), now including exact latest-50 completed Diary and first-100 ACTIVE Thesis caps. Typecheck and lint passed for the UI. Author inspected both stored captures under `docs/design/evidence/review-queue/`.

Remaining (historical): independent finish review (review agents unavailable due usage limit), complete build/check checkpoint and overall integration acceptance. Status was in-progress at this checkpoint; author inspection was not independent review.

Production build checkpoint: `npm run build` passed after the final queue metadata and cap/paging tests, including TypeScript, Web client/SSR and API bundle. Independent finish review and wider integration remain pending.

## Final acceptance — 2026-09-06

Root/Astra reviewed the independent finish review, the 1440px and 390px captures, and the existing 4 API plus 3 browser scenarios. The review confirmed the five-group hierarchy, target navigation, date/goal metadata, mobile reading space, owner filtering and private-review exclusion. Ticket 28 is accepted and complete; no production or visual changes were required.
