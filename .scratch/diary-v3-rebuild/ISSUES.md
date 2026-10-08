# diary-v3 實作 tickets

Tickets 01–61 cover the PRD's 114 user stories. Follow-up tickets 62–82 are indexed below and in the linked follow-up index. Per-ticket status and acceptance evidence remain authoritative; `ready-for-agent` means the specification is ready, not that implementation or blockers are complete. See the [all-ticket acceptance inventory](../../docs/features/all-tickets-acceptance-2026-09-25.md).

| Ticket | Type | Blocked by | 發佈狀態 |
| --- | --- | --- | --- |
| [01 固定功能基準並重現舊版 Diary 完整流程](issues/01-baseline.md) | AFK | — | ready-for-agent |
| [02 由空資料庫註冊登入並寫下首篇 Diary](issues/02-first-diary.md) | AFK | 01 | ready-for-agent |
| [03 確認投資研究桌的代表性設計與 App shell](issues/03-design-shell.md) | AFK | 02 | ready-for-agent |
| [04 保持 Web session 並正確登出目前瀏覽器](issues/04-web-session.md) | AFK | 03 | ready-for-agent |
| [05 以原生 JSON session 讀寫同一篇 Diary](issues/05-native-session.md) | AFK | 02 | ready-for-agent |
| [06 修改密碼及登出所有裝置](issues/06-account-security.md) | AFK | 04, 05 | ready-for-agent |
| [07 儲存語言、時區與投資偏好](issues/07-preferences.md) | AFK | 04 | ready-for-agent |
| [08 編輯及整理完整無交易 Diary](issues/08-diary-editor.md) | AFK | 04 | ready-for-agent |
| [09 以 Quick Diary 模板捕捉並併發追加](issues/09-quick-diary.md) | AFK | 08 | ready-for-agent |
| [10 搜尋與分頁管理 Diary 資料庫](issues/10-diary-search.md) | AFK | 08 | ready-for-agent |
| [11 按日期閱讀 Diary Timeline](issues/11-timeline.md) | AFK | 07, 08 | ready-for-agent |
| [12 由 Calendar 定位及開啟 Diary](issues/12-calendar.md) | AFK | 07, 08 | ready-for-agent |
| [13 完成及修改 Diary Review](issues/13-diary-review.md) | AFK | 07, 08 | ready-for-agent |
| [14 建立及追蹤 Trade Plan 至日記關聯](issues/14-trade-plans.md) | AFK | 07, 08 | ready-for-agent |
| [15 記錄買入 Transaction 並查看成本持倉](issues/15-buy-ledger.md) | AFK | 08 | ready-for-agent |
| [16 記錄賣出並計算損益與剩餘持倉](issues/16-sell-ledger.md) | AFK | 15 | ready-for-agent |
| [17 修改歷史交易或刪除 Diary 後保持帳本有效](issues/17-ledger-corrections.md) | AFK | 16 | ready-for-agent |
| [18 在 Company 查看報價與歷史價格](issues/18-market-provider.md) | AFK | 04 | ready-for-agent |
| [19 為 Portfolio 估值並呈現缺報價狀態](issues/19-portfolio-valuation.md) | AFK | 16, 18 | ready-for-agent |
| [20 查看 Portfolio 曝險、集中度與風險摘要](issues/20-portfolio-risk.md) | AFK | 19 | ready-for-agent |
| [21 回顧策略績效與近期交易](issues/21-strategy-performance.md) | AFK | 16 | ready-for-agent |
| [22 匯出個人交易資料](issues/22-transaction-export.md) | AFK | 16 | ready-for-agent |
| [23 管理股票 Watchlist](issues/23-watchlist.md) | AFK | 18 | ready-for-agent |
| [24 維護 Company 的目前 Stock Note](issues/24-stock-notes.md) | AFK | 23 | ready-for-agent |
| [25 捕捉 Evidence 並回看不可變股票時間線](issues/25-evidence-timeline.md) | AFK | 08, 23 | ready-for-agent |
| [26 建立及更新 Investment Thesis](issues/26-investment-thesis.md) | AFK | 23 | ready-for-agent |
| [27 完成 Thesis Review 並記錄 Portfolio Decision](issues/27-thesis-review.md) | AFK | 07, 26 | ready-for-agent |
| [28 集中處理 Diary 與 Thesis Review Queue](issues/28-review-queue.md) | AFK | 13, 27 | ready-for-agent |
| [29 在 Company Hub 串連持倉、觀點與記憶](issues/29-company-hub.md) | AFK | 19, 24, 25, 27 | ready-for-agent |
| [30 由 Overview 找到下一個投資跟進動作](issues/30-overview.md) | AFK | 11, 14, 20, 28, 29 | ready-for-agent |
| [31 設定並取消單次 Diary 回頭提醒](issues/31-diary-alerts.md) | AFK | 07, 08 | ready-for-agent |
| [32 建立 WEEK／MONTH 提醒並取消整個系列](issues/32-recurring-alerts.md) | AFK | 31 | ready-for-agent |
| [33 以前景 Socket.IO 接收提醒並在撤銷後斷線](issues/33-realtime.md) | AFK | 06, 32 | ready-for-agent |
| [34 管理 Price Alert 並在價格條件符合時提示](issues/34-price-alerts.md) | AFK | 18, 33 | ready-for-agent |
| [35 整理並隨機閱讀 Discipline](issues/35-disciplines.md) | AFK | 04 | ready-for-agent |
| [36 匯入、匯出及分享 Discipline](issues/36-discipline-sharing.md) | AFK | 35 | ready-for-agent |
| [37 建立 Partner 關係並管理雙方分享設定](issues/37-partners.md) | AFK | 04 | ready-for-agent |
| [38 在 Pair View 比較 Diary 並遵守分享隱私](issues/38-pair-view.md) | AFK | 11, 13, 24, 37 | ready-for-agent |
| [39 管理 scoped API key 並由 Agent 建立 Diary](issues/39-api-keys.md) | AFK | 05, 08 | ready-for-agent |
| [40 讓 Agent 發佈冪等股票研究並經 Partner 閱讀](issues/40-agent-research.md) | AFK | 25, 38, 39 | ready-for-agent |
| [41 管理 ETF Catalog 與歷史資料初始化](issues/41-etf-catalog.md) | AFK | 18 | ready-for-agent |
| [42 使用 ETF Watchlist 閱讀研究摘要](issues/42-etf-research.md) | AFK | 41 | ready-for-agent |
| [43 更新持久化市場價格並查看最新輪動排名](issues/43-rotation-snapshot.md) | AFK | 18 | ready-for-agent |
| [44 閱讀 Market State、Sector Breadth 與市場摘要](issues/44-market-state.md) | AFK | 43 | ready-for-agent |
| [45 比較兩週市場輪動並按 scope 篩選排序](issues/45-rotation-history.md) | AFK | 44 | ready-for-agent |
| [46 匯出 Market Rotation 的目前視圖](issues/46-rotation-export.md) | AFK | 45 | ready-for-agent |
| [47 計算 Position Sizing 並交接至 Diary／Trade Plan](issues/47-position-sizing.md) | AFK | 09, 14 | ready-for-agent |
| [48 使用 Financial Freedom／FIRE 計算工具](issues/48-fire.md) | AFK | 03 | ready-for-agent |
| [49 比較 Relative Value 並捕捉研究](issues/49-relative-value.md) | AFK | 09, 25 | ready-for-agent |
| [50 閱讀 Seasonality 並保存本地化研究摘要](issues/50-seasonality.md) | AFK | 07, 09, 25 | ready-for-agent |
| [51 搜尋 SEC 公司並瀏覽申報文件清單](issues/51-sec-search.md) | AFK | 04 | ready-for-agent |
| [52 安全閱讀、下載及打包 SEC 文件](issues/52-sec-download.md) | AFK | 51 | ready-for-agent |
| [53 發布公開首頁、About 與使用說明](issues/53-public-pages.md) | AFK | 03 | ready-for-agent |
| [54 建立及預覽管理員 Post 草稿](issues/54-article-drafts.md) | AFK | 04 | ready-for-agent |
| [55 發布、封存及批次管理 Post](issues/55-article-management.md) | AFK | 54 | ready-for-agent |
| [56 搜尋公開文章並以 SSR 閱讀正文](issues/56-public-articles.md) | AFK | 55 | ready-for-agent |
| [57 由 Admin 管理使用者並撤銷被刪帳戶存取](issues/57-admin-users.md) | AFK | 33 | ready-for-agent |
| [58 安裝及更新 PWA 並隔離私人 API 資料](issues/58-pwa.md) | AFK | 07, 08 | ready-for-agent |
| [59 在隔離 K3s 部署並更新完整運行路徑](issues/59-deployment.md) | AFK | 33, 43 | ready-for-agent |
| [60 備份還原 PostgreSQL 並驗證產品流程](issues/60-backup-restore.md) | AFK | 59 | ready-for-agent |
| [61 完成全功能對等與跨裝置發布驗收](issues/61-final-verification.md) | AFK | 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60 | ready-for-agent |

## Follow-up and tracker additions (62–82)

| Ticket | Type | Recorded state | Issue file |
| --- | --- | --- | --- |
| 62 — Daily Workspace & First-use Flow | Follow-up | Execution: done | [62-daily-workspace.md](issues/62-daily-workspace.md) |
| 63 — Research to Diary context handoff | Follow-up | Execution: done | [63-research-diary-handoff.md](issues/63-research-diary-handoff.md) |
| 64–81 — Convenience and architecture follow-ups | Follow-up | All record Execution: done; see the index for each ticket | [Follow-up issues](FOLLOW-UP-ISSUES.md) |
| 82 — Return exact per-user Diary counts in Admin inventory | Bug | done; focused HTTP and Admin browser reruns passed | [82-admin-users-diary-count.md](issues/82-admin-users-diary-count.md); [final verification](../../docs/features/all-tickets-acceptance-2026-09-25.md) |

## Capture-cost follow-ups (84–91)

Published 2026-10-04 from a review of input cost across the two authoring paths
(`/diaries/quick` and `/diaries/new`). All of them are implemented; the rows below were
reconciled with the tickets themselves on 2026-10-08, having been left at
`ready-for-agent; Execution: todo` long after each ticket recorded its own completion.
Ticket 83 predates this set and is not indexed above.

| Ticket | Type | Recorded state | Issue file |
| --- | --- | --- | --- |
| 84 — Close the Quick Diary keyboard loop with Cmd/Ctrl+Enter | Follow-up | accepted; Execution: done | [84-quick-keyboard-submit.md](issues/84-quick-keyboard-submit.md) |
| 85 — Launch straight into capture from the installed app icon | Follow-up | accepted; Execution: done | [85-app-shortcuts-to-capture.md](issues/85-app-shortcuts-to-capture.md) |
| 86 — Receive shared links and text into a Quick Diary draft | Follow-up | accepted; Execution: done | [86-share-target-into-quick-diary.md](issues/86-share-target-into-quick-diary.md) |
| 87 — Offer prefilled capture from holdings, watchlist and price alerts | Follow-up | accepted; Execution: done | [87-prefilled-capture-entries.md](issues/87-prefilled-capture-entries.md) |
| 88 — Stop requiring a title in the full Diary editor | Follow-up | accepted; Execution: done | [88-full-editor-title-derivation.md](issues/88-full-editor-title-derivation.md) |
| 89 — Suggest company symbols the account already tracks | Follow-up | accepted; Execution: done | [89-company-symbol-suggestions.md](issues/89-company-symbol-suggestions.md) |
| 90 — Remove the cold-start wait before the Quick Diary writing area | Follow-up | accepted; Execution: done 2026-10-04, completed 2026-10-08 after 100 | [90-quick-cold-start-wait.md](issues/90-quick-cold-start-wait.md) |
| 91 — Revisit the destination summary sitting above Quick writing | Design decision | ruled 2026-10-04; Execution: done (delivered by 97) | [91-quick-destination-placement.md](issues/91-quick-destination-placement.md) |

## Article translation management follow-up (92)

| Ticket | Type | Recorded state | Issue file |
|---|---|---|---|
| 92 — Batch-manage and retranslate article translations | Follow-up | accepted; Execution: done | [92-article-translation-bulk-management.md](issues/92-article-translation-bulk-management.md) |

## Desktop workspace layout follow-up (93)

| Ticket | Type | Recorded state | Issue file |
|---|---|---|---|
| 93 — Use desktop workspace width more effectively | Design follow-up | accepted; Execution: done | [93-desktop-workspace-space-utilization.md](issues/93-desktop-workspace-space-utilization.md) |

## Quick Diary button consistency follow-up (94)

| Ticket | Type | Recorded state | Issue file |
|---|---|---|---|
| 94 — Standardize button sizing across Quick Diary editing | Design follow-up | accepted; Execution: done (delivered by 97) | [94-quick-diary-button-consistency.md](issues/94-quick-diary-button-consistency.md) |

## Dropdown layout follow-up (95)

| Ticket | Type | Recorded state | Issue file |
|---|---|---|---|
| 95 — Correct dropdown layout and spacing across the app | Cross-cutting visual bug | accepted; Execution: done | [95-dropdown-layout-density.md](issues/95-dropdown-layout-density.md) |

## Trading principles page redesign (96)

| Ticket | Type | Recorded state | Issue file |
|---|---|---|---|
| 96 — Rebuild the Trading principles page around reading, not managing | Design follow-up | accepted; Execution: done | [96-discipline-page-redesign.md](issues/96-discipline-page-redesign.md) |

## Diary authoring redesign (97)

| Ticket | Type | Recorded state | Issue file |
|---|---|---|---|
| 97 — Redesign both diary authoring surfaces as one writing system | Design follow-up | accepted; Execution: done | [97-quick-composer-redesign.md](issues/97-quick-composer-redesign.md) |
| 98 — Derive recent tag suggestions from saved diaries | Follow-up | accepted; Execution: done | [98-recent-tags-from-saved-diaries.md](issues/98-recent-tags-from-saved-diaries.md) |

## Diary calendar redesign (99)

| Ticket | Type | Recorded state | Issue file |
|---|---|---|---|
| 99 — Redesign the Diary calendar around density and legible destinations | Design follow-up | accepted; Execution: done | [99-calendar-redesign.md](issues/99-calendar-redesign.md) |

## Shell architecture follow-up (100)

Filed 2026-10-04 from the execution of [90](issues/90-quick-cold-start-wait.md), which found that
confirming the session replaced the routed element tree on every cold load.

| Ticket | Type | Recorded state | Issue file |
|---|---|---|---|
| 100 — Confirming the session destroys every page's unsaved state | Cross-cutting architecture | triaged; Execution: done 2026-10-08, new e2e cases not run | [100-shell-swap-destroys-page-state.md](issues/100-shell-swap-destroys-page-state.md) |

## Whole-app page score follow-up (101–114)

Filed 2026-10-06 from the [whole-app UI page score](../../docs/design/ui-page-score-2026-10-06.md),
which scored all 69 route states against DESIGN.md and PRODUCT.md from fresh captures.
App-level heuristic score: 29/40. Six pages scored below 55 and are redesigns; the rest of
the set is cross-cutting consistency work and four focused reworks.

| Ticket | Type | Recorded state | Issue file |
|---|---|---|---|
| 101 — Normalize money, quantity, percentage and date rendering | Cross-cutting visual bug | triaged; Execution: done 2026-10-07, e2e suite run and green | [101-figure-formatting-consistency.md](issues/101-figure-formatting-consistency.md) |
| 102 — Correct the confirmed text and markup defects | Cross-cutting visual bug | triaged; Execution: done 2026-10-07, no assertion pins the seven fixes | [102-confirmed-markup-defects.md](issues/102-confirmed-markup-defects.md) |
| 103 — Split AI administration into task-scoped views | Design follow-up | triaged; Execution: done 2026-10-08, AI admin e2e green | [103-admin-ai-split-into-views.md](issues/103-admin-ai-split-into-views.md) |
| 104 — Rebuild the admin accounts page around a readable table | Design follow-up | triaged; Execution: done 2026-10-09, admin-users e2e 2/2 after two real fixes | [104-admin-accounts-rebuild.md](issues/104-admin-accounts-rebuild.md) |
| 105 — Make strategy performance readable at low cardinality | Design follow-up | triaged; Execution: done 2026-10-08, chart geometry unit-tested and performance e2e green | [105-performance-chart-low-cardinality.md](issues/105-performance-chart-low-cardinality.md) |
| 106 — Reduce the Watchlist row to a readable company | Design follow-up | triaged; Execution: done 2026-10-08, both watchlist e2e specs updated and green | [106-watchlist-row-controls.md](issues/106-watchlist-row-controls.md) |
| 107 — AI reports denied, empty and first-run states | Design follow-up | triaged; Execution: done 2026-10-08, 11/11 AI e2e cases green, guard mutation-checked | [107-ai-reports-states.md](issues/107-ai-reports-states.md) |
| 108 — Rebuild Diary reminders as a usable page | Design follow-up | triaged; Execution: done 2026-10-08, 7/7 alerts e2e cases green | [108-diary-reminders-page.md](issues/108-diary-reminders-page.md) |
| 109 — Design the authentication pages | Design follow-up | triaged; Execution: done 2026-10-08, 8/8 new auth e2e cases green | [109-authentication-pages-design.md](issues/109-authentication-pages-design.md) |
| 110 — Section the company research page into legible jobs | Design follow-up | triaged; Execution: done 2026-10-08, company/notes/evidence e2e green | [110-company-research-page-sections.md](issues/110-company-research-page-sections.md) |
| 111 — Fix the trade plan execution comparison region | Design follow-up | triaged; Execution: done 2026-10-08, 10/10 trade-plan e2e cases green | [111-trade-plan-execution-comparison.md](issues/111-trade-plan-execution-comparison.md) |
| 112 — Standardize empty states and list sections | Cross-cutting visual bug | triaged; Execution: done 2026-10-08, 13/13 affected e2e cases green | [112-empty-states-and-list-sections.md](issues/112-empty-states-and-list-sections.md) |
| 113 — Correct the research tool pages | Design follow-up | triaged; Execution: done 2026-10-08, tool-page e2e green | [113-research-tool-page-corrections.md](issues/113-research-tool-page-corrections.md) |
| 114 — Quiet the article management rows and size its columns | Design follow-up | triaged; Execution: done 2026-10-08, 3/3 article-management e2e cases green | [114-admin-article-list-rows.md](issues/114-admin-article-list-rows.md) |

## Navigation and capture decisions filed from 112 (115–116)

Filed 2026-10-08 from [112](issues/112-empty-states-and-list-sections.md)'s execution,
whose acceptance required its two deferred findings to be ruled on or filed rather than
dropped. Both touch the capture-first navigation principle and both have two defensible
readings, so neither was decided inside a consistency ticket.

| Ticket | Type | Recorded state | Issue file |
|---|---|---|---|
| 115 — Rule on the duplicate Quick diary primary action | Design decision | triaged; Execution: done 2026-10-08 | [115-duplicate-quick-diary-action.md](issues/115-duplicate-quick-diary-action.md) |
| 116 — Decide what belongs in the sidebar | Information architecture | triaged; Execution: done 2026-10-08 | [116-sidebar-navigation-depth.md](issues/116-sidebar-navigation-depth.md) |

## Test debt (117)

| Ticket | Type | Recorded state | Issue file |
|---|---|---|---|
| 117 — Clear the remaining end-to-end failures | Test debt | triaged; Execution: done 2026-10-09; found a product defect that destroyed stored drafts | [117-remaining-e2e-failures.md](issues/117-remaining-e2e-failures.md) |

Recommended order from the review: 101 first (highest visibility per unit of effort, and a
credibility problem), then 102 (four fixes of two lines or less), then the redesigns
103–106, then 107–111, then 112–114.

**Progress — 2026-10-07.** 101 and 102 are implemented, in one pass because they share
call sites. Both carry rulings taken by the implementing agent rather than by the user,
each recorded with its reasoning in the ticket's "Settled during triage". Two things found
during the work are worth reading before picking up 103–114:

- The display boundary is now enforced by `tests/unit/figure-formatting-boundary.test.ts`.
  Any new page that formats a figure with `Intl.NumberFormat`, `toFixed` or
  `toLocaleString` fails that test. Use `apps/web/app/market-display.ts`; DESIGN.md's Data
  and finance section has the table of roles.
- The full e2e suite was run: **307 passed, 9 failed, none caused by 101/102.** Seven are
  pre-existing and also fail on clean `HEAD`: three in `account-security.spec.ts` (an ambiguous
  `getByLabel('Content')` dating from ticket 97), three in `workspace-navigation.spec.ts`
  (admin nav gained Guru links in `d9e0232`), and one in `pwa.spec.ts`. These are not
  caused by 101/102 and are worth their own ticket. An eighth, in `company-market.spec.ts`,
  had the same cause and was fixed here.
- **The other two failures are flaky and that is its own problem.** `posts.spec.ts:13`
  passes on re-run, and `research-diary-handoff.spec.ts` fails a different test on every
  run (`562`, then `212`, then neither) with no code change between runs. Both live in the
  Quick draft/append state machine. Worth a ticket: a suite that fails a different test
  each run cannot answer the question it is run to answer.
- Running e2e **changed the shipped rule**: fixed two-decimal amounts broke the ledger's
  own arithmetic (`buy-ledger.spec.ts`) and then over-reported float noise
  (`portfolio.spec.ts`). The convention that shipped is two decimals always, up to four
  more only for a decimal string. Read 101's "Ruling corrected by the e2e run" before
  touching an amount.
- 102's seven fixes are still unpinned — the repo has no DOM test harness and no spec
  covers them. The local e2e harness now runs (OrbStack + `docker compose --profile redis
  up -d` + `npm run db:migrate`), so writing them is a small follow-up.

**Progress — 2026-10-08.** 103, 104, 105, 106 and 107 are implemented, in the review's
recommended order. Each ticket carries its own rulings and execution record; two things
are worth reading before picking up 108–114:

- **106 and 107 both chose structure over the guard the ticket proposed.** 106 replaced
  six peer row controls with a page-level arrange mode rather than a per-row overflow
  menu, after weighing the keyboard cost the ticket asked to weigh. 107 found that the
  denied state arrives three different ways — capabilities answers **200** with
  `AI_ACCESS_DENIED` for an account that never had a grant, so the `denied` flag the page
  already had was false for the exact case the review screenshotted — and replaced the
  two-column scaffold rather than guarding one sentence inside it.
- **The stale-e2e ticket that 101 asked for has one more case.** `evidence.spec.ts:44`
  ("Diary evidence retains captured summary and opens its original source") fails at both
  widths on a missing `Add research evidence` disclosure on `/diaries/:id`. Confirmed
  pre-existing by rerunning it with 106 stashed. It was not in the nine failures 101
  recorded, so that list is now ten.

**Progress — 2026-10-08, second pass.** 108 and 109 are implemented, continuing the
review's recommended order. Three things are worth reading before picking up 110–114:

- **108 found a live defect in [100](issues/100-shell-swap-destroys-page-state.md) and fixed
  it.** A cold load of a private page could show `AUTH_UNAUTHORIZED` while every API
  response was `200`: `fetchSession` discarded an in-flight private read whenever the
  session *revision* advanced between request and answer, and the first confirmation of
  the session advances exactly that revision, normally while the page's own reads are
  open. The guard now keys on `identity`, the distinction 100 introduced for this.
  Confirmed pre-existing by reproducing it on a stashed tree. It was costing real tests:
  `alerts.spec.ts` failed every cold-load case, `quick-authoring-follow-up.spec.ts` went
  from 7 failures to 4 with the fix in place, and `evidence.spec.ts:44` — recorded as
  pre-existing in the first 2026-10-08 note — now passes at both widths, so it leaves the
  stale list.
- **109's step 3 was wrong as written and the tests said so.** Hiding the recovery link
  whenever account email is unconfigured broke `ui-ux-audit-regressions.spec.ts`, which
  pins that recovery stays discoverable when a support route is configured. The shipped
  rule offers the link when *either* path exists. Read 109's ruling 4 before touching the
  sign-in page.
- **Full e2e suite run: 316 passed, 16 failed.** Two of the sixteen were caused by this
  work and are fixed (`layout-theme`'s gutter selector, `ui-ux-audit-regressions` above);
  the other fourteen are pre-existing, and the list below is now the authoritative one.

### Pre-existing e2e failures — now [117](issues/117-remaining-e2e-failures.md)

Carried here unfiled since 2026-10-07 and filed as a ticket on 2026-10-09, by which point
seven of them were fixed: three in `account-security.spec.ts` (97's region label), three in
`workspace-navigation.spec.ts` (116), and `admin-users.spec.ts:22`, whose two real faults —
a paginated inventory in a shared database, and two landmarks named "Accounts" — also
completed 104's acceptance. Two of the four `quick-authoring-follow-up` cases went with
them; the spec's own account-read hold helper was throwing.

Six remain and are described in the ticket: two in `quick-authoring-follow-up.spec.ts`,
two in `research-diary-handoff.spec.ts`, one in `pwa.spec.ts`, and `posts.spec.ts:13`,
which passes on re-run.

**Progress — 2026-10-08, third pass.** 110 and 111 are implemented, finishing the
review's 107–111 band. Three things are worth reading before picking up 112–114:

- **110 rejected its own recommended mechanism, and the tests are why.** The ticket
  preferred deferred disclosures and offered sub-routes as an alternative; both were
  rejected. `company-hub.spec.ts` carries an accepted acceptance that the hub, notes,
  evidence and quote readers sit on **one** page and fail independently there, so moving
  notes and evidence to their own addresses would have deleted that claim rather than
  satisfied the ticket. Disclosures alone leave a populated page exactly as long as it is
  today. What shipped is in-page section navigation plus a deferred *capture form* — the
  recorded evidence timeline stays standing.
- **A second router blocker was found on the company page.** Deferring the evidence
  capture mounted its navigation guard permanently, and a router supports one blocker at a
  time: it silently took the registration from the notes editor, whose unsaved-note
  confirmation then stopped holding the navigation. `stock-notes.spec.ts` caught it. The
  guard now mounts only while there is unsaved capture. Worth remembering for any page
  that grows a second surface with unsaved work.
- **Full e2e suite run: 319 passed, 15 failed, none new.** Every failure is in the
  pre-existing list above, plus `posts.spec.ts:13`, which the 2026-10-07 note already
  recorded as passing on re-run. The run before this one failed 16 including two caused by
  109; both were fixed.

**Progress — 2026-10-08, fourth pass.** 112 and 113 are implemented, which closes the
whole-app page score's 101–114 set except [114](issues/114-admin-article-list-rows.md).
Three things are worth reading before picking it up:

- **112's open decision went the other way from the review's reading.** The review
  suggested an unconditional Refresh was the weaker option; it does not survive contact
  with what these lists are. Every one of them can change without the reader — two specs
  use `Refresh partners` to observe a second account across browser contexts. The rule
  that shipped is: a **retry** belongs to a failure and appears only with one; a
  **refresh** belongs to a list whose data can change without you, and sits on its
  heading's baseline. `/stocks`'s unconditional "Try again" was a mislabelled refresh and
  is now `Refresh prices`.
- **112's two deferred findings are filed, not dropped**, as its acceptance required:
  [115](issues/115-duplicate-quick-diary-action.md) for the duplicate Quick diary primary
  action and [116](issues/116-sidebar-navigation-depth.md) for sidebar depth. Both touch
  the capture-first principle and both have two defensible readings.
- **113 reached `/tools/market-rotation` the way its step 7 demanded** — captured
  populated from the existing fixtures before deciding anything — and changed exactly one
  thing against that capture: the four-up bordered stat row became a ledger, the same
  shape [105](issues/105-performance-chart-low-cardinality.md) and
  [111](issues/111-trade-plan-execution-comparison.md) removed elsewhere. Its flat ratio
  chart resolves the same way too: a ratio that does not move is stated rather than drawn
  as a straight line across a 680px frame.

**Full e2e suite run: 320 passed, 15 failed — the same fifteen as the previous run, none
new.**

**Progress — 2026-10-08, fifth pass. 114 is done, which closes 101–114.** Two things from
it are worth carrying forward:

- **A confirmation existed but was the wrong one.** `/admin/blog`'s `action()` helper
  raised `window.confirm` for every DELETE using the *bulk* copy, so deleting one article
  asked "Delete the selected articles?" about a selection the reader had not made. Both
  deletions now use the project dialog with copy that names what each does. Worth
  remembering that a confirmation in a shared helper can be invisible at the call site —
  the ticket read the row as having none.
- **DESIGN.md gained the worked example the ticket asked for.** The quiet-row-control rule
  was stated but never shown, and three tables had each worked it out separately. The
  Buttons section now names the convention and the three pages that follow it: every row
  control quiet at compact height except a destructive one, and no filled action in a row,
  because one per row multiplies into a page of them.

**Full e2e suite run: 322 passed, 14 failed — all pre-existing.** `posts.spec.ts:13`
passed on this run, which is the re-run behaviour already recorded for it.

**Progress — 2026-10-09, seventh pass. The suite is green: 338 passed, 0 failed.**

[117](issues/117-remaining-e2e-failures.md)'s six remaining failures came down to **one
product defect and four test faults**:

- **A cold load destroyed a stored draft.** The account read confirms the session and
  supplies the Quick draft key in one commit, and React runs effects in declaration order:
  the save effect was declared before the one that reads the stored draft, so it wrote
  first — overwriting a draft stored for that account with whatever had been typed on the
  cold document, then offering that back as "the stored draft". Restoring it was a no-op
  because there was nothing left to restore. `quick-composer.tsx` now holds the save until
  the key has been read. That one fix also cleared `:115` and both
  `research-diary-handoff` cases, which is what had been making this cluster "fail a
  different case on every run": one corrupted key, several tests reading it.
- The rest were the spec's own: a locale race (the account's locale is authoritative and
  defaults to zh-TW, so choosing English on the control is not enough), a manifest
  assertion that counted Chrome's advisories as faults, and a measurement taken during a
  dialog's entry transition.

**A confirming second run was 337/1**, and the one failure is a harness timeout on a loaded
machine — `partner-timeline-parity.spec.ts:146` waiting 90s for the preferences select to
become enabled, passing 7/7 on rerun. Recorded in 117 rather than claimed as green.

**Progress — 2026-10-09, sixth pass. Every ticket that uses the execution convention is
done except [117](issues/117-remaining-e2e-failures.md), which this pass filed.** The full
suite now runs **333 passed, 5 failed**, up from 325/13.

- **115 and 116 are done.** Capture keeps one filled action, the sidebar's; the account
  controls are pinned to the bottom of the scrolling column and Settings moved in beside
  them. 116's own measurement is recorded in the ticket, including the arrangement that was
  tried and rejected — giving the list its own scroll box left it 242px tall at 1440×900.
- **The index was lying about 84–99.** Fourteen rows still read
  `ready-for-agent; Execution: todo` while every one of those tickets recorded
  `Status: accepted / Execution: done` in its own file, some of them days earlier. The rows
  are reconciled; the tickets were right and the index was stale. Worth checking the files
  rather than this table when a state matters.
- **Seven of the long-standing e2e failures are fixed, not deferred, and the rest are now
  [117](issues/117-remaining-e2e-failures.md).** 116 could not start without characterising
  the three `workspace-navigation` cases, and all three turned out to be stale assertions
  rather than defects: a content-width check that contradicted DESIGN.md's 1280px data cap,
  a calendar legend that 99 turned into two, and an administration link list that predated
  the Guru routes. The same pass fixed the three `account-security` cases (97's writing
  region shares its label with the textarea, so address the control by role),
  `admin-users.spec.ts:22` — which had two real faults and whose fix **completes 104's
  acceptance** — and two of the four Quick cold-start cases, where the spec's own
  account-read hold helper was throwing.

The 101–114 set from the 2026-10-06 page score is now complete. What remains open from
that review is the "Scored but not filed" list below, plus [115](issues/115-duplicate-quick-diary-action.md)
and [116](issues/116-sidebar-navigation-depth.md), and the stale-test list above.

### Scored but not filed

Pages that scored in the 60s and were inspected but not broken down in enough detail to
specify a ticket honestly: `/admin/research/:id` (67), `/admin/etf` (66),
`/admin/article-translations` (64), `/admin/blog/new` and `/admin/blog/:id/edit` (63),
`/partners` (64, partly covered by 112), `/etf/watchlist` (62, partly covered by 112),
`/stocks/:symbol/thesis` (64, its checkbox defect is in 102), `/stocks` Holdings (66, its
formatting is in 101). These need a closer pass before they become tickets rather than
being invented now.

Two findings were deliberately left unfiled pending a ruling and are recorded in
[112](issues/112-empty-states-and-list-sections.md)'s Observation: the duplicate
"Quick diary" primary action, which may be intentional and may already belong to
[94](issues/94-quick-diary-button-consistency.md); and navigation depth, where the sidebar
holds 1,745px of content and leaves Settings, Sign out and Preferences below its own fold
at 1440×1080 — an IA question that interacts with the standing capture → read → review
priority.
