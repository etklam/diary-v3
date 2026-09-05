# [21] 回顧策略績效與近期交易

Status: done
Type: AFK
User stories covered: US-040, US-043

## Parent

[完整重構 PRD](../PRD.md)

## What to build

提供 Strategy Performance 及近期交易入口，以相同帳本呈現現有策略分析與結果。

## Acceptance criteria

- [x] 策略分組、日期窗口、交易排序及所有既有統計／rounding 均對應來源 fixtures。
- [x] 不同策略、無交易、部分紀錄及合法邊界輸入可重現，不能自行更換公式。
- [x] 由 UI 篩選／閱讀到 API／真 DB 結果完整，使用者隔離及長數字驗收通過。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [16 sell-ledger](16-sell-ledger.md)

## Calculation and API checkpoint

Audited frozen performance-stats types/calculator/handler and trade-analytics. Added native-compatible performance calculation and generated `/api/stats/performance` contract. Month/quarter/year grouping is UTC; invalid period retains source month fallback; symbol filtering trims/uppercases. Strategy/emotion inheritance uses SELL override then latest BUY metadata, resetting on full close. Top wins/losses filter before top-five selection, monthly Sharpe uses realized return percentages with inactive months filled with zero, and realized drawdown keeps the source cumulative-closed-cost basis.

Intentional correction: matching now calls the existing exact decimal ledger rather than a second floating-point position engine. Orphan SELL/oversell is rejected, consistent with accepted ledger integrity instead of silently skipped. Empty inputs follow the normal pure calculation path and return fresh arrays, so callers cannot mutate shared state; no structuredClone runtime dependency is required. API owner data comes from the stable tradeDate/id ledger read; output includes no Diary body. Source action-independent statistical formulas and numeric display output are retained.

Ported source formula fixtures plus exact decimal break-even, UTC offset boundary, partial-exit attribute inheritance/reset and isolated empty-result regressions. Source tests required explicit nullable strategy/emotion fields and known-index assertions under strict TypeScript; orphan SELL expectation intentionally changed to ledger rejection. One integration expected value used a different floating-point operation order; corrected to source `(wins / total) * 100`. Typecheck and lint passed.

Historical remaining at this checkpoint: React performance page and all existing visualizations/filters, browser/long-number verification, independent finish review, source scope/rounding audit. The bounded final evidence below supersedes these pending items; ticket status remains in-progress until shared acceptance.

Verification: 46 calculation/PostgreSQL tests passed (1.29s). Production build passed before removal of the redundant shared empty-result shortcut; the simplified path then passed all seven performance-calculator tests (100ms).

## React and browser checkpoint

Added `/strategy-performance`, linked from Holdings. It combines the source Strategy Performance page and existing Portfolio performance plots: summary, UTC period P&L, cumulative realized P&L, top-ten symbol plot/all-symbol table, strategy/emotion breakdowns and best/worst five trades. Period/symbol filters persist in URL and survive reload; every large data table exposes 50-row pages, while chart data remains available as a table. Three locales, loading/empty/error/retry/auth and logout clearing are handled.

Three browser scenarios passed (10.2s), including 1440px/light and 390px/dark, true transaction results, month/quarter/year and symbol filters, tables/charts, retry, locales and logout; plus 51 closed trades, long strategy names, large values and table pagination. The first run used a brittle exact-label query for the select; corrected to accessible role/name. Author inspection found and fixed excessively narrow mobile stock columns.

Author inspection also exposed the offscreen fixed skip-link appearing inside full-height captures. Replaced offscreen positioning with clipping until focused; a keyboard scenario passed (3.7s), Tab reveals the link and Enter focuses main.

Large-value testing reproduced a real source arithmetic issue: identical monthly returns `[99999999899.99995, 99999999899.99994]` from repeated equal-profit trades produced Sharpe ≈3.21e16 due solely to floating-point resolution. Zero-volatility detection now uses the greater of the existing absolute floor and eight relative machine epsilons. Regression also proves meaningful variation is retained. All 45 calculation fixtures passed (126ms); the mobile large-value case passed again (4.7s), now asserting unavailable Sharpe instead of an artificial extreme.

Final acceptance: root reviewer approved on 2026-09-06 after inspecting the bounded API fixtures, source formula evidence, owner isolation, 4/4 browser suite and refreshed captures. Ticket is done.

Final checkpoint for this slice: lint and production build (including typecheck) passed after the Sharpe and mobile/skip-link corrections.

## Bounded final evidence — 2026-09-06

The independent bounded review added no production changes or reproduced defects. The API fixture records source-derived fractional aggregation and rounding at the JSON boundary: `0.016`/`-0.016` realized P&L, `0.14` average cost, `114.28571429%`/`-28.57142857%` realized return and two-decimal cumulative P&L. A 51-close all-history fixture measures the serialized performance response at 11,502 bytes, retains 51 equity and 51 strategy rows, caps `topWins`/`topLosses` at five each, and proves diary title/body/raw transactions are absent.

Verification:

- `npx vitest run tests/integration/performance.test.ts --disableConsoleIntercept --reporter verbose`: 4/4 PostgreSQL integration tests passed; output recorded the 11,502-byte payload.
- `npx vitest run tests/performance-stats.test.ts tests/trade-analytics.test.ts`: 45/45 passed; targeted ESLint and `npx tsc --noEmit` passed.
- `PLAYWRIGHT_CHANNEL=chrome npx playwright test tests/e2e/performance.spec.ts`: 4/4 passed in 28.2s. The focused 390px assertion verifies no document overflow and a readable `overflow-x:auto` local strategy table. Existing scenarios retain desktop/light, mobile/dark, filters, three locales, retry, logout, keyboard skip-link, long names, large values and pagination.
- Refreshed evidence: [`1440.png`](../../../docs/design/evidence/performance/1440.png), [`390.png`](../../../docs/design/evidence/performance/390.png), [`long-summary-390.png`](../../../docs/design/evidence/performance/long-summary-390.png); visual review found no blocking issue. The initial unsandboxed E2E attempt stopped before browser launch on PostgreSQL `EPERM`; the Chrome rerun used disposable PostgreSQL and passed without build/install.
