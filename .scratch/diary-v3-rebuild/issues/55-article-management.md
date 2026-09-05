# [55] 發布、封存及批次管理 Post

Status: done
Type: AFK
User stories covered: US-094, US-095

## Parent

[完整重構 PRD](../PRD.md)

## What to build

讓管理員發布、封存、刪除 Post，使用既有搜尋／分頁及 bulk publish／delete 管理內容。

## Acceptance criteria

- [x] 合法 lifecycle、重新發布保留首次發布時間、批次錯誤／原子性依基準。
- [x] Admin title／作者姓名／email substring 搜尋與公開搜尋分開；作者 email 不混入 public persona。
- [x] UI／API／真 DB 驗證所有單筆／批次操作、權限及搜尋；發布資料供 56 真正閱讀。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [54 article-drafts](54-article-drafts.md)

## Implementation checkpoint — 2026-09-06

The same Post vertical slice now includes publish/archive, immutable first-publication provenance, bulk publish/delete and separate admin title/author substring filters. The real PostgreSQL suite covers lifecycle and bulk operations; admin UI and browser acceptance remain pending.

## Astra acceptance — 2026-09-06

Accepted against the 7/7 disposable PostgreSQL suite and 1/1 Chrome principal flow (9.1s), runtime-measured search fixtures, and direct source review of draft retention on failed writes. Astra inspected the desktop/light and mobile/dark article captures. Shared mobile navigation is assigned to ticket58; no repeated cosmetic checks are required.
