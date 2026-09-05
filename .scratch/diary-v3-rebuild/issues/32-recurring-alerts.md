# [32] 建立 WEEK／MONTH 提醒並取消整個系列

Status: done
Type: AFK
User stories covered: US-056, US-057

## Parent

[完整重構 PRD](../PRD.md)

## What to build

由 Diary 建立當地 weekday 09:00 的 recurring Alert，並區分 root 全系列取消與 child 單次取消。

## Acceptance criteria

- [x] self-parent root、instanceNumber、同 Diary 關聯及建立時 materialize 遵循基準。
- [x] WEEK 的平日／週末起點、MONTH 月底、DST 及使用者時區有固定時鐘驗證。
- [x] root 取消在 transaction 內影響全組，child 只取消自身；列表與後續 scheduler 不重新暴露已取消 parent 的 children。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [31 diary-alerts](31-diary-alerts.md)

## Recurring foundation checkpoint

Ported calendar-only WEEK/MONTH generation and required timezone conversion without Prisma/DOM dependencies. WEEK materializes weekdays through Friday (weekend starts continue into the next workweek); MONTH stays in the current month and may yield no rows when its remaining dates are weekends. Every instance is 09:00 in the account timezone; root becomes self-parent after insert, children share root and sequential instance numbers.

Standalone API creates all instances atomically and returns the root or null for an empty set. Child dismissal affects one row; root dismissal affects the entire series in one transaction. Listing defensively excludes children of dismissed parents. The composite parent FK prevents cross-Diary/cross-owner links. Ported source fixtures plus spring/fall DST coverage; combined 19 date/PostgreSQL tests passed (2.08s). Source test imports and asserted indices were adapted to strict TypeScript.

Remaining: Diary editor/replace lifecycle, browser recurring flows, scheduler integration (ticket 33), independent review and final scope checks. Ticket remains in-progress.

Static checkpoint: typecheck and production build passed; a test-only prefer-const lint finding was corrected.

## Editor and contract parity checkpoint

The incumbent Diary reminder controls now have browser evidence for one-off, WEEK and MONTH drafts together. The editor still uses the existing message, device-local datetime, repeat select and remove controls; MONTH materializes remaining weekdays through month end, while one-off reminders remain `recurringMode: null`. The preservation path dismisses a WEEK child, edits only the Diary title, and verifies all alert IDs and the dismissed child state survive before removing all three drafts.

The standalone Alert route accepts the frozen mixed wire body with per-field `snake_case ?? camelCase` precedence; null only falls back when its paired camel value exists, and canonical generated-client shapes are represented by the wire schema. `tests/unit/alert-contract.test.ts` 3/3, `tests/integration/alerts.test.ts` 8/8 on disposable PostgreSQL, and `npm run contracts:check` passed. Alerts Chrome evidence covers 1440/390 editor cases and DST; all five functional cases passed across the full run plus the isolated 390px rerun (the initial 390px failure was Playwright trace teardown `ENOENT` only).

## Final acceptance

Astra/root reviewed the recurring materialization, parent/child dismissal, owner/rollback fixtures, updated wire contract and existing Diary reminder fieldsets at desktop/mobile widths. The three criteria are complete; scheduler integration remains ticket 33's scope.
