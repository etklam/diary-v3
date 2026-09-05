# [34] 管理 Price Alert 並在價格條件符合時提示

Status: done
Type: AFK
User stories covered: US-058, US-059, US-060

## Parent

[完整重構 PRD](../PRD.md)

## What to build

由股票介面建立、編輯、刪除既有各類 Price Alert，排程檢查後在前景提示並可從 REST 回看。

## Acceptance criteria

- [x] 突破／跌破／漲跌幅／均線條件及既有檢查節奏使用固定行情驗證。
- [x] 先持久化 trigger state 再通知；Socket.IO 失敗不 rollback，重試與再觸發語意對等。
- [x] owner、缺行情、失敗、取消與多 alert 的端到端流程可示範，無重複 scheduler。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [18 market-provider](18-market-provider.md)
- [33 realtime](33-realtime.md)


## Source audit and schema foundation

Frozen source `server/utils/price-alert-condition.ts` only supports inclusive PRICE_ABOVE/PRICE_BELOW. CHANGE_PERCENT and MOVING_AVG were enum members whose creation was rejected and whose evaluator always returned false. PRD US-058 requires all four, so ADR0009 records the accepted correction: signed percentage thresholds use the previous regular-session close, and MOVING_AVG supports completed-session SMA periods 20/50/200 with inclusive above/below direction. The implementation below follows that decision without claiming those conditions were supported by the frozen source.

Ported price-alert contract into `packages/contracts/src/price-alerts.ts`: exact DECIMAL(10,4) input, coherent triggered state/date updates, stable ID/decimal serialization and max-100 read contract. Added migration 0012 price_alerts with owner cascade, trigger-state and threshold checks, user/create and pending/symbol indexes. Three contract tests passed (111ms); real PostgreSQL migration/precision/state/cascade test passed (575ms). Typecheck/lint passed before the last DB-test addition. API routes, condition evaluator, five-minute checker, frontend CRUD, foreground notification and independent acceptance remain pending.

Source checker marks trigger state before attempting delivery; offline/error delivery does not roll it back. Re-arming is explicit isTriggered=false/triggeredAt=null. Preserve these behaviors and correct concurrent check/edit/delete races when implementing persistence.


## Price Alert HTTP checkpoint

Implemented frozen paths GET/POST `/api/stocks/alerts`, PUT/DELETE `/:id`, all owner-filtered and no-store. Reads include triggered alerts, creation/id descending, max 100. Create preserves default messages and exact threshold strings. Update locks the owner row, validates type-dependent negative thresholds, preserves trigger state for ordinary edits, and supports explicit coherent rearm pairs. Delete is one owner-filtered statement. `PRICE_ALERT_NOT_FOUND`, OpenAPI and generated standard-fetch types added; local signed-out guard covers stock-alert routes.

PostgreSQL HTTP tests cover exact extremes, ownership, CSRF/guest, trigger state/instant consistency, explicit rearm, default/empty messages, stable cap including triggered rows and delete. The same owner fixture now creates CHANGE_PERCENT and MOVING_AVG alerts, including the `movingAverageDirection` wire field; PostgreSQL numeric readback is intentionally asserted at scale (`20.0000`, `-5.0000`).


## Price checker transaction checkpoint

Added standalone five-minute checker with idempotent start/stop and coalesced ticks. Fetches each unique pending symbol once outside transactions. After quote resolution it locks/re-reads each current row, evaluates inclusive above/below against its latest threshold, and commits trigger state before notification. Deleted/already-triggered rows are skipped. Concurrent checker instances cannot double-trigger the same still-armed row. Delivery failure does not roll back trigger state; explicit rearming allows another trigger.

The checker evaluates all four conditions using the current regular-market quote, previous regular-session close, and raw historical closes on the same basis. It validates numeric periods after PostgreSQL scale serialization (for example `20.0000`), requires 20/50/200 completed observations, includes a bar after the New York 16:00 close, excludes an incomplete current-session bar across the DST boundary, and leaves an insufficient-history MA pending. Concurrent MA checkers lock the owner row so only one notification commits. A same-symbol history failure leaves the independent price and percentage rows eligible while the MA row remains pending.


## Price runtime/provider/Socket integration

Runtime now shares one market provider between API reads and the price checker. Price checks bypass fresh-cache shortcuts and explicitly skip stale fallback on upstream failure, preventing old read-only fallback data from causing a new trigger. Added typed `price-alert:triggered` emissions alongside Diary hints. Production starts the five-minute checker after listening and shutdown awaits both schedulers before closing sockets/HTTP.

Real JWT + Socket.IO + PostgreSQL runtime evidence now primes a provider cache, simulates a stale quote outage, verifies all four rows remain pending, restores a fresh quote while history is unavailable (price and percentage rows trigger independently), then restores history and triggers the MA row. Owner-only payloads retain the private `message` field and distinguish `price`, `percent`, and `period` units. No external production data or deployment used.

## React CRUD and foreground extension

Added `/stocks/alerts`, navigation and a Company-page entry that prefills the symbol. Three locales, account-timezone dates, dirty-form navigation protection, precise decimal input, edit focus, state-preserving threshold/message edits, four condition choices, explicit rearm and delete are implemented. Desktop/mobile CRUD browser cases passed (2/2); the four-condition workflow and accepted captures are recorded in the evidence section below. Independent review remains pending.

Foreground reminders now listen for price hints and local CRUD changes, fetch the authoritative price list alongside Diary reminders, deduplicate triggered IDs, and clear state on session changes. Each REST result is handled independently so one rejected read does not discard the other. Synthetic browser harness runs the real checker against only its dedicated FOREGROUND symbol. The foreground cases are recorded below; they keep private message text out of summaries while the owner Socket event retains its wire field.

Foreground browser verification completed: five cases passed (19.7s), covering Diary notices on desktop/mobile, server-side account revocation, and real price-checker → Socket hint → REST → notice on desktop/mobile. Price notices survive reload, omit private message content, link to the list, and disappear after deletion and sign-out. First price run failed because the test omitted its post-login English locale selection; failure snapshot showed the correct Chinese triggered notice. Corrected locale setup and exact delete-button name, then reran all five successfully. Author inspected the mobile foreground banner; no overflow. Actual transport-loss/reconnect and visibility restoration still need browser acceptance evidence.

Post-extension typecheck, lint and production Web/API build all passed. Build retains the existing non-fatal Vite config import-extension and Node register deprecation warnings. Ticket remains in-progress; no deployment performed.

## Four-condition correction evidence (pending root acceptance)

- `tests/unit/price-alert-contract.test.ts`: 3/3 passed; all four types, signed percentage input, MA direction/period boundaries, serialized response defaults and owner omission are covered.
- `tests/integration/price-alert-checker.test.ts`, `price-alert-schema.test.ts`, `price-alert-http.test.ts`, and `price-alert-runtime.test.ts`: 4 files / 11 tests passed against disposable PostgreSQL. The checker cases cover equality, signed direction, 20/50/200 periods, `20.0000` numeric input, completion at New York 16:00, DST date handling, insufficient history, same-symbol independent conditions, row-lock races, stale provider fallback, and fresh recovery through Socket.IO.
- `npm run contracts:generate && npm run contracts:check` passed; generated OpenAPI/client output is current. `npm run typecheck` passed after narrowing the web create/edit request union so each endpoint receives its own validated body.
- `PLAYWRIGHT_CHANNEL=chrome npx playwright test tests/e2e/price-alerts.spec.ts` passed 2/2 (1440px and 390px). The existing surface now creates all four conditions, exercises signed-percent and completed-session-period copy, selects MA period/direction, edits MA from 50/below to 20/above with period-select focus, edits percent from negative to positive with input focus, verifies all triggered states remain triggered, rearms, switches all three locales, deletes, captures the accepted desktop/mobile surfaces, and checks mobile no-overflow. Existing foreground browser evidence remains valid for owner-only notification and reconnect recovery.

## Astra feature acceptance — 2026-09-06

Root independently inspected the corrected desktop/light and390px/dark captures. The four conditions are readable, the MA period is an explicit integer completed-session unit, and the tested MA edit focuses its select. Latest Chrome rerun passes2/2 with MA50/below→20/above and percent negative→positive edits preserving triggered state, price precision, rearm/delete and locales. Focused backend evidence includes11 integration tests and3 contract tests, four-condition runtime owner Socket payloads, stale/missing-history recovery, concurrent trigger locking and20/50/200/session boundaries. Contracts and production build pass; later global typecheck errors belong to concurrently unfinished Overview/rotation work.

The feature is accepted, but Status remains in-progress because declared blocker ticket33 must finish its reconnect/visibility/proxy acceptance. Do not mark34 done until33 is accepted. No further price-alert visual polish is requested.

## Root final acceptance — 2026-09-06

Ticket33 and its dependent34 are now accepted together. Root reviewed the actual foreground reconnect/controlled-visibility tests and runtime/proxy structure. Latest evidence:7/7 Chrome cases with real HTTP/Socket state,4 focused files/12 listener-auth-proxy-pusher tests and owned lint. The controlled visibility fixture exercises the real app handler and REST/socket recovery; it is not claimed as native OS background execution. Ticket34 additionally has the independently accepted final desktop/mobile four-condition UI and backend evidence above. Single runtime construction/start/stop and the single-instance deployment contract are recorded; actual Kubernetes Ingress/Recreate/update execution belongs to59. All declared blockers are complete.
