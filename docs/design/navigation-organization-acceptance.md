# Navigation organization acceptance

Date: 2026-09-12
Review baseline and implementation start: `77c3a930023a32471ddad1fd61af0cb34603836b`

## Scope and findings

The previous workspace shell put Overview, Diary, Review queue, Trade plans, Holdings, Watchlist, Market research, and Tools in one "Daily work" group. Partners, Trading principles, Diary reminders, and Price reminders shared one unrelated "More workspace features" disclosure. Admin links were ordered ETF, accounts, then articles. These findings were confirmed. The existing shared desktop/mobile `NavigationLinks`, Quick Diary disclosure, Diary in-page navigation, Timeline partner comparison, Settings in-page links, and accessible mobile dialog were already correct and were retained.

## Before and after map

| Before | After |
| --- | --- |
| Daily work: all eight primary destinations | Overview, then Diary & review, Investing & trading, and Markets & tools |
| More workspace features: four unrelated secondary destinations | Diary management: reminders and partners; Trade management: price reminders and principles |
| Account: Settings and Account security | Account: Public articles and Settings; Settings owns its existing Preferences, API keys, and Security sub-navigation |
| Administration: ETF, accounts, articles | Administration: articles, users, ETF catalog |

The same configuration renders in the desktop sidebar and mobile drawer. Primary destinations remain visible. Each secondary disclosure opens automatically when it owns the current route. Existing evidence at `docs/design/evidence/ui-consistency/after/overview-1440.png` records the pre-phase shell. New evidence is in `docs/design/evidence/navigation/`.

## Route ownership

| Destination | Owned routes |
| --- | --- |
| Overview | `/` |
| Diary | `/diaries`, new/quick/detail/edit, `/timeline`, `/calendar`, `/partners/compare` |
| Review queue | `/reviews`, `/diaries/:id/review` |
| Diary reminders | `/alerts` |
| Partner management | `/partners` |
| Holdings | `/stocks`, `/strategy-performance` |
| Watchlist | `/stocks/watchlist` |
| Trade plans | `/trade-plans`, `/trade-plans/new`, `/trade-plans/:id` |
| Price reminders | `/stocks/alerts` |
| Trading principles | `/discipline`, `/discipline/share` |
| Market research | `/stocks/:symbol`, `/stocks/:symbol/thesis` |
| Tools | `/tools`, all `/tools/*`, `/etf/watchlist` |
| Public articles | `/articles`, `/articles/:slug` |
| Settings | `/settings`, `/settings/api-keys`, `/settings/security` |
| Article management | `/admin/blog`, `/admin/blog/new`, `/admin/blog/:id/edit` |
| User management | `/admin/users` |
| ETF catalog | `/admin/etf` |

Ownership uses a specific-path-first matcher, normalizes trailing slashes, and rejects lookalike prefixes such as `/trade-plans-extra`. A workspace sidebar landmark exposes at most one `aria-current="page"`; feature-local navigation can independently identify its current view. Account precedes the Admin-only Administration group in both desktop and mobile renderings.

## Evidence

- `tests/unit/navigation.test.ts`: 33 route ownership cases, including collision-prone routes, trailing slashes, and lookalike prefixes.
- `tests/e2e/workspace-navigation.spec.ts`: desktop, mobile dialog, role gating, focus return, route navigation, 360/768 overflow checks, and Admin ordering.
- `docs/design/evidence/navigation/user-sidebar-1440.png`
- `docs/design/evidence/navigation/admin-sidebar-1440.png`
- `docs/design/evidence/navigation/mobile-drawer-390.png`

Focused verification passed: navigation/capture unit tests (38), TypeScript, ESLint, and three Playwright navigation scenarios. Combined phase verification passed 72 unit files / 648 tests, the production build, contracts drift check, 20 scoped browser scenarios, and all 9 production-artifact RC1 browser scenarios. Full article and combined results are recorded in `docs/design/article-publishing-acceptance.md`.

## Mobile bottom navigation — 2026-09-20

The user's follow-up moves the three mobile diary shortcuts to the viewport bottom and adds Write diary. Below 768px the bar contains Library, Timeline, Calendar and Write diary; the top header contains only the brand and Menu. Write diary opens the full editor. New and quick capture routes select Write diary; reading/editing stays with Library. The mobile drawer retains Quick Diary and other workspace destinations, while the desktop capture disclosure remains unchanged.

The bar, page clearance and full-page Quick Diary sticky submit share a safe-area-aware height. Native dialogs retain their own footer and focus handling. Existing semantic colors, icons and system typography are reused.

Acceptance uses synthetic accounts and a disposable local PostgreSQL database. The navigation scenario verifies fixed positioning before and after scrolling, all four destinations, full/quick save clearance, reachable end-of-page content, three locales at 320px, 390px light/dark themes, drawer focus return and desktop/admin behavior. The full workspace-navigation and quick-diary suites pass seven Chromium scenarios. Typecheck, scoped ESLint, the production build, 38 existing navigation unit cases and independent code review pass. Desktop and mobile screenshots were reviewed together; only relevant mobile evidence is retained.

The same mobile navigation scenario also passes WebKit with `npx playwright test tests/e2e/workspace-navigation.spec.ts --config=playwright.webkit-critical.config.ts --grep 'mobile bottom navigation' --reporter=list`. This is browser automation evidence, not a physical-device test.
