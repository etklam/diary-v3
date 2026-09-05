# Frozen legacy behavior baseline

This baseline belongs to ticket 01. It establishes traceable inputs and reproducible legacy behavior; it does **not** mark the 114 stories as implemented in diary-v3.

## Source and drift

The planning scan referenced `72b5bf7bb5cd841eff2fca9795a5fa977bff0196` plus uncommitted changes. When implementation began, the source repository had advanced to **`47f8313bf29870b52582db97209bef2e1cbe41ce` with a clean worktree**. The current source, including those now-committed changes, is frozen in `source-snapshot.tar.gz`. `source-manifest.json` records each included worktree file's SHA256, tracked state, archive hash, and exclusions. `source-worktree.patch` is correctly empty at this clean snapshot. The source repository was never modified by this work.

The archive includes executable source, tests, documentation, migrations and contract source definitions. Environment files, credential-bearing filenames, database/data folders, dependencies, runtime/build output, logs and binary generated assets are excluded. Generated API/client output, runtime/generated Nuxt types and PWA bitmap assets are excluded; preparation occurs only in the isolated test copy. The early shared draft archive included generated API/client output; it was removed before finalizing ticket 01. The final policy also explicitly retains extensionless deployment configuration, SEC HTML test fixtures and credential-resolution source tests/ADRs; none are credential stores. The final archive contains 947 source files. The manifest lists excluded paths without reading or copying their contents. Private-key and common cloud-token byte patterns fail closed; this is a narrow source policy rather than a guarantee that arbitrary prose cannot contain sensitive information.

Run `python3 scripts/parity/check-baseline.py --source ../diary-vue` before accepting a new source behavior. On drift, keep this baseline immutable, produce a separately named manifest/archive, inspect changed entry points and fixtures, and update affected tickets through an explicit change note. Never silently re-freeze the baseline beneath running implementations.

## Inventory

`inventory.json` contains 43 page entries, 124 API handlers, 7 job/scheduler entries and 38 forward SQL migrations. All 114 PRD stories link to source references and implementation ticket numbers. Mappings are navigation and coverage evidence, not proof of runtime equivalence. Handler-specific ownership, capabilities and authentication middleware remain authoritative over coarse role labels. Exports are mapped with their owning feature (transaction CSV, discipline JSON/share/OG, rotation CSV/copy/PNG and SEC documents/ZIP).

`legacy-final-constraints.tsv` is queried from the fully migrated disposable MariaDB instance. It records applied table, unique, foreign-key and check constraints after all forward migrations, rather than assuming the Prisma schema alone expresses final integrity. The legacy harness additionally exercises documented remediation/rollback/reapply checks before the normal clean database migration.

## Runtime reproduction

Prerequisites: Docker, Node and a private installed dependency directory for the frozen legacy package/lockfile. Example on APFS after extracting the snapshot: clone the already-installed source dependencies with `cp -cR ../diary-vue/node_modules /tmp/diary-v3-source-baseline/node_modules`. The runner rejects a dependency symlink, avoiding Vite/Nuxt writes into the original repository.

Run `bash scripts/parity/run-old-baseline.sh`. It extracts the frozen source into the dedicated `/tmp/diary-v3-source-baseline` directory, regenerates PNGs from the frozen SVG and Nuxt type configuration, then reuses the original disposable MariaDB 11.4 migration harness. The database binds to loopback on a dynamically allocated port; no `.env` or real user data is copied. A shell trap deletes the uniquely named container on success or failure. All credentials and Diary/Post rows are synthetic.

The test fixture `tests/parity/legacy-diary-baseline.fixture.ts` boots the real Nuxt/Nitro build, logs in via the Native JSON endpoint, creates a no-transaction Diary, reads it, deletes it and verifies 404. This is real HTTP/database evidence; it is not a browser UI test or mocked Prisma test. It also probes title boundaries and public search using synthetic English/Chinese, short-word, stopword and content-only terms. `legacy-runtime-evidence.json` records status codes and single-flow latency observations without tokens or user credentials. `legacy-runtime.log` captures the latest run. Single observations must not be represented as percentiles or production capacity estimates; broader long-content/large-ledger benchmarking remains ticket 61 work.

Initial isolation-only failures (missing generated Nuxt type files and generated PWA PNGs) were resolved by running source preparation/generation scripts inside the private copy. The synthetic Post fixture initially omitted mandatory category; that fixture was corrected. These are test-harness setup failures, not claimed legacy product regressions.

## Known contradictions and decisions

| Finding | Evidence | Handling |
| --- | --- | --- |
| Diary create is implemented as HTTP 201 but old OpenAPI advertises 200 | `server/api/diaries.post.ts`, `scripts/openapi/registry.ts`; runtime fixture | Use actual 201 in new contract; document contract correction. |
| Diary request accepts title up to 500 characters while SQL column is varchar(255) | `lib/contracts/diary.ts`, `prisma/schema.prisma`; runtime length probes | Preserve observed evidence. Widening new DB to the accepted 500 is a deliberate bug correction covered by the accepted decision in `docs/adr/0001-parity-baseline-and-contract-corrections.md`, not an unnoticed parity claim. |
| Public and admin article search have different fields and matching modes | `server/utils/post-queries.ts`; runtime public search probes | Public: published/non-null publication time, fulltext title/excerpt, no body or author email. Admin: title substring and optional author name/email substring. PG behavior must be tested against measured fixtures. |
| A planning-era dirty source changed before implementation | source manifests and recorded hashes | Current clean HEAD is explicit baseline; do not claim to possess historical uncommitted bytes no longer present. |

## Validation

`python3 scripts/parity/check-baseline.py` validates archive integrity, every file hash, 43/124 entry counts and complete story mapping. `scripts/parity/build-inventory.py` regenerates navigation mappings from the frozen manifest and published tickets. Neither command labels downstream feature verification as complete.

Auth follow-up: `tests/parity/auth-prior-art.json` extracts focused frozen-source auth cases and boundary notes for tickets 04/05/06/39. These references are not new implementation pass claims.
