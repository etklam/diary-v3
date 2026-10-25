import { defineConfig } from 'vitest/config'

// Remote test stores (SSH-tunneled VPS Postgres/Redis) inflate every DB
// round-trip to ~100-150ms, so schema-per-suite provisioning exceeds local
// defaults. Opt in with REMOTE_TEST_DB=1; local runs keep fast-fail defaults.
const remoteDb = process.env.REMOTE_TEST_DB === '1'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    testTimeout: remoteDb ? 240_000 : 20_000,
    hookTimeout: remoteDb ? 300_000 : 30_000,
    // Parallel workers saturate the SSH tunnel and starve per-suite
    // provisioning; two workers keep remote runs stable.
    maxWorkers: remoteDb ? 2 : undefined,
    // Coverage measures the unit scope only, because `test:coverage` must run
    // without PostgreSQL to live in the pre-merge gate. Modules exercised
    // mainly through integration tests therefore read low here by construction
    // — `auth-session.ts` is the clearest case. The thresholds below are
    // derived from that same unit-only measurement, so they are consistent with
    // it; they are not claims about total exercise.
    // Baseline and method: docs/audits/coverage-baseline-2026-10-25.md
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      include: [
        'apps/api/src/**/*.ts',
        'apps/web/app/**/*.{ts,tsx}',
        'packages/contracts/src/**/*.ts',
        'packages/domain/src/**/*.ts',
        'packages/db/src/**/*.ts',
      ],
      exclude: [
        // Generated from the contracts; hand-written tests do not own it.
        'packages/api-client/src/**',
        // Long-running CLI entrypoints: a worker loop's `main` is covered by
        // its service's tests, not by invoking the process.
        'apps/api/src/*-cli.ts',
        '**/*.d.ts',
      ],
      // Every number below is the measured baseline rounded down by a few
      // points, never a target someone liked the look of. Baselines are in
      // docs/audits/coverage-baseline-2026-10-25.md; raise a floor only with a
      // fresh measurement behind it.
      thresholds: {
        // Global floor catches a collapse. It is low because most of this
        // repository is verified outside the unit scope: `apps/web` is 7.6%
        // here and exercised by ~90 Playwright specs, and most of `apps/api` is
        // exercised by ~110 integration suites against real PostgreSQL. Raising
        // this number would mean writing unit tests to satisfy an average, not
        // to catch a defect.
        lines: 26,
        branches: 18,
        functions: 20,
        statements: 25,
        // The portable rules: pure functions with no I/O, so the unit scope is
        // the whole of their verification and the floor can be strict.
        'packages/domain/src/**': { lines: 91, branches: 78, functions: 90, statements: 89 },
        // Schemas. Branch coverage is structurally lower than line coverage
        // because a zod refinement's failure arm is only taken by a test that
        // feeds it bad input.
        'packages/contracts/src/**': { lines: 90, branches: 45, functions: 52, statements: 88 },
        // Abuse counters: a silent regression here weakens a control.
        'apps/api/src/rate-limit/**': { lines: 57, branches: 54, functions: 58, statements: 54 },
        // The shared request policy — CSRF comparison, client IP, error shape.
        'apps/api/src/app-context.ts': { lines: 50, branches: 30, functions: 42, statements: 49 },
      },
    },
  },
})
