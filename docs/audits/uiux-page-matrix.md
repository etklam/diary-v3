# Trade basic All-pages UI/UX Audit Matrix

Audit date: 2026-09-18

Baseline commit: `7e3a39ad5c4900f88d9d8193b7077610d48f9418`

Registered route count: 52 routes in `apps/web/app/routes.ts`.

This matrix records the current checkout, not an older screenshot set. Coverage is layered rather than a full Cartesian product of route, viewport, theme, locale, and state. Each row has a runtime smoke or behavior reference, and the shared-shell tests cover the common layout around the page-specific checks.

## Coverage legend

- `D1440/M390`: runtime coverage at 1440x900 and 390x844.
- `D/M+dark`: desktop/mobile coverage with at least one explicit dark-theme pass in the named suite; light is the default pass unless stated otherwise.
- `360/768`: additional narrow or breakpoint coverage.
- `L/E/P/Err`: loading, empty, populated, and error states where applicable.
- `V/Sub/OK`: validation error, submitting, and success feedback where applicable.
- `Auth`: authorization or protected-route behavior.
- `LC`: long-content or dense-data behavior.
- `Static`: route registration, shell ownership, and component inspection.

Status values are deliberately route-level:

- `verified`: the route and its applicable states were exercised without a change required in this audit.
- `fixed-and-verified`: a shared fix affects the route and the route was re-run after that fix.
- `not-applicable`: the entry is a redirect or non-HTML response; behavior was checked but visual review does not apply.
- `blocked`: a required route-level check could not be completed. No registered HTML route is marked blocked in this run.

## Route matrix

| # | Route | Page/component | Access | Applicable states and fixtures | Viewport/theme and evidence | Issues | Status |
|---:|---|---|---|---|---|---|---|
| 1 | `/` | `routes/home.tsx`; overview workspace in the authenticated shell | Guest and authenticated variants | L/E/P; Auth boundary; quick capture entry | D1440/M390, light/dark shared-shell coverage; `tests/e2e/overview.spec.ts`, `tests/e2e/daily-workspace.spec.ts`, `tests/e2e/design.spec.ts`, `tests/e2e/pwa.spec.ts` | UI-002 | fixed-and-verified |
| 2 | `/about` | `routes/about.tsx` public content | Public | P; locale and long-copy reading | D1440/M390; `tests/e2e/layout-theme.spec.ts`, `tests/e2e/pwa.spec.ts`, `docs/design/evidence/public-pages/` | UI-002 | fixed-and-verified |
| 3 | `/guide` | `routes/guide.tsx` public guide | Public | P; locale and responsive list | D1440/M390; `tests/e2e/layout-theme.spec.ts`, `tests/e2e/pwa.spec.ts`, `docs/design/evidence/public-pages/` | UI-002 | fixed-and-verified |
| 4 | `/login` | `routes/login.tsx` and `auth-form.tsx` | Public entry; redirects into private shell after success | V/Sub/OK; failed login preserves return path | D1440/M390; all supported locale selectors; `tests/e2e/web-session.spec.ts`, `tests/e2e/layout-theme.spec.ts`, `docs/design/evidence/public-pages/` | UI-002 | fixed-and-verified |
| 5 | `/register` | `routes/register.tsx` and `auth-form.tsx` | Public entry | V/Sub/OK; registration return path | D1440/M390; `tests/e2e/first-diary.spec.ts`, `tests/e2e/discipline-share.spec.ts` | UI-002 | fixed-and-verified |
| 6 | `/timeline` | `routes/timeline.tsx` | Private | L/E/P/Err; paging; back/forward context | D1440/M390, `360/768` shared browse coverage; `tests/e2e/timeline.spec.ts`, `tests/e2e/diary-discovery.spec.ts`, `tests/e2e/partner-timeline-parity.spec.ts` | — | verified |
| 7 | `/diaries` | `routes/diary-list.tsx` | Private | L/E/P/Err; search, filter, sort, pagination, recovery | D1440/M390, 360/768; `tests/e2e/diary-list.spec.ts`, `tests/e2e/diary-discovery.spec.ts`, `docs/design/evidence/diary-list/` | — | verified |
| 8 | `/diaries/new` | `routes/new.tsx` and `diary-editor.tsx` | Private | V/Sub/OK/Err; draft recovery; Markdown; reminder replacement | D1440/M390, 360; light/dark editor coverage; `tests/e2e/diary-editor.spec.ts`, `tests/e2e/diary-editor-ux.spec.ts`, `tests/e2e/diary-response-loss.spec.ts` | AUD-001 | verified |
| 9 | `/diaries/quick` | `routes/quick.tsx` and quick composer | Private or guest handoff | V/Sub/OK/Err; saved draft; source context; retry | D1440/M390, 360; `tests/e2e/quick-diary.spec.ts`, `tests/e2e/quick-related-trades.spec.ts`, `tests/e2e/research-diary-handoff.spec.ts`, `docs/design/evidence/quick/` | — | verified |
| 10 | `/diaries/:id/edit` | `routes/diary-edit.tsx` | Private owner | Valid synthetic diary fixture; V/Sub/OK/Err; dirty navigation and recovery | D1440/M390; dynamic IDs created by `diary-editor.spec.ts` and `diary-editor-ux.spec.ts`; `docs/design/evidence/diary/` | — | verified |
| 11 | `/diaries/:id/review` | `routes/diary-review.tsx` | Private owner | Valid synthetic diary fixture; schedule, complete, revise, recover | D1440/M390; dynamic IDs from `diary-review.spec.ts`; `tests/e2e/diary-detail-review.spec.ts`, `docs/design/evidence/review/` | — | verified |
| 12 | `/diaries/:id` | `routes/diary.tsx` reading view | Private owner | Valid synthetic diary fixture; Markdown/LC; review section; delete path | D1440/M390; dynamic IDs from `diary-editor.spec.ts` and `diary-detail-review.spec.ts`; `docs/design/evidence/diary/`, `docs/design/evidence/markdown/` | — | verified |
| 13 | `/discipline/share` | `routes/discipline-share.tsx` | Public import/share; writes require auth | L/E/P/Err; import preview; V/Sub/OK; clipboard denial | D1440/M390, all locales; `tests/e2e/discipline-share.spec.ts`, `docs/design/evidence/discipline/` | — | verified |
| 14 | `/partners/compare` | `routes/partner-compare.tsx` | Private partnered users | L/E/P/Err; no partner; invitation; selection; unlink | D1440/M390, dark and all locales; `tests/e2e/partner-timeline-parity.spec.ts`, `tests/e2e/partners.spec.ts`, `docs/design/evidence/partner-timeline-parity/` | — | verified |
| 15 | `/partners` | `routes/partners.tsx` | Private | L/E/P/Err; invitation, accept, withdrawal, unlink | D1440/M390; `tests/e2e/partners.spec.ts`, `docs/design/evidence/partners/` | — | verified |
| 16 | `/discipline` | `routes/discipline.tsx` | Private | L/E/P/Err; CRUD; reorder; failed write; long collection | D1440/M390; `tests/e2e/discipline.spec.ts`, `docs/design/evidence/discipline/` | — | verified |
| 17 | `/alerts` | `routes/alerts.tsx` | Private | L/E/P/Err; series dismissal; create/edit; timezone edge cases | D1440/M390; `tests/e2e/alerts.spec.ts`, `tests/e2e/foreground-reminders.spec.ts`, `docs/design/evidence/alerts/` | — | verified |
| 18 | `/reviews` | `routes/reviews.tsx` and review queue | Private | L/E/P/Err; filter; complete; paging; recovery | D1440/M390; `tests/e2e/review-queue.spec.ts`, `tests/e2e/daily-workspace.spec.ts`, `docs/design/evidence/review/` | — | verified |
| 19 | `/calendar` | `routes/calendar.tsx` | Private | L/E/P; date navigation; heatmap; exact day fixtures | D1440/M390; `tests/e2e/calendar.spec.ts`, `docs/design/evidence/calendar/` | — | verified |
| 20 | `/trade-plans` | `routes/trade-plans.tsx` | Private | L/E/P/Err; lifecycle list; pagination | D1440/M390; `tests/e2e/trade-plans.spec.ts`, `docs/design/evidence/trade-plans/` | — | verified |
| 21 | `/trade-plans/new` | `routes/trade-plan-new.tsx` | Private | V/Sub/OK/Err; exact decimal inputs; diary handoff | D1440/M390; `tests/e2e/trade-plans.spec.ts`, `docs/design/evidence/trade-plans/` | — | verified |
| 22 | `/trade-plans/:id` | `routes/trade-plan.tsx` | Private owner | Valid synthetic trade-plan ID; draft/active/completed lifecycle; decimal precision | D1440/M390; dynamic ID created by `trade-plans.spec.ts`; `docs/design/evidence/trade-plans/` | — | verified |
| 23 | `/strategy-performance` | `routes/performance.tsx` and performance table/chart | Private | L/E/P/Err; filters; long names; large values; pagination | D1440/M390, LC; `tests/e2e/performance.spec.ts`, `docs/design/evidence/performance/` | — | verified |
| 24 | `/stocks` | `routes/holdings.tsx` and portfolio views | Private | L/E/P/Err; complete/incomplete/stale valuation; retry | D1440/M390; `tests/e2e/portfolio.spec.ts`, `tests/e2e/portfolio-attention.spec.ts`, `tests/e2e/portfolio-exposure.spec.ts`, `docs/design/evidence/portfolio/` | — | verified |
| 25 | `/stocks/watchlist` | `routes/watchlist.tsx` | Private | L/E/P/Err; add/edit/remove; uncertain write recovery | D1440/M390; `tests/e2e/watchlist.spec.ts`, `tests/e2e/etf-research.spec.ts`, `docs/design/evidence/watchlist/` | — | verified |
| 26 | `/stocks/alerts` | `routes/price-alerts.tsx` | Private | L/E/P/Err; create/edit/delete/rearm; foreground retry | D1440/M390; `tests/e2e/price-alerts.spec.ts`, `tests/e2e/foreground-reminders.spec.ts`, `docs/design/evidence/price-alerts/` | — | verified |
| 27 | `/stocks/:symbol/thesis` | `routes/thesis.tsx` | Private | Valid `AAPL` fixture; L/E/P/Err; activation review; failed save | D1440/M390; `tests/e2e/thesis.spec.ts`, `docs/design/evidence/thesis/` | — | verified |
| 28 | `/stocks/:symbol` | `routes/company-market.tsx` | Public research, private capture | Valid `AAPL`/`SPY` fixtures; quote/history missing, stale, retry | D1440/M390; `tests/e2e/company-market.spec.ts`, `tests/e2e/company-hub.spec.ts`, `docs/design/evidence/company-hub/` | — | verified |
| 29 | `/tools/etf` | `routes/etf-research.tsx` | Public research; watchlist writes require auth | L/E/P/Err; unavailable/stale profile; watchlist recovery | D1440/M390, dark; `tests/e2e/etf-research.spec.ts`, `docs/design/evidence/etf-research/` | UI-002 | fixed-and-verified |
| 30 | `/tools` | `routes/tools.tsx` | Public core use; authenticated shell variant | P; guest calculation entry; private API boundary | D1440/M390; `tests/e2e/public-tools.spec.ts`, `tests/e2e/etf-research.spec.ts`, `docs/design/evidence/public-tools/` | UI-002 | fixed-and-verified |
| 31 | `/tools/market-rotation` | `routes/market-rotation.tsx` | Public monitor; admin writes | L/E/P/Err; no snapshot; unknown values; export; admin batch | D1440/M390, dark/locales; `tests/e2e/market-rotation.spec.ts`, `docs/design/evidence/market-rotation/` | UI-002 | fixed-and-verified |
| 32 | `/tools/relative-value` | `routes/relative-value.tsx` | Public core use | L/E/P/Err; local capture handoff | D1440/M390; `tests/e2e/relative-value-seasonality.spec.ts`, `docs/design/evidence/relative-value/` | UI-002 | fixed-and-verified |
| 33 | `/tools/seasonality` | `routes/seasonality.tsx` | Public core use | L/E/P/Err; table density; export/local capture | D1440/M390; `tests/e2e/relative-value-seasonality.spec.ts`, `tests/e2e/public-tools.spec.ts`, `docs/design/evidence/relative-value/` | UI-002 | fixed-and-verified |
| 34 | `/tools/sec-filings` | `routes/sec-filings.tsx` | Public core use | L/E/P/Err; search/filter; unavailable provider; result selection | D1440/M390; `tests/e2e/sec-filings.spec.ts`, `tests/e2e/pwa.spec.ts`, `docs/design/evidence/sec-filings/` | UI-002 | fixed-and-verified |
| 35 | `/tools/sec-filings/:cik/:accession` | `routes/sec-filing-detail.tsx` | Public core use | Valid synthetic `0000000001/0000000001-24-000001`; loading/error/document reading | D1440/M390; `tests/e2e/sec-filings.spec.ts`, `docs/design/evidence/sec-filings/` | UI-002 | fixed-and-verified |
| 36 | `/etf/watchlist` | `routes/etf-watchlist.tsx` | Private | L/E/P/Err; add/remove; catalog unavailable | D1440/M390; `tests/e2e/etf-research.spec.ts`, `tests/e2e/narrow-viewport.spec.ts` | — | verified |
| 37 | `/admin/etf` | `routes/etf-admin.tsx` | Admin only | Auth; L/E/P/Err; catalog/history CRUD; focused long input | D1440/M390; `tests/e2e/etf-admin.spec.ts`, `docs/design/evidence/etf-admin/` | — | verified |
| 38 | `/admin/users` | `routes/admin-users.tsx` | Admin only | Auth; L/E/P/Err; current-account guard; ordinary-user denial | D1440/M390; `tests/e2e/admin-users.spec.ts`, `tests/e2e/workspace-navigation.spec.ts`, `docs/design/evidence/admin-users/` | — | verified |
| 39 | `/settings` | `routes/settings.tsx` | Private | L/E/P/Err; exact zero/decimal values; timezone; locale/theme persistence | D1440/M390, light/dark; `tests/e2e/settings.spec.ts`, `docs/design/evidence/settings/` | — | verified |
| 40 | `/settings/api-keys` | `routes/api-keys.tsx` | Private | L/E/P/Err; create/revoke; masked secret; external diary | D1440/M390; `tests/e2e/api-keys.spec.ts`, `docs/design/evidence/api-keys/` | — | verified |
| 41 | `/settings/security` | `routes/account-security.tsx` | Private | V/Sub/OK/Err; wrong current password; all-device logout; password change | D1440/M390, light/dark/locales; `tests/e2e/account-security.spec.ts`, `docs/design/evidence/security-*` | — | verified |
| 42 | `/tools/financial-freedom` | `routes/fire.tsx` | Public core use | L/E/P/Err; numeric assumptions; projection; responsive copy | D1440/M390; `tests/e2e/fire.spec.ts`, `tests/e2e/public-tools.spec.ts`, `docs/design/evidence/fire/` | UI-002 | fixed-and-verified |
| 43 | `/tools/position-sizing` | `routes/position-sizing.tsx` | Public core use; save requires auth | V/Sub/OK/Err; calculation; guest sign-in prompt; handoffs | D1440/M390; `tests/e2e/position-sizing.spec.ts`, `tests/e2e/public-tools.spec.ts`, `docs/design/evidence/position-sizing/` | UI-002 | fixed-and-verified |
| 44 | `/design-preview` | `routes/preview.tsx` | Public internal design review | L/P; locale; theme; keyboard selection; narrow reflow | D1440/M390, 360/768 and light/dark; `tests/e2e/design.spec.ts` | — | verified |
| 45 | `/articles` | `routes/articles.tsx` | Public; admin controls by role | L/E/P/Err; guest/user/admin visibility; dark mobile | D1440/M390, dark; `tests/e2e/posts.spec.ts`, `tests/e2e/layout-theme.spec.ts`, `docs/design/evidence/article-publishing/` | UI-002 | fixed-and-verified |
| 46 | `/articles/:slug` | `routes/article.tsx` | Public; admin actions by role | Valid synthetic published/draft slug; Markdown/LC; missing image; admin actions | D1440/M390, dark; `tests/e2e/posts.spec.ts`, `tests/e2e/markdown-typography.spec.ts`, `docs/design/evidence/markdown/` | UI-002 | fixed-and-verified |
| 47 | `/sitemap.xml` | `routes/sitemap.ts` | Public non-HTML response | XML status/content type and route list | `Static`; route module inspection and build output; no visual surface | — | not-applicable |
| 48 | `/blog` | `routes/blog-index-redirect.tsx` | Public redirect | Redirect target and no stale shell | `Static`; route module and full E2E public article navigation | — | not-applicable |
| 49 | `/blog/:slug` | `routes/blog-redirect.tsx` | Public redirect | Valid slug redirect behavior | `Static`; route module and full E2E public article navigation | — | not-applicable |
| 50 | `/admin/blog` | `routes/admin-blog.tsx` | Admin only | Auth; L/E/P/Err; list, publish state, role denial | D1440/M390; `tests/e2e/posts.spec.ts`, `tests/e2e/workspace-navigation.spec.ts`, `docs/design/evidence/article-publishing/` | — | verified |
| 51 | `/admin/blog/new` | `routes/admin-blog-new.tsx` and `admin-post.tsx` | Admin only | V/Sub/OK/Err; Markdown preview; draft recovery | D1440/M390; `tests/e2e/posts.spec.ts`, `docs/design/evidence/article-publishing/` | — | verified |
| 52 | `/admin/blog/:id/edit` | `routes/admin-blog-edit.tsx` and `admin-post.tsx` | Admin owner | Valid synthetic post ID; draft/published edit; failed republish recovery | D1440/M390, dark; `tests/e2e/posts.spec.ts`, `docs/design/evidence/article-publishing/` | — | verified |

## Special checks outside the registered route count

| Entry | Evidence | Status |
|---|---|---|
| Unknown route / root error boundary | `apps/web/app/root.tsx` `ErrorBoundary`; missing synthetic image intentionally exercises the rendered failure path in `tests/e2e/posts.spec.ts` and WebKit critical output | verified |
| Native error/loading boundaries | Route-specific failed-request fixtures in `company-market`, `etf-research`, `market-rotation`, `review-queue`, `diary-response-loss`, and `research-diary-handoff` suites | verified |

## Coverage limits

- Chromium Playwright and the repository WebKit runner passed. The WebKit runner is browser automation, not a real iPhone Safari device.
- The matrix uses direct route tests plus shared-template tests; it does not claim every route x viewport x theme x locale x state combination.
- No production services, real users, credentials, tokens, or production database were used. Dynamic IDs and provider responses came from the disposable E2E server and synthetic fixtures.
- Screenshots are evidence of the relevant existing design surfaces. Interaction, persistence, authorization, and error-state claims come from tests, not screenshots alone.
