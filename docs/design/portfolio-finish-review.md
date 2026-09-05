# Portfolio finish review

## Final acceptance — 2026-09-06

Ticket 19 passed the independent scope audit. No production defect was reproduced, so the acceptance work is limited to regression evidence and review documentation.

- `npx vitest run tests/integration/portfolio.test.ts`: 5/5 passed against disposable PostgreSQL and a controlled provider. The added source-derived fixture uses two fractional BUY rows (`0.1250 @ 12.3400` and `1.3750 @ 10.0100`) and asserts the exact decimal holding projection plus market value `18.5184`, unrealized amount `3.21215` and unrealized return `20.9858717844%` (within JSON-number floating-point tolerance).
- `PLAYWRIGHT_CHANNEL=chrome npx playwright test tests/e2e/portfolio.spec.ts`: 4/4 passed in 17.0s. The focused fixture covers `staleQuoteCount: 1`, fractional and large display values, a 20-character symbol, stale labels in `zh-TW`, `zh-CN` and English, keyboard focus followed by Enter on Retry, and a 390px document overflow guard. The mobile assertion also scrolls the local holdings table to the large-value cell and verifies that cell is inside the table viewport and readable.
- After the local-table assertion was strengthened, `PLAYWRIGHT_CHANNEL=chrome npx playwright test tests/e2e/portfolio.spec.ts -g 'stale decimal'` passed 2/2 in 8.9s (1440px and 390px), confirming the final browser test state.
- Current captures: [`1440.png`](evidence/portfolio/1440.png) and [`390.png`](evidence/portfolio/390.png). The desktop capture is light; the mobile capture is dark. Both show the stale count, decimal/large display fixture and holdings table. The large-number fixture is display-only and is deliberately isolated from the surrounding empty cost-holdings/exposure synthetic panels.
- `npx tsc --noEmit` and `npx eslint tests/integration/portfolio.test.ts tests/e2e/portfolio.spec.ts`: passed.

The first Playwright invocation without a channel stopped before launching a browser because the requested `chromium_headless_shell-1243` cache was absent. The suite was rerun with the already installed Google Chrome channel; no browser install, build or production service was used.

The numeric Portfolio display contract remains JSON numbers, while authoritative persisted transaction and cost-holding values remain decimal strings. Quote timestamps display UTC, and missing values remain dashes rather than zero.

## Historical author inspection

The initial author inspection covered desktop/mobile captures and identified no visual fix. It recorded complete/partial/unavailable/empty states, retry, three locales, real PostgreSQL/provider fixtures and generated-contract checks, but explicitly was not an independent finish review. The final acceptance above supersedes its pending-review note.
