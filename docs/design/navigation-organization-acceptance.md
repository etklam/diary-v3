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

## Public articles moves out of Account — 2026-10-11

A signed-in reader reported that the workspace navigation offers no way to the
public articles. The link existed, but the original "Account: Public articles
and Settings" grouping above put it in the wrong place twice over. By category,
the article list is public reading rather than a setting about this reader, so
Account is not where anyone looks for it. By position, Account is the last group
in a column that scrolls past the viewport at 1440x900 — the recorded evidence
screenshot already ends mid-way through Markets & tools — and the platform
scrollbar is hidden until the pointer moves, so nothing signals that the group
exists at all.

Public articles now sits beside Tools, the other destination that opens in the
public chrome. Route ownership, the command palette entry and the public header
are untouched.

Placement alone does not fix the second half. The column overflowed its viewport
by 537px at 1440x900, measured against the shipped stylesheet, and Public
articles was below the fold before the move as after it. `useScrollAffordance`
therefore marks the sidebar `data-scroll-more` while content remains past its
bottom edge, and the account controls grow a 24px gradient above themselves
while that holds, so the rows sliding under them fade instead of ending against
an edge. The cue clears at the end of the list, where it would otherwise claim
content that is not there.

The alternative — forcing a permanently visible scrollbar — was rejected.
Safari does not implement `scrollbar-color`, and the global
`* { scrollbar-color: ... }` at the top of `styles.css` makes Chromium ignore
`::-webkit-scrollbar` on any element it touches, so the same signal would have
needed three engine-specific mechanisms and would still have cost gutter width
on every scroll container that inherited it.

## Shortening the column — 2026-10-12

The cue tells the truth about a column that is still too long. Measuring where
its 1437px went made the waste obvious, and four changes removed 277px of it
without costing any destination a click it did not already cost.

| Change | Saved |
| --- | --- |
| The sidebar ticker field is gone | 96px |
| Account moved into the pinned block, losing its heading, rule and gap | 79px net of the 48px it now occupies there |
| Markets & tools merged into Investing & markets, losing a heading | 70px |
| AI reports, Diary reminders and Partner management behind a Diary management disclosure | 68px |

The ticker field duplicated the command palette four rows above it: the palette
already resolves a bare ticker to that company, so the field spent 96px —
nearly three rows — on a second way in. `destinations()` now lists Market
research at the ticker the field opened on an empty submit, so that default
survives. `/stocks/:symbol` consequently has no marked entry anywhere, which is
honest: it never had one of its own.

The 2026-09-12 arrangement kept the three supporting diary functions open on the
grounds that none should cost an extra click. That reasoning did not survive
measurement — all three sat below the fold, so reaching them cost a blind scroll
*and* a hunt. One labelled disclosure that opens itself on the routes it owns is
cheaper than what it replaced. The capture-read-review loop stays open, as it
must; only its supporting functions moved.

The column now measures 1160px. It fits a 1200px viewport whole, overflows a
1050px one by 110px, and a 900px one by 260px, where the first row hidden under
the account block is Guru portfolios — four rows above Public articles, which
still needs a scroll on a laptop. Closing the remaining 260px would mean
collapsing the three diary views into one entry and reusing the existing
`DiaryNavigation` switcher on desktop, and that still leaves ~148px. Fitting
everything at 900px is not reachable without cutting into the diary loop, so the
cue is permanent, not a stopgap.

Verification: 133 unit files / 1190 tests, TypeScript, ESLint, the production
build, and the contrast check (74 pairs per theme). The column was measured in
Chromium at 1440x900 in both themes against the built stylesheet — overflow
537px before and 260px after, cue on with a 24px gradient at the top of the
column, cue off and the gradient collapsed at the end of it, Public articles
under the account block before scrolling and clear of it after.
`tests/e2e/workspace-navigation.spec.ts` asserts the same sequence, the two
group headings, the pinned Account links and the absent ticker field in the real
app; that suite needs a database and was not run here.

One correction worth recording: visibility in this column is not viewport
containment. The account block is opaque and sticky, so a row can intersect the
viewport and still be painted underneath it. A first measurement that tested
only `top >= 0 && bottom <= viewport` reported Public articles as visible at
900px when it was not; both the harness and the Playwright assertion now compare
against the block's top edge.
