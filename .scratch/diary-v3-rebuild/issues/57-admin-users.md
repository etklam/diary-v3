# [57] 由 Admin 管理使用者並撤銷被刪帳戶存取

Status: done
Type: AFK
User stories covered: US-096

## Parent

[完整重構 PRD](../PRD.md)

## What to build

管理員查看既有統計、搜尋／分頁 users、更新角色及刪除帳戶，並驗證其登入及即時連線影響。

## Acceptance criteria

- [x] 所有既有 admin 能力、角色／刪除限制、使用者投影與關聯清理依基準。
- [x] 被刪除帳戶的 session 與 Socket.IO 存取失效，其他帳戶不受影響。
- [x] 雙帳戶／多 client 真 HTTP 與 UI 驗證搜尋、角色、刪除、越權及資料隔離。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [33 realtime](33-realtime.md)

## Astra implementation direction — 2026-09-06

See `docs/design/admin-users-brief.md`. Frozen `server/utils/user-queries.ts` includes admin stats/recent activity and `/api/admin/diaries` in addition to user CRUD; preserve these existing admin capabilities. Explicitly exclude private Review fields from admin Diary/recent-activity projections per PRD33, record the intentional legacy correction with regression evidence, and test role downgrade/deletion against already-issued HTTP/native/Socket credentials.

## Implementation and evidence checkpoint — 2026-09-06

- Added strict admin user, Diary projection, statistics, list, role-update, and delete contracts. OpenAPI and generated client artifacts include `/api/admin/users`, `/api/admin/users/{id}/role`, `/api/admin/users/{id}`, `/api/admin/diaries`, and `/api/admin/stats`.
- The server re-reads the target role from PostgreSQL for every admin request, rejects self role/delete operations, locks role/delete mutations, keeps the revocation callback after a committed delete, and projects no private Review fields in admin Diary data. Delete cascade and post-commit revocation preserve the survivor session.
- `tests/integration/admin-users-http.test.ts`: 2/2 disposable PostgreSQL HTTP cases pass. They cover case-insensitive search/tie ordering, guest/ordinary denial, self guards, fresh role authorization against an already-issued session, private projection exclusion, statistics, delete cascade, HTTP/native/API-key invalidation, and survivor isolation.
- `/admin/users` is registered in the React route graph and the ADMIN navigation. `tests/e2e/admin-users.spec.ts`: 2/2 Chrome cases pass (8.5s), covering real inventory/stats/recent Diary data, current-account guard, explicit role Save, confirmed delete, ordinary denial, three-locale-ready route copy, keyboard controls, and 1440/390 overflow captures at `docs/design/evidence/admin-users/`.

The parent agent owns final status and independent acceptance; the controlled evidence above does not authorize production account administration.

## Astra acceptance — 2026-09-06

Accepted the 2/2 disposable PostgreSQL admin HTTP suite, source review of explicit private-field projections and post-commit revocation hook, and 2/2 Chrome admin flow (8.5s): role changes, self protection, account removal and ordinary-user denial. Astra inspected desktop/mobile admin captures. Existing ticket33 socket-disconnect infrastructure supplies the shared live-connection behavior; the admin suite checks its post-commit hook plus HTTP/native/API-key rejection.
