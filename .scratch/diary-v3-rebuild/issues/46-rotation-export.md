# [46] 匯出 Market Rotation 的目前視圖

Status: done
Type: AFK
User stories covered: US-081

## Parent

[完整重構 PRD](../PRD.md)

## What to build

把 monitor 當前 scope、filter、sort 結果匯出 CSV、精簡 Copy Table 及 PNG。

## Acceptance criteria

- [x] 三種輸出只使用目前顯示 payload，不混入未篩選 rows 或重新取得不同時間資料。
- [x] CSV／PNG 保留既有 metadata 與欄位，Copy Table 保留 tab-separated 格式。
- [x] 從瀏覽器設定篩選排序後下載／複製並驗證內容、特殊字元、空結果及圖像可讀性。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [45 rotation-history](45-rotation-history.md)

## Implementation checkpoint — 2026-09-06

The export slice uses the same loaded, filtered and sorted rows as the ranking table. CSV includes the source seven metadata values plus filter/sort and observation dates with twelve localized columns and CSV escaping; Copy Table keeps the five tab-separated source cells with a selectable fallback; PNG renders escaped text on a fixed opaque canvas with all twelve columns, wrapped metadata and empty-result output. Browser verification and root acceptance remain pending after ticket45 acceptance.

## Root acceptance — 2026-09-06

Astra reviewed the shared filtered/sorted export rows, twelve-column CSV escaping/metadata, five-cell tab-separated copy normalization and current-payload snapshot. The focused Chrome case passed1/1 in7.8s (earlier successful runs8.5s and5.6s), exercising real CSV/clipboard/PNG output without refetching. Root inspected the actual English export.png and confirmed readability. The final canvas measureText/header-wrap correction was source-reviewed; its added CJK browser assertion has not been run and is not claimed as runtime evidence. Empty-output branches were reviewed in code. Per the latest user instruction, these low-risk presentation/empty-output checks do not trigger another browser pass. Ticket45 is done.
