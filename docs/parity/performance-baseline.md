# Ticket61 performance baseline (legacy vs rebuilt runtime)

Direction: `docs/agents/final-performance-acceptance.md`. This records the measurement design, equivalence decisions and gate policy for the outstanding ticket61 performance requirement. It does not claim any runtime is faster or accepted; numbers live only in the JSON artifacts.

## Artifacts

| File | Role |
| --- | --- |
| `tests/parity/performance-fixture.ts` | Dependency-free shared fixture: synthetic data formulas, per-workload result verification, 5-warmup + 30-sample sequential measurement, median/p95. Copied into the legacy snapshot so both runtimes execute identical logic. |
| `tests/parity/performance-fixture.self-check.test.ts` | In-memory vitest check for the fixture: seed invariants plus the rotation verifier accepting a well-formed monitor response and rejecting tampered/short/shifted ones. Runs with `npx vitest run tests/parity/performance-fixture.self-check.test.ts`; measures nothing. |
| `tests/parity/performance-legacy.fixture.ts` | Vitest fixture executed inside the isolated `/tmp/diary-v3-source-baseline` snapshot (as `tests/integration/http/performance-baseline.test.ts`); boots the frozen Nuxt/Nitro build against disposable MariaDB 11.4. |
| `scripts/parity/performance-run-legacy.sh` | Runs the legacy fixture using the proven disposable-MariaDB harness; writes `docs/parity/performance-legacy-runtime.json`. Never touches `parity-baseline.test.ts`, `legacy-runtime-evidence.json` or other original parity evidence. |
| `scripts/parity/performance-freeze-gates.ts` | Freezes each regression gate to `max(legacy p95 * 2, 250 ms)` from the persisted legacy evidence; writes `docs/parity/performance-gates.json`. Refuses failed/partial evidence and refuses overwrite without `--force`. |
| `scripts/parity/performance-run-rebuilt.ts` | Boots the real Hono API on an ephemeral port against a disposable PostgreSQL database, seeds the identical fixture, measures the same HTTP reads and evaluates the frozen gates; writes `docs/parity/performance-rebuilt-runtime.json`. Refuses to run without frozen gates. |

## Workloads (equivalent authenticated HTTP reads, Bearer token, login/setup unmeasured)

1. `diary-read` — `GET /api/diaries/:id` on one saved Diary with exactly 50,000 content characters; every response checked for title and full 50,000-char content.
2. `diary-search` — `GET /api/diaries?search=zephyr&page=1&limit=20&sortBy=date-desc` over 1,000 diaries. `zephyr` is a non-stopword, non-wildcard term occurring (case-insensitively, content) in exactly 100 rows; every response must report `pagination.total = 100`, a bounded page of 20, and the expected page rows.
3. `ledger-holdings` — `GET /api/stocks/holdings` replaying 1,000 BUY transactions across 20 symbols (50 × quantity 10 per symbol, prices 10 + index × 1.25). Every response must contain the 20 open positions with exact quantity 500, `avgCost = price`, `totalCost = 500 × price`.
4. `rotation-history` — `GET /api/market/rotation-monitor?scope=core` on both runtimes, over 250 seeded `market_rotation_snapshot` dates × the full source core universe (23 symbols: 13 `core_etf` + 10 `mega_cap`/`single_stock` = 5,750 rows). The route has no `days` parameter; its supported bounded interval is the ADR-0004 two-week comparison window — the latest qualified date plus the comparison date 10 qualified dates back (threshold `ceil(23 × 0.9) = 21`, so all 250 seeded dates qualify). Every response must report `asOfDate` = newest seed date, `comparisonDate` = 11th newest seed date, all 23 core rows with exact seeded values (name, groupType, sectorName, lastPrice, rsi14, percentFromHigh, rotationScore/rank and deltas, above20d/above50d, maStatus, signalStatus), and each row's 11-point `twoWeekTrend` with exact ascending dates and value 100 (constant per-symbol prices normalize to the base).

All fixtures are synthetic and deterministic (fixed anchor date 2026-09-05, no RNG, no live market network, disposable isolated databases). Statistical protocol: 5 warmups + 30 measured sequential requests per workload; median = mean of the 15th/16th ordered samples, p95 = nearest-rank (29th of 30). Environment (Node, app mode, DB version, CPU model/count, memory, OS, hostname — no secrets), fixture sizes and the protocol are recorded in every evidence file.

## Equivalence decisions and exclusions

- **Portfolio/ledger read**: the ledger-derived holdings read (`/api/stocks/holdings`) is measured on both runtimes. The portfolio *valuation* endpoint (`/api/stocks/portfolio`) is excluded because the frozen legacy quote seam (`lib/market-data/cache.ts` + `lib/yahoo-finance.ts`) is an in-memory cache over the live Yahoo client; fixture prices cannot be injected without modifying the frozen source, and hitting real Yahoo would violate the controlled-provider requirement. The rebuilt runtime keeps its injectable fixture provider for functional tests (e2e harness), which is not comparable evidence.
- **Search semantics**: both runtimes implement case-insensitive `contains` over Diary title OR content (legacy Prisma `contains` under the MariaDB CI collation; rebuilt `ilike`). The marker term is embedded case-varied (`ZEPHYR`) so both semantics are exercised by the same 100-row fixture.
- **Core rotation window**: both runtimes run the same ADR-0004 domain logic (the rebuilt `packages/domain/market-rotation/*` modules are ports of the frozen source `lib/market-rotation/*` — qualification threshold `ceil(N × 0.9)`, `COMPARISON_OFFSET = 10`, and `price / comparison-price × 100` rounded to 4 dp are identical). No breadth rows are seeded, so both runtimes resolve `marketState = 'unknown'`; the rebuilt route's real `now()` needs no fake clock because every seeded date is ≤ the fixed anchor 2026-09-05. Response fields present in only one contract (e.g. the rebuilt top-level `betaAllocation`) are not asserted.

## Procedure (in order, on a quiet host — no parallel builds or browser suites)

```bash
# 1. Persist legacy measurements first (boots the frozen Nuxt build + disposable MariaDB via Docker).
bash scripts/parity/performance-run-legacy.sh

# 2. Freeze gates BEFORE any rebuilt-runtime measurement or tuning.
node --import tsx scripts/parity/performance-freeze-gates.ts

# 3. Measure the rebuilt runtime against the frozen gates.
node --import tsx scripts/parity/performance-run-rebuilt.ts
```

Gates are frozen before rebuilt results exist and are never revised afterwards; `performance-freeze-gates.ts` refuses overwrite without `--force`, and any forced refreeze must be recorded in ticket61 with its reason. Failed observations are preserved: both runners write their JSON evidence before failing, exit non-zero, and gate/verification failures name the affected workloads. Only affected workloads are rerun after a real fix. Setup failures (Docker, snapshot dependencies, database migration) are reported as setup failures; SQL timings are never substituted for HTTP claims.

### Partial rerun (workload-specific verifier fix)

The first legacy observation (2026-09-06, run96453) verified diary-read, ledger-holdings and rotation-history; only the diary-search verifier failed (it compared lexicographically sorted titles instead of the date-desc marker order — fixture bug, not a runtime defect; raw record kept at `docs/parity/performance-legacy-first-observation.json`). To rerun only the fixed workload and carry the three verified records forward unmodified:

```bash
PERFORMANCE_WORKLOAD=diary-search \
PERFORMANCE_PRIOR_EVIDENCE="$repo_root/docs/parity/performance-legacy-first-observation.json" \
PERFORMANCE_RERUN_REASON='diary-search verifier row-order fix (fixture bug, first observation run96453)' \
bash scripts/parity/performance-run-legacy.sh
```

The merged evidence sets `workloadProvenance: { partialRerun: true, measuredWorkloads: ['diary-search'], rerunReason, reused: { source, workloads, note } }`; reused records are byte-copied from the prior observation. Gates freeze only from all-verified evidence.

## Limitations

- Reproduction requires Docker for disposable MariaDB and the local disposable PostgreSQL at `127.0.0.1:55433`. Run sequentially on a quiet host. Typecheck, targeted ESLint, fixture self-checks and both runtime measurements passed.
- The measured MariaDB/Prisma environment passed exact date/order verification. Different database timezone configuration requires the same checks on reproduction.
- Local sequential single-client latency only; this is a regression gate baseline, not a capacity or concurrency benchmark.

## Completed measurements — 2026-09-06

Legacy corrected search rerun exited0; three original verified workloads were retained with explicit provenance. Gates were then frozen before the rebuilt runner started. The rebuilt runner exited0: all4workloads verified and met the frozen250ms p95 gates (Diary4.38ms, search12.46ms, holdings5.76ms, rotation10.30ms). Raw artifacts: `performance-legacy-first-observation.json`, `performance-legacy-runtime.json`, `performance-gates.json`, `performance-rebuilt-runtime.json`. The fixture self-check4/4, targeted lint and TypeScript check passed.
