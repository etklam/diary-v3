# [27] 完成 Thesis Review 並記錄 Portfolio Decision

Status: done
Type: AFK
User stories covered: US-053, US-054

## Parent

[完整重構 PRD](../PRD.md)

## What to build

由 Thesis 進入複盤，記錄 outcome、反思與 Portfolio Decision，再回看論點及複盤歷史。

## Acceptance criteria

- [x] Thesis Review 使用自己的 lifecycle 和欄位約束，不借用 Diary Review 完成捷徑。
- [x] 有效與無效 outcome／decision、owner、日期及重複操作遵循來源。
- [x] 完整 UI／API／DB 測試證明原始 Thesis、Review 與 decision 脈絡可分辨。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [07 preferences](07-preferences.md)
- [26 investment-thesis](26-investment-thesis.md)

## Backend integration checkpoint — 2026-09-05 (historical)

Implemented with ticket 26 to avoid a temporary non-atomic snapshot path: review POST validates meaningful reflection and ACTIVE state inside the save/review lock, stores a full immutable-in-API snapshot, then updates last review/outcome in the same transaction. Composite FK enforces owner. At this checkpoint, four focused PostgreSQL scenarios included historical snapshot preservation and concurrent archive/review; comprehensive DB constraint/rollback evidence, React review workflow and independent review remained.

## React checkpoint — 2026-09-05 (historical)

Added `/stocks/:symbol/thesis` and Company link with current thesis fields/status, explicit UTC due input, account-timezone review history, outcome/decision/reflections and full snapshots. Unsaved thesis disables review until saved. Desktop/mobile lifecycle 2/2 passed (7.7s); production build/typecheck passed; detector clean. At this checkpoint, scope/recovery/independent review were recorded in `docs/design/thesis-finish-review.md`.

### Failure/transaction verification

Five PostgreSQL scenarios now pass (2.67s), including direct cross-owner review FK rejection and an injected failure after snapshot insert proving snapshot/current state roll back together. Focused browser recovery passed (4.9s): failed PUT retains edits, successful PUT retains unsaved reflection and its navigation guard, unchanged `.123Z` due date survives, subsequent review saves and clears dirty state.

## Finish validation — 2026-09-06

- Existing Thesis UI evidence: `tests/e2e/thesis.spec.ts` 3/3, covering lifecycle at 1440/390 and failed-save recovery with snapshot immutability, owner/session clearing and precise due time.
- Focused PostgreSQL `tests/integration/investment-thesis.test.ts`: 6/6 passed, including the new invalid outcome/decision no-write checks and two sequential valid reviews producing distinct ACTIVE snapshots, alongside existing lifecycle, owner, concurrency and rollback scenarios.
- Root accepted the review outcome/decision, owner, date, repeat-operation and immutable-history evidence. No production or UI changes were made for ticket 27.

## Final acceptance — 2026-09-06

Root reviewed the narrow API fixture with existing Thesis UI/API/DB evidence and the green global typecheck/lint/contracts gate. All three acceptance criteria are checked; ticket 27 is complete.
