# [30] 由 Overview 找到下一個投資跟進動作

Status: done
Type: AFK
User stories covered: US-023, US-026, US-027, US-042

## Parent

[完整重構 PRD](../PRD.md)

## What to build

完成已登入首頁的 Portfolio 概況、待關注事項、近期活動與待 Review 摘要，連回 Timeline、Company、Trade Plan 和 Review。

## Acceptance criteria

- [x] 各摘要消費既有模組的有界投影，不建立第二套帳本、計算或授權。
- [x] 近期／逾期／即將到期、partial data、空資料與導航目標均對等。
- [x] 用含 Diary、Thesis、Trade Plan、持倉及風險事項的合成帳戶示範下一步操作。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [11 timeline](11-timeline.md)
- [14 trade-plans](14-trade-plans.md)
- [20 portfolio-risk](20-portfolio-risk.md)
- [28 review-queue](28-review-queue.md)
- [29 company-hub](29-company-hub.md)

## Root acceptance — 2026-09-06

Astra accepted the bounded existing-module composition, source-correct navigation, translated review states and account-timezone dates. Root inspected the desktop/light and mobile/dark composition before the final timestamp correction. The final Chrome run passed4/4 in12.5s, including a real missing-quote holding (50%coverage,200unpricedcost), independent section failure/retry, account-timezone load failure/recovery, empty prompts, three locales, navigation and logout. Four prerequisite PostgreSQL suites passed15/15 tests; typecheck and targeted lint passed. No repeated visual pass was needed for the final date-only change. All declared blockers are done.
