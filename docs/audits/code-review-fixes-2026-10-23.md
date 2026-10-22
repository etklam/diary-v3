# Code review corrections — 2026-10-23

## Scope

This follow-up implements the seven findings from the repository review. It does not authorize production deployment or modify the original rebuild PRD. All verification uses synthetic data, injected provider responses, and disposable local PostgreSQL databases.

## Corrections

1. Browser session guards now include `/api/goals` and its child paths. Reads and writes are blocked during local sign-out, and responses issued under an ended identity are discarded.
2. Guru worker recovery and failure settlement are owned by the successful attempt transition from `dispatched` to a terminal state. Reaping an already-settled attempt cannot increment unknown usage twice. Losing a lease preserves the call slot until the provider deadline. Completion validates and locks the run before changing the attempt.
3. Guru historical context includes only quarters earlier than the selected period.
4. Public Guru analysis freshness compares the complete input hash, including profile, consensus, and historical data. A retained result remains readable with `STALE` status when any captured input changes.
5. Goal achievement dates and deadline labels use the owner's configured timezone. A single API operation uses one timestamp; re-confirmation preserves the original achieved date. Achievement handoff uses the server response date and still requires an explicit save.
6. Partner invitations compare email addresses case-insensitively, consistent with login and the existing unique email index. Self-invite, duplicate-invite, ownership, and recipient acceptance checks remain enforced.
7. `.gitattributes` fixes text checkout line endings to LF. Existing shell scripts and generated protocol files were restored to LF; their canonical tracked content is unchanged. This removes Linux shell syntax failures and line-ending-only OpenAPI drift.

The Guru consensus fixture now aligns the rebuild request deadline with its injected clock. The previous fixture could skip consensus preparation because a database trigger used wall-clock time.

## Current verification

Runtime: Linux Node.js 24.22.1. PostgreSQL 18.6 was unpacked under `/tmp` and bound only to loopback; each integration suite creates and drops its own uniquely named database. No production service or user data was used.

| Command | Result |
| --- | --- |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm run test:unit` | Passed: 135 files, 1,204 tests |
| `npm run build` | Passed: typecheck, Web production artifacts, and API bundles |
| `npm run contracts:check` | Passed: OpenAPI and generated API client |
| `npm run design:check` | Passed |
| `npx vitest run tests/integration/goals-http.test.ts` | Passed: 6 tests |
| `npx vitest run tests/integration/partner-http.test.ts` | Passed: 9 tests |
| `npx vitest run tests/integration/guru-analysis.test.ts` | Passed: 10 tests |
| `npx vitest run tests/integration/ai-reports-budget.test.ts tests/integration/ai-reports-jobs.test.ts tests/integration/achievements-http.test.ts tests/integration/web-session.test.ts --maxWorkers=2` | Passed: 4 files, 37 tests |
| `npx playwright test tests/e2e/goals-timezone.spec.ts` | Harness started; both cases stopped at browser launch because Chromium headless shell was absent. Browser assertions did not run. |

The focused integration commands use `DATABASE_URL=postgresql://diary@127.0.0.1:55433/diary_v3` against the temporary local server. Tests required execution outside the network-restricted sandbox. The earlier native fixture `git EPERM` failures disappeared when the full unit suite was run with the required subprocess permissions.

The official Playwright Chromium download repeatedly timed out. The smaller headless-shell download and a direct official storage connectivity check also failed to make progress. Browser acceptance therefore remains unverified in this environment; the two new fixed-clock cases are committed for execution where the required runtime is available. The full browser matrix, WebKit, Docker-image release smoke, and production operations were not exercised.

## Review

An independent read-only review accepted the Guru accounting/lease changes, full-input freshness, goal timezone handling, server-authoritative handoff, and browser identity guards without blocking findings. The primary agent separately reviewed the Partner query and HTTP regression. This record reports only the scope and commands executed for this change.
