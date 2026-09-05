# Diary reminder list — author verification

Scope: `/alerts`, navigation and safe login return. Operate mode; extends the established Diary list world with bordered rows, message-first hierarchy and existing typography, colors and controls. All dates use the account timezone. Earliest 100 active items is stated explicitly. The root action says it dismisses the entire series; child/single actions identify one occurrence.

Author inspected desktop light (1440) and mobile dark (390) captures in `evidence/alerts/`. Wrapped message, timezone, link and action remain readable without horizontal overflow. Empty/loading/error/retry, single-child/root dismissal, private-content omission, sign-out and three locale headings have browser evidence. Tests: `tests/e2e/alerts.spec.ts`, 2 passed (9.7s). Lint, typecheck and production build passed.

This began as author evidence. Astra/root completed the independent review of the list, fieldsets, responsive states and evidence below; the remaining broader keyboard and post-commit write follow-ups are tracked outside tickets 31/32.

## Authoring extension

Full Diary form now includes reminder drafts in the incumbent fieldset layout; no new visual system. Author reviewed both editor captures after successful desktop/mobile form tests (2/2, 8.2s). Messages, datetime and recurrence controls have explicit accessible names. Unchanged collections preserve server state; replacement consequences are stated before controls. This supersedes the earlier note that the full Diary authoring form was absent.

## Final implementation evidence accepted

The form evidence now creates one-off, WEEK and MONTH reminders in the existing controls at 1440px and 390px, dismisses a WEEK child, preserves all alert IDs/state through a title-only edit, and removes the full collection. The full Alerts Chrome spec had 4/5 functional cases pass on its first run; the 390px navigation case was rerun in isolation and passed 1/1 after the only initial failure, a Playwright trace artifact `ENOENT` during browser-context teardown. The DST case and both authoring widths passed.

The API wire parser restores the frozen standalone aliases with independent `snake_case ?? camelCase` precedence; a null snake value falls back only when its camel pair exists, and an effective null is rejected. Contract unit tests pass 3/3, Alerts HTTP/PG integration passes 8/8, OpenAPI and typed client are regenerated, and typecheck, contracts:check and targeted ESLint pass. Astra/root accepted the final visual and behavioral surface.

The cross-flow audit found no Alert-specific Quick Diary requirement: Quick entry intentionally omits the Alert fieldset, while its existing HTTP/Chrome tests cover create, append, retry and local draft recovery. Diary Alert tests cover transactional create/append/replace/clear and rollback. A dropped-response-after-commit fixture for Diary create/replacement remains a broader uncertain-write evidence follow-up; existing tests cover pre-commit failures and do not claim that stronger guarantee.

## Foreground realtime boundary

Foreground notices treat Socket.IO as a hint channel. `ForegroundReminders` restores the capped REST projections on connect, trigger, dismiss, server disconnect and visible-document recovery; hidden documents disconnect and cancel reads. The browser evidence in `tests/e2e/foreground-reminders.spec.ts` covers an alert triggered while transport is unavailable and a reminder that becomes due while the document is hidden, then verifies REST recovery after reconnect without exposing the Diary body or price-alert message.

The runtime contract is one `createApiRuntime` composition per API HTTP listener: its pusher and price checker are started once after the listener binds, their lifecycle is stopped before Socket.IO and the database close, and `createAlertPusher.start()` is idempotent under repeated calls. `apps/web/proxy.ts` forwards both `/api` and `/socket.io` through the same Web origin, with websocket upgrades enabled; `tests/integration/socket-proxy.test.ts` covers cookie-authenticated polling and websocket transports. The ticket 59 deployment contract is one API replica with a `Recreate` rollout while the in-process scheduler is enabled: stop and await the old runtime before starting its replacement, with no overlapping scheduler processes; a future dedicated CronJob must disable the in-process scheduler rather than run both. Production ingress and single-replica enforcement remain deployment acceptance in ticket 59, so this document records the contract and local evidence without claiming a production rollout.
