# [01] 固定功能基準並重現舊版 Diary 完整流程

Status: done
Type: AFK
User stories covered: US-114

## Parent

[完整重構 PRD](../PRD.md)

## What to build

在隔離環境固定含未提交變更的來源快照，重現登入、建立、閱讀與刪除無交易 Diary，並把所有有效入口映射至本次工作項目。

## Acceptance criteria

- [x] 記錄 commit、diff、未追蹤來源檔與內容雜湊；排除 secrets、真實使用者資料、依賴與生成產物。
- [x] 盤點所有有效頁面、API、角色、排程、匯出與 SQL 最終約束，映射全部 114 條 stories；歷史文件矛盾與搜尋語意有可重現 fixtures。
- [x] 提供隔離環境的完整 Diary 流程證據、已知問題表及效能基線；來源後續變更有追蹤規則。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

None - can start immediately

## Evidence

- Frozen source: [manifest](../../../docs/parity/source-manifest.json), [snapshot](../../../docs/parity/source-snapshot.tar.gz), [source drift and known-delta notes](../../../docs/parity/README.md).
- Coverage: [43 pages / 124 APIs / 7 jobs / 38 migrations / all 114 stories](../../../docs/parity/inventory.json).
- Actual migrated SQL: [final constraints](../../../docs/parity/legacy-final-constraints.tsv).
- Real Nuxt/Nitro + disposable MariaDB 11.4: [runtime evidence](../../../docs/parity/legacy-runtime-evidence.json), [latest passing log](../../../docs/parity/legacy-runtime.log), [portable expected fixtures](../../../tests/parity/legacy-contract-fixtures.json).
- Passed: `bash scripts/parity/run-old-baseline.sh` (1 real HTTP test; login/create/read/delete/missing plus title and search probes).
- Passed: `python3 scripts/parity/check-baseline.py --runtime --source ../diary-vue`.
- Diary title 256–500 legacy storage failures are an explicit accepted correction in [ADR 0001](../../../docs/adr/0001-parity-baseline-and-contract-corrections.md); parity fixtures retain the observed old behavior.
- Performance observations are one cold flow, not percentiles or capacity commitments; representative larger-data benchmarking remains the final acceptance gate.
