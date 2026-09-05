# [52] 安全閱讀、下載及打包 SEC 文件

Status: done
Type: AFK
User stories covered: US-088, US-089

## Parent

[完整重構 PRD](../PRD.md)

## What to build

從申報清單開啟文件、下載指定 basename，並按既有模式打包 ZIP。

## Acceptance criteria

- [x] SEC 文件閱讀、下載及 package 維持 guest 可用；無效顯式 credential 仍 fail closed。rendering、headers／內容、打包模式與來源邊界對等。
- [x] path traversal、檔案數、單檔／總容量、串流及暫存清理限制有負向驗證。
- [x] 從真 UI 觸發讀取與下載，檔案／ZIP 可解析；provider 中途失敗有正確回饋與清理。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [51 sec-search](51-sec-search.md)

## Astra acceptance — 2026-09-06

Accepted using the controlled provider/domain and disposable PostgreSQL evidence in `docs/design/sec-filings-finish-review.md`, source review of download deadline/redirect/actual-byte limits, and the 1/1 Chrome flow (6.1s) downloading both ZIP modes with CRC, entry and extracted-body checks. Astra inspected both initial desktop/mobile captures; no additional cosmetic test cycle.
