# [60] 備份還原 PostgreSQL 並驗證產品流程

Status: done
Type: AFK
User stories covered: US-112

## Parent

[完整重構 PRD](../PRD.md)

## What to build

使用合成產品資料完成 PostgreSQL 備份、還原及發布回復演練，重開 Web 驗證原有資料與權限。

## Acceptance criteria

- [x] 備份、還原、schema 版本及必要系統資料有可執行操作說明。
- [x] 還原後 Diary／Transaction、研究、提醒、分享與 session 規則依當時已交付功能驗證；後續 schema 變更持續更新演練。
- [x] 隔離演練覆蓋完整恢復與失敗情境，沒有使用或搬遷舊真實使用者資料。
- [x] 在真實 schema 版本 N 備份合成資料，於空環境還原後套用 N→N+1 migration，驗證 constraints／seed／代表資料；restore smoke 成為後續每次 migration 的持續 gate。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [59 deployment](59-deployment.md)

## Implementation evidence (awaiting root acceptance)

- Added [`docs/operations/restore-60-smoke.md`](../../../docs/operations/restore-60-smoke.md) with the executable isolated PostgreSQL rehearsal and cleanup boundary.
- Rehearsed schema N at migration 0019 (20 ledger rows), custom-format backup (107721 bytes), restore into an empty database, and the repository migration 0020 (21 ledger rows; `posts` present).
- Seeded the restored N+1 database with the real system seed (24 ETF rows and 213 market-universe rows). Verified 68 check/foreign-key constraints, the transaction owner foreign key, positive-transaction and non-empty-reminder rejection, and a post write.
- Real HTTP against only the restored database read the Diary/Transaction, research note, reminder, connected share and WEB session; partner compare kept private values out and a disallowed partner note read returned 403. A new Diary with one Transaction returned 201 and read back.
- A missing backup exited 1 and left a separate empty target with zero public tables. All records and credentials were synthetic; dev/K3s volumes were not used.
- Added `npm run db:restore-smoke` / `scripts/restore-smoke.sh` as the bounded CI restore gate. Its local execution passed `schema_N=20`, `schema_N_plus_1=21`, all eight fixture categories, `seed=24|213`, a complete N+1 backup→empty restore (`n1_restore_ledger=21`), and `invalid_restore_exit=1` with zero public tables in the failed target.
- Added concrete image-only and migration rollback commands, including stop-single-API, custom `pg_restore`, `rollout undo`, readiness and ledger checks, to the operations document.

## Astra acceptance — 2026-09-06

Accepted the isolated N=0019 backup→empty restore→0020 upgrade, representative real API/owner-sharing checks, and persistent `npm run db:restore-smoke` execution: N ledger20, N+1 ledger21, full N+1 backup restore ledger21, seeds24/213, invalid restore exit1 with zero target tables. The runner is a required CI step and cleans only its own temporary container. Rollback instructions explicitly restore the single API replica after image undo. No real user data or production cutover.
