# Static Bottleneck Remediation

Date: 2026-09-15  
Review baseline: `f1a157fd3f1169a4725bfc99b95f93a4b450d027`  
Rechecked HEAD before changes: `82ee5411dbf456744fe404c53a2505d8817178e2`

HEAD was one documentation-only commit beyond the review baseline. The diary editor, overview, market queue, price-alert checker, summary-list query, and diary search call chains were rechecked at the current HEAD. The diary-vue source and production services were not used. All database measurements and integration tests use fresh disposable PostgreSQL databases with synthetic rows.

## F01 — Text-only diary saves

**Status: reproduced and fixed.** An existing diary save always included `transactions`; the API therefore entered the ledger replacement path, locked the ledger, replayed history, and rewrote transaction rows even when only Markdown had changed.

The editor now compares the current transaction set with its canonical saved baseline. Existing diaries omit `transactions` when unchanged, while an explicit clear still sends `[]`. Creates and genuine add/change/delete operations keep the existing contract. The API's ledger lock, whole-history oversell validation, and lock order are unchanged. Uncertain-write comparison treats an omitted transaction field as unchanged, and draft recovery remains intact.

Changed files: `apps/web/app/diary-editor.tsx`, `tests/unit/diary-editor-dirty.test.ts`, `tests/integration/diary-editor.test.ts`, `tests/e2e/diary-editor-ux.spec.ts`.

Evidence: `npm run test:unit` passed (683 tests), `npm run test:integration` passed (241 tests), and `npm run test:e2e` is recorded in the final verification section. Focused database assertions count SQL calls: a text-only edit performs zero ledger-lock/full-ledger replay queries and leaves transaction rows unchanged; explicit clear takes the ledger path. Fixtures also cover empty transaction collections, add/change/delete, concurrent transaction writes, and rollback through the existing ledger-correction tests.

Before → after: text-only diary edit, one full ledger read/replay → zero; transaction rows, rewritten → unchanged. A real transaction change still replays and validates the complete ledger.

## F02 — Shared Overview valuation

**Status: reproduced and fixed.** Overview independently loaded attention and portfolio endpoints, each rebuilding holdings from a full ledger replay.

Added an owner-scoped `GET /api/portfolio/overview` composition. A read-only repeatable-read transaction obtains holdings and attention facts from one owner snapshot, then derives both sections from the single holdings result. Existing endpoints remain available. Each section retains independent data/error/retry state in the web UI, so one failed section does not hide the other. No user TTL cache was added. The new response schema, OpenAPI definition, and generated client were updated.

Changed files: `apps/api/src/portfolio.ts`, `apps/api/src/portfolio-attention.ts`, `apps/api/src/app.ts`, `apps/web/app/overview.tsx`, `packages/contracts/src/portfolio-overview.ts`, `packages/contracts/src/openapi.ts`, `packages/contracts/package.json`, `openapi/openapi.json`, `packages/api-client/src/generated.ts`, `tests/integration/portfolio-overview.test.ts`, `tests/e2e/overview.spec.ts`, `tests/e2e/daily-workspace.spec.ts`.

Evidence: the disposable-DB integration fixture asserts one replay per request: two concurrent owners produce two total replays, and a transaction update followed by reload produces one fresh replay and the new quantity. It also checks single-flight quote invocations, empty/partial/stale values, per-section failure, and independent retry. `npm run contracts:check`, `npm run test:integration`, and `npm run test:e2e` cover the changed API/UI boundaries.

Before → after: one Overview load, two ledger replays → one; after a ledger mutation, the next load recomputes from the updated ledger. Existing endpoints and quote-provider cache behavior are unchanged.

## F03 — Market queue deadlines and cleanup

**Status: reproduced and fixed.** A waiting queue entry had no wait deadline until it acquired a slot, and consumers sharing a key did not have independent cancellation lifetimes.

The queue now has configurable attempt, queue-wait, and overall deadlines (defaults: 10 s, 10 s, and 45 s), retains two active slots, caps unique waiting jobs at 256 and consumers per key at 256, and keeps the existing three-attempt limit and retry delays. Queue and overall timers are cleared on dequeue/settlement. A cancelled last consumer removes an unstarted waiter or aborts active work; remaining same-key consumers keep shared work alive. Cancellation propagates through request handlers, is not converted into stale fallback, and batch quotes rethrow cancellation rather than treating it as a symbol error. Runtime shutdown closes the provider queue before the server finishes stopping.

Changed files: `apps/api/src/market-data/queue.ts`, `apps/api/src/market-data/index.ts`, `apps/api/src/market-routes.ts`, `apps/api/src/portfolio.ts`, `apps/api/src/portfolio-attention.ts`, `apps/api/src/company-hub.ts`, `apps/api/src/etf-profile.ts`, `apps/api/src/etf-admin.ts`, `apps/api/src/app.ts`, `apps/api/src/runtime.ts`, `tests/unit/market-data.test.ts`, `tests/integration/market-state-http.test.ts`, `tests/integration/sec-filings-http.test.ts`.

Evidence: `npx vitest run tests/unit/market-data.test.ts --reporter=verbose` passed 25/25 with fake timers and controlled fetch fixtures. Coverage includes slot exhaustion, a 50 ms configured queue-wait expiry without dispatch, dequeue and timer clearing, overload caps, same-key consumers, partial/last-consumer cancellation, cleanup and re-request, retries, stale timeout fallback, cancellation without stale fallback, shutdown, and the Yahoo transport's abort propagation. The tests do not contact live Yahoo. For this deterministic test, queue wait is observed at the configured fake-clock deadline; wall-clock p50/p95 and process heap were not measured because a live-provider latency benchmark would not provide reliable evidence for queue lifecycle correctness.

Before → after: a saturated waiter's unbounded wait → bounded by its queue-wait deadline and the overall task deadline; an abandoned waiter could later consume an upstream slot → removed before dispatch. Concurrency remains 2; retry count and stale fallback remain bounded.

Residual risk: cancellation is cooperative at the upstream transport boundary. The queue aborts signals and releases its executor, but a future fetcher that ignores `AbortSignal` may continue its own external work after cancellation.

## F04 — Price-alert pending grouping

**Status: reproduced and optimized; no pagination change.** Pending alerts are still loaded as one complete rotation. Repeated `pending.some(...)` history checks were replaced with one pass that groups each symbol's moving-average-history need. Per-candidate transactions, in-lock revalidation, commit-before-emit, stale-price suppression, and the existing single-run guard are unchanged. Pagination was not introduced, so later rules cannot be starved by a fixed page.

Changed files: `apps/api/src/price-alert-checker.ts`, `tests/unit/price-alert-grouping.test.ts`, `tests/integration/price-alert-checker.test.ts`, `scripts/measure-price-alert-grouping.mjs`.

Measurement command: `node --expose-gc --import tsx scripts/measure-price-alert-grouping.mjs 5000 3 15`. Fixture: 5,000 pending rules, 5,000 unique symbols, 1,000 moving-average rules; Node v26.4.0; concurrency 1; 3 warmups and 15 timed repetitions per algorithm; first invocation reported as cold; retained result-map heap measured after forced GC.

| Measurement | Repeated `pending.some` | Single-pass grouping |
| --- | ---: | ---: |
| Cold | 81.375 ms | 0.426 ms |
| Warm p50 / p95 | 41.785 / 44.988 ms | 0.194 / 0.670 ms |
| Retained Map heap | 231,592 B | 229,744 B |

The result-map memory is effectively unchanged; the measured gain is reduced CPU work for grouping. This microbenchmark does not measure database query or transaction cost. Unit grouping tests include a 50,000-row case; integration tests retain the transaction/locking and emit-order assertions.

## F05 — Diary-summary content projection

**Status: reproduced; persistent excerpts implemented after measurement.** The list response was short, but the database projection returned full Markdown content and derived the excerpt in the API on each list request.

The schema now stores an excerpt plus the content hash it represents. API create/append/update paths write both with the content. A migration trigger invalidates the excerpt hash for legacy content-only updates. Migration startup backfills missing/stale excerpts in 50-row locked batches. The list projection returns full content only for rows with a missing or invalidated excerpt and applies the existing Markdown-aware `diaryExcerpt` rule as fallback; healthy rows use the stored exact excerpt. No SQL `left(content, N)` approximation was used.

Changed files: `packages/db/src/schema.ts`, `packages/db/migrations/0022_sturdy_sinister_six.sql`, `packages/db/migrations/meta/0022_snapshot.json`, `packages/db/migrations/meta/_journal.json`, `packages/db/src/index.ts`, `packages/db/src/migrate.ts`, `apps/api/src/diary.ts`, `apps/api/src/diary-list.ts`, `tests/support/database.ts`, `tests/integration/diary-summary.test.ts`, `tests/integration/diary-summary-migration.test.ts`.

Measurement fixture: 20 legal Markdown diaries, 500,000 characters each (10,000,000 UTF-8 content bytes); Node v26.4.0, PostgreSQL 17.6 on aarch64 Alpine; concurrency 1, five warm repetitions; PostgreSQL cache not flushed. The comparison executed the old full-content projection and the new conditional-excerpt projection against the same synthetic data.

| Measurement | Full-content projection | Persisted-excerpt projection |
| --- | ---: | ---: |
| PostgreSQL DataRow bytes | 10,001,422 B | 6,302 B |
| Absolute post-GC process heap sample | 51,711,752 B | 41,771,840 B |
| API response body | 9,033 B | 9,033 B |

Excerpt CPU on the old full-content path was 32.410 ms cold and 32.850 / 33.310 ms warm p50/p95 while deriving excerpts for the fixture. The optimized route's measured warm p50/p95 was 7.440 / 8.790 ms in its latest run; route latency is recorded separately rather than presented as a controlled before/after comparison. The heap figures are process-level post-GC samples; the optimized query's measured net heap delta was -479,416 B because garbage collection reclaimed prior allocations, so it is not interpreted as negative allocation.

Validation: `npx vitest run tests/integration/diary-summary-migration.test.ts --reporter=verbose --maxWorkers=1` passed fresh-install and existing-schema upgrade coverage, including a 251-row backfill. `npm run test:integration` also passed the excerpt create/append/update and legacy content-only update cases. Restore/manual-write paths that bypass the trigger and leave two non-null but mismatched excerpt fields are repaired on the next migration backfill; ordinary list reads intentionally do not hash full content on every request.

## F06 — Diary contains-search plans

**Status: reproduced; measured-no-change.** `diaryPageFilter()` uses escaped case-insensitive contains matching over its established fields, and count/page SQL share the same predicate. Current schema/migrations were inspected before plan capture. No GIN/trigram index or token-search substitution was made.

Changed files: `tests/integration/diary-search-plan.test.ts` only.

Fixture and conditions: 40,000 synthetic diaries (10,000 target owner, 30,000 other owner), one linked `F06SYM` row, then `ANALYZE`; Node v26.4.0; PostgreSQL 17.6 on aarch64 Alpine; serial execution; five warm `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` runs per count/page query and term; caches were not flushed. The test captures the actual Drizzle count/page SQL, asserts identical WHERE predicates, and logs existing index definitions and plan nodes.

| Search | Query | Rows returned/scanned | Warm p50 / p95 | Observed access |
| --- | --- | ---: | ---: | --- |
| `needle` | count | 10 / 10,000 owner rows | 10.220 / 10.382 ms | `diaries_user_id_idx`, 511 shared hits, 0 reads |
| `needle` | page | 10 / 10,000 owner rows | 10.362 / 10.448 ms | `diaries_user_date_key` + Incremental Sort, 581 hits, 0 reads |
| `F06SYM` | count | 1 / 10,000 owner rows | 10.224 / 10.667 ms | owner index plus correlated stock match |
| `F06SYM` | page | 1 / 10,000 owner rows | 10.239 / 13.987 ms | `(user_id, date)` index + Incremental Sort, 581 hits, 0 reads |

The captured plans use owner/date indexes and filter the target owner's rows; these observations do not establish a full-table scan. The stock-link fixture is deliberately small, so its plan is not generalized to a large association table. Count/page snapshot behavior, Chinese and short-term matching, symbol search, escaped `%`, `_`, and backslash literals, owner isolation, and title collation remain covered by integration tests. No search semantics or schema index was changed because this measured fixture did not establish sufficient benefit for a specific index.

## Verification

| Command | Result |
| --- | --- |
| `npm ci` | Passed; installed 493 packages. npm reported two install scripts requiring approval, but neither was needed for this run. |
| `npm run contracts:check` | Passed. |
| `npm run lint` | Passed after fixing lint findings in the new benchmark script and search-plan test. |
| `npm run typecheck` | Passed. |
| `npm run test:unit` | Passed: 76 files, 683 tests. |
| `npm run test:integration` | Passed: 66 files, 241 tests, using disposable local PostgreSQL databases. |
| `npm run test:e2e` | Passed: 201 tests (13.6 minutes, one worker). |
| `npm run build` | Passed (typecheck, React Router client/server build, API build). |
| `npm run native:proof:test` | Passed: 2 files, 19 tests. |
| `npm run native:proof:typecheck` | Passed. |
| `npm run native:proof:compile` | Passed: Expo export for iOS and Android. |
| `npm run native:api:test` | Passed: 1 API acceptance test against a disposable local PostgreSQL database. |
| `npm --cache=/private/tmp/diary-v3-npm-cache run native:packages:pack` | Passed: packed contracts, api-client, and domain with provenance. |
| `npm --cache=/private/tmp/diary-v3-npm-cache run native:packages:test -- --packages-dir dist/native-packages` | Passed: fresh offline install from the tarballs; 71 runtime and 71 type exports imported. |

The host's default npm cache has root-owned entries, and a new temporary cache starts without npm registry metadata. The package gates therefore used a writable `/private/tmp` cache populated only with the required cached package metadata/tarballs; no ownership or permission changes were made to the user's npm cache.

## Residual risks and scope

- F03 queue cancellation relies on upstream transport observing `AbortSignal`; see the F03 note above.
- F05 trigger-bypassing restores/manual SQL can leave a stale non-null excerpt/hash pair until migration backfill. The repository migration path repairs missing or mismatched content hashes without hashing each full diary during every list request.
- F06 plan results are warm-cache measurements on one synthetic 40,000-row fixture, not a production workload. A different data distribution may justify another measured plan review.
- F04 keeps full pending-rule loading and per-candidate transactions; this change only removes repeated in-memory grouping work.
- No production traffic, real user data, live Yahoo calls, deployment, or force-push was used.
