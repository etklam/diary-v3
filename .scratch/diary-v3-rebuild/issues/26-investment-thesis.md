# [26] 建立及更新 Investment Thesis

Status: done
Type: AFK
User stories covered: US-051, US-052

## Parent

[完整重構 PRD](../PRD.md)

## What to build

在 Company 編寫 Investment Thesis、更新其內容及既有生命周期，保持可回看的目前論點。

## Acceptance criteria

- [x] Thesis 欄位、status、日期與 owner 約束按契約保存，不混同 Stock Note 或 Diary Review。
- [x] 可建立、重新讀取、修改及執行既有狀態轉換，非法轉換有明確錯誤。
- [x] 使用真 DB／API／React 驗證完整 lifecycle、長內容與日期邊界。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [23 watchlist](23-watchlist.md)

## Source rules checkpoint — 2026-09-05 (historical)

Copied frozen shared Thesis/review schemas and extracted portable full-replacement and health rules. Source PUT clears omitted draft fields and defaults omitted status to DRAFT; ACTIVE requires summary and whyIOwnIt. First activation timestamp persists through archive/reactivation; health precedence is archived → draft → invalidated → overdue → healthy, with a strict overdue boundary. Backend must serialize save/review operations so review snapshots do not race with edits (legacy service reads before transaction). At this checkpoint, API, database and React work remained pending.

## API/database checkpoint — 2026-09-05 (historical)

Migration 0010 adds current Thesis and review snapshots, canonical owner/company uniqueness, same-owner composite review FK and content checks. GET/PUT and review POST are registered with generated contracts. Save/review share an owner+symbol advisory transaction lock and row lock; full replacement does not erase review history or original activation time. Read response uses a repeatable-read snapshot. At this checkpoint, four real PostgreSQL scenarios exercised lifecycle, invalid activation, owner/CSRF/Bearer, old snapshot retention and five concurrent archive/review races; React UI and complete review UX remained pending.

## React checkpoint — 2026-09-05 (historical)

Added `/stocks/:symbol/thesis` and Company link with current thesis fields/status, explicit UTC due input, account-timezone review history, outcome/decision/reflections and full snapshots. Unsaved thesis disables review until saved. Desktop/mobile lifecycle 2/2 passed (7.7s); production build/typecheck passed; detector clean. At this checkpoint, remaining scope/recovery/independent review were recorded in `docs/design/thesis-finish-review.md`.

### Failure/transaction verification

Five PostgreSQL scenarios now pass (2.67s), including direct cross-owner review FK rejection and an injected failure after snapshot insert proving snapshot/current state roll back together. Focused browser recovery passed (4.9s): failed PUT retains edits, successful PUT retains unsaved reflection and its navigation guard, unchanged `.123Z` due date survives, subsequent review saves and clears dirty state.

## Finish validation — 2026-09-06

- Existing domain/API evidence: `tests/investment-thesis.test.ts` 2/2 and `tests/integration/investment-thesis.test.ts` 5/5, including lifecycle, health boundary, owner/credential checks, concurrent serialization, cross-owner FK rejection and rollback.
- Focused Chrome `tests/e2e/thesis.spec.ts` ran the three existing cases and passed 3/3 in 18.2 seconds (1440px 7.6s, 390px 4.5s, recovery 2.4s). No new assertions or production code changed.
- Refreshed evidence: `docs/design/evidence/thesis/editor-1440.png` (1040×1226), `editor-390.png` (358×1333), `review-1440.png` (1040×1138) and `review-390.png` (358×1164). The current mobile captures have no skip-link overlap and the browser assertions confirm no document-width overflow.
- Independent inspection found no actual Thesis UI defect and made no aesthetic changes. Root accepted the evidence; the historical skip-link overlap was resolved by ticket21.

## Final acceptance — 2026-09-06

Root reviewed the current editor/history captures, existing domain/API/rollback evidence and the 3/3 focused browser result. The lifecycle, review outcomes/decisions, owner boundaries, snapshot immutability, archive transitions, precise due time and recovery behavior were accepted. All three acceptance criteria are checked.
