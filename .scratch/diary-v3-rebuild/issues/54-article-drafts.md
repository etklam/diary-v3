# [54] 建立及預覽管理員 Post 草稿

Status: done
Type: AFK
User stories covered: US-093

## Parent

[完整重構 PRD](../PRD.md)

## What to build

管理員建立、編輯、保存及私下預覽 Markdown Post 草稿。

## Acceptance criteria

- [x] Post schema、管理員授權、欄位驗證、作者投影及 draft lifecycle 真正持久化。
- [x] 重新開啟可繼續編輯；Markdown 安全呈現，草稿不經公開入口洩露。
- [x] 真 DB／API／React 覆蓋建立、更新、預覽、長內容與非 Admin 拒絕。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [04 web-session](04-web-session.md)

## Implementation checkpoint — 2026-09-06

Added the PostgreSQL `posts` migration, shared Post contracts, role-protected admin CRUD and preview surface, safe Markdown rendering, and public SSR route modules. The focused disposable PostgreSQL HTTP suite passes 7/7, including a 98k-character draft reopen, public privacy projection, cross-admin authorization, lifecycle timestamps, permissions and frozen MariaDB search probes. `npm run contracts:check` and repository typecheck pass. Browser/editor and root acceptance remain pending; this ticket is intentionally still in progress.

The focused Chrome principal flow `tests/e2e/posts.spec.ts` passes 1/1 in 9.1s against the disposable E2E database. It covers draft save/reopen, publish, no-JavaScript public reading, archive/republish, ordinary-user denial and refreshed `docs/design/evidence/public-content/{1440,390}.png`; root review and tracker checks remain pending.

## Astra acceptance — 2026-09-06

Accepted against the 7/7 disposable PostgreSQL suite and 1/1 Chrome principal flow (9.1s), runtime-measured search fixtures, and direct source review of draft retention on failed writes. Astra inspected the desktop/light and mobile/dark article captures. Shared mobile navigation is assigned to ticket58; no repeated cosmetic checks are required.
