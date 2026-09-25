# Research Studio operations and acceptance

Status: local implementation and offline acceptance complete. Live-source/full-report acceptance remains blocked; formal research publication is not ready. See [acceptance record](research-studio-acceptance.md) for verified checks and outstanding inputs.

## Scope

Research Studio prepares immutable evidence, deterministic Node.js/TypeScript calculations, controlled research drafts, exact-revision approval and unpublished article handoff. It is admin-only. Public and Member readership remains in the existing article system. The source method is `us-equity-swing-report` version 1.0.0.

The main method and seven appendices were retrieved from the connected Notion workspace into original-source evidence fixtures. Runtime work must preserve rule coverage and hashes. Original Python files and their historical test claims are not local acceptance; TypeScript golden tests provide the implementation evidence.

## Credentials and outbound calls

The supplied local test credential was explicitly authorized for storage in `.env.research.local`, an ignored owner-only file. Do not commit it, print it, copy it into fixtures, or include it in support logs. Production credentials belong in deployment secrets or the application encrypted-secret store, with purpose isolation from private AI reports.

Only the exact test model `openrouter/free` is authorized. Do not substitute a named paid model or use application fallback. The actual routed model can differ and must be captured. [OpenRouter's free router documentation](https://openrouter.ai/openrouter/free) describes zero prompt/completion pricing and selection among free models; verify current capabilities before a future authorized session.

Local connectivity evidence: the minimal request returned `OK`, actual model `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`, 23 prompt tokens, 49 completion tokens, reported cost 0. The initial session also recorded a sandbox network failure and HTTP 400 with optional parameters. Those attempts exhaust the three-attempt engineering ceiling. Do not run another live request or create a replacement budget session without user authorization. JSON-mode/full-report support was not established by this smoke.

Ordinary unit, integration and browser tests inject synthetic evidence and transport responses. A functioning mock pipeline must never be reported as a verified latest-market report. Source acquisition/storage/model/publication rights must be configured explicitly before real evidence preparation; a free model credential does not grant market-data or search rights.

## Deployment boundaries

Migrate additively before starting the new API/worker. Keep Research Studio and generation disabled until acceptance is complete. Run the research worker separately from the core API, with no public service or generation schedule. Provider failure must not disable Diary readiness or already published article reads. Use the same approved encryption keyring wherever encrypted research configuration is decrypted; rotate keys with backup retention in mind.

Stop generation before rollback, fence running attempts, and preserve durable dispatch records. Do not downgrade to an article implementation that ignores research provenance while research-linked publishing remains enabled. A rollback must retain all new data and use a compatible article publication policy; reverting database migrations is not a recovery procedure.

## Retention and restoration

Do not apply the private-report seven-day input purge to research evidence. Published provenance retains permitted normalized metrics, method/configuration versions, evidence locators and the approval trail. Raw content follows each source's specific retention policy; delete disallowed raw excerpts without falsely claiming that a hash preserves reproducibility. Configure unpublished retention separately.

For the initial PostgreSQL-backed artifacts, the database backup contains evidence and revision links. Back up encryption keys separately through the deployment secret procedure. Restore into a fresh disposable database and verify source/evidence hashes, run/revision/article links, approval hashes, budgets and attempt state before worker activation. A restored unknown or dispatched attempt must never be automatically resent. If private external artifact storage is introduced later, database-only backup is insufficient and the restore procedure must include that storage.

## Required acceptance evidence

Record actual lint, typecheck, contracts drift, unit, disposable-PostgreSQL integration, production build and browser results. Cover competing workers, crash/timeout/cancellation, immutable snapshots, source rights, all publication paths, published-content edits, authorization, safe rendering and private-data sentinels. Capture desktop/mobile and failure states. Restore evidence must validate the new research records, not only successful schema creation.

A real SOXX report is a separate gated acceptance with current approved sources, complete method coverage, human QA and an explicitly authorized live budget. Missing real sources or an exhausted live budget remain open conditions. A non-SOXX synthetic fixture establishes that calculations are not hard-coded to SOXX.

## Local administration commands

Build the API with the normal `npm run build` command. The separate production worker entry point is `npm run research:worker:prod` (`dist/api/research-worker.js`). For an isolated diagnostic pass use the development worker command with `-- --once`. Its deployment starts with zero replicas, exposes no port and has no schedule. Enablement, provider configuration and dispatch budgets remain independent controls.

Prepared-work retention is opt-in: run `npm run research:retention:prod` after building (or `node --env-file-if-exists=.env --import tsx scripts/research-retention.ts` locally) with `RESEARCH_PREPARATION_RETENTION_DAYS` set to an integer from 1 to 3650. Without that setting, the command does not open a database. Each invocation removes at most 100 old runs that have never had an attempt, approval or article handoff. Recent work and all dispatched/approved/linked or detached-handoff provenance remain retained. This is deliberately separate from private-report purging; it does not erase a dispatch ledger or make an unknown request retryable. The current direct-source adapter stores extracted metadata and locators, not full raw pages. A future source requiring raw-content storage needs its own enforceable retention behavior before activation.

Writer context is a defined projection of the immutable evidence snapshot: method rules, source records, manifest/hash, deterministic metrics and plan candidates. The full canonical bars remain available for audit and calculation but are not needed for language generation. Context overflow is rejected; the worker must not silently truncate evidence or change models.
