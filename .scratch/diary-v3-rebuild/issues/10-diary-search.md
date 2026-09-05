# [10] 搜尋與分頁管理 Diary 資料庫

Status: done
Type: AFK
User stories covered: US-013, US-022

## Parent

[完整重構 PRD](../PRD.md)

## What to build

由 Diary 列表按現有日期及查詢條件搜尋、排序、分頁並進入記錄。

## Acceptance criteria

- [x] title／content case-insensitive contains 與所有既有條件保持一致，不套用 Blog 全文搜尋。
- [x] page／limit／最大值、ID tie-breaker、空結果、未知參數及 owner 隔離符合 canonical contract。
- [x] 真 DB fixtures 包含中文、英文、混合內容及同排序值；手機／鍵盤可完成篩選與導航。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [08 diary-editor](08-diary-editor.md)

## Frozen-source clarification

The existing list UI/API has no tag filter. Canonical query keys are page, limit, search, sortBy, dateFrom, dateTo and reviewStatus; tag/tags are rejected unknown parameters. Preserve those filters and display tags as metadata. See [query decisions](../../../docs/adr/0006-diary-authoring-and-query-semantics.md).

## Implementation checkpoint

Backend mounted at `GET /api/diaries`; canonical strict query and response are in `@diary/contracts/diary-list`. Migration 0003 creates the ICU case/accent-folding title collation. Count and page use one repeatable-read snapshot.

`tests/integration/diary-list.test.ts` passed 4/4 against real HTTP and a newly migrated PostgreSQL database: owner/credential isolation, mixed-language literal contains (including `%`, `_`, backslash), ICU title ties across pages, date endpoints, due-only pending review, strict filter validation and extreme empty-page bounds. Typecheck and ESLint passed at this checkpoint. Independent sol review found no blocking list semantics mismatch; package import, strict output and validation wording findings were corrected.

React list/filter/navigation and its desktop/mobile browser review remain pending. Final deployment-image ICU verification remains part of 59/61.

## Completed vertical slice

`/diaries` now provides URL-backed filters, dates, review status, stable sorting, page size, pagination/back navigation, accessible result focus, empty and recoverable-error states. `tests/e2e/diary-list.spec.ts` passed 2/2 (desktop 1440 / mobile dark 390), including keyboard submit, three locales, date endpoints, API failure retry and reading navigation. One detector pass returned `[]`; independent review disposition ship is recorded in `docs/design/diary-list-finish-review.md`. Production Web/API build and contracts drift check passed.

Future relation slices must hydrate their list fields with page-bounded batch queries; ticket 15 is extending Transaction projections now.
