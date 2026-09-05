# [51] 搜尋 SEC 公司並瀏覽申報文件清單

Status: done
Type: AFK
User stories covered: US-087, US-089

## Parent

[完整重構 PRD](../PRD.md)

## What to build

完成公司搜尋、filings 分頁、單次申報 document index 與既有批次查閱入口。

## Acceptance criteria

- [x] SEC 搜尋、filings、document index 與既有批次查閱維持 guest 可用；無效顯式 credential 仍 fail closed。cursor、CIK／accession 驗證及 canonical contract 保留。
- [x] SEC contact User-Agent、queue／cache、timeout、等待上限與 provider 錯誤由共同邊界處理。
- [x] 受控 upstream 與瀏覽器測試覆蓋搜尋、分頁、開啟申報及失敗／空資料。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [04 web-session](04-web-session.md)

## Astra acceptance — 2026-09-06

Accepted using the controlled provider/domain and disposable PostgreSQL evidence in `docs/design/sec-filings-finish-review.md`, source review of download deadline/redirect/actual-byte limits, and the 1/1 Chrome flow (6.1s) downloading both ZIP modes with CRC, entry and extracted-body checks. Astra inspected both initial desktop/mobile captures; no additional cosmetic test cycle.
