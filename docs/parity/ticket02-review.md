# Ticket 02 second-pass review

Scope: current `apps/api/src/app.ts`, `packages/contracts/src/index.ts`, `packages/db/src/`, and `tests/integration/first-diary.test.ts`. Read-only review; no integration tests were run concurrently with the active register-500 diagnosis. Source references below refer to the reviewed code, and may move as the other agents edit it.

The user explicitly authorizes fixes to existing bugs and technical debt. The old title-length storage failure is therefore a correction with regression coverage, not behavior to preserve. HTTP 201 creation and widening title storage to the accepted 500 characters are already recorded in ADR 0001. The ongoing register-500 diagnosis is intentionally excluded from this review.

## Actionable findings

### [P2] Reject decimal IDs outside PostgreSQL bigint range before querying

**Evidence:** `apps/api/src/app.ts:406–410` accepts any positive decimal string and passes `BigInt(id)` into a PostgreSQL bigint comparison. `packages/contracts/src/index.ts` uses the same unbounded regex for serialized IDs. `GET /api/diaries/9223372036854775808` is valid according to this contract but exceeds the maximum signed bigint; PostgreSQL rejects the bind value and the generic handler returns 500. Extremely long all-digit input also reaches bigint conversion/database encoding unnecessarily. The existing invalid-ID test only covers `01`.

**Narrow fix:** Make the authoritative ID schema enforce the actual signed-64-bit positive range (at most 19 digits and at most `9223372036854775807`) and use it for route parsing before constructing the query. Do not merely catch the PostgreSQL overflow as a generic missing resource.

**Minimal regression:** A real authenticated GET with the maximum valid ID returns 404 when absent; max+1 and an excessively long numeric path return canonical 400 validation errors. Keep the owner-isolation test unchanged.

### [P2] Do not classify database outages as invalid authentication

**Evidence:** `authenticateAccess` in `apps/api/src/app.ts:224–241` wraps both JWT verification and `findSessionUser` in the same catch that returns `AUTH_TOKEN_INVALID`. The cookie middleware at lines 272–282 then suppresses every authentication error as anonymous. A valid session during a transient PostgreSQL query failure therefore receives 401 instead of the normal internal-error response. This becomes especially damaging when the ticket 04/05 clients interpret 401 as a reason to refresh or clear sessions.

**Narrow fix:** Catch only expected credential/JWT validation failures. Let database faults propagate to the central 500 handler; in cookie resolution suppress only explicitly identified invalid/expired credentials, not arbitrary failures. Unknown users or tokenVersion mismatches should still remain 401.

**Minimal regression:** With a valid signed credential, inject a single user-lookup database failure and assert a sanitized 500 with requestId; prove malformed token and tokenVersion mismatch remain 401. This should be a narrow failure-injection test, not a production database shutdown. Cover cookie and Bearer branches so the second broad catch cannot hide the fix.

### [P2] Expire inactive rate-limit keys instead of retaining them forever

**Evidence:** `limiter()` at `apps/api/src/app.ts:166–173` prunes timestamps only when that exact key is used again and never deletes map keys. Login attempts create both IP and email keys. A continuously running API retains every distinct attempted identity/IP indefinitely, even though the rate-limit window is only 60 seconds. Rotating invalid email addresses gives an unauthenticated client permanent retained entries. Individual per-IP limits slow this growth but do not reclaim expired entries or bound the total.

**Narrow fix:** Retain the simple single-process limiter, but expire idle keys with bounded cleanup or use a small existing limiter supporting expiry. Avoid adding Redis or a separate service. Include `Retry-After` if the API's eventual common 429 contract requires it; that header is not the core defect here.

**Minimal regression:** With a controllable clock, consume distinct identities, advance beyond expiry, trigger cleanup and verify stale entries are removed while an active identity still gets 429 at its limit. No large-load integration test is needed. Also add one real HTTP sixth-login-attempt 429 assertion because the current integration suite never exercises the limiter.

## Security checks that look correct in the present slice

- An explicit invalid Bearer or API key is evaluated before ambient cookies; `x-api-key` plus Authorization is rejected. Capability-specific API-key support belongs to ticket 39 and is not falsely implemented here.
- JWT algorithm, issuer, audience, type and tokenVersion are checked, and the current role is retrieved from the database rather than trusted from a stale JWT role claim.
- Cookie mutation requests require matching CSRF values. Verified Bearer is the only current authenticated bypass; register/login are explicit bootstrap exceptions. No unsafe handler was found outside these checks in the current slice.
- Diary reads combine the requested ID and authenticated owner in one database predicate. User/day uniqueness is a real database constraint, not a preflight check alone; the concurrent real-DB test is meaningful.
- Raw refresh tokens are hashed before persistence. Login wire does not return the token pair in JSON. Generic errors do not serialize query parameters, passwords, database connection strings, or exception objects.
- Cookie flags currently include HttpOnly, Strict SameSite and production-only Secure. Existing tests assert the first two, but a focused production-config cookie assertion would protect Secure from regression.

## Remaining verification boundaries, not additional ticket-02 bugs

The four current integration cases use actual HTTP and a newly created PostgreSQL database, and meaningfully verify concurrency, owner hiding, CSRF, digest storage and generated-client reads. They do not yet establish native login/rotation or stable Web recovery; those are tickets 04/05. Do not mark those behaviors complete from a Bearer token borrowed from Web login.

The current tests accept an arbitrary `DATABASE_URL` as an administrative connection. All data mutations target a unique freshly created test database, and teardown only drops that name, so existing application rows are not touched. Before this becomes a general CI/deployment harness, add the documented disposable-host/environment guard; dedicated test database naming alone does not prove that the PostgreSQL server itself is isolated.

There is currently no structured error logging. This is a later observability gate, not evidence of secret logging; future logging should keep the current sanitized response behavior and must not dump Drizzle error parameters, cookies, raw tokens or request bodies.
