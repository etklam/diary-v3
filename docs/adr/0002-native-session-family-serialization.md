# Native session family serialization

Status: accepted

Native refresh stores only SHA-256 token digests. Each native login creates a separate family; rotation links a single replacement to its parent. Browser refresh stays stable and separate.

Refresh, replay and logout acquire the same transaction-scoped PostgreSQL advisory lock derived from the immutable family ID. Token/user state is re-read under the lock. Replay revocation commits before the API returns 401. Other families remain independent; a hash collision would only serialize unrelated operations, not weaken correctness.

A conditional update on the individual parent token alone is insufficient: a replay revocation UPDATE may take its snapshot while a descendant rotation is inserting another child, allowing that child to escape the revocation. The regression deliberately holds the descendant insert with a test-only PostgreSQL trigger, then overlaps replay; all descendants must end revoked. Production has no test trigger.

Native refresh verifies signature, HS256, issuer, audience, type and claims before requiring a matching digest row. Database expiresAt is the authoritative refresh expiry. An already rotated ancestor must still trigger family revocation after its JWT expiration, because newer descendants may remain active. An active expired row is marked EXPIRED and rejected. This corrects the legacy expiry-before-replay ordering; it does not authorize an expired credential or introduce a grace window.

Access JWT expiry remains enforced. Logout-one revokes a refresh family but does not claim to revoke an already issued access JWT immediately; its existing maximum lifetime is one hour. Logout-all/tokenVersion changes are a separate account-security operation.

The native client owns no platform storage implementation: callers inject get/set/clear, and standard fetch composes with the generated API client. Concurrent protected 401 responses share refresh; a late response reuses the newer session rather than rotating again. Login/refresh/logout bootstrap calls do not enter this retry loop. Lost rotation responses end the local session without retrying the old refresh token.
