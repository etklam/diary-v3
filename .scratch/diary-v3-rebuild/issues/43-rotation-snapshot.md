# [43] 更新持久化市場價格並查看最新輪動排名

Status: done
Type: AFK
User stories covered: US-078, US-079, US-082, US-097

## Parent

[完整重構 PRD](../PRD.md)

## What to build

由管理員觸發或 CLI 更新 canonical universe 的每日價格，生成 snapshots，並在公開 monitor 查看最新有界排名。

## Acceptance criteria

- [x] 先持久化價格再計算，canonical seeds、unique keys、scope-local 分數／rank／signal 及 null 行為遵循基準。
- [x] 批次與管理員入口共用用例，重跑冪等；真 DB／受控 upstream 測部分失敗、unknown 和無快照 404。
- [x] 訪客可經 API／React 讀取最新 rows，不在每次開頁現抓 Yahoo；完整兩週比較與 scope controls 由 45 擴展。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [18 market-provider](18-market-provider.md)

Portfolio exposure integration obligation: ticket 20 now serves `/api/stocks/exposure` with real cost buckets and the source unknown-market fallback. When persisted sectors dashboard context exists, wire its marketState/betaAllocation/lastUpdated into the exposure reader, compute gaps using shared `compareExposureToTarget`, and render live comparison with fixtures. Current fallback-only integration is not completion of ticket 20.


## Frozen calculation checkpoint

Read the recorded source implementations for indicators, rounding, scoring, signal and snapshot builder. Ported these five pure modules into packages/domain/src/market-rotation, replacing Nuxt aliases with relative ESM imports. Preserved valid formulas and existing null semantics; no database or platform dependencies. Ported source fixtures without changing behavioral assertions. All 81 cases in five suites passed (133ms); typecheck/lint passed. Added explicit domain package exports for runtime consumers.

Important integration investigation: source comparison-enrichment builds a map by symbol only and calculates percentiles/ranks over the supplied rows. Its callers must partition scopes (and intended core pools) before invocation. Do not blindly feed a mixed-scope batch: SPY appears in indexes and core. Source pipeline/scope-enrichment/comparison-enrichment were read but not yet ported; verify production batch caller semantics before choosing the correction. Persisted prices, canonical universe seed/schema, batch/API/CLI, ranking integration and public UI remain pending. This checkpoint does not satisfy full ticket acceptance.

Source caller follow-up: frozen server/utils/market-rotation-batch.ts runScopeBatch loads exactly getUniverseForScope(rankScope), persists prices first and invokes runSnapshotPipeline once per scope. Thus cross-scope symbol collision is a misuse risk, not an established defect in that production caller. Preserve its per-scope invocation boundary. Core first-stage percentile pools are split, while comparison-enrichment uses the entire supplied scope for performance percentiles/final ranks; reconcile this distinction against core fixtures before changing it.

## Pipeline and canonical universe checkpoint

Ported frozen pipeline, scope enrichment, comparison enrichment, types, universe and their supporting state/breadth modules into the pure domain package. Canonical configuration retains 11 sectors, 8 indexes and 23 core entries (13 ETF / 10 stock); source fixtures cover the universe and core percentile grouping. Calculation inputs/outputs retain source behavior, including null comparison fields when no persisted comparison exists. Runtime contracts and persistence have not yet been connected.

Twelve rotation unit suites now pass 162 source-derived assertions (221ms), with typecheck and lint passing. Adaptations are ESM import paths, explicit non-null fixture indexing required by noUncheckedIndexedAccess, removal of unnecessary any casts, and unused-destructure handling; no calculation assertions were weakened. Source production caller invokes the pipeline once per scope; preserve that boundary. The first stage splits core percentile pools while the comparison stage uses supplied scope-wide performance percentiles/ranks. No source comparison-stage core-pool fixture was found in the bounded rotation test search, so this distinction remains documented rather than silently changed. PostgreSQL schema, qualified dates, daily-price persistence, API/CLI and React monitor remain outstanding.

## PostgreSQL persistence schema checkpoint

Added marketDailyPrices, marketRotationSnapshots and marketRotationSnapshotRuns to Drizzle with migration 0017_real_radioactive_man.sql. Compared frozen Prisma models and all relevant source migrations: daily numeric(18,6), bigint volume, calendar dates, scope/symbol/date snapshot uniqueness, nullable scores/signals and run counters/timestamps are retained. PostgreSQL instants use timestamptz. Tables remain independent of personal stock and ETF catalog tables, as in the source model. Source updatedAt behavior must be explicitly supplied by future mutation/upsert code (the database defaults cover inserts only).

Disposable PostgreSQL schema integration passed 1/1 (635ms): concurrent same-day insert single winner, exact 123456789012.123456 numeric roundtrip, 5-billion volume, date string mapping, indexes/core same-symbol coexistence, same-scope duplicate rejection, unknown nullable metrics, run defaults and no stock/ETF writes. Typecheck/lint passed. This verifies the new schema from an empty database; batch persistence and read APIs remain pending.

## Qualified-date PostgreSQL reader

Ported only the pure qualification/window section from frozen qualified-date.ts; omitted its Prisma helper. Added readRotationWindow in API using Drizzle aggregate query with mandatory canonical symbol filter, explicit scope and as-of bound. The 90% threshold and ten-qualified-position offset stay in the shared domain module. Pre-persistence qualified candidates participate once; repeated same calendar dates do not shift the window.

Source qualification suite passed 22/22 (94ms). Real PostgreSQL window integration passed 1/1 (700ms): 10-of-11 sectors qualifies, 9 plus 20 noncanonical symbols does not, unrelated index rows remain isolated, future persisted/candidate dates are excluded, candidate retry deduplicates, newly qualified candidate shifts comparison correctly, insufficient comparison history returns null. Typecheck/lint passed. Candidate counts remain an internal batch responsibility and must be computed from canonical successful rows; reader is not a public unchecked-input endpoint. Daily-price provider/persistence, full batch and public monitor remain pending.

## Daily provider and atomic price persistence

Added market.dailyPrices using the existing queue/cache/timeout and explicit refreshed reads, with stale fallback still identifiable for the future batch policy. OHLC parser preserves source behavior for valid rows: requires positive OHLC, falls back adjustedClose to close, missing/nonpositive volume becomes zero, decimal storage uses six places. Last duplicate date wins and output is sorted. Intentional hardening rejects invalid dates, unsafe positive volume and prices outside representable positive numeric(18,6), including tiny prices rounding to zero; no partial invalid row is fabricated.

Added persistRotationPrices: deduplicates symbol/date, sorts consistently, uses conflict-update for each date and batches 500 rows within one transaction. Compared source sequential upserts: the new per-refresh transaction prevents partially committed history after a later failure. Provider/parser and PostgreSQL tests passed 3/3 (738ms), including fresh repeat reads, stale flag, duplicate handling, exact decimal/large volume, concurrent upsert and injected numeric failure in row 501 rolling back the first 500. Added parser tiny-value regression after this run. Typecheck/lint and final parser rerun recorded by command output. Batch must explicitly refuse stale provider reads as fresh success and only calculate after persisted prices; that orchestration remains pending.

## Snapshot write boundary

Added explicit runtime snapshot projection and persistence in apps/api/src/rotation-snapshots.ts. Calendar dates, scope, nullable booleans/integers and finite numeric metrics validate before writes. Metrics serialize to source column scales and reject overflow; extra pipeline fields are not blindly persisted. Conflict updates preserve row identity/createdAt and explicitly set updatedAt. Up to 250 rows per SQL statement share one transaction.

Actual runSnapshotPipeline output passed through real PostgreSQL integration (1/1, 730ms): six-place price serialization, unknown signal/rank, replay updates score and updatedAt without replacing identity, invalid Infinity prevents all inserts, injected failure in row 251 rolls back the first chunk. Initial test import used an unexported contracts subpath; corrected to existing package root export. Final typecheck/lint passed. Batch orchestration, jobs/API and public reads/UI remain outstanding.

## Scope batch orchestration checkpoint

Added runRotationBatch composing canonical provider refresh, persisted-price read, qualified comparison window, pure pipeline and snapshot persistence. PostgreSQL session advisory lock excludes concurrent updates to the same scope across runtimes; its dedicated pooled connection is discarded if unlock fails. Prices are persisted before snapshot generation, stale provider fallback fails the run, and failed runs retain prior snapshots. Run records track running/success/partial/failed with finished timestamps. Completed-day filter retains source New York 16:00 weekday policy, including DST offset differences (special exchange early-close calendar remains source behavior, not added here).

PostgreSQL batch tests passed 2/2 (996ms): 8 index snapshots from 464 canonical persisted daily rows, idempotent snapshot rerun, stale rejection without replacing snapshots, concurrent scope lock rejection, terminal run records and summer/winter close boundaries. Typecheck/lint passed after unlock cleanup hardening. API/CLI and public monitor remain pending; atomic coordination of snapshot commit with terminal run status and recovery after process interruption still require review. Goal control was observed blocked while this test turn was still doing useful work; this does not represent a repository blocker.

## Shared batch CLI checkpoint

Added rotation-command and standalone rotation-cli, bundled into dist/api/rotation-cli.js by the existing API build. Supports default all scopes and both --scope=core / --scope core. Uses the same runRotationBatch, no HTTP/JWT/CSRF dependency. JSON output includes jobId, timestamps, duration, completed results and counts; failures retain counts for earlier committed scopes without exposing raw exception secrets. Invalid/unknown CLI arguments fail before connecting. Uses process.exitCode and awaits pool.end, correcting the source process.exit inside try that could bypass asynchronous cleanup.

Typecheck/lint, two CLI dispatcher tests (83ms), API production bundling passed. Executed the bundled invalid-scope entrypoint: exit 1, structured failure stderr, no stdout. Valid production Yahoo run deliberately not executed; controlled real-database batch coverage is recorded above. Focused sol-expert review requested separately for batch integrity/locks/comparison logic; pending. API routes and public monitor still not implemented.

CLI follow-up: totalErrors now includes missing symbols in partial results; third dispatcher regression passed (88ms), typecheck/lint passed. The new rotation_review subagent is confirmed running (unlike earlier usage-limited agents); review findings are not yet available and no independent approval is claimed.

## Independent batch review corrections

sol-expert rotation_review found and root corrected: (1) snapshot commit and terminal run status now share an outer transaction; trigger-injected terminal status failure rolls back snapshots; (2) per-symbol source history cap restored to latest 300 observations before recursive RSI/EMA; >300 non-flat prior history regression proves correct RSI100/EMA100 for the final flat window; (3) after acquiring scope lock, abandoned running rows are marked failed before new work; failure tracking is best-effort and preserves the original error. Success also requires all canonical symbols at the candidate date. Final batch integration covers three cases including these paths, and typecheck/lint passed.

Outstanding review finding: mixed latest dates are still fed into one scope percentile/ranking pipeline (source-preserved defect). Ten sectors at D and one at D-1 can let the stale symbol affect D ranks and apply D's comparison boundary to its older snapshot. Must resolve with same-date grouping/filtering and regression before ticket completion; partial status alone does not correct metrics. SQL read currently loads history then slices 300 in memory; bounded per-symbol SQL read remains an efficiency obligation. Review is not a completion sign-off.

## Mixed-date correction and bounded reads

Resolved the outstanding mixed-date review finding: only symbols on the qualified candidate date enter the pipeline, comparison asOf is that date, and no candidate means zero snapshot writes with partial run status. Existing snapshots stay unchanged. Added PostgreSQL 10-current/1-stale fixture proving current RSI percentiles exclude the stale peer, then 9-current case proving no overwrite. sol-expert reviewed this exact correction and found no remaining correctness defect (optional regressed-candidate comparison fixture not added).

Replaced full-history read/in-memory slicing with indexed per-symbol descending queries limited to 300, reverse for calculations. Weekends and not-yet-completed New York current day are filtered before the limit. Final batch/alignment integration passed 4/4, typecheck/lint passed. The shared batch remains the API/CLI boundary; subsequent checkpoints add the administrator HTTP route and monitor UI.

## Administrator HTTP batch checkpoint

Added POST /api/admin/market/rotation-batch preserving single-scope {success,result} and all-scope {success,results,totalUpserted,totalErrors} shapes, with explicit runtime request/response schemas and generated OpenAPI/client. Result adds runId/status and includes symbols omitted for missing qualified-date data. Production server supplies its PostgreSQL pool for shared scope locking. Unauthorized/ordinary users cannot invoke batch, Web CSRF remains required, invalid explicit Bearer fails closed; overlapping scope returns 409 ROTATION_BATCH_BUSY. Runtime without supplied pool returns 503 rather than starting an unlocked job.

Real HTTP/PostgreSQL test passed 1/1 (1.67s): unauthenticated no-CSRF rejection, ordinary role, malformed scope, missing CSRF, invalid Bearer, index batch persistence, lock conflict and all three scopes returning 42 rows. Initial guest assertion expected 401 but global CSRF runs first and correctly returned 403; corrected test expectation, not middleware. Contracts drift/typecheck/lint passed. Malformed JSON is now rejected rather than source's catch-and-default-to-all behavior; this is a safety correction for an expensive mutation. A frozen page/component scan found no separate rotation-batch caller, so the API and shared CLI are the ticket's administrative entrypoints; a separate admin batch UI is not required.

## Public monitor API/UI checkpoint

The guest monitor now reads only canonical persisted snapshots and returns `404` when no qualified rows exist; it never refreshes the market provider on page reads. Public responses are `Cache-Control: no-store`, including no-snapshot and validation responses. The response includes nullable `summaryAsOfDate` because indexes/core rows and the independently latest sector breadth summary may come from different dates. Rank values are validated as positive 1-based values, and summary wording is scope-neutral (`Leaders`, `Weakening groups`) while the React UI localizes structured state/signal labels. The React route is `/tools/market-rotation`, with sectors/indexes/core controls, explicit as-of/comparison/breadth dates, unknown-value rendering, mobile table handling and controlled-fixture browser coverage.

Focused unit and contract tests (32/32), monitor PostgreSQL fixtures (2/2), admin HTTP fixture (1/1), typecheck and lint pass. Chrome E2E `tests/e2e/market-rotation.spec.ts` passed 2/2 (13.0s) with a controlled admin batch writing the disposable database followed by an unauthenticated guest reading the real monitor API (8 index rows), plus routed 404/retry, three locale state/signal labels, keyboard scope changes, explicit date divergence, unknown/insufficient values, and desktop/mobile screenshots. Evidence is saved at `docs/design/evidence/market-rotation/desktop.png` and `docs/design/evidence/market-rotation/mobile.png`. Final independent release acceptance remains with the primary agent.

## Final acceptance evidence

2026-09-06 root acceptance confirmed all three criteria after reviewing the source-preserved calculation boundary, generated contracts, real disposable PostgreSQL and controlled-provider evidence, the final Chrome suite, and desktop/mobile captures against the Astra design brief. No production service or real user data was used. The separate admin UI question is resolved by the frozen page/component scan: ticket43's administrator entrypoints are the shared HTTP batch route and CLI, with no additional admin page required.

See [`docs/design/market-rotation-finish-review.md`](../../../docs/design/market-rotation-finish-review.md) for the consolidated review record. Market-state/breadth behavior remains ticket44, and portfolio20 market context integration remains a separate pending obligation; neither is claimed as part of ticket43 completion.
