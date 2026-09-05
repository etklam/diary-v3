# [45] 比較兩週市場輪動並按 scope 篩選排序

Status: done
Type: AFK
User stories covered: US-078, US-079, US-080, US-082

## Parent

[完整重構 PRD](../PRD.md)

## What to build

完成 monitor 的 sectors／indexes 選擇、訊號篩選／排序、共同起點 sparkline 與兩週排名變化。

## Acceptance criteria

- [x] 合格日期只計同 scope 的 canonical universe，至少 90% coverage；比較日是往前第十個合格快照日。
- [x] trend 以共同比較日為 100，缺值不插補；排名、tie-breaker、unknown、非 canonical extra rows 有固定 fixtures。
- [x] core 維持 API-only；桌面／手機比較流程及公開認證邊界完整，畫面由同一 dashboard payload 呈現。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [44 market-state](44-market-state.md)

## Implementation checkpoint — 2026-09-06

The first 45 slice is implemented in the existing monitor page without changing the monitor API: all nine source filters derive from the loaded scope payload, table sorting is keyboard-operable with explicit `aria-sort`, null values remain visible and sort with a stable symbol tie-break, and the existing normalized trend payload renders separate SVG segments across missing points. The comparison date and observation range remain visible beside the ranking table; scope continues to use the existing URL parameter and core remains API-only at the data boundary.

Focused evidence: `tests/unit/market-rotation-view.test.ts` plus trend, monitor and contract tests pass (24 tests), and the 45-owned ESLint paths pass. The controlled browser case for filtering, sorting and trend gaps is authored but awaits the shared runner slot; root acceptance remains pending. Ticket46 export verification is tracked separately.

## Root acceptance — 2026-09-06

Astra accepted the existing canonical-universe/90%-coverage/tenth-qualified-date and base100 gap-preserving domain fixtures together with the source-reviewed filter/sort module. Twenty rotation unit files passed231 tests. The focused Chrome controls/export case passed1/1 (latest functional run7.8s), demonstrating filtering, stable rank order and same-payload trend rendering. Existing desktop/mobile guest-boundary evidence remains applicable; no duplicate test run is required. Ticket44 is done.
