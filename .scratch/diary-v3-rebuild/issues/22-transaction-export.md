# [22] 匯出個人交易資料

Status: done
Type: AFK
User stories covered: US-044

## Parent

[完整重構 PRD](../PRD.md)

## What to build

由交易或績效入口下載既有格式的本人交易資料。

## Acceptance criteria

- [x] 欄位、順序、日期、numeric 表達、篩選範圍與來源匯出一致。
- [x] 未登入／非 owner 無法下載；中文、特殊字元、空結果與較大帳本有驗證。
- [x] 瀏覽器下載檔可解析，內容與同一真 DB 帳本一致。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [16 sell-ledger](16-sell-ledger.md)

## Implementation checkpoint

Owner-only CSV endpoint and Holdings download control implemented. HTTP/PostgreSQL 3/3 and browser download 2/2 passed: seven source columns, UTC sell dates, complete ledger/symbol filter, partial sales, exact decimals, empty result, 150-sale fixture, Unicode/CSV escaping, explicit-credential rejection and retry. OpenAPI/client generated; typecheck and lint passed. Independent UI review: ship, `docs/design/trade-export-finish-review.md`.

Intentional corrections: exact decimal half-up rounding matches the rebuilt ledger instead of binary floating-point artifacts; symbol formula prefixes are neutralized for spreadsheets and attachment filenames are sanitized. Persisted symbol text remains unchanged.
