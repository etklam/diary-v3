# Final release coverage

Every source entry and story has an accepted owning ticket. Feature evidence is recorded in each local ticket; cross-cutting acceptance is consolidated in [final release report](final-release-report.md).

- Accepted tickets: 61/61.
- Source entries whose owners are all accepted: 212/212.
- Stories whose owners are all accepted: 114/114.

| Final cross-cutting ticket | Source entries | Stories |
| --- | ---: | --- |
| [61](../../.scratch/diary-v3-rebuild/issues/61-final-verification.md) | 20 | US-006, US-098, US-099, US-100, US-101, US-102, US-103, US-106, US-107, US-108, US-109, US-110, US-111, US-112, US-113, US-114 |

The20 source entries assigned to ticket61 are legacy migrations. Verify their surviving final constraints and indexes in PostgreSQL; do not recreate dropped Telegram/obsolete tables or treat historical data repair as a user-data migration requirement. Use the frozen final constraint inventory, new migrations and existing integrity evidence.

Final gates passed: contracts/lint/build,795 core tests,132 unique Chrome cases across bounded resumed runs, PWA lifecycle/private cache boundaries,4 controlled HTTP performance workloads, isolated K3s/TLS update/recovery and full-schema backup/restore. The performance fixture self-check adds4 passing checks. No production cutover or old-data migration was performed.

## Final schema name audit — 2026-09-06

Compared the actual frozen `legacy-final-constraints.tsv` table names to current Drizzle `pgTable` declarations. All 26 legacy business table names remain present. Two legacy implementation tables are intentionally absent: `_prisma_migrations` is replaced by Drizzle migration tracking; `diary_reconciliation_audits` is referenced only by the frozen Prisma model and `scripts/diary-reconcile-duplicates.ts` (the write is at line272), a historical duplicate-data repair utility. The user explicitly excludes old-data migration. This is a table-presence/scope audit; constraint correctness still relies on disposable PostgreSQL integrity suites and final restore verification, not names alone.
