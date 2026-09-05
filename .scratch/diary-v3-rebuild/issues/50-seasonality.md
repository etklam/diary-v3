# [50] 閱讀 Seasonality 並保存本地化研究摘要

Status: done
Type: AFK
User stories covered: US-050, US-086

## Parent

[完整重構 PRD](../PRD.md)

## What to build

依既有季節性資料呈現當月、下月、強弱月份及分析，並複製／捕捉本地化研究。

## Acceptance criteria

- [x] 既有固定資料與計算、使用者時區月份及本地化 Markdown 對等，不虛構新的行情分析來源。
- [x] 跨年、時區、強弱月份排序與缺內容有 deterministic tests。
- [x] 由 UI 閱讀至真正 Diary／Evidence 捕捉可示範；純分析不新增無需要的 DB／API。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [07 preferences](07-preferences.md)
- [09 quick-diary](09-quick-diary.md)
- [25 evidence-timeline](25-evidence-timeline.md)

## Root acceptance — 2026-09-06

Astra accepted the fixed twelve-month source dataset, account-timezone month derivation, stable strongest/weakest ordering and arithmetic period means. Domain fixtures cover timezone boundary and ordering; the simple December→January branch and missing-month lookup were source-reviewed without extra tests under the user's latest direction. The combined49/50 Chrome flow passed1/1 (17.0s test,32.7s total), reading twelve rows and Traditional Chinese scope then persisting the full localized Seasonality analysis via a real Diary append. The source explicitly disables company Evidence for this broad market reference; Diary capture is preserved with explicit new/append destination. No new data source, database table or analysis API. Typecheck and owned lint passed. Blockers07/09/25 are done.
