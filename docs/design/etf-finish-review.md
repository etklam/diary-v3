# ETF finish review

## Final acceptance — 2026-09-06

Root acceptance approved tickets 41 and 42 after the independent source/formula review, focused UI correction pass, and final inspection of the bounded browser evidence. No production service or real user data was used.

- **Catalog and persistence:** Disposable PostgreSQL plus controlled-provider evidence covers canonical symbol validation, five-year monthly history, seed reruns, concurrent initialization, provider/data failures, deletion counts and cascades, owner/role/CSRF boundaries, and preservation of the empty stock ledger. Initialization and deletion remain catalog operations and do not write personal stock data.
- **Profile correctness:** The profile integration suite covers currency-only → `unavailable` and complete numeric metrics with `currency: null` → `complete`. The metric guide matches the calculator: latest 252 observations for approximate-year high/low and drawdown, signed distance percentages, 20/60/252-return volatility annualized with √252, and the prior 20 observations as the volume baseline.
- **Watchlist and UI:** Controlled Chrome fixtures cover complete, stale, and unavailable profiles; three-locale actionable API errors; ARIA field wiring; localized UTC date elements; watchlist add/read/remove; and Admin 20-character symbol / 255-character name boundaries with Enter submission. Catalog rows and watchlist rows carry symbol-bearing accessible context, and delete confirmation includes the symbol.
- **Evidence:** Focused Admin captures are [`focused-1440.png`](evidence/etf-admin/focused-1440.png) and [`focused-390.png`](evidence/etf-admin/focused-390.png); the bounded research captures are [`1440.png`](evidence/etf-research/1440.png) and [`390.png`](evidence/etf-research/390.png). The browser runner used the installed Chrome channel; no browser install, build, or production service was run for acceptance.
- **Verification:** Focused Vitest suites, Chrome suites, full typecheck, lint, and `contracts:check` passed in the final workspace. Owner isolation and integrity claims come from the real HTTP/PostgreSQL suites; no two-account browser smoke test is claimed.

Tickets remain complete with their acceptance checkboxes marked in the issue tracker.
