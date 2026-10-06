# [06] Build the Guru directory and overview

Status: ready-for-agent
Execution: done
Type: AFK

## Parent

[Guru Portfolio PRD](../PRD.md)

## What to build

Turn prepared Guru metadata and analytics into the primary product surfaces: /gurus and /gurus/:slug. This is a research discovery experience, not a filing browser.

## Acceptance criteria

- [x] Directory supports search, style/fund-type filters, featured, sector focus, and sorting for concentration, turnover, activity, latest filing, follower count, A–Z, and custom order.
- [x] This slice adds private follow/unfollow persistence and an aggregate follower count; follower identities and preferences are never public.
- [x] Each row shows manager/fund, style, reported value, holdings count, top position/weight, latest quarter, and categorized latest actions.
- [x] Overview shows value, position count, concentration, largest position, turnover/actions, sector allocation, top holdings, latest moves, historical direction, and AI summary state.
- [x] Every SEC-derived fact has reported-period/filer labeling; editorial style/philosophy is not presented as SEC fact.
- [x] Fixed 13F delay/coverage warning is present on Guru surfaces.
- [x] Loading, empty, partial, stale, and failure states are covered; browse paths use prepared API reads and work on desktop/mobile.
- [x] Guru overview links to the dedicated /gurus/:slug/filings route, whose source/history implementation and acceptance belong to ticket 07.
- [x] Browser evidence covers directory discovery and navigation to a Guru overview in all supported locales.

## Verification evidence

- `npx vitest run tests/integration/gurus-http.test.ts tests/integration/admin-gurus-http.test.ts` — 2 files, 6 tests passed against disposable local PostgreSQL.
- `npx playwright test tests/e2e/guru-discovery.spec.ts` — passed with all three locales, 390px layout, loading, empty, failure/retry, and partial-quarter states.
- `npm run typecheck`, scoped ESLint, `npm run contracts:check`, and `git diff --check` passed.
- Visual evidence: `docs/design/evidence/guru-discovery/`.

## Blocked by

- [01 Guru registry](01-guru-registry.md)
- [05 portfolio analytics](05-portfolio-analytics.md)
