# [31] 設定並取消單次 Diary 回頭提醒

Status: done
Type: AFK
User stories covered: US-021, US-055

## Parent

[完整重構 PRD](../PRD.md)

## What to build

在 Diary 設定單次 Alert，由提醒清單閱讀、開啟日記及取消該次提醒。

## Acceptance criteria

- [x] 提醒以正確 instant 儲存並依使用者時區顯示；Diary 編輯的清單 replace 語意對等。
- [x] canonical request、仍有效 aliases、owner、上限／trigger time／ID 排序及 Diary 刪除關聯正確。
- [x] UI／API／真 DB 覆蓋建立、重新讀取、取消、過期、跨時區及 rollback。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [07 preferences](07-preferences.md)
- [08 diary-editor](08-diary-editor.md)

## Required relation integration

Once persisted Alerts are writable, extend Diary/Timeline counts and `GET /api/diaries/activity` with actual undismissed Alert counts. Ticket 12 currently emits zero because no Alert relation exists; add a positive fixture and owner isolation assertion with this slice.

## Persistence/API checkpoint

Audited frozen alert contract, handlers, query/persistence module and Diary limits (50 draft alerts per write). Added migration 0011: alerts, Diary cascade, same-Diary composite parent FK, unique parent/instance number, nonempty messages and single-alert shape checks. GET/POST `/api/alerts` and PUT `/:id/dismiss` are implemented with owner/CSRF/no-store guards. Active list includes overdue and future reminders, sorted triggerAt/id ascending and capped at 100. Canonical clients use the strict camelCase request schema; the standalone Alert wire parser also retains the frozen `snake_case` aliases, choosing each snake value when non-nullish and falling back to camelCase for `null`/`undefined` when the paired camel value exists. An effective null with no fallback remains invalid.

Standalone creates lock the owner Diary within the transaction, protecting against concurrent deletion; dismiss uses the same Diary-first lock order and re-reads the alert. Recurring persistence is shared with upcoming Diary writes. Single/recurring API + real PostgreSQL and pure date fixtures: 19 passed (2.08s), including idempotent dismiss, isolation, canonical schema, precision, FK/cascade, cap and synthetic child-insert rollback.

Remaining: actual Diary/Timeline/Calendar counts, independent review and final scope checks. Ticket remains in-progress.

Static checkpoint: typecheck and production build passed; a test-only prefer-const lint finding was corrected.

## Calendar relation checkpoint

`GET /api/diaries/activity` now counts actual undismissed alerts, matching frozen `server/utils/diary-activity.ts` (future and overdue included). A correlated aggregate avoids multiplying transaction counts when multiple alerts exist. Real PostgreSQL HTTP fixtures cover two active reminders plus a dismissed reminder against two transactions, three account timezones, date boundaries and another owner with zero alerts. Diary create/append/update source audit confirms append unions reminders, PUT omission preserves, and explicit array replaces (including `[]` clearing); that write integration remains pending.

Verification: Calendar PostgreSQL HTTP suite 2/2 passed (1.41s); typecheck and targeted ESLint passed. Ticket remains in-progress until Diary write/read integration, UI and independent acceptance are complete.

## Diary write/read integration checkpoint

Diary create and append now persist reminders in the same transaction as content, ledger and stock contexts. PUT omission preserves reminders; explicit arrays replace, including `[]` clearing. Frozen Diary contract accepts an optional alert `id`; this is accepted for compatibility but replacement creates new identities, matching source persistence. Drafts remain capped at 50. Series expand in the owner's timezone through the shared persistence function.

Detail/by-date/create/update responses now contain persisted reminders. List loads reminders in one owner-filtered batch within its repeatable-read snapshot. Timeline counts undismissed reminders rather than every stored historical reminder. OpenAPI and fetch-client types regenerated.

New real PostgreSQL HTTP coverage verifies create/read/list/append/omit/replace/clear, optional old id, recurring children, 51-draft rejection, owner isolation, concurrent appends and synthetic insert failures rolling back Diary content, ledger, deleted reminders and new Diary creation. Full-suite run found one obsolete pre-alert test rejecting `alerts: []` (422 other tests passed); updated that test to reject invalid reminder data instead. React editing/list and independent review remain pending; do not mark done.

## Reminder list UI checkpoint

Added `/alerts` with navigation and safe login return, account-timezone dates, message and Diary link, earliest-100 scope, root-vs-child dismissal labels, pause/recurrence metadata, empty/loading/error/retry, three locales and logout cleanup through the shared session boundary. Successful dismissal refetches the active list so cap replenishment and root cascades are reflected.

Chrome E2E desktop/light 1440 and mobile/dark 390: 2 passed (9.7s), covering seeded Diary reminders, correct New York 09:00, link navigation, child/root/single dismissal, failure recovery, locales, empty and sign-out. Author inspected both captures; see `docs/design/alerts-finish-review.md`. Lint/typecheck/build passed. Reminder authoring/editing and independent review are still required.

## Diary reminder form checkpoint

Added shared `alert-fields.tsx` to full Diary create/edit. Supports single/WEEK/MONTH drafts, 50 cap, removal, message/time validation, device-zone datetime with shared DST ambiguity selection and original instant preservation. Existing active recurring roots collapse to one draft; unchanged reminder section omits the API field so IDs and dismissed child state survive ordinary text edits. Editing the collection retains source full replacement semantics and explicitly explains series regeneration. Dirty-state protection includes reminder changes.

Chrome authoring tests at 1440/390 passed 2/2 (8.2s), creating a weekly series through UI, dismissing a child, editing title only with exact alert ID/state preservation, reopening and clearing. Initial browser tests exposed accessible names polluted by select options/textarea content; explicit labels corrected these. Author inspected both form captures (`editor-1440.png`, `editor-390.png`); no horizontal overflow. Lint/typecheck/build passed before final label-only fix; final UI behavior passed afterward. Independent review, single/DST/month boundary form evidence, uncertain-write recovery and quick-entry integration still require acceptance work.

## Reminder instant acceptance

Browser fixture with device timezone America/New_York now proves a missing spring-forward time is rejected before saving, a repeated fall-back minute exposes both UTC choices, and selecting the later occurrence persists 06:30Z. A message-only reminder replacement preserves the existing 06:30:42.123Z instant, including seconds/milliseconds and DST occurrence. The ambiguous-instant select has an explicit accessible name. Targeted browser test passed (1/1, 5.7s); typecheck and targeted lint passed.

Uncertain dismissal recovery: desktop/mobile browser requests execute the real dismissal then drop its HTTP response. UI retains the displayed collection and shows an error; retrying the same id succeeds idempotently and refreshes the remaining list. Both browser cases passed (2/2, 8.0s). This establishes dismissal recovery only, not uncertain Diary replacement/create recovery.

## Contract parity and form boundary checkpoint

Restored standalone Alert alias compatibility from the frozen handler. The wire parser applies `diary_id ?? diaryId`, `trigger_at ?? triggerAt`, and `recurring_mode ?? recurringMode` independently; a non-nullish snake value wins even when the camel value is valid, while a null snake value falls back only when its camel pair exists. Missing trigger keys still default to the API request clock; an effective null remains invalid. Canonical camelCase remains strict for generated clients. OpenAPI now documents the mixed wire body and the typed client was regenerated.

Focused evidence: `tests/unit/alert-contract.test.ts` 3/3; `tests/integration/alerts.test.ts` 8/8 against disposable PostgreSQL, including canonical/alias/conflict/null/default/invalid precedence and Diary cascade; `npm run typecheck`, `npm run contracts:check`, and targeted ESLint passed. The existing Alerts Chrome spec covered the new single, WEEK and MONTH editor drafts at 1440/390, dismissed-child and ID preservation, and DST; all five functional cases passed across the full run plus the isolated 390px rerun (the first 390px result failed only while Playwright closed a missing trace artifact). Root/Astra final review remains pending.

## Bounded cross-flow evidence audit

The shared API suite covers Diary create/append, PUT omission preservation, explicit replacement/clear, owner isolation, 50-item validation, recurring expansion and PostgreSQL rollback. Quick Diary HTTP and Chrome suites cover create, append, retry and draft recovery; Quick Diary intentionally does not render `AlertFields`, and PRD stories 55–57 do not require Quick entry to create server Alerts, so no Alert-specific Quick entry gap remains.

The remaining evidence-only gap is a dropped HTTP response after a Diary create or replacement has already committed. Current tests cover pre-commit 500 responses, atomic database rollback and client retry; they do not claim post-commit uncertain-write recovery. Keep that as a broader Diary write follow-up if required by the overall product gate, outside the bounded 31 implementation.

## Final acceptance

Astra/root reviewed the updated mixed wire contract, real PostgreSQL fixtures, Alerts Chrome evidence and the accepted Diary fieldset direction. The three criteria are complete; the post-commit Diary dropped-response case remains explicitly tracked under the broader cross-flow follow-up and is not claimed by this ticket.
