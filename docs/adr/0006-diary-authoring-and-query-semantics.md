# Diary authoring and query semantics

Status: accepted

Diary authoring preserves the canonical create/update fields, owner-only access, unique user/date constraint and explicit clearing semantics. Update requires title and content; omitted optional values remain unchanged, while null or an empty tag array clears the corresponding value. Alert payloads are not silently discarded while that module remains unimplemented. Nested transaction replacement follows the frozen diff contract: a row with an ID updates that row, a row without an ID is inserted, omitted existing rows are deleted, and an omitted transactions field preserves the collection.

BUY and SELL quantity and price must fit PostgreSQL `numeric(15,4)` without rounding and leave the API as normalized decimal strings. Holdings and realized results use rational BigInt arithmetic: quantity has at most four decimal places, total cost and average cost round half-up to eight decimal places, and the recent-trades projection rounds realized P&L and percentage half-up to two decimal places. This deliberately fixes the frozen implementation's conversion of persisted Decimal values to JavaScript numbers.

Every transaction-bearing create, append or replacement takes a transaction-scoped advisory lock for the owner, re-reads the complete ledger ordered by `tradeDate, id`, and validates the projected result before writing. This makes concurrent SELL and historical correction races single-winner when both results cannot coexist. A partial SELL removes average cost basis proportionally and preserves the position's average cost; a full SELL removes the symbol. Diary deletion uses the same lock and rejects removing an earlier BUY when a later SELL depends on it.

Replacement validates the order that will exist after persistence. Existing rows retain their database IDs and new rows receive later IDs, so equal-instant validation cannot trust client payload order. IDs from another Diary or owner are rejected before mutation. Transaction diff and Diary scalar changes commit in one database transaction; a later uniqueness failure rolls both back.

Tags now use PostgreSQL text arrays. Commas are valid within an individual tag, so the Web editor edits array entries separately. Migration 0002 converts this project's former comma storage, while new writes are lossless. The compatibility tagsString field remains ambiguous for comma-containing values; consumers must use the canonical tags array. This fixes the legacy truncation and delimiter debt under the user's authorization.

Markdown is stored as authored and rendered through React Markdown with GFM, without a raw-HTML plugin. Unsafe URL targets are removed; a removed target renders as text rather than an empty clickable link. The editor preserves text after failed submissions, supports preview and exposes the original thesis, risk and execution separately from the main content.

## Quick Diary append semantics

Quick Diary sends the selected civil date as `YYYY-MM-DD`; UTC noon was a legacy storage detail and is never a wire value. The profile timezone chooses the default date in the client. General Diary creation without an explicit date retains its existing UTC-date default.

`appendToToday: true` uses the same authenticated Diary create endpoint. When the owner already has a Diary for the date, the existing title remains unchanged, content is joined with `\n\n---\n\n`, and tags are unioned in existing-first order. Explicit thesis, risk and execution values use normal update semantics, including null clearing; accepted fields are not discarded. When no row exists, the request creates the Diary and its title is used.

Both ordinary creation and append take a transaction-scoped advisory lock for the owner/date logical key before deciding whether the row exists. This protects the absent-row case that `FOR UPDATE` cannot lock: concurrent appends create one Diary and retain every successful content fragment. Ordinary create still returns the canonical date conflict when the locked date is occupied. API-key agent append remains disallowed; a Native bearer session has ordinary user authority.

When a row exists, append also reads it with `FOR UPDATE`. If a full PUT has
already acquired the row lock, append waits and merges onto that committed
body rather than writing from a stale pre-update snapshot. A full PUT that
runs after append deliberately replaces the body, and a DELETE that runs
after a successful append deliberately removes the Diary; those are the
documented last-writer semantics of explicit full replacement and deletion.
If deletion commits before a waiting append reads the row, append treats the
date as empty and creates a new Diary instead of failing with an internal
error.

## Search decision for ticket 10

The frozen Diary list supports page, limit, search, sortBy, dateFrom, dateTo and reviewStatus only. Unknown query keys, including tag/tags and days, are rejected. The ticket's initial mention of tag filtering was not supported by the actual canonical API or list UI; tags remain displayed metadata, not an invented filter.

Search means literal case-insensitive title/content contains, including Chinese text and literal percent/underscore characters. It is distinct from public article full-text search. Date bounds are inclusive; pending additionally requires reviewDueAt at or before the captured request time. Every sort uses a same-direction ID tie-breaker.

The legacy deployment's utf8mb4_unicode_ci title ordering folds case and accents. PostgreSQL title ordering will use an explicitly migration-created ICU primary-strength collation instead of the host default; the current PostgreSQL 17 development image exposes ICU collations. The implementation and title-order fixtures remain ticket 10 work, including verification in the eventual deployment image.

## Review completion and local-session recovery

Structured completion is confined to owner-scoped Review PATCH: a valid outcome and at least one trimmed nonblank reflection are required. Server time sets reviewedAt; generic Diary writes reject Review outcome/status/reflection keys. Scheduling may set or clear reviewDueAt, and SQL CASE preserves a concurrently completed reviewed state. Original thesis, risk, execution and content remain separately projected. Regression evidence: `tests/integration/diary-review.test.ts`.

Local browser invalidation returns an AUTH_UNAUTHORIZED recovery envelope without inventing a server request ID. This fixes code-based consumers losing their sign-in action when an empty synthetic 401 body becomes an empty-string client error. `tests/e2e/library-session-recovery.spec.ts` passed 1/1 against the real browser/API: private rows clear at logout and the sign-in link returns to the populated owner library.

## Explicit Company context

Migration 0006 adds shared Stock identities and cascading Diary–Stock links. Company context is independent of text templates and executed transactions. Full edit omission preserves links, explicit arrays replace, and same-day append unions in the Diary transaction under its existing lock. Symbol upserts take deterministic order to avoid reverse-list deadlocks across accounts. Reads batch owner-scoped links; diary deletion removes only its links. The effective frozen input rules are retained: 20-character symbols, at most 20 raw entries and ten unique normalized companies per submission. Existing append unions are not silently truncated. HTTP/PostgreSQL regression: `tests/integration/diary-stocks.test.ts`, 4/4.
