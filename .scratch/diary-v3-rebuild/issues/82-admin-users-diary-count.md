# [82] Return exact per-user Diary counts in Admin inventory

Status: done
Type: Bug

## Parent

[Full rebuild PRD](../PRD.md)

## Problem

The Admin user list's correlated Diary count resolves an unqualified `id` to the inner `diaries` table. The resulting count is not correlated to the outer user row, so users can receive identical or incorrect counts.

## Acceptance criteria

- [x] Qualify the count predicate against the outer `users.id` while preserving the `diaryCount` response contract.
- [x] Add disposable-PostgreSQL HTTP coverage with two users holding different numbers of Diaries and assert each exact count.
- [x] Tighten the Admin browser assertion to check the Diary count cell exactly.
- [x] Run the focused HTTP integration and Admin browser suites; record results.

## Evidence

The original observed failure is recorded in [the UI consistency defect note](../../ui-consistency/admin-users-diary-count-mismatch.md).

## Execution — 2026-09-25

- `npm run typecheck` passed.
- `npx vitest run tests/integration/admin-users-http.test.ts` passed: 3 tests against a disposable local PostgreSQL database.
- `npx playwright test tests/e2e/markdown-typography.spec.ts tests/e2e/portfolio.spec.ts tests/e2e/admin-users.spec.ts tests/e2e/workspace-navigation.spec.ts` passed: 10 tests. The Markdown fixture selects the Public article access option through its labeled control; Portfolio's retry fixture holds all requests at 500 until keyboard focus, then returns 200 after Enter; Research Studio is included in the admin navigation order assertion.
- The initial focused E2E run exposed an exact accessible-name mismatch in the Markdown Public selector. The label locator now permits its associated option text; the full focused rerun passed.

No live market provider or LLM was used. The browser harness uses the repository's synthetic provider fixtures.
