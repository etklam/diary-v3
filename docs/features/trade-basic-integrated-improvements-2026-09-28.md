# Trade basic integrated improvements: acceptance record

Status: implemented; automated verification complete with documented reruns and manual-device/zoom boundaries. This record is not production acceptance.

## Source and scope

Reference SHA and initial clean checkout: `b81014e5cdfc78f6fe6ae071c59b0226e63c3037`, branch `main`. Verification uses that checkout plus the uncommitted implementation described here. All three requested batches are included. The immutable rebuild PRD, historical reports and frozen performance gates are unchanged. No deployment, push, production data or paid/live provider call was performed.

The working tracker is `.scratch/trade-basic-integrated-improvements/PRD.md`. ADRs 0018 and 0019 record read reuse, review concurrency, saved views and execution comparison decisions.

## Feature acceptance

| Item | Initial classification | Implemented behavior | Verification state |
| --- | --- | --- | --- |
| A1 | Existing, improved | Two independently retriable ledger/quote aggregates; one owner ledger replay per aggregate; unified holdings table; ledger fingerprint prevents mixed snapshots | Verified: API parity, provider failure, snapshot mismatch, request/SQL measurements and browser flows |
| A2 | Existing, improved | Browser-only revision-scoped account snapshot and single flight; independent consumer cancellation; settings and cross-tab invalidation | Verified: revision isolation, independent abort, settings invalidation and shared browser reads |
| A3 | Existing, improved | Lazy summary picker, 300 ms debounce, IME handling, filters, paging, cancellation and retained selected diary | Verified: summary-only browser requests, search/select and built-artifact linkage |
| A4 | Existing lifecycle, newly integrated | Owner/plan drafts, normalized dirty comparison, restore/prefill conflict, truthful local persistence status and navigation protection | Verified: normalization/storage units, expiry/logout/account and same-mounted route browser regressions |
| A5 | Existing, improved | Same-account confirmed results survive ordinary refresh errors; session/authorization changes clear private results | Verified: deferred refresh, stale response and authorization browser regressions |
| B1 | Existing queue, newly integrated | Mixed diary/thesis save-next, local skip, snapshot progress, complete paginated traversal and narrow CAS reschedule | Verified: API concurrency/queue boundaries and mixed continuous-review browser flows |
| B2 | Existing, improved | Search/research filters, pin, atomic custom-order moves, row operations and same-ID undo with unknown-outcome reconciliation | Verified: atomic API ordering/ownership and browser move, same-ID undo, error and logout flows |
| B3 | Existing, improved | Scoped mobile action areas, collapsible original review, field error focus, responsive library/watchlist controls | Automated checks passed at four widths and three locales; actual browser zoom and physical keyboard/PWA remain unverified |
| C1 | New | Owner-persisted validated URL-query views, CRUD, chips, changed-state and bounded limits | Verified: runtime/unit/API limits, ownership and browser CRUD/filter flow |
| C2 | Existing search, improved | Bounded actual-match snippets and source metadata; safe text rendering and Unicode offsets | Verified: Unicode/long-query units, strict legacy compatibility, safe browser text and measured query plans |
| C3 | New | Explicit exclusive whole-transaction links, immutable versioned plan snapshots/history, decimal comparison, retrospective and invalidated states | Verified: domain/API precision, snapshots/ownership and browser baseline/history/Review/read-race flows |

## Main implementation paths

- `apps/api/src/ledger.ts`, `portfolio-attention.ts`, `portfolio-exposure.ts`; `apps/web/app/routes/holdings.tsx` and portfolio section components.
- `apps/web/app/account-resource.ts`, `session.ts`, `overview.tsx`.
- `apps/web/app/routes/trade-plan.tsx`, `trade-plan-draft.ts`, `draft-lifecycle.ts`, `trade-plan-execution-evidence.tsx`.
- `apps/api/src/diary-review.ts`, `investment-thesis.ts`, `review-queue.ts`; Web review continuation/session/time/reschedule helpers and diary/thesis routes.
- `apps/api/src/diary-list.ts`, `diary-search.ts`, `diary-saved-views.ts`, `watchlist.ts`; corresponding library/watchlist routes, copy and CSS.
- `apps/api/src/trade-plan-execution.ts`, `packages/domain/src/trade-plan-execution.ts`, shared runtime contracts, generated OpenAPI/client and DB schema.

## APIs, migrations and compatibility

New routes include `/api/portfolio/ledger`; versioned diary `/review-workflow` and `/review-schedule`; thesis `/review-schedule`; `/api/diaries/saved-views` and item mutations; watchlist `/reorder`; plan `/execution`, `/execution-baseline`, `/execution-baselines` and `/execution-candidates`. Existing strict plan/diary responses remain compatible. Thesis full writes and review writes accept optional expected timestamps for legacy consumers; the Web always sends them. New narrow schedule and execution writes require concurrency tokens.

Both portfolio aggregates attach `X-Portfolio-Ledger-Revision`. No global ledger projection/cache was introduced. Saved query payloads have schema version 1, exclude pagination and untrusted URLs, and enforce 20 views/account and 80-character names. Duplicate view names within an owner return 409; another owner may use the same name. The Web opts into watchlist management response fields with `X-Watchlist-Features: management-v1` and search snippets with `X-Diary-Search-Snippet: 1`. Without those headers, new keys are omitted for existing strict consumers. The new runtime fields are optional for gradual rollout.

Additive unpublished migrations:

- `0040_bitter_alice.sql`: execution baseline, execution and transaction relation tables, immutable snapshots, ownership and uniqueness constraints.
- `0041_woozy_masque.sql`: saved views and persisted watchlist pin state.
- `0042_youthful_prima.sql`: internal thesis `review_pending` marker; no public response field.

Apply the complete chain before serving new API/Web assets. Execution comparisons do not rewrite ledger records. Deleted or edited selected transactions remain visibly missing/changed through immutable snapshot identifiers and require explicit confirmation. Historical maximum-position units remain unknown. No fee, FX, corporate-action, stop-trigger or strategy-performance inference is made.

## Performance evidence

Environment: local macOS, Node v26.4.0, disposable loopback PostgreSQL, synthetic owners/data and controlled market fixtures. Each dedicated API measurement uses one warmup and five samples; elapsed HTTP time includes response-body consumption. The reported p95 is the maximum of five samples, not a production percentile estimate. Browser, build and dedicated performance runs are serialized. Final measurements use `--no-file-parallelism` so the two measurement files do not compete. The intermediate parallel-file probe is not used in this table.

### Portfolio

The old five endpoints and new two aggregates were run against the same synthetic owner and checked for matching financial payload projections. SQL logging observes full ledger reads; one replay per read is established by call-path inspection, not a replay spy.

| Holdings / transactions | Requests | SQL statements | Full ledger reads / inferred replays | p50 before → after | p95 before → after | Bytes before → after |
| --- | --- | --- | --- | --- | --- | --- |
| 20 / 1,000 | 5 → 2 | 18 → 12 | 5 → 2 | 23.74 → 11.56 ms | 28.72 → 12.06 ms | 17,980 → 18,154 |
| 100 / 10,000 | 5 → 2 | 18 → 12 | 5 → 2 | 185.12 → 81.59 ms | 196.32 → 82.53 ms | 47,069 → 47,243 |

Provider calls including warmup remain 20 and 100 respectively, thanks to the existing provider cache/single flight. Each new aggregate replays once; two independently fetched aggregates intentionally replay twice overall so ledger rendering does not wait for quote providers.

Development browser observation recorded 19 total API requests before portfolio integration (12 portfolio), versus 8 after integration (one ledger, one overview, one account, one settings and two each of the alert reads). Development StrictMode/session bootstrap explains why observed traffic differs from the static logical five-to-two chain. Account-resource work had begun before the first browser capture, so this is not a clean before-A2 measurement.

### Diary picker and search

Fixtures contain 1,000 or 10,000 diaries, with every hundredth body approximately 50,000 characters and a late body match. Each endpoint reads at most 20 results. The picker changes from one full-list request to one summary request, issued only when opened; it does not download all pages to locate an older diary.

| Diary count | Picker bytes full → summary | Picker SQL full → summary | Current full/summary p50 | Search bytes before → after | Search SQL before → after | Search p50 before → after | Search p95 before → after |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1,000 | 60,711 → 5,506 | 9 → 8 | 5.88 / 4.77 ms | 4,783 → 8,093 | 8 → 8 | 10.23 → 23.48 ms | 11.06 → 25.12 ms |
| 10,000 | 60,791 → 5,586 | 9 → 8 | 9.91 / 8.63 ms | 9,544 → 16,164 | 8 → 8 | 48.89 → 72.33 ms | 54.02 → 75.76 ms |

Actual snippet/source metadata increases search payload and computation. It does not introduce per-result queries. EXPLAIN ANALYZE/BUFFERS JSON for the actual parameterized owner/search count and paginated row expressions is preserved. At 10,000 diaries, the count uses `diaries_user_id_idx` and the paged query uses `diaries_user_date_key` with incremental sort; the 1,000-row count chooses a sequential scan. The indexed stock-relation branch uses `diary_stocks_stock_diary_idx`. Existing indexes and frozen large-search gates remain in place; no unmeasured index claim or new search service is introduced.

Dedicated final measurements are preserved under `.scratch/trade-basic-integrated-improvements/evidence/dedicated/`, with reference diary results under `evidence/reference/`. Other integration runs may overwrite the convenience copies at the evidence root; they are not used for timings here.

### Route bundle cost

The production build passed. The table counts each route, root and entry manifest-listed module/import/CSS once, with gzip calculated per file. This is a reproducible cold manifest footprint, not observed network transfer or lazy interaction cost. Trade Plan route modules are 66-byte re-export stubs, so their module-only size hides the shared editor; the cold footprint includes it.

| Route | Route module bytes before → after | Manifest cold gzip bytes before → after |
| --- | --- | --- |
| holdings | 25,388 → 29,602 | 270,722 → 273,884 |
| trade-plan | 66 → 66 | 260,962 → 273,525 |
| trade-plan-new | 66 → 66 | 260,962 → 273,525 |
| diary-list | 9,334 → 21,918 | 260,784 → 265,950 |
| watchlist | 9,874 → 18,177 | 261,502 → 266,146 |
| reviews | 12,541 → 13,362 | 264,517 → 269,099 |
| diary-review | 16,127 → 26,632 | 265,282 → 278,826 |
| thesis | 7,656 → 9,195 | 262,213 → 270,788 |
| quick | 696 → 696 | 256,107 → 257,398 |

These features increase client code; no bundle reduction is claimed. The watchlist browser regression confirms that a row move and same-item undo issue mutations without another full-list GET.


## Regression and browser evidence

| Gate | Result |
| --- | --- |
| `npm run lint` / `npm run typecheck` | Passed |
| `npm run contracts:check` | Passed; generated schema/client drift check |
| `npm run test:unit` | 116 files, 1,015 tests passed |
| `npm run test:integration` | 94 files passed, 400 tests passed, two optional Redis tests skipped (`RATE_LIMIT_TEST_REDIS_URL` unset) |
| `npm run build` | Passed, Web client/server and API artifacts |
| `npm run test:e2e` | Full run: 268 passed, 12 failed; all 12 failures corrected and rerun as described below |
| Targeted Chromium correction suite | 32/34 passed initially; both remaining tests subsequently passed individually; includes two new Trade Plan race regressions |
| `npm run test:e2e:webkit:critical` | 10/10 passed on the final full rerun |
| `npm run test:e2e:release` | 10/10 passed on the final full rerun; the first run used a stale linked-diary select control |
| `npm run manifests:check` | Passed, 12 manifests |
| `npm run native:proof:test` / `native:proof:typecheck` | Passed: 19 tests and native TypeScript |
| `npm run native:packages:test` / `native:proof:compile` | Passed: 83 runtime/type exports in a fresh offline consumer; iOS and Android Metro exports |
| `npm run db:restore-smoke` | Passed: schema 42 → 43, restored fixture/seed checks, invalid restore rejected with zero residual public tables |

The complete Chromium suite was executed once on the stable integrated source, then affected files were rerun after corrections. The 12 failures were stale selectors, old review mutation mocks, a moved disclosure link and an account-cache fixture that assumed a duplicate `/auth/me` call. The correction run additionally exposed an over-broad test selector edit, which was restored for Timeline, and required the Overview fixture to wait for route completion after advancing a browser clock installed before module load. The corrected Overview test asserts that a failed account request actually occurred. Existing failure, precision, research, draft, authorization, theme and navigation assertions remain; none were removed to obtain a pass. The final two Trade Plan regressions verify same-mounted route identity/404 and a delayed revision N read released after saving N+1. The final source does not have a second single all-green full-suite run; acceptance combines the completed full run with documented affected-file reruns.

A diagnostic full Chromium run was deliberately interrupted after failures exposed outdated headings/timezone fixture cache setup and evolving source/server skew. A later focused run found a mobile plan action overlap, 200% text overflow in watchlist, plan post-save navigation blocking and an authentication error presentation regression. These are treated as failures requiring fixes and reruns, not passes. Existing assertions were retained; fixture settings writes now reload the browser because direct `page.request` mutations bypass the browser resource invalidation path.

The first WebKit run passed 9/10; one mobile navigation setup lost its Email field before native form validation, so no login POST occurred. Stronger pre-submit value assertions were added without changing product authentication, timeouts or retry counts. A full rerun passed 10/10. Independent source review found no concrete remount or state-clear defect; the one-off WebKit input observation remains recorded rather than attributed to an invented fix.

Before screenshots were captured from the clean reference checkout. After screenshots and request logs are stored under the current evidence directory. Four widths (1440, 768, 390, 360), three locales, light/dark, keyboard focus, long titles, reduced motion and 200% root text scaling are exercised. Root text scaling is not equivalent to an actual browser zoom test. A standalone headless Chromium probe confirmed that Meta+Equal leaves innerWidth/devicePixelRatio/visualViewport.scale unchanged; CDP pageScaleFactor changes pinch scale only. Neither is reported as native browser UI zoom acceptance. Actual screenshots were inspected in addition to automated overflow checks. The Impeccable detector was run once over 25 changed UI files; it returned two accent-border warnings (exit 2). Both new execution-state side borders were removed, retaining explicit changed/missing text and semantic text colors. This is a documented manual remediation, not a claimed clean rerun.

## Boundaries and release notes

All browser results use desktop browser viewport emulation, not physical devices. Physical mobile keyboards, installed PWA behavior, actual browser zoom and production capacity remain unverified. No live provider or real user data was used. No production rollout was performed. The local database test helper rejects non-loopback hosts and creates random isolated databases; direct commands do not load the product `.env`.

Independent Sol review identified and drove corrections for portfolio snapshot identity, full thesis-write concurrency, completed-queue pagination, pending-review health, consumer cancellation, account-transition isolation and execution-draft preservation. The final same-mounted plan route race and execution revision race were corrected and independently re-reviewed: route identity gates drafts/rendering, and accepted execution revisions advance synchronously before React state updates. Both final Trade Plan browser race regressions passed. All requested local gates were executed, with the exact first-run failures and successful reruns documented above. There is no known remaining functional blocker from this scoped review. Manual device/zoom boundaries and the one-off WebKit input observation remain explicit limitations.

## Evidence index and final source state

All evidence lives under `.scratch/trade-basic-integrated-improvements/evidence/`:

- `source-state.json`: exact HEAD, branch and SHA-256 manifest of changed source/config/test files; this is an uncommitted working tree, not a release commit.
- `reference/`: clean-reference screenshots for diary, quick capture, plan, review, library and watchlist at 1440/768/390/360, reference search plans and bundle accounting.
- `before/` and `after/`: portfolio request logs and screenshots, responsive three-flow captures, three-locale doubled-text captures, and plan execution/history screenshots. Key inspected outputs include `after/stocks-390.png`, `after/plan-execution-390.png`, `after/plan-execution-1440.png` and `after/watchlist-text-200-zh-TW.png`.
- `dedicated/`: final serialized API measurement JSON, including actual SQL plans.
- `bundles-after.json`: final build footprint using the same measurement script as the reference.
- `impeccable-detect.json`: the single detector run and its two manually remediated warnings.
- `logs/`: full commands' output, including failed diagnostic runs and successful reruns. Final timing input is `trade-basic-performance-serial-final.log` (four tests, 8.74 seconds).
- `test-generated/`: this run's copies of historical screenshot outputs. All 143 tracked historical PNG changes were restored byte-for-byte from HEAD after preserving these copies. No historical acceptance report, frozen baseline, published migration, CI policy, production manifest or parent PRD was changed.

Restore smoke final evidence: `migration_N=0041_woozy_masque schema_N=42 schema_N_plus_1=43 fixture=2|1|1|1|1|1|1|1 seed=24|213 n1_restore_ledger=43 invalid_restore_exit=1 failed_target_public_tables=0`.

## Pre-commit review follow-up

The user requested a final review and local commit after the integrated acceptance run. The 113-file source/config/test manifest matched the verified snapshot at review start. A focused independent API/data-integrity review and a parent review of Web read/write ordering were performed.

The Web review found a delayed Watchlist refresh could replace a newer confirmed row mutation and remove the same-item undo prompt. The follow-up preserves row-level interactions while rejecting reads that started before a newer confirmed write. A deferred-refresh/remove/undo browser regression accompanies the correction. The independent API review also found that implicit restoration of an archived watchlist item could reuse an occupied order key. The common restoration helper now shifts following active rows under the existing owner lock, preserving the restored position and avoiding duplicate keys across legacy POST, evidence, note and agent entry points. The new integration regression first failed with `[0, 0]` instead of `[0, 1]`, then passed after the correction. Independent re-review found no remaining blocker in that fix.

Follow-up verification passed: 22 integration tests across Watchlist, evidence, stock notes, API keys and timeline capture; four Chromium library/watchlist tests, including the deferred refresh regression; ESLint; TypeScript; and the Web/API production build. The final bundle table was regenerated after these corrections. Generated historical screenshots were preserved locally and restored from HEAD. Original full-suite results and limitations above remain historical evidence; this follow-up does not claim a fresh full-suite rerun. The user explicitly authorized the subsequent local commit; no push or deployment is included.
