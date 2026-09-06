# Source baseline and contract corrections

Status: accepted; user explicitly authorized fixing legacy bugs and technical debt on 2026-09-05

The frozen source archive and manifests under `docs/parity/` are the implementation baseline. The planning commit was followed by source commits before implementation; the snapshot records the actual worktree and all exclusions. Original source remains read-only. The parent PRD remains unchanged.

Runtime HTTP behavior takes precedence over stale generated documentation. Creating a Diary returns **201**, proven by the isolated legacy HTTP flow; the new runtime schema, OpenAPI and generated client must all describe 201.

The legacy Diary request accepts titles through 500 characters, while its SQL column only accepts 255. Legacy probes demonstrate 255 succeeds and 256/500 fail with `500 SYS_INTERNAL_ERROR`. The new PostgreSQL column accommodates the documented 500-character input. This deliberately corrects a storage/validation mismatch rather than recreating a server failure for valid input. Preserve it as a known compatibility delta in the final parity report; do not claim byte-for-byte error equivalence on this case. No accepted input is truncated. Registration name storage likewise accommodates its existing request schema; any additional request cap requires an explicit contract decision.

Calendar dates default to the current UTC day when omitted, matching source implementation. Clients that intend another civil day must submit YYYY-MM-DD explicitly. Date display must not shift that value through timezone conversion.

Email lookup and uniqueness are case-insensitive, matching the legacy database. Preserve original email spelling for display, and enforce uniqueness at the database boundary.

## User clarification

"Pre-existing bugs and tech debt — fix them in passing; there is no need to follow legacy behavior rigidly." Feature parity means preserving intended capabilities and valid business rules. Proven bugs and unnecessary coupling should be corrected with targeted regression tests. Legacy fixtures describe observations, not an obligation to recreate defects. Security, data integrity and useful public/native contracts remain deliberate requirements. The original PRD is retained as historical scope; this later instruction supersedes its strict legacy-error-equivalence interpretation.

## Additional verified corrections

- bcrypt consumes only 72 UTF-8 bytes. Registration and login now reject longer inputs with validation 400, preventing distinct submitted passwords from silently authenticating as the same truncated value. The regression includes multibyte Chinese input at the byte boundary.
- Public IDs must fit the database positive signed 64-bit range. Oversized IDs receive canonical validation 400; a valid absent ID remains 404.
- Database failures during session lookup remain sanitized 500 responses. They must not appear as invalid credentials and trigger client session removal.
- Authentication rate-limit storage expires idle keys and has bounded capacity, preserving active limits when full.
- Build tooling uses patched esbuild 0.28.2, with a single override for the older Drizzle loader and other transitive consumers. This addresses the concrete development-server advisories without npm audit's suggested Drizzle downgrade. Verification included the loader's synchronous/asynchronous TypeScript transforms, `drizzle-kit check`, Web/API production builds and lint. Installation reports zero known npm vulnerabilities at this checkpoint; this is not a permanent security guarantee.

- Agent stock timeline replay preserves immutable evidence. Frozen stock-timeline-queries used sequential upsert, overwriting existing research and allowing partial writes on database failure. Ticket 40 explicitly requires immutable evidence, so validated batches now run transactionally and repeated owner/stock/idempotency keys return skipped ALREADY_EXISTS with no update. Non-watched symbols and unowned source diaries retain per-record skip behavior. Regression: tests/integration/api-key-http.test.ts covers concurrent replay, altered replay, scope across owner/stock, and injected rollback.

### Rotation daily-price refresh integrity

Frozen daily price parsing accepted invalid Date instances and could convert unsafe floating volume to bigint; sequential per-row upserts could leave a partial refresh. New parser rejects invalid dates, unsafe positive volume and values outside positive numeric(18,6) storage precision. Valid OHLC, adjusted-close fallback and zero-volume defaults retain source behavior. One refresh now commits all chunked conflict-updates atomically. Regression evidence: rotation-daily-prices unit fixtures and rotation-prices PostgreSQL integration, including failure in row 501 leaving prior history unchanged.

### Rotation snapshots share one observation date

The frozen batch mixed each symbol's latest date within one scope ranking and selected a single comparison date from 90% coverage. This allowed stale peers to affect another date's percentiles/ranks. The corrected batch selects the newest qualified candidate, ranks only symbols whose latest observation equals that date, and bounds the comparison window by that date. When no candidate qualifies it records partial with zero snapshot writes, preserving prior snapshots. This intentionally fixes legacy mixed-date calculation rather than treating partial status as sufficient. Regression: rotation-date-alignment PostgreSQL fixture, 10 current / 1 stale sector, followed by only 9 current sectors. Focused sol-expert re-review found no remaining correctness issue in this correction.

### Explicit rotation mutation input

The frozen admin route swallowed JSON parsing errors and defaulted to an all-scope batch. The replacement route uses strict request parsing: malformed JSON or unknown scope/fields receives validation failure before work starts. Valid empty objects retain default all. Same-scope overlap receives a machine-readable 409 instead of launching concurrent work. Regression evidence: rotation-admin-http and rotation-batch integration tests.

### Rotation monitor summary and public wire corrections

The public monitor can rank indexes or core assets while its breadth summary remains based on the independently latest sector snapshot. The response now carries nullable `summaryAsOfDate` so clients can distinguish the active scope observation date from the sector summary date; the value is `null` when no sector summary exists. This preserves valid source behavior while preventing a client from implying that both views share one date. Rank values are 1-based and the wire schema rejects zero. Human-readable summary text uses scope-neutral `Leaders` and `Weakening groups`; the React monitor localizes those labels from structured fields rather than displaying the English compatibility sentence. Public monitor responses use `Cache-Control: no-store` even for validation and no-snapshot errors because the result is data-dependent and must not be cached.

### API-key revocation cutoff

API-key revocation keeps the frozen authentication-time cutoff. The source authenticates and checks `revokedAt` before entering the route handler; the PRD requires subsequent authentication to fail, but does not promise cancellation of a request that already authenticated. The replacement middleware uses one conditional `UPDATE ... WHERE revoked_at IS NULL RETURNING` to close the lookup/update race, then treats the returned key context as authenticated for that request. A later owner revocation may commit before the handler's business transaction; it does not act as a transaction commit barrier or cancel that in-flight request. Regression: `tests/integration/api-key-http.test.ts` streams a real partial JSON request, observes `last_used_at` in disposable PostgreSQL as the authentication gate, revokes through the owner's HTTP session, releases the body and asserts one successful Diary commit, then sends the same key again and asserts 401 with no extra row. This semantics is scoped to API-key authentication and makes no broader production-auth architecture change.

### Standalone Alert alias compatibility

The frozen standalone Alert handler accepted both camelCase and snake_case request keys. The snake value wins independently for `diary_id`/`diaryId`, `trigger_at`/`triggerAt`, and `recurring_mode`/`recurringMode` whenever it is non-nullish; a null snake value falls back to its camel pair when supplied, while an effective null remains invalid. Omitting trigger keys defaults to the request clock. The replacement keeps the canonical strict camelCase contract for generated clients, adds a wire adapter for the retained aliases, and documents the mixed body and its null/default cases in OpenAPI. Regression evidence: `tests/unit/alert-contract.test.ts` covers exact precedence, invalid snake values, null fallback, null rejection, missing trigger and OpenAPI; `tests/integration/alerts.test.ts` covers real HTTP/PG canonical, alias, conflict and default requests. This is a compatibility correction for an accidental strict-parser regression, with no change to ownership, recurrence or persistence rules.
