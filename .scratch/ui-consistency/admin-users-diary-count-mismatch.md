# Admin users E2E diary count mismatch

Date: 2026-09-06

The admin-users test was rerun after making the initial settings hydration wait explicit. The role selector was then available, but the existing assertion at `tests/e2e/admin-users.spec.ts:51` still failed:

- The target account's diary POST returned `201`.
- The admin recent-diaries section rendered `Synthetic admin diary` and attributed it to the target account.
- The target account row rendered `diaryCount` as `0`.
- The test assertion expects the row to contain `1`.

This is an observed mismatch between two existing admin projections. The current API source still computes `diaryCount` in `apps/api/src/admin-users.ts`; no backend, contract, schema, or business-flow change was made because this UI consistency task excludes that scope. The test assertion remains unchanged so the mismatch is not hidden or weakened.

The settings hydration race fix is separate: `tests/e2e/admin-users.spec.ts` now waits for the initial successful `GET /api/user/settings` response before selecting English after direct API login.
