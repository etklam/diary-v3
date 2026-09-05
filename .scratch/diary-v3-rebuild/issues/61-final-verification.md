# [61] 完成全功能對等與跨裝置發布驗收

Status: done
Type: AFK
User stories covered: US-006, US-098, US-099, US-100, US-101, US-102, US-103, US-106, US-107, US-108, US-109, US-110, US-111, US-112, US-113, US-114

## Parent

[完整重構 PRD](../PRD.md)

## What to build

針對所有已交付切片完成全產品 parity、三語／主題／a11y、效能、Native contract 及部署還原的最終交付報告。

## Acceptance criteria

- [x] 逐項關閉基準矩陣，114 stories 與有效 routes／API／排程均有證據；未實作或未解釋差異為零。
- [x] 通過真 PostgreSQL／HTTP／Socket.IO／Native-client／核心 E2E、contracts drift、desktop／mobile 與預先訂立的效能門檻。
- [x] 以當前完整 schema 重跑空環境部署及備份還原；本票只整合驗收及修正回歸，不能把前面遺漏的功能藏成大型補作。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [01 baseline](01-baseline.md)
- [02 first-diary](02-first-diary.md)
- [03 design-shell](03-design-shell.md)
- [04 web-session](04-web-session.md)
- [05 native-session](05-native-session.md)
- [06 account-security](06-account-security.md)
- [07 preferences](07-preferences.md)
- [08 diary-editor](08-diary-editor.md)
- [09 quick-diary](09-quick-diary.md)
- [10 diary-search](10-diary-search.md)
- [11 timeline](11-timeline.md)
- [12 calendar](12-calendar.md)
- [13 diary-review](13-diary-review.md)
- [14 trade-plans](14-trade-plans.md)
- [15 buy-ledger](15-buy-ledger.md)
- [16 sell-ledger](16-sell-ledger.md)
- [17 ledger-corrections](17-ledger-corrections.md)
- [18 market-provider](18-market-provider.md)
- [19 portfolio-valuation](19-portfolio-valuation.md)
- [20 portfolio-risk](20-portfolio-risk.md)
- [21 strategy-performance](21-strategy-performance.md)
- [22 transaction-export](22-transaction-export.md)
- [23 watchlist](23-watchlist.md)
- [24 stock-notes](24-stock-notes.md)
- [25 evidence-timeline](25-evidence-timeline.md)
- [26 investment-thesis](26-investment-thesis.md)
- [27 thesis-review](27-thesis-review.md)
- [28 review-queue](28-review-queue.md)
- [29 company-hub](29-company-hub.md)
- [30 overview](30-overview.md)
- [31 diary-alerts](31-diary-alerts.md)
- [32 recurring-alerts](32-recurring-alerts.md)
- [33 realtime](33-realtime.md)
- [34 price-alerts](34-price-alerts.md)
- [35 disciplines](35-disciplines.md)
- [36 discipline-sharing](36-discipline-sharing.md)
- [37 partners](37-partners.md)
- [38 pair-view](38-pair-view.md)
- [39 api-keys](39-api-keys.md)
- [40 agent-research](40-agent-research.md)
- [41 etf-catalog](41-etf-catalog.md)
- [42 etf-research](42-etf-research.md)
- [43 rotation-snapshot](43-rotation-snapshot.md)
- [44 market-state](44-market-state.md)
- [45 rotation-history](45-rotation-history.md)
- [46 rotation-export](46-rotation-export.md)
- [47 position-sizing](47-position-sizing.md)
- [48 fire](48-fire.md)
- [49 relative-value](49-relative-value.md)
- [50 seasonality](50-seasonality.md)
- [51 sec-search](51-sec-search.md)
- [52 sec-download](52-sec-download.md)
- [53 public-pages](53-public-pages.md)
- [54 article-drafts](54-article-drafts.md)
- [55 article-management](55-article-management.md)
- [56 public-articles](56-public-articles.md)
- [57 admin-users](57-admin-users.md)
- [58 pwa](58-pwa.md)
- [59 deployment](59-deployment.md)
- [60 backup-restore](60-backup-restore.md)

## Cross-flow follow-up recorded by Astra — 2026-09-06

- [x] Verify the actual client outcome when a Diary creation or an explicit reminder-list replacement commits but its HTTP response is lost. Existing ticket31 evidence proves atomic rollback, pre-commit failure handling and idempotent dismissal recovery; it does not prove these post-commit Diary outcomes. Use a controlled browser route that forwards the real request before dropping the response, then verify reload/retry cannot silently duplicate a Diary or overwrite an unrelated decision. Preserve the approved explicit reminder replacement semantics and record any recovery correction with regression evidence.

### Response-loss evidence checkpoint — 2026-09-06

`tests/e2e/diary-response-loss.spec.ts` passed in the controlled Chrome harness. A committed Diary create whose response was aborted is reconciled through the authoritative by-date read and navigates without an automatic duplicate request; an explicit same-date retry receives `DIARY_ALREADY_EXISTS` and leaves one persisted Diary. A committed reminder replacement whose response was aborted is reconciled against a concurrent newer title/reminder update; the editor reports `DIARY_WRITE_UNCERTAIN`, disables the stale Save action, and offers an explicit Load latest action that applies the newer server state. The test uses only disposable PostgreSQL and synthetic users. The correction is implemented in `apps/web/app/diary-editor.tsx`; no version framework or production service was added.

## Performance evidence scope — Astra audit 2026-09-06

`docs/parity/legacy-runtime-evidence.json.timingsMs` contains single cold-flow observations only; its note explicitly disclaims percentile/capacity evidence. Do not treat these numbers as an established p95 budget. Before final performance acceptance, measure controlled representative long Diary, large ledger, paginated search and market-history workloads on the isolated frozen source and rebuilt runtime, record environment/fixture sizes/warmup/sample count/median/p95, and pin the measured regression gates before tuning or rerunning for approval. Use synthetic data and controlled providers. Preserve failures and compare equivalent functionality; this is an outstanding final verification requirement, not an already-passing Phase0 performance claim.

Performance acceptance is complete: `docs/parity/performance-baseline.md` and its raw JSON artifacts record both runtimes, frozen gates and all4 passing comparisons. Original failed search-fixture observation is preserved; only that workload was remeasured after correction.

Response-loss evidence: `tests/e2e/diary-response-loss.spec.ts` passed the real forwarded POST/PUT followed by dropped response, confirming create reconciliation/date uniqueness and blocking stale reminder/title resubmission after a concurrent newer write. The localized recovery retains the local draft and requires loading latest server content. This closes that bounded follow-up, not the final release gates.

### Final operations evidence

Current schema acceptance is supported by `docs/operations/deployment-59-smoke.md` (isolated K3s/TLS empty deployment, controlled batch and real API/Socket.IO recovery) and `docs/operations/restore-60-smoke.md` (N0019 backup→empty restore→0020 upgrade, plus complete N+1 backup→empty restore; 21 migration rows, constraints, seeds and representative ownership/sharing API checks). No schema edits have followed those runs. Astra accepted the core/operations/performance evidence and Claude UI verification; ticket61 is complete.

### Browser gate evidence — 2026-09-06

All 132 unique Chrome cases pass: the 126-case list (`/tmp/diary-v3-e2e-passed.txt`) from the bounded resumed runs plus the final 6 — registration link scopes in discipline-share/first-diary, shared ETF catalog seed expectations, and the mobile390 market-rotation overflow. Final run: `PLAYWRIGHT_CHANNEL=chrome npx playwright test --max-failures=6 --test-list-invert /tmp/diary-v3-e2e-passed.txt` → 6 passed, 17.6s, disposable PostgreSQL harness, raw log `docs/parity/browser-final-six.log`. Existing assertions were preserved; corrections were test-only except one scoped CSS property. The ETF cases pin the common seed at 24 (`Added`+`Skipped` parsed from the admin notice) and assert the catalog count equals the reported `Total` (union with the 2 entries earlier catalog CRUD legitimately leaves), without deleting shared records; watchlist response-loss safety assertions are unchanged. The mobile overflow root cause: `.sr-only` trend spans are `position:absolute` with no positioned ancestor, so they escaped the `.rotation-table-scroll` horizontal clip and extended document scrollWidth to 1333px at 390px; the fix is `.rotation-trend-cell{position:relative}`, keeping the wide table inside its own keyboard-reachable horizontal scroll region. Mobile evidence `docs/design/evidence/market-rotation/mobile.png` was regenerated and inspected: full readable data, own scroll regions, dark theme, no body crop or font shrink. Astra combined this UI evidence with the passing core and operations gates to close ticket61.

### Final acceptance

All61 tickets are done. `docs/parity/final-release-report.md` consolidates212 source entries/114 stories,795 core tests,132 unique Chrome cases,4 fixture self-checks and4 passing controlled performance workloads. Required contract/lint/build gates and isolated K3s/TLS/backup-restore evidence passed. Native API/client compatibility is ready; native UI, push/offline implementation and production cutover remain outside this phase by the approved scope.
