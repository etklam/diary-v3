# [12] Complete institutional operations and filing inspection

Status: ready-for-agent
Execution: in-progress
Type: AFK

## Parent

[Guru Portfolio PRD](../PRD.md)

## What to build

Provide operational views and safe actions for filing discovery/ingestion, amendments, mapping coverage, analytics, and AI work.

## Acceptance criteria

- [x] /admin/institutional reports tracked managers, latest SEC check, pending filings, parser/mapping errors, partial quarters, and AI pending/errors.
- [x] Filing Inspector drills from Guru and quarter through filing/accession/documents/parsed rows/effective snapshot/amendments and links to SEC source.
- [x] Guru detail shows latest filing, successful sync, next check, available quarters, ingestion status, mapping coverage, and errors.
- [x] Admin actions to sync, reprocess, rebuild analytics, and regenerate analysis are authorized, idempotent, observable, and return job identifiers/status.
- [x] Diagnostics export includes source/processing versions and redacts secrets and user-private data.
- [x] Browser evidence covers partial/error/retry states and prevents destructive or duplicate operations.

## Blocked by

- [02 13F ingestion](02-13f-ingestion.md)
- [03 securities mapping](03-securities-mapping.md)
- [04 effective snapshots](04-effective-snapshots.md)
- [11 Guru AI analysis](11-guru-ai-analysis.md)

## Resolved operations decisions

- Every action queues an existing job instead of running work inside the request. `sync` moves the discovery check forward, `reprocess` returns one filing to the ingestion queue, and `rebuild` adds one effective-snapshot rebuild revision whose downstream events republish analytics and consensus.
- Repeating an action cannot stack jobs. The response distinguishes `QUEUED`, `ALREADY_QUEUED`, and `RUNNING`; a held discovery lease is never interrupted; and a rebuild request that is still pending returns its existing revision.
- No operation deletes preserved data. Reprocessing keeps artifacts and parsed rows until a new parse succeeds, which the integration test asserts directly.
- Diagnostics is a download that states its own redactions and excludes provider credentials, raw filing content, AI text, follower identities, and requesting-admin identities.
- Non-READY states are always reported as their own state. The overview never presents a partial or error quarter as a zero count.

## Implementation evidence

- Operations rules are documented in [docs/institutional-operations.md](../../../docs/institutional-operations.md).
- `npm run typecheck` — passed.
- `npm run contracts:generate` and `npm run contracts:check` — passed.
- `npm run build --workspace=@diary/web` — passed.
- `npx eslint` on the changed API, web, and contract files — no findings.
- `npx vitest run tests/integration/institutional-admin-operations.test.ts` — 3 passed, using a disposable PostgreSQL database: overview and lineage reads, non-admin refusal, idempotent sync/reprocess/rebuild with preserved artifacts and parsed rows, and the redacted diagnostics export.
- `REMOTE_TEST_DB=1 ./node_modules/.bin/playwright test tests/e2e/admin-institutional.spec.ts --workers=1 --reporter=line` — 1 passed against the disposable harness. It covers partial/error states, inspector lineage, mobile overflow, cancel-before-reprocess, queueing, and duplicate prevention.
- Browser screenshots: [overview](../../../docs/design/evidence/admin-institutional/overview-1440.png), [inspector desktop](../../../docs/design/evidence/admin-institutional/inspector-1440.png), and [inspector mobile](../../../docs/design/evidence/admin-institutional/inspector-390.png).
