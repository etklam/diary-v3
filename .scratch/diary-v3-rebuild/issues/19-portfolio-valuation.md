# [19] 為 Portfolio 估值並呈現缺報價狀態

Status: done
Type: AFK
User stories covered: US-039, US-040, US-082

## Parent

[完整重構 PRD](../PRD.md)

## What to build

從持倉進入 Portfolio，取得行情後顯示市值、未實現損益與完整／部分估值狀態。

## Acceptance criteria

- [x] 估值使用同一帳本與規範化行情，數值和 rounding 對等。
- [x] 缺報價、stale、部分失敗、unpriced cost 及 as-of 明確呈現，不以零代替未知。
- [x] 真 DB＋固定 upstream＋UI 驗證完整、部分、完全無報價及空持倉。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [16 sell-ledger](16-sell-ledger.md)
- [18 market-provider](18-market-provider.md)

## Backend checkpoint

Owner `GET /api/stocks/portfolio` now reads the exact ledger once and enriches holdings through the existing bounded quote cache. The frozen Portfolio display contract intentionally uses JSON numbers; authoritative persisted transactions and cost-holdings endpoints remain decimal strings. Source aggregation formulas retain missing positions, priced/unpriced cost, oldest quote timestamp, 72-hour stale count and empty/complete/partial/unavailable states.

`tests/integration/portfolio.test.ts` passed 5/5 using real PostgreSQL and controlled upstream: complete valuation, source-derived fractional quantity/cost/quote aggregation, partial quote failure with preserved cost, stale timestamp, empty/unavailable/valid-zero distinction and owner/credential isolation. OpenAPI/client generated. Portfolio Web and batch-price compatibility endpoint are now implemented.

## Web and batch checkpoint

`POST /api/stocks/prices` validates 1–25 input entries, retains first trimmed input keys, deduplicates case-insensitively, returns available quotes on partial failure, and uses shared cache/queue/rate limits. API suite now 4/4. Portfolio E2E passed 4/4 in 17.0s using the existing Chrome channel at both 1440px and 390px. The focused browser fixture covers stale count 1, fractional/large display values, a 20-character symbol, three-locale stale labels, Retry focus plus Enter, document overflow and local-table viewport readability. Current captures are `docs/design/evidence/portfolio/1440.png` and `docs/design/evidence/portfolio/390.png`; the large-number fixture is display-only. Typecheck and targeted lint passed; see `docs/design/portfolio-finish-review.md` for the final acceptance record.

## Final acceptance evidence

2026-09-06 root acceptance completed after the independent source/formula review and the focused test additions. No production defect was reproduced and no production file was changed for this ticket.

- `npx vitest run tests/integration/portfolio.test.ts` — 5/5 passed.
- `PLAYWRIGHT_CHANNEL=chrome npx playwright test tests/e2e/portfolio.spec.ts` — 4/4 passed in 17.0s.
- Final focused rerun after the mobile local-table assertion: `PLAYWRIGHT_CHANNEL=chrome npx playwright test tests/e2e/portfolio.spec.ts -g 'stale decimal'` — 2/2 passed in 8.9s (1440px and 390px).
- `npx tsc --noEmit` — passed.
- `npx eslint tests/integration/portfolio.test.ts tests/e2e/portfolio.spec.ts` — passed.
- Screenshots regenerated: `docs/design/evidence/portfolio/1440.png` and `docs/design/evidence/portfolio/390.png`.
