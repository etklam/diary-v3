# [33] 以前景 Socket.IO 接收提醒並在撤銷後斷線

Status: done
Type: AFK
User stories covered: US-004, US-005, US-060, US-111

## Parent

[完整重構 PRD](../PRD.md)

## What to build

啟用單實例提醒排程與真 Socket.IO，前景顯示到期提示、斷線後以 REST 回復，登出全部／改密碼即撤銷相應 sockets。

## Acceptance criteria

- [x] cookie／Bearer handshake、origin、身份與 malformed input 正確處理，未授權不能訂閱其他使用者。
- [x] 日記 pusher 不以推送代表已送達；REST 是真實狀態，重連不遺漏既有可讀提醒。
- [x] 真 listener 測試涵蓋到期提示、撤銷、重連、parent dismissal guard；scheduler 只有一個且 logs 帶關聯資料。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [06 account-security](06-account-security.md)
- [32 recurring-alerts](32-recurring-alerts.md)


## Pusher foundation checkpoint

Audited frozen `server/schedulers/alert-pusher.ts`: each minute hints at active reminders in `[now, now + 65 seconds)`, with parent-dismissal protection; it neither materializes series nor marks delivery/dismissal. Implemented the PostgreSQL query and dependency-injected pusher in `apps/api/src/alert-pusher.ts`, retaining wire event `alert:triggered` and minimal Diary reference. Ordered by triggerAt/id.

Corrected legacy lifecycle debt: repeated start is idempotent, slow ticks coalesce, stop clears the timer and awaits an in-flight read without emitting its stale results. Errors carry operation/jobId and per-alert owner/id context; one failing recipient does not prevent other hints. Overlapping windows may repeat hints by design; forthcoming client must deduplicate IDs and restore from REST.

Three deterministic timer/broadcaster tests passed (318ms). PostgreSQL fixture covers exact inclusive/exclusive window boundaries, dismissed root + artificially active child, repeated reads and unchanged persisted dismissal state. Socket.IO dependency/listener, auth/origin/revocation, production bootstrap, frontend reconnect and independent review remain pending. Scheduler is not started in production yet; this foundation does not satisfy the full ticket.


## Real Socket.IO boundary checkpoint

Installed exact Socket.IO server/client 4.8.3 after checking registry and official `server-options`/`middlewares` documentation. Added listener factory on a supplied Node HTTP server, with Origin gating through both CORS and allowRequest, cookie/auth-token/Bearer parsing, generic handshake failures, server-owned user rooms, expiry disconnect, owner hints and account disconnect hook. Dismiss validates ID and reauthenticates before invoking the owner-scoped persistence dependency. A revocation epoch rejects handshakes spanning a revoke/registration race. No client-supplied room subscription is exposed.

Malformed explicit credentials now fail rather than falling back to a valid cookie. Duplicate access cookies and malformed Origin URLs are rejected. Source www/apex alias and native no-Origin handshakes remain supported. Security changes are intentional input-hardening corrections.

Six tests passed (211ms): parser/origin fixtures plus actual WebSocket/polling sockets proving cookie login, native auth, hostile Origin rejection, user isolation, targeted revocation, malformed dismiss rejection and per-mutation reauthentication. Listener tests currently inject authentication and dismissal dependencies; real JWT/PostgreSQL service wiring, HTTP logout-all/password revocation integration, expiry/race tests, production bootstrap and foreground client remain outstanding. No production listener or scheduler is started yet.


## JWT and HTTP revocation integration checkpoint

Auth service now exposes `authenticateSocketAccess`, returning the verified access expiry and checking the current database token version. Verified tokens must contain a finite expiry (issued Web/native tokens already do). Added an optional app revocation callback after successful logout-all/password transactions; rejected password changes do not notify or disconnect.

Real Node HTTP + Socket.IO + disposable PostgreSQL tests issue actual login JWTs, connect sockets, invoke HTTP logout-all/password changes, observe disconnect and reject reconnect with old JWTs. Wrong current password keeps the socket connected. Six socket/account-security tests passed (2.78s); typecheck/lint passed. Production bootstrap still must supply the callback and listener dependencies; this is tested integration capability, not production activation. Owner-scoped dismiss wiring, pusher bootstrap and frontend reconnect remain outstanding.


## Runtime composition checkpoint

Extracted `dismissDiaryAlert` as the shared owner-locked transaction for REST and sockets; REST retains its 404 contract and socket errors remain generic. Added `createApiRuntime` composing Hono, real Socket.IO, JWT service, committed HTTP revocation callback, PostgreSQL pusher and shared dismissal. Production entry now uses this composition and starts the idempotent timer only after listening; shutdown waits for pusher stop before closing sockets/HTTP and the database pool. No deployment/cutover performed.

The real JWT integration tests now use the runtime factory rather than test wiring. Root socket dismissal verifies every persisted series occurrence is dismissed, with existing logout-all/password disconnect checks. Nine combined runtime/alerts PostgreSQL tests passed (2.62s). Lint, typecheck and production build passed. Added a live pusher-to-socket assertion for a 30-second upcoming reminder; final focused runtime result is recorded below. Frontend listener, REST recovery/deduplication, deployment proxy and single-replica checks, expiry/race acceptance and independent review remain pending.


## Same-origin development transport checkpoint

Web Vite config now proxies both `/api` and `/socket.io`, enabling websocket upgrades on the latter via shared `apps/web/proxy.ts`. A real Vite server test connects real Socket.IO clients using cookie credentials through polling and websocket transports, receives an owner hint, and checks API response/cookie forwarding. Test passed (321ms); typecheck and targeted lint passed.

Current compose file contains PostgreSQL only. Production ingress/reverse proxy and replica enforcement are still deployment-ticket obligations, not satisfied by this development proxy. Browser foreground state/reconnect remains the next integration step. The E2E API harness currently constructs Hono-only per-scenario apps and must attach the socket service before browser foreground tests can provide end-to-end evidence.


## Browser foreground integration checkpoint

Added `ForegroundReminders` to the authenticated shell. Socket connect/trigger/dismiss hints refetch the capped REST list; stable IDs deduplicate count and only due instants contribute. The next upcoming instant schedules a REST refresh, with a 60-second fallback. Hidden documents disconnect/cancel reads; visible documents reconnect/restore. Server disconnect retries after REST session refresh. Logout revision unmounts the listener, aborts requests and clears count. Successful form/list mutations signal local refresh. The compact due-count link opens `/alerts` without exposing Diary body text.

The synthetic E2E harness now attaches the real socket auth/dismiss service and an accelerated pusher tick (test-only; production remains 60 seconds). Browser tests observe an actual websocket, create a soon-due reminder while the page remains open, show exactly one due item, reload with REST recovery, dismiss through UI and verify logout cleanup. Desktop/mobile 2/2 passed (14.1s). Initial desktop attempt failed at login due to Vite 504 Outdated Optimize Dep; isolated rerun passed. Do not run builds concurrently with browser acceptance. Lint/typecheck/build passed before the isolated browser run.

Author captures are in `docs/design/evidence/alerts/foreground-{1440,390}.png`. Independent review, explicit transport-reconnect/visibility/expiry coverage, production proxy/replica checks and complete ticket acceptance remain pending.


## Expiry/revocation acceptance

Added controlled real-listener races: authentication is held pending while account revocation occurs, then stale completion is rejected without registration; expired handshake is rejected; a connected session expires and cannot receive subsequent hints. Listener suite 5/5 passed (715ms). Browser HTTP logout-all causes socket disconnect, private reminder clearance and login return; 1/1 passed (5.5s). Typecheck and targeted lint passed.

Independent reviewers were rechecked and all three remain terminal usage-limit errors (reset reported Sep 12, 2026). Root continues implementation; these tests do not establish independent review. Full regression run follows this checkpoint.

Full Vitest checkpoint: 57 files / 438 tests passed (14.71s), covering current API/domain/real PostgreSQL/listener suites. Browser tests are separate; no claim of all-ticket completion.

## Transport-loss browser evidence

`tests/e2e/foreground-reminders.spec.ts` now closes an actual forwarded WebSocket while the browser network is offline, creates a synthetic price alert through the separate API request stack, waits for persisted triggering, verifies no browser notice, then restores network and observes a new transport plus the authoritative REST notice. Passed 1/1 (6.1s total). This establishes missed-event recovery without reloading. Visibility restoration, production replica/proxy enforcement and independent review remain pending.

## Visibility and runtime-boundary evidence

Added a real Chrome foreground case that uses a controlled `visibilityState`/`visibilitychange` event to change the document to hidden, observes the listener close, creates a reminder that becomes due while reads are suspended, confirms no notice while hidden, then restores visibility and verifies a new Socket.IO transport plus the authoritative REST notice. The case also checks Diary body text remains private; this is browser lifecycle evidence, not a claim of native OS background scheduling. Run with `PLAYWRIGHT_CHANNEL=chrome npx playwright test tests/e2e/foreground-reminders.spec.ts`; the final bounded run passed 7/7 (desktop/mobile reminder, price-alert, revocation, transport-loss and visibility cases).

The runtime/local transport boundary is explicit: `createApiRuntime` composes one pusher and one Socket.IO listener per HTTP process; `createAlertPusher.start()` is idempotent, and `server.ts` starts the scheduler once after listen and stops it before the socket/database shutdown. `apps/web/proxy.ts` forwards same-origin `/api` and `/socket.io` websocket upgrades, with polling and websocket coverage in `tests/integration/socket-proxy.test.ts`; real JWT revocation and rejected reconnect are covered in `tests/integration/socket-auth-session.test.ts` and `tests/integration/socket-listener.test.ts`. The deployment contract for ticket 59 is one API replica with a `Recreate` rollout while the in-process scheduler is enabled, awaiting the old runtime's stop before replacement so schedulers never overlap; a future dedicated CronJob must disable the in-process scheduler rather than run both. Production reverse-proxy configuration and single-replica enforcement remain ticket 59 deployment acceptance, so 33 does not claim rollout evidence.

The matching focused listener boundary run passed 4 files / 12 tests with `./node_modules/.bin/vitest run tests/unit/alert-pusher.test.ts tests/integration/socket-proxy.test.ts tests/integration/socket-listener.test.ts tests/integration/socket-auth-session.test.ts --reporter=dot` (10.91s). This covers idempotent scheduler start/stop, real polling and websocket forwarding, owner isolation and malformed input, expiry/revocation, logout-all/password disconnects, and rejection of stale-token reconnects.

## Root final acceptance — 2026-09-06

Ticket33 and its dependent34 are now accepted together. Root reviewed the actual foreground reconnect/controlled-visibility tests and runtime/proxy structure. Latest evidence:7/7 Chrome cases with real HTTP/Socket state,4 focused files/12 listener-auth-proxy-pusher tests and owned lint. The controlled visibility fixture exercises the real app handler and REST/socket recovery; it is not claimed as native OS background execution. Ticket34 additionally has the independently accepted final desktop/mobile four-condition UI and backend evidence above. Single runtime construction/start/stop and the single-instance deployment contract are recorded; actual Kubernetes Ingress/Recreate/update execution belongs to59. All declared blockers are complete.
