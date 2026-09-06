# diary-v3 Full Rebuild Plan

Status: original planning record; the module breakdown and test scope are confirmed, and implementation has now started against the local tickets. Progress is judged by each ticket's acceptance evidence.
Inventory date: 2026-09-05.

Follow-up spec: [full rebuild PRD](/Users/klam/Desktop/project/diary-v3/.scratch/diary-v3-rebuild/PRD.md). The user has confirmed carrying over this plan's module breakdown and test scope; the PRD governs concrete acceptance.

## 1. Goals and Confirmed Scope

1. Feature and business-behavior parity with everything currently live in diary-vue.
2. The Web app moves entirely to React.
3. The database moves to PostgreSQL, with Drizzle for schema and queries.
4. No React Native app at this stage; instead, deliver the API it will consume directly, native authentication, shared contracts, and reusable business logic.
5. UI/UX is redesigned under Impeccable; the old visuals impose no constraints.
6. No legacy data migration; the new database is built from empty.
7. The user has confirmed keeping Docker/K3s; push notifications and offline writes are deferred to the app phase.

"Feature parity" covers user operations, permissions, data outcomes, APIs, scheduling, import/export, public content, and error scenarios. Page layout and implementation approach may change; features must not be silently dropped and trading formulas must not change during the rebuild.

## 2. Current Baseline and Constraints

- diary-v3 was an empty folder at inventory time.
- diary-vue currently has 43 page files and 124 API handler files; this is the inventory entry point, not 43 independent features or a completed acceptance result.
- Source HEAD: `72b5bf7bb5cd841eff2fca9795a5fa977bff0196`.
- The source carries uncommitted fixes to auth, schema, market jobs, Socket.IO, and more. Phase 0 must freeze a worktree snapshot that includes these changes; taking HEAD alone is not acceptable.
- The legacy OpenAPI spec mostly covers the mobile/core API and does not cover every handler; a complete feature matrix must be built separately.
- This was a code and documentation inventory: the legacy system's full test suite was not run, and no completed runtime feature-parity verification is claimed.

Primary evidence:

- [Current product scope](/Users/klam/Desktop/project/diary-vue/PRODUCT.md)
- [Domain language and rules](/Users/klam/Desktop/project/diary-vue/CONTEXT.md)
- [Feature workflows](/Users/klam/Desktop/project/diary-vue/docs/WORKFLOWS.md)
- [React Native readiness](/Users/klam/Desktop/project/diary-vue/docs/backend-readiness.md)
- [Data model](/Users/klam/Desktop/project/diary-vue/prisma/schema.prisma)
- [Legacy database migrations](/Users/klam/Desktop/project/diary-vue/prisma/migrations)

## 3. Proposed Technical Architecture

A TypeScript monorepo using npm workspaces and a single lockfile.

| Layer | Choice | Responsibility |
| --- | --- | --- |
| Web | React + React Router framework mode + Vite | Routing, React UI, SSR of public content, interactive pages |
| API | Hono on Node.js | REST, authentication and authorization, business use cases, Socket.IO, scheduler startup |
| Database | PostgreSQL + Drizzle + node-postgres | Schema, SQL migrations, queries, transactions and data constraints |
| Contracts | Zod + OpenAPI | Runtime validation of requests/responses/errors and the external protocol |
| Client | openapi-typescript + openapi-fetch | Shared typed fetch client, coordination of native refresh |
| Testing | Vitest + Playwright + disposable PostgreSQL | Pure logic, API/DB integration, browser flows |

React Router framework mode supports SSR, client rendering, and prerendering, so a single React web app can preserve the first-HTML body of public articles along with the interactive workspace. [Official rendering docs](https://reactrouter.com/start/framework/rendering)

Hono has a Node.js adapter and suits hosting a standalone HTTP API runtime; the choice here rests on a clean API boundary and self-hosting requirements. [Official Node docs](https://hono.dev/docs/getting-started/nodejs)

Drizzle provides PostgreSQL column types and a versioned migrations workflow; date and numeric types must be configured explicitly rather than relying on automatic serialization. [Column docs](https://orm.drizzle.team/docs/column-types), [migrations docs](https://orm.drizzle.team/docs/migrations)

Pin compatibility-checked stable versions when implementation starts; this plan does not pre-commit to unverified version combinations.

```text
diary-v3/
  apps/
    web/                  React UI, routes, styles, i18n, PWA
    api/
      modules/            organized by feature: diary, portfolio, research, etc.
      jobs/               scheduler and CronJob CLI entry points
  packages/
    contracts/            Zod schemas, API errors, OpenAPI registry
    api-client/           standard fetch client, single-flight refresh
    domain/               pure computation, validation and state rules
    db/                   Drizzle schema, migrations, DB functions
  tests/
    parity/               old-vs-new behavior fixtures and feature mapping
    e2e/                  full user flows
  docs/
    adr/                  architecture decisions kept long-term
```

Dependency boundaries: Web and a future native app may import contracts, api-client, and applicable pure domain functions. The DB, server credentials, and Node-only modules are for the API/jobs only. Authorization and authoritative business validation stay in the API; sharing validation with the frontend must not move them out.

The web public SSR loader fetches and renders data through the API; no second business or session system is created. Interactive pages reach the same API through the shared API client. A shared frontend state/cache abstraction is extracted only when actual duplication demands it.

K3s topology:

```text
Ingress on a single origin
  ├─ /api/**, /socket.io/** → API runtime → PostgreSQL
  └─ every other URL        → Web SSR runtime → API

Market Rotation CronJob → jobs CLI of the same API image → business functions/PostgreSQL
Future React Native     → the same REST API
```

The API stays a modular monolith. One active scheduler/realtime instance; early deployments must avoid two schedulers running at once during a rollout. Web can deploy independently; how the API scales is decided when real demand exists.

## 4. Initial Feature-Parity Scope

| Feature group | Capabilities that must be preserved |
| --- | --- |
| Accounts & settings | Registration, web login/logout and renewal, native session, logout-all, password change, roles, language, timezone, existing preferences |
| Diary | Markdown, tags, CRUD, search/filter/pagination, one-per-day uniqueness, transaction and reminder links |
| Quick Diary | Global entry point, keyboard shortcut, free-form writing, templates, and the existing save/append-to-current-day flows |
| Overview/Timeline/Calendar | Investment overview, recent activity, date navigation, diary reading, items to watch, partner-comparison entry |
| Review/Trade Plans | Structured diary review, review queue, thesis review, trade plans and status transitions, diary links |
| Portfolio/performance | Trade records, positions, valuation, cost and P/L, exposure/concentration, cautions, strategy performance, trade export |
| Company/Watchlist | Watchlist, Company Hub, Stock Notes, immutable timeline, Investment Thesis, evidence collection |
| Alerts/Discipline | Diary follow-up reminders, WEEK/MONTH recurrence rules, price alerts, foreground realtime prompts, discipline CRUD/reorder/random/share/import-export |
| Partner/Agent | Invitation acceptance and removal, two-way sharing settings, Pair View, API key scopes, external agent writes and idempotency |
| Markets & tools | ETF watch/research, market state, Market Rotation and historical snapshots, position sizing, FIRE, relative value, seasonality, SEC filings browse/download/bundle |
| Public content & admin | Home, About, usage guide, Articles/Blog, SSR/SEO/sitemap/OG, article draft/publish/archive/bulk operations, user and ETF administration, batch triggers |
| Cross-page experience & ops | zh-TW/zh-CN/en, light and dark themes, responsive, PWA, permission/error/empty states, health, logs, CI, backup and restore |

Phase 0 expands each item into "legacy entry point, operations, roles, API, data rules, new location, tests, completion status". Every currently live feature needs a new home and acceptance; only legacy internal implementations confirmed as retired may be left behind, such as historical data-repair tools. When documentation and code disagree, check actual behavior first; known bugs are listed separately and are not license to change specs at will during the rewrite.

## 5. Concrete Definition of App-Ready

Completed in this phase:

- REST + JSON usable with plain fetch, with no dependence on React Router loaders/actions, the browser cookie jar, or the DOM.
- Web uses HttpOnly cookies and CSRF; native uses a JSON token pair with a Bearer access token and a rotating refresh token.
- Behaviors such as refresh families, replay detection, single-flight refresh, and revocation on logout are preserved.
- An invalid Bearer token is rejected outright and never falls back to a valid cookie; permissions are verified server-side.
- The shared client accepts an injected base URL, fetch, and access-token provider; the future native platform adapter for token storage is separate from the API.
- IDs and persisted decimals are strings; calendar dates are `YYYY-MM-DD` and instants are UTC `Z`.
- Stable error codes, requestId, pagination, and ownership contracts.
- Keep the existing compatibility envelope under `/api/**`; when a future app release lags the backend, existing contracts are not broken in place.
- Socket.IO signals foreground updates; after reconnecting or returning to the foreground, authoritative data is re-fetched over REST.
- Lint and dependency gates stop the shared client/domain from importing Vue, React DOM, Hono, Drizzle, or Node-only server modules.
- DOM-free native-client tests against a real API + PostgreSQL: login, diary read/write, concurrent 401s sharing a single refresh, retry, logout, and revocation.

Screens, navigation, Keychain/Keystore integration, deep-link handlers, APNs/FCM/Expo Push, offline writes, and conflict handling come only in the React Native phase.

What gets shared is contracts, the client, and pure logic. Web HTML/CSS components stay in Web; a future native UI is implemented per platform. Locale strings and portable semantic token values carry over; there is no need to build an empty mobile app this phase.

## 6. PostgreSQL/Drizzle Design Focus

Skipping legacy data migration keeps initialization simple, but the final constraints on the data must still be rebuilt in full.

| Risk | Plan |
| --- | --- |
| The Prisma schema does not reflect every SQL constraint | Read the checks, composite FKs, and triggers in the migrations too; write the effective rules into new Drizzle/custom SQL migrations |
| Money, price, and quantity precision | PostgreSQL numeric with explicit precision and API strings; verify calculation and rounding against existing fixtures, never casually cast to JS Number |
| Dates/timezones | Diary and market civil dates use date; event times use timestamptz; test DST, day boundaries, and user timezones |
| Daily uniqueness and concurrent appends | A `(user_id, date)` unique constraint plus transactions/row locks where needed; test concurrent creation, appends, and trade edits |
| Trade ledger integrity | Keep existing rules such as validating the whole ledger in time order and no overselling; edits to diary, trade, and reminder links stay atomic |
| User isolation | Ownership checks, same-user composite foreign keys, partner-sharing allowlists; trades, positions, and private reviews never leak |
| Refresh token concurrency | Keep atomic claim, single winner, and family revocation; rewrite the error mapping for PostgreSQL |
| Search and casing | Explicit email/symbol normalization; rebuild MariaDB collation/FULLTEXT-equivalent behavior; Chinese, English, and mixed-text search are accepted independently |
| Enums and missing values | Match wire-contract casing and lifecycle; unknown/null/missing quotes must never be substituted with 0 |
| Scheduling and performance | Rebuild indexes and paginated queries; keep trigger ordering, idempotency keys, single-instance scheduling, and job failure records |

Chinese full-text search does not default to replacing the old capability with PostgreSQL's English tokenizer; the Phase 0 search fixtures decide the minimal viable implementation and the indexes it needs.

A fresh initialization contains only the market universe and ETF definitions the system needs, plus a safe admin-creation flow. Test/demo data is synthetic. New schema migrations and PostgreSQL backup/restore remain in scope for delivery.

## 7. UI/UX Plan

What follows is a proposed design starting point, not an implemented or locked visual spec. The Impeccable product-fact record lives in [PRODUCT.md](/Users/klam/Desktop/project/diary-v3/PRODUCT.md).

**Direction: a clear, calm investment research desk.** Identity comes from text, dates, investment judgments, and data hierarchy. Warm-white reading surfaces, ink-colored body text, and a restrained deep-green action color are candidates; up/down and risk keep independent semantics. Number alignment, table density, and long-session reading outrank decoration.

| Surface | Mode and design task |
| --- | --- |
| Overview/Timeline | Operate/Read: see what needs handling first, then read your own decision context by date |
| Diary composer/Review | Operate: a clear main editing area, with thesis, risk, execution, and retrospective visually distinct |
| Portfolio/Company | Operate: sensible position data density; from a company, reach theses, evidence, and reviews |
| Research tools | Operate: understand inputs and data timing first, then compare results and limits |
| Articles | Read: body text, headings, table of contents, and reading width lead |
| Public home | Persuade: show accurately what the product can actually do, using real features or clearly labeled examples |

Initial information architecture: fixed desktop navigation split into Overview, Diary, Portfolio, Research, Review; Partner, Alerts, Discipline, Settings, and Admin keep clear entries. Quick Diary stays a global action.

Desktop can compose "list / main content / context" as needed; mobile switches to single-column task flows with touch-friendly bottom navigation and a capture entry. Wide tables on mobile use a summary, expandable rows, or clearly visible horizontal scrolling, keeping all data and actions.

Before mass page production, complete design proposals and interactive templates for three representative flows: Overview, Quick Diary, and Company/Review; cover desktop/mobile, long content, zero data, missing quotes, loading, errors, permission denial, and long translations at the same time. The visual construction approach is settled in that phase.

Build only the foundation components actually needed: semantic tokens, forms, tables, navigation, dialogs, status messages, and Markdown and chart containers. WCAG AA, keyboard/focus, reduced motion, and three languages are the quality bar. Each full UI delivery goes through Impeccable's bounded desktop/mobile checks and an independent finish review before the actual design system is recorded.

## 8. Phased Delivery

Every feature phase delivers DB, API, React UI, and tests together; the interim login-and-diary skeleton is only the first validated flow — full feature parity is still required at the end.

| Phase | Deliverables | Pass criteria |
| --- | --- | --- |
| 0: Frozen baseline | Source snapshot including uncommitted changes, a complete route/API/scheduling/data-rule matrix, reproducible fixtures, a known-issues table | Every live feature has a home; new source changes have a tracking path |
| 1: End-to-end foundation | Monorepo, PostgreSQL, migrations, API/Web runtimes, contracts, dual-mode auth, CI, and the minimal login → create → read diary flow | Real DB + Web + a DOM-free client all complete it; auth/ownership gates pass |
| 2: Design and the diary main line | Representative-flow templates, app shell, Quick Diary, full diary authoring, Timeline, search, Calendar, diary review, Trade Plans | Quick capture through review is usable end to end; concurrent appends and ledger links are correct; desktop/mobile acceptance |
| 3: Investment workflows | Watchlist, Company Hub, Notes/Evidence/Thesis, thesis review, trades, Portfolio, performance, export | Positions/P/L/exposure/performance on fixed fixtures match legacy semantics; missing-data states are consistent |
| 4: Alerts and collaboration | Diary alerts, Price Alerts, Discipline, Socket.IO, Partner/Pair View, API keys/agent ingestion | Scheduler and trigger behavior, sharing isolation, replay/idempotency, and reconnect recovery accepted |
| 5: Research and public content | Yahoo/ETF/Market State/Rotation, SEC, all calculation tools, Articles/Blog, admin console | Batches are re-runnable; provider failures/rate limits/partial data are handled; public articles' first HTML is readable |
| 6: Full acceptance and delivery | Complete the three languages/themes/PWA, full-feature parity, performance and a11y, K3s manifests, PostgreSQL backup/restore, ops docs | Full matrix passes, all release gates green, clean-environment deployment and restore drills succeed |

Deployment configuration and verification start in Phase 1; Phase 6 completes the formal delivery check. PWA, three languages, and themes are supported continuously in every phase — the whole UI must not be patched up at the end.

## 9. Final Acceptance

- Every feature-matrix row has concrete evidence; "the page exists" never counts as done.
- Extract reproducible business fixtures/behavior tests from the legacy code, run them with a fixed clock and fixed market data, and compare against the new system. Nondeterministic fields such as IDs and timestamps get an explicit mapping only; meaningful differences are never ignored.
- Real PostgreSQL tests: empty migration, constraints, transactions, concurrency, link deletion, queries, and native refresh.
- API tests: roles, ownership, partner privacy, web CSRF, invalid-Bearer fail-closed, refresh replay, socket revocation on logout/password change, pagination, and ID/decimal/date formats.
- Native-ready tests hit the new backend directly, not just a mocked fetch; building or delivering a React Native app is not required.
- Playwright verifies the core end-to-end flows, with API parity covering all remaining features.
- Public articles' initial HTML has body content, title, and canonical/meta tags, and stays readable with JavaScript disabled.
- Yahoo/SEC use controlled upstream fixtures to verify rate limiting, caching, stale data, download limits, and failures; CI does not depend on live market network results.
- The PWA keeps install and update capability; personal API data stays NetworkOnly, so adding a service worker never causes cross-account caching or covert offline writes.
- CI includes lint, typecheck, build, contracts/client drift, domain tests, PostgreSQL integration, and core E2E; releases are gated on these results.
- Performance is measured with representative large diaries, long time series, pagination, and market data; Phase 0 establishes baselines and thresholds instead of inventing timing guarantees now.
- The self-hosted environment provides health/readiness, structured requestId/jobId logs, a migration Job, a single-instance scheduler, backup/restore, and a release-rollback flow.

## 10. Decision Status for This Round

Confirmed: React, PostgreSQL/Drizzle, full feature parity, UI/UX free to redesign, no legacy data migration, Docker/K3s, and deferral of push notifications and offline writes.

This plan proposes: a TypeScript monorepo with a React Router framework web app and a Hono API; delivery stage by stage along complete feature flows; formal coding starts at Phase 0/1.

Still to be settled during implementation: compatible package versions, visual templates, a complete item-by-item parity checklist, performance baselines, and the public brand name. These do not change this round's scope and must not be treated as done.
