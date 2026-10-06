# Institutional operations and filing inspection

`/admin/institutional` is the operational view over 13F ingestion. It reads prepared state only; it never parses filings or calls SEC at request time.

## Overview

The page reports four things.

- **Shared SEC scheduler.** The single fair-access scheduler's next allowed request, last request, and cumulative request and failure counters. API and worker processes share this row.
- **Queues and backlogs.** Filings awaiting ingestion, partial filings, filing errors, pending snapshot rebuilds, pending and retrying analytics events, pending consensus rebuilds, pending mapping refresh jobs, unresolved and ambiguous holdings, partial and error quarters, and queued, running, failed, and invalidated AI analyses.
- **Processing versions.** The code-owned parser, amendment resolver, security-mapping, portfolio-analytics, consensus, AI context, and AI output-schema versions.
- **Tracked managers.** Per manager: discovery state with next check, last success and last error code; filing counts by state; quarter counts by state; latest mapping coverage; and AI analysis counts. A non-READY state is always shown as its own state, never as a zero.

The filings index below it filters by Guru, filing state, reported quarter, and a literal accession, CIK, or name search.

## Filing inspector

`/admin/institutional/filings/:id` drills from one filing through its full lineage: filing metadata and SEC source link, source documents with every preserved raw artifact (content digest, byte length, fetch time and reason, retention, and the artifact it supersedes), a bounded sample of parsed rows with their security-mapping state and parser warnings, the active effective snapshot with its replay key, snapshot and source-manifest digests, resolver version, publication and quarter state, the amendment sources that produced it, every filing for the same quarter with its resolved operation, and the prepared analytics row.

## Guarded operations

Four admin actions exist. Each one queues an existing job, returns a job identifier and status, and is safe to repeat.

| Action | Endpoint | Effect |
| --- | --- | --- |
| Check SEC now | `POST /api/admin/gurus/:id/sync` | Moves the manager's next discovery check to now. A held worker lease is reported as `RUNNING` and left alone; an already-due check returns `ALREADY_QUEUED`. |
| Reprocess filing | `POST /api/admin/institutional/filings/:id/reprocess` | Returns one filing to the ingestion queue and schedules its manager. Preserved artifacts are reused; parsed rows are replaced only when a new parse succeeds. |
| Rebuild quarter | `POST /api/admin/gurus/:id/rebuild` | Requests one more effective-snapshot rebuild revision, which republishes analytics and consensus downstream. A quarter with no ingested filing is refused. |
| Regenerate analysis | `POST /api/admin/gurus/:id/analysis` | Documented in [Guru AI analysis](guru-analysis.md). |

No action deletes a filing, an artifact, a snapshot, or an analysis. Repeating an action cannot stack duplicate jobs: the response status distinguishes `QUEUED` from `ALREADY_QUEUED` and `RUNNING`, and the UI asks for confirmation before sending either destructive-sounding request.

## Diagnostics export

`GET /api/admin/institutional/diagnostics` downloads a JSON snapshot of processing versions, scheduler state, queue depths, and per-manager counts. It lists its own redactions and excludes provider credentials, raw filing content, AI prompt and result text, follower identities, and requesting-admin identities.
