# [04] Resolve amendments into effective quarter snapshots

Status: ready-for-agent
Execution: done
Type: AFK

## Parent

[Guru Portfolio PRD](../PRD.md)

## What to build

Resolve original and amended filings into one reproducible effective portfolio per Guru/manager/report period. Preserve every filing and the decision path that selected the snapshot.

## Acceptance criteria

- [x] Original filings and amendments are stored separately from effective holdings; each manager/report period has at most one active effective snapshot.
- [x] Amendment metadata distinguishes restatement from additional holdings and resolves precedence deterministically without treating amendments as separate quarters.
- [x] Reprocessing the same filing set produces the same effective snapshot and lineage; concurrent rebuilds cannot publish competing active snapshots.
- [x] Reprocessing after parser or mapping version changes uses a retained raw artifact when available; if retention expired, an explicit idempotent refetch is recorded before rebuild.
- [x] PARTIAL, SUPERSEDED, and ERROR states propagate without inventing removals; only comparable READY snapshots may infer exits.
- [x] Publishing a changed effective snapshot writes a durable invalidation event in the publication transaction. A status or reason change with a previously published snapshot writes a durable period-state event so analytics cannot remain READY with stale quality; invalidation remains separate from summary regeneration.
- [x] Synthetic amendment fixtures cover restatement replacing an original, additional holdings, multiple amendments, out-of-order discovery, and idempotent replay.
- [x] Disposable PostgreSQL tests cover unique active-snapshot constraints, concurrent rebuilds, and transaction rollback.

## Blocked by

- [02 13F ingestion](02-13f-ingestion.md)
- [03 securities mapping](03-securities-mapping.md)

## Implementation decisions

- Read the amendment number and amendment type from the filing cover page. A missing, invalid, or duplicate amendment number/type makes the period resolution incomplete; keep the last valid snapshot and do not infer removals from the incomplete filing set.
- Rebuild from the original filing and apply amendments in ascending amendment number, independent of discovery order. Use filed time and accession only as deterministic lineage ordering after valid amendment numbers; they do not repair duplicate or missing numbers.
- A restatement replaces the full accumulated information table at that point in the numbered sequence. An add-new-holdings amendment appends only the disclosed entries and never overwrites prior entries. Preserve repeated rows from different filings as distinct source disclosures; later analytics may aggregate by resolved security.
- A later restatement therefore replaces the original and earlier add-only entries; later numbered add-only amendments are applied on top of that restatement. If any applicable filing is not READY or its amendment type cannot be classified, publish no new READY snapshot and keep the previous valid snapshot visible with the quarter marked incomplete.
- Preserve the ordered accession list, amendment operation, per-source row identity, artifact digest, parser version, and resulting snapshot hash as lineage. Publishing is a transaction serialized by manager/report period, with one active snapshot and a deterministic replay key.
- Keep effective snapshot headers, lineage, and effective holdings as separate persisted records. Enforce one active READY snapshot per manager/report period with a partial unique index; retain unresolved source rows in the snapshot rather than dropping them.
- Acquire a PostgreSQL transaction advisory lock for the manager/report period before reading the source manifest. Recheck the manifest before publication so a concurrent filing or mapping update cannot publish a snapshot built from stale inputs. An identical replay key returns the existing snapshot without duplicating lineage or holdings.
- When a changed snapshot publishes, write a durable snapshot-change event in the same transaction. This ticket owns the event producer; analytics and AI tickets own consuming it to invalidate prepared inputs. Publication does not synchronously calculate analytics or call a model.
- A PARTIAL, ERROR, or READY quality transition with a previously published snapshot also writes an `EFFECTIVE_PERIOD_STATE_CHANGED` outbox event when status or reason changes. Repeated `REBUILD_PENDING` writes with the same state do not emit duplicates. New periods without a published snapshot wait for their first effective-snapshot publication event.
- SEC instructions distinguish full restatements from amendments containing only additional holdings entries, permit multiple amendments, and require separate amendments when both operations are needed. The implementation follows that distinction rather than inferring amendment semantics from market values or row contents. See the [SEC Form 13F FAQ, Questions 58b–58c](https://www.sec.gov/rules-regulations/staff-guidance/frequently-asked-questions-about-form-13f#amending-form-13f) and [Form 13F Special Instruction 3](https://www.sec.gov/pdf/form13f.pdf).

## Verification evidence

- `npx vitest run tests/unit/institutional-effective-snapshots.test.ts tests/integration/institutional-effective-snapshots.test.ts tests/integration/guru-13f-ingestion.test.ts tests/integration/institutional-security-mapping.test.ts`: 4 files, 32 tests passed against disposable PostgreSQL. Covers amendment ordering/replay, unique active publication, concurrent rebuild, source-manifest race rejection, publication rollback, Admin mapping correction, request revision safety, and ERROR/PARTIAL handling.
- `npm run typecheck`: passed.
- `npm run contracts:check`: passed.
- Scoped ESLint for the effective snapshot service, worker wiring, schema, and tests: passed.
- `git diff --check`: passed.

## Operational boundary

Rebuild requests are consumed from the existing discovery worker's idle path, after due SEC discovery and mapping refresh work. Sustained due work may delay snapshot rebuilds. Final source-manifest validation uses short PostgreSQL SHARE table locks; parsing, hashing, and snapshot-row preparation happen before that lock window.
