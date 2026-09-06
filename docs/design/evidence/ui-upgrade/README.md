# UI upgrade evidence (2026-09-07)

Full-site visual upgrade: shared tokens/primitives, public home, tools index and
tool shells, Overview, mobile quick diary, and the remaining workspace pages.

All screenshots use synthetic accounts and controlled fixtures on a local
production build (`react-router build` + `react-router-serve` + Hono API on a
local disposable database). No real user or production data was used. Browser
verification ran in desktop Chrome at 360/390/768/1024/1440/1920; no real
iPhone device testing was performed this round (narrow-viewport Chrome only).

## Files

- `before-*.png` — state at the starting commit (guest public pages).
- `after-*.png` — same routes after the upgrade (production build).
- `after-10-overview-*`, `after-11-overview-dark-1440` — signed-in Overview,
  light and dark, desktop and 390px.
- `after-12-diary-new-*`, `after-13-quick-390` — diary editor and quick diary
  mobile (sticky save bar with safe-area).
- `after-position-sizing-results-1440.png` — calculator with big total,
  ratio allocation bar, stat tiles, batch table card.
- `after-market-rotation-data-1440.png` — research tool with seeded snapshot:
  meta bar, summary cards, leadership panels, filter toolbar, exports.
- `holdings-360/1024/1920.png` — widest tables at the spot-check widths; tables
  scroll inside their own containers, the page never scrolls horizontally.
- `overview-dark-1024.png`, `tools-360-dark.png` — dark-theme representatives.
- `overview-1920.png`, `position-sizing-1920.png` — wide-desktop check.

## Verification recorded elsewhere

- Gates: lint, typecheck, 801 unit/integration tests, 136 e2e tests, production
  build — all green after the upgrade (see PR description).
- `tests/e2e/layout-theme.spec.ts` now also asserts the workspace header and
  section cards share one alignment line at 1440px and 390px.
