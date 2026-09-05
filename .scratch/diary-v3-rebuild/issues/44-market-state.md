# [44] 閱讀 Market State、Sector Breadth 與市場摘要

Status: done
Type: AFK
User stories covered: US-077, US-082

## Parent

[完整重構 PRD](../PRD.md)

## What to build

在公開市場視圖讀取 Market State、Sector Breadth、confirmation、歷史狀態及 deterministic summary。

## Acceptance criteria

- [x] Market State vocabulary、supporting breadth 與 summary 使用既有計算，breadth 始終來自 sectors。
- [x] coverage／stale 門檻及未知狀態不被 neutral 或零掩蓋；不把原始內部狀態直接當主標籤。
- [x] UI／API／真 DB 與固定價格驗證正常、部分、unknown 及歷史日期，維持 guest 可讀。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [43 rotation-snapshot](43-rotation-snapshot.md)

## Implementation checkpoint — 2026-09-06

The first vertical slice is implemented and remains in progress pending root acceptance. It adds the source-derived breadth/regime domain, `market_universe` and `market_breadth_daily` storage, generated contracts/OpenAPI, public snapshot/history readers, date-aligned rotation context, price-first seed/update CLI with advisory locking and transactional breadth upserts, and the existing monitor route's localized state/history presentation. The configured `SP500_NDX` basket is explicitly a configured stock basket; it is not described as a complete index universe.

Warmup correction is recorded in [ADR 0008](../../../docs/adr/0008-market-state-warmup-and-freshness.md): known daily moves remain visible, ratios require eligible 5/10-day history, and regime/score remain unknown until 90% of the configured universe has a 40-day series. Persisted stale or under-covered state resolves to `unknown` consistently in the state API and monitor while preserving separate observation dates.

Automated evidence: focused market-state, monitor-contract, monitor-summary and monitor-context unit tests pass (41 tests); the state HTTP, batch, monitor-context and existing rotation monitor/admin HTTP suites pass against disposable PostgreSQL (7 tests); `npm run contracts:check` and the 44-owned ESLint paths pass. The repository-wide typecheck is currently blocked by the unrelated WIP `apps/web/app/routes/price-alerts.tsx:58` error. The focused controlled Chrome case `PLAYWRIGHT_CHANNEL=chrome npx playwright test tests/e2e/market-rotation.spec.ts -g "public monitor handles"` passes 1/1 and covers 404/retry, three locales, localized state/signal labels, keyboard scope changes, history focus, date provenance, unknown values, source breadth condition/confirmation and the complete typed seven-part summary; it produced [`current-read-desktop.png`](../../../docs/design/evidence/market-rotation/current-read-desktop.png) and [`current-read-mobile.png`](../../../docs/design/evidence/market-rotation/current-read-mobile.png). Earlier controlled evidence covers the real admin-batch→guest path and full-page captures. Independent root/Astra acceptance remains pending; portfolio 20 context integration remains separate.

## Root acceptance — 2026-09-06

Astra inspected current-read-desktop.png and current-read-mobile.png against the pinned composition and earlier accepted full-page state/history captures. Readable complete deterministic summary, localized breadth/confirmation, typed policy and separate state/sector/rank dates are accepted. Latest focused evidence: 5 unit files/41 tests; 7 disposable PostgreSQL state HTTP/batch/monitor/rotation tests; contracts check and owned ESLint; 1 focused Chrome flow covering guest retry, three locales, keyboard, history, unknown and summary. Earlier warmup boundaries and controlled-price batch evidence remain applicable. Ticket44 is done. The unrelated unfinished ticket34 form union currently prevents a global typecheck pass and is not a completed-release claim. Portfolio20 is now accepted separately.

Follow-up: root reran `npm run typecheck` after the ticket34 form fix; the full current worktree passes (exit0). The earlier unrelated typecheck blocker is resolved.
