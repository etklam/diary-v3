# Stable browser session recovery

Status: accepted

Web refresh tokens remain stable across tabs. Expired or invalid ambient access cookies can recover through a valid Web refresh token in API middleware; recovery sets only the access cookie. The explicit refresh endpoint uses the same service. Native families are not accepted as browser refresh sessions. Invalid explicit credentials remain fail-closed and never fall back to cookies.

Cookie and anonymous logout clear current and legacy auth cookies even when database cleanup fails. Bearer logout does not clear an attached browser session. Cleanup errors include a request ID and sanitized error classification, never token values. Browser logout and refresh retain their baseline CSRF exemptions; protected cookie mutations still require CSRF.

The standard-fetch Web transport coalesces concurrent 401 recovery and retries once. Account transitions invalidate pending recovery. The Web UI separately discards late responses and clears private views across tabs on logout; successful transparent recovery does not remount a diary draft. Return destinations are restricted to implemented private routes.

OpenAPI generation lives in the explicit `@diary/contracts/openapi` entry point. Runtime schemas do not import or initialize the generator. This removes generator code from browser consumers while retaining runtime validation and generated-client drift checks.

Verification: `tests/integration/web-session.test.ts` uses real HTTP and disposable PostgreSQL to exercise stable concurrent refresh, ambient recovery, database cleanup failures, explicit-credential isolation, expiry and native/Web separation. `tests/unit/web-session.test.ts` verifies transport recovery and invalidation. Browser workflow evidence is recorded separately in ticket 04 after execution.
