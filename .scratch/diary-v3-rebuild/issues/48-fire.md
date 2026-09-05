# [48] 使用 Financial Freedom／FIRE 計算工具

Status: done
Type: AFK
User stories covered: US-084

## Parent

[完整重構 PRD](../PRD.md)

## What to build

提供既有財務假設輸入、目標／年數／projection 結果及複製能力。

## Acceptance criteria

- [x] 以固定 fixtures 驗證所有既有公式、邊界、十年 projection 與 rounding。
- [x] 輸入調整到結果／複製的 UI 流程完整，無非法無限值，三語、主題與手機可用。
- [x] 保持純計算功能，不新增專用持久層或 API。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [03 design-shell](03-design-shell.md)

## Evidence

- Pure model implemented in `packages/domain/src/fire.ts`; 18 domain tests cover frozen formula values, rounding, ten-year projection and corrected boundaries.
- Formula corrections and scope: [ADR 0004](../../../docs/adr/0004-fire-calculation-corrections.md).
- `tests/e2e/fire.spec.ts`: 2/2 Chrome scenarios passed for responsive inputs/results, three languages/themes, all-year projection, contiguous Markdown table copy and manual fallback on clipboard denial.
- Root checkpoint: full 85 tests, build, lint and contracts check passed. [Independent visual review](../../../docs/design/security-fire-finish-review.md) opened final desktop/mobile evidence and accepted this surface.
