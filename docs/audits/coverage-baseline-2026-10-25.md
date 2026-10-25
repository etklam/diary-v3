# Coverage baseline — 2026-10-25

Recorded for [ticket 125](../../.scratch/diary-v3-rebuild/issues/125-measure-and-floor-coverage.md),
which asked for the measurement *before* any threshold, on the grounds that the honest
number comes from the baseline run. It does, and it is lower than a guess would have been:
the first draft of this change proposed a 55% line floor, which the measurement showed to
be 23 points above reality.

## Command

```
npm run test:coverage
# = vitest run --exclude 'tests/integration/**' --exclude 'tests/e2e/**' --coverage
```

Provider `@vitest/coverage-v8@5.0.0`, pinned to the `vitest` version. 142 test files /
1,253 tests passed. Scope and exclusions are in `vitest.config.ts`.

## The measurement

| Area | Lines | Branches | Functions | Statements |
| --- | --- | --- | --- | --- |
| `packages/domain` | **94.5%** | 82.3% | 93.9% | 92.5% |
| `packages/contracts` | **93.6%** | 49.8% | 56.9% | 92.6% |
| `packages/db` | 36.4% | 0.0% | 0.0% | 36.1% |
| `apps/api` | 29.9% | 22.0% | 29.0% | 28.3% |
| `apps/web` | **5.9%** | 6.6% | 4.9% | 5.9% |
| **Total** | **28.5%** | 20.8% | 22.5% | 27.3% |

**Re-measured after the Prettier pass.** The first measurement of this baseline
ran before ticket 127 formatted the tree, and reported 32.5% lines. Formatting
expanded deliberately dense one-liners — some over 5,000 characters — so the
line denominator grew without a single statement changing, and the same suite
read 28.5%. The floors below are derived from the post-format numbers, which is
the tree the gate actually runs against. Nothing about test coverage changed;
this is the metric's denominator moving, and it is worth recording because a
4-point drop with no cause would otherwise look like a regression.

Named security- and correctness-critical modules:

| Module | Lines | Branches | Functions | Statements |
| --- | --- | --- | --- | --- |
| `apps/api/src/rate-limit/**` (5 files) | 60.8% | 58.1% | 62.0% | 58.2% |
| `apps/api/src/app-context.ts` | 54.3% | 33.3% | 45.5% | 52.5% |
| `apps/api/src/auth-session.ts` | **13.5%** | 3.3% | 3.7% | 11.9% |
| `apps/api/src/ledger.ts` | **0.0%** | 0.0% | 0.0% | 0.0% |

## Reading these numbers honestly

**This is unit-scope coverage, not total exercise.** `test:coverage` deliberately excludes
the integration and browser suites so it can run in the pre-merge gate without PostgreSQL.
Three of the low numbers are structural, not gaps:

- `apps/web` at 5.9% — the UI is verified by ~90 Playwright specs. A unit floor here would
  measure the wrong thing.
- `apps/api/src/ledger.ts` at **exactly zero** — and it is not untested. `tests/unit/ledger.test.ts`
  covers `@diary/domain/ledger`, the portable replay rules, at 95%+; `apps/api/src/ledger.ts`
  is the PostgreSQL-facing persistence layer, covered by `tests/integration/buy-ledger.test.ts`,
  `sell-ledger.test.ts` and `ledger-corrections.test.ts`. The split is the architecture
  working: rules are portable and unit-tested, persistence is integration-tested.
- `apps/api/src/auth-session.ts` at 13.5% — covered by
  `tests/integration/auth-session-service.test.ts` and the session suites, which need a
  database to mean anything.

The ticket asked whether the security-critical modules carry tests proportional to their
risk. In the unit scope the answer is no, and that is the correct answer for a different
reason than it looks: their risk is in what they do to rows, and rows need a database.

## Floors set, and the two deliberately not set

Each floor is the baseline above rounded down a few points, so ordinary refactoring does
not trip it. See `vitest.config.ts`.

| Scope | Floor (lines / branches / functions / statements) |
| --- | --- |
| Global | 26 / 18 / 20 / 25 |
| `packages/domain/src/**` | 91 / 78 / 90 / 89 |
| `packages/contracts/src/**` | 90 / 45 / 52 / 88 |
| `apps/api/src/rate-limit/**` | 57 / 54 / 58 / 54 |
| `apps/api/src/app-context.ts` | 50 / 30 / 42 / 49 |

**`auth-session.ts` and `ledger.ts` have no floor**, though the ticket names both. A floor
derived from a 0% baseline is not a floor, and a floor derived from a measurement that
structurally cannot see their tests would be a false guarantee. What they need is a coverage
run that includes the integration suite — which needs PostgreSQL, unavailable when this
baseline was taken. That run is the prerequisite, and until it exists this is an open gap
rather than a satisfied criterion.

## Verification that the gate bites

Both tiers of threshold were proven to fail, not assumed to:

```
# global
ERROR: Coverage for lines (32.53%) does not meet global threshold (95%)
# per-directory
ERROR: Coverage for lines (95.14%) does not meet "packages/domain/src/**" threshold (99%)
```

Both were temporary experiments; the committed configuration passes.

The gate also bit for real: after the Prettier pass the global line floor of 30
failed at 28.47%, which is how the denominator shift above was noticed rather
than guessed.
