# [49] 比較 Relative Value 並捕捉研究

Status: done
Type: AFK
User stories covered: US-050, US-085, US-089

## Parent

[完整重構 PRD](../PRD.md)

## What to build

比較兩個 symbols 的即時價格、target scenarios 及對齊日期的歷史 ratio chart，並完成既有複製／研究捕捉。

## Acceptance criteria

- [x] 公式、alias suggestion、日期對齊、缺值／零分母與單邊行情失敗依基準。
- [x] quote／historical 消費共用 provider 邊界，不建立第二套 queue／cache。
- [x] 由輸入到圖表、失敗提示及真 Diary／Evidence 捕捉完整驗證，保留 guest／登入動作邊界。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [09 quick-diary](09-quick-diary.md)
- [25 evidence-timeline](25-evidence-timeline.md)

## Root acceptance — 2026-09-06

Astra accepted native-compatible ratio/scenario calculations, strict target parsing, canonical aliases and union-timeline gap markers. Quote/history use the existing shared endpoints. Combined49/50 domain5/5 tests and the Chrome flow1/1 (17.0s test,32.7s total) passed, including real RELATIVE_VALUE Evidence and Diary append persistence. Capture opens a consistent source/summary/metadata snapshot with a stable evidence idempotency key and explicit Diary new/append destinations. Root reviewed source and the actual desktop artifact, then directed the long history table into a native collapsed disclosure; all historical rows remain available. This simple final layout change was source-reviewed without another browser run under the user's latest instruction. Existing browser mobile and no-overflow evidence remains applicable. Owned lint/typecheck passed; blockers09/25done.
