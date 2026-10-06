# [02] Discover, preserve, and parse 13F filings

Status: ready-for-agent
Execution: done
Type: AFK

## Parent

[Guru Portfolio PRD](../PRD.md)

## What to build

Add restart-safe 13F-HR and 13F-HR/A discovery and ingestion through the existing shared SEC boundary, with filing/document lineage and a dedicated 13F information-table parser.

## Acceptance criteria

- [x] Discovery is scoped to tracked manager CIKs, records accession/form/report period/filed time/amendment metadata/documents, and is idempotent on retry.
- [x] A single scheduled discovery owner and configurable/documented cadence fit the existing worker topology; next check, last success, and stale/error state are observable.
- [x] SEC requests use the shared SEC scheduler and common identification, rate limiting, cache, retry/backoff, deadlines, and metrics; no Guru-local HTTP stack is added.
- [x] Reprocessable raw source artifacts have a content digest, stable reference, and documented retention policy.
- [x] Expired artifacts require an explicit, append-only, idempotent refetch record linked to the expired artifact before parser reprocessing, including when the fetched bytes have the same digest.
- [x] The parser preserves issuer, class, CUSIP, FIGI, reported value and unit provenance, quantity, SH/PRN, Put/Call, discretion, other manager, voting authority, source URL, ingestion time, and parser version.
- [x] Filing ingestion distinguishes PENDING, DOWNLOADED, PARSED, PARTIAL, READY, and ERROR; SUPERSEDED is reserved for effective snapshot resolution in ticket 04. Security mapping coverage remains unset until ticket 03. A malformed row does not discard valid rows.
- [x] Synthetic XML fixtures cover valid holdings, malformed individual rows, missing identifiers, SH and PRN, Put/Call, and historical/current value-unit representations.
- [x] Disposable PostgreSQL evidence proves duplicate discovery/download retries do not duplicate filings or parsed rows; controlled SEC transport tests cover provider failure and recovery.

## Blocked by

- [01 Guru registry](01-guru-registry.md)

## Implementation decisions

- Discovery runs from one dedicated worker command. PostgreSQL manager leases prevent duplicate processing when more than one process is accidentally started. The default discovery cadence is 24 hours (`GURU_SEC_DISCOVERY_INTERVAL_HOURS`, 1–168); unfinished backfill resumes after 60 seconds and provider failures retry after 15 minutes.
- SEC requests from API and worker processes reserve start slots in one PostgreSQL scheduler row at a 125 ms minimum interval. The shared row records request and failure counts; every request keeps the existing SEC User-Agent, local queue, cache, deadline, retry, and URL validation.
- Source XML is stored as versioned PostgreSQL artifacts. `retain_until = null` means indefinite retention. A future retention purge may clear content while retaining digest and artifact reference; parser reprocessing must then append an explicit `reprocess-refetch` artifact linked to the expired version.
- The raw Form 13F value and source-unit label are both retained. The default unit boundary is 2023-01-03 (older filing dates are `THOUSANDS_USD`; newer are `USD`), without rewriting the reported value. SEC filing-specific correction text can override this rule in a later parser revision.
- Effective amendment resolution and security mapping remain owned by tickets 03 and 04.

## Verification evidence

- `npx vitest run tests/unit/guru-13f-parser.test.ts tests/unit/sec-edgar.test.ts tests/unit/sec-edgar-cancellation.test.ts`: 3 files, 24 tests passed.
- `npx vitest run tests/integration/guru-13f-ingestion.test.ts`: 1 file, 2 tests passed against a disposable PostgreSQL database, including retries, stale source state, cross-process request pacing, same-digest refetch replay, changed-digest lineage, and reuse of an earlier digest without duplication.
- Refetch history is stored separately from content artifacts with a unique operation key and immutable DB trigger. Integration verifies replay makes no second SEC request, every event retains source/destination artifact IDs, digest, URL, and fetch time, and direct event mutation is rejected.
- `npm run typecheck`: passed.
- Scoped ESLint for the ticket-owned parser, ingestion, worker, SEC scheduler, CLI, schema, and integration files: passed.
- `npm run db:generate`: generated migrations 0046–0048 and 0052–0053; the integration test applied the complete migration chain to a fresh disposable database.
- `git diff --check`: passed.
