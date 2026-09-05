# Performance finish review

## Independent bounded review — 2026-09-06

The final focused review found no reproducible production defect. The work stays within ticket21's test and evidence scope; no production file was changed.

- Source-derived decimal/API evidence now covers a `0.3 @ 0.1` plus `0.2 @ 0.2` average-cost position, fractional exits, exact `0.016`/`-0.016` realized P&L, `114.28571429%`/`-28.57142857%` realized return and the source's two-decimal equity-curve rounding.
- The representative all-history API response contains 51 closed trades, 51 equity points and 51 strategy rows while top wins and losses remain capped at five each. Its measured serialized JSON size is **11,502 bytes**. The response exposes only the performance projection: no diary title, body, or raw transaction collection.
- `npx vitest run tests/integration/performance.test.ts --disableConsoleIntercept --reporter verbose`: **4/4 passed** against disposable PostgreSQL; the output recorded the 11,502-byte payload.
- `npx vitest run tests/performance-stats.test.ts tests/trade-analytics.test.ts`: **45/45 passed**. Targeted ESLint and `npx tsc --noEmit` also passed.
- `PLAYWRIGHT_CHANNEL=chrome npx playwright test tests/e2e/performance.spec.ts`: **4/4 passed in 28.2s**. The final 390px case asserts page overflow remains absent while the strategy table stays in an `overflow-x: auto` local viewport with a readable row. Existing coverage retains 1440px light, 390px dark, filters, three locales, retry, logout, keyboard skip-link, long strategy names, large values and 50-row pagination.
- Refreshed captures: [`1440.png`](evidence/performance/1440.png) (1224×3638, light), [`390.png`](evidence/performance/390.png) (390×3870, dark) and [`long-summary-390.png`](evidence/performance/long-summary-390.png) (358×1230). Visual inspection shows readable summary, period/cumulative/symbol plots and complete tables; narrow trade tables remain locally scrollable without page overflow.

The first Playwright invocation stopped before launching a browser because sandboxed PostgreSQL access returned `EPERM` on `127.0.0.1:55433`. The rerun used the already installed Google Chrome channel with the disposable test database; no browser install, build or production service was used. The web server emitted transient existing Vite websocket `ECONNRESET` warnings between cases, while all four tests passed.

Root acceptance was recorded on 2026-09-06 after review of the source fixtures, owner isolation, final browser suite and refreshed captures.

## Historical author inspection

The initial author inspection covered desktop/mobile captures and identified no visual fix. It recorded complete/partial/unavailable/empty states, retry, three locales, real PostgreSQL/provider fixtures and generated-contract checks, but explicitly was not an independent finish review. The bounded review above supersedes its pending-review note.
