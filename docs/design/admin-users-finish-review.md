# Admin users implementation review

Status: implementation and controlled acceptance evidence recorded; parent/root review remains required.

The admin surface is `/admin/users`. It keeps account management behind the fresh server-side ADMIN check, presents system counts and recent Diary activity, uses explicit role Save and delete confirmation controls, and disables self role/delete actions after reading the current account from `/api/auth/me`. The admin Diary projection intentionally omits private Review fields.

Evidence:

- `tests/integration/admin-users-http.test.ts`: 2/2 disposable PostgreSQL HTTP tests pass. They cover search ordering, permission boundaries, role freshness, private projection exclusion, statistics, cascade deletion, HTTP/native/API-key invalidation, and survivor isolation.
- `tests/e2e/admin-users.spec.ts`: 2/2 Chrome tests pass in 8.5s. The controlled flow loads real admin API responses, creates a synthetic Diary for recent activity, changes a target role with explicit Save, rejects self deletion, deletes the target after confirmation, checks ordinary denial, and verifies 1440/390 overflow. Captures are `docs/design/evidence/admin-users/1440.png` and `390.png`.
- Route/nav/session wiring is in `apps/web/app/routes.ts`, `apps/web/app/nav.tsx`, and `apps/web/app/session.ts`; targeted ESLint and `npx tsc --noEmit --pretty false` pass at this checkpoint.

No production users or services were used. Root owns final ticket status and independent visual/acceptance review.
