# Deployment and restore acceptance direction

Astra direction for tickets 59–60. Follow PLAN.md, PRODUCT.md and the immutable PRD. This document defines evidence; it does not assert deployment is complete.

## Runtime and image boundaries

- Build production Web SSR and API images from the locked monorepo dependencies. Run the actual built artifacts, not the development server. Keep the existing same-origin `/api/**` and `/socket.io/**` routing through Ingress; public SSR must use its configured internal API origin without exposing it in browser links.
- Package every production command with its required resources. At this review, `scripts/build-api.ts` only builds `server.ts` and `rotation-cli.ts`; `market-state-cli.ts` and the database migration entry point still need a production packaging decision. Verify SQL migrations resolve from the built image's filesystem. An npm command that depends on absent TypeScript sources is not a working production command.
- API binds the pod interface explicitly. Cookie Secure/CSRF origin and trusted proxy behavior must be tested through the actual Ingress. Do not weaken production authentication to make the smoke test pass.
- Exactly one API replica with a Recreate update strategy. Confirm the old process completes scheduler shutdown before the replacement activates. The normal server starts the diary pusher and price checker; migration and market job processes must not create the API runtime or start these timers.
- Market CLI and manual HTTP actions use the same batch functions and database concurrency locks. CronJobs need bounded execution, overlap prevention, observable failure, and the intended source baseline schedule. Verify the schedule from the frozen source before choosing it.

## Reproducible isolated proof

- Use a dedicated local K3s cluster/context, or a demonstrably isolated disposable K3s environment. Do not use the user's production context. Docker and kubectl executables are present; k3d/k3s/kind executables were not found during the initial read-only check. Check the available local container runtime before selecting the smallest reproducible setup.
- Use synthetic users and a disposable PostgreSQL volume. External Yahoo/SEC behavior must come from controlled provider fixtures in the isolated exercise. The fixture selection belongs to the test environment and must not silently become the production provider.
- Start from an empty database, run migrations and necessary system seed, then deploy Web/API. Distinguish static universe/ETF configuration from seed work that needs market data. Provide a safe administrator creation command with no embedded reusable credentials.
- Exercise login, create and read a diary; actual foreground Socket.IO delivery plus reconnect/REST recovery; and a batch invocation whose persisted result is read through the deployed API. Repeat the meaningful paths after an image update. Test both websocket and polling paths through Ingress.
- Readiness proves usable dependencies; liveness must not restart healthy processes merely because an external provider is down. Structured logs connect HTTP requestId and batch jobId to success/failure without credentials, tokens or private diary contents.
- CI gates include contracts, typecheck, lint, production build, domain tests, real PostgreSQL integration and principal browser paths. Demonstrate that a required failed gate prevents the publish/deploy step. A YAML file alone is not execution evidence.

## Restore evidence

- Back up a real schema version N containing synthetic diary/transactions, research, reminders, shares and sessions. Restore into an empty database, verify its version, then apply an actual existing N→N+1 migration. Check constraints, seeds and representative data after that upgrade.
- Exercise product reads and writes against the restored deployment and check owner/partner/session restrictions. Include a failed restore or invalid backup path and avoid reporting a partially restored database as ready.
- Document exact backup, restore, verification and release rollback commands, artifact provenance, and cleanup boundaries. Keep the restore smoke runnable as subsequent migrations land; final acceptance uses the final delivered schema.

## Evidence record

Record image revisions, isolated context, database version, commands, exit codes, logs and the assertions for each deployed path. Keep credentials out of artifacts. A source-level test or Vite proxy test is useful supporting evidence but cannot substitute for the Docker/K3s update and restore exercises.
