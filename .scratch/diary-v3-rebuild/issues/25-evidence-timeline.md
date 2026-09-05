# [25] 捕捉 Evidence 並回看不可變股票時間線

Status: done
Type: AFK
User stories covered: US-026, US-049, US-050, US-054

## Parent

[完整重構 PRD](../PRD.md)

## What to build

從已可用的 Company／Diary 研究入口捕捉 Evidence，於 Stock Timeline 閱讀不可變記錄並回到來源。

## Acceptance criteria

- [x] 事件來源、時間、關聯與 idempotency key 範圍遵循基準；不提供改寫不可變證據的捷徑。
- [x] 同一捕捉重試不重複，非法來源／跨 owner 連結被拒絕，Diary 變更後關聯語意正確。
- [x] 真 UI 捕捉後在時間線可見；後續工具票把各自現有捕捉入口接入同一用例。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [08 diary-editor](08-diary-editor.md)
- [23 watchlist](23-watchlist.md)

## Integration obligation

Replace Watchlist empty record projections with owner-filtered counts/latest evidence, ordered by occurredAt and ID. Watchlist CRUD is implemented and verified; independent UI review is recorded in `docs/design/watchlist-finish-review.md`.

## Backend checkpoint — 2026-09-05 (historical)

- Added timeline contracts, OpenAPI/generated client, PostgreSQL migration 0008 and three authenticated source-compatible endpoints.
- Web capture and automatic Watchlist restoration are one transaction. Same owner/stock/key retries return the original immutable record, including simultaneous requests.
- Database trigger rejects evidence rewrites and foreign Diary sources; source Diary deletion may null its link while preserving captured content. Web input continues to reject sourceDiaryId rather than accepting forged links; agent source linkage remains ticket 40.
- Watchlist now uses real owner-filtered counts/latest evidence with event-time/ID tie breaking in a repeatable-read snapshot. Empty placeholders removed.
- Focused real PostgreSQL Evidence + Watchlist tests: 8/8. Typecheck, lint and generated contracts check passed.
- At this checkpoint, React capture/timeline UI, Diary capture entry, browser flows and independent design review remained. Future tools reuse this capture API; agent ingestion must preserve immutable evidence rather than legacy upsert overwrites.

## React checkpoint — 2026-09-05 (historical)

Company and Diary pages mount the shared Evidence form. Company displays the latest 200 records with source links and explicit UTC timestamps. Uncertain submissions retain the original payload/key for retry. Two desktop/mobile browser cases passed (16.0s), including a real committed write followed by a simulated lost response, stable-key retry, one record, reload, Watchlist projection, three locales and logout clearing. Detector found no issues in Evidence/Watchlist components. At this checkpoint, the dedicated Diary capture flow, timeline/source metadata scope audit and independent finish review remained.

### Diary and source parity validation

Dedicated browser flow now proves Diary capture prefills source title/URL, retains frozen summary/title after Diary updates, opens the current source in a new tab, and preserves the evidence after source deletion. The frozen source timeline component also exposes confidence; the new timeline now renders non-null confidence and uses the authenticated account timezone (explicit label), while capture input remains explicitly UTC. Three browser cases passed (21.1s), including 10:30Z → 18:30 Asia/Taipei. Typecheck passed.

## Finish validation — 2026-09-06

- Existing PostgreSQL evidence: `tests/integration/evidence.test.ts` 4/4; existing Timeline projection unit tests: `tests/unit/timeline.test.ts` 4/4. These cover immutable/idempotent capture, owner/source boundaries, Watchlist projection, event-time/ID ordering, Diary unlinking and safe Timeline projection.
- Focused Chrome `tests/e2e/evidence.spec.ts` ran once with the three existing cases and passed 3/3 in 12.7 seconds (1440px 3.9s, 390px 2.8s, Diary source 2.5s). Existing `tests/e2e/timeline.spec.ts` evidence remains 2/2 (13.4s recorded); it was not rerun because no Timeline concern was found.
- Refreshed capture evidence: `docs/design/evidence/capture/1440.png` (960×990) and `390.png` (358×1225). Existing Timeline evidence inspected: `docs/design/evidence/timeline/1440.png` (1440×1855) and `390.png` (390×3114). No production or test assertions beyond the approved path update changed.
- Independent inspection found no actual UI defect and made no aesthetic changes. The consolidated audit is in `docs/design/evidence-capture-finish-review.md`; root accepted the ticket evidence.

## Final acceptance — 2026-09-06

Root reviewed the refreshed 1440/390 capture images, existing Timeline images, 3/3 focused capture run, and recorded 4/4 PostgreSQL, 4/4 unit and 2/2 Timeline evidence. The immutable capture/idempotency/source-link behavior, Watchlist projection, Diary source preservation and Timeline reading scope were accepted. All three acceptance criteria are checked.
