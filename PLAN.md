# diary-v3 Full Rebuild Plan

Status: original approved planning record, inventoried on 2026-09-05. Sections 1–10 retain the original scope, acceptance requirements, and proposed direction; they are not the current implementation checklist. Documentation status reviewed on 2026-09-27.

The core rebuild has local acceptance. Use [PRODUCT.md](PRODUCT.md) for current capabilities, [DESIGN.md](DESIGN.md) for built visual rules, [architecture](docs/architecture.md) for the actual runtime/source map, and the [documentation index](docs/README.md) for later features and evidence. The [2026-09-25 acceptance](docs/features/all-tickets-acceptance-2026-09-25.md) and [2026-09-27 audit](docs/audits/project-cleanup-2026-09-27.md) supersede planning-era progress statements without changing this plan's original intent. They do not authorize a production cutover.

The user subsequently authorized documented legacy bug and technical-debt corrections under [ADR-0001](docs/adr/0001-parity-baseline-and-contract-corrections.md). Preserve valid feature intent rather than reproducing an erroneous formula or contract.

Follow-up spec: [full rebuild PRD](.scratch/diary-v3-rebuild/PRD.md). The user has confirmed carrying over this plan's module breakdown and test scope; the PRD governs concrete acceptance.

## 1. Goals and Confirmed Scope

1. Feature and business-behavior parity with everything currently live in diary-vue.
2. The Web app moves entirely to React.
3. The database moves to PostgreSQL, with Drizzle for schema and queries.
4. No React Native app at this stage; instead, deliver the API it will consume directly, native authentication, shared contracts, and reusable business logic.
5. UI/UX is redesigned under Impeccable; the old visuals impose no constraints.
6. No legacy data migration; the new database is built from empty.
7. The user has confirmed keeping Docker/K3s; push notifications and offline writes are deferred to the app phase.

"Feature parity" covers user operations, permissions, data outcomes, APIs, scheduling, import/export, public content, and error scenarios. Page layout and implementation approach may change; features must not be silently dropped and trading formulas must not change during the rebuild.

## 2. Original Inventory and Baseline Constraints

- diary-v3 was an empty folder at inventory time.
- The legacy inventory contains 43 page files and 124 API handler files; this is the inventory entry point, not 43 independent features or a completed acceptance result.
- Planning-scan HEAD: `72b5bf7bb5cd841eff2fca9795a5fa977bff0196`.
- The planning scan included uncommitted fixes, so that HEAD alone was not a complete baseline. At implementation freeze, the source had advanced to clean commit `47f8313bf29870b52582db97209bef2e1cbe41ce`; the sanitized archive and manifest record the actual accepted inputs.
- The legacy OpenAPI spec mostly covers the mobile/core API and does not cover every handler; a complete feature matrix must be built separately.
- This was a code and documentation inventory: the legacy system's full test suite was not run, and no completed runtime feature-parity verification is claimed.

Primary evidence is the [frozen baseline](docs/parity/README.md), [manifest](docs/parity/source-manifest.json), and [archive](docs/parity/source-snapshot.tar.gz). The archive contains the legacy `PRODUCT.md`, `CONTEXT.md`, `docs/WORKFLOWS.md`, `docs/backend-readiness.md`, `prisma/schema.prisma`, and `prisma/migrations/`. These are archive-relative references, not instructions to consult the live diary-vue checkout. Ordinary parity uses this immutable sanitized baseline.

## 3. Proposed Technical Architecture

The original proposal uses a TypeScript monorepo with npm workspaces and a root lockfile. The later isolated Native proof has a separate lockfile. See [current architecture](docs/architecture.md) for the implemented layout and worker topology.

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

The original proposal deferred exact versions. Current pins are in package manifests and lockfiles; runtime requirements are in [README.md](README.md#local-development). The following tree is the original proposed layout, not the current source map.

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

What follows is the original proposed design starting point. The current implemented direction, brand, colors, navigation, and spacing are governed by [DESIGN.md](DESIGN.md). The Impeccable product-fact record lives in [PRODUCT.md](PRODUCT.md).

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

## 10. Original Decision Status and Later Resolution

Confirmed: React, PostgreSQL/Drizzle, full feature parity, UI/UX free to redesign, no legacy data migration, Docker/K3s, and deferral of push notifications and offline writes.

The original proposal selected a TypeScript monorepo with a React Router framework Web app and a Hono API, delivered stage by stage along complete feature flows. Those runtime choices are now implemented.

The initial open decisions now have recorded outcomes:

| Original open item | Recorded outcome |
| --- | --- |
| Compatible package versions | Locked manifests and dependency evidence in the [latest audit](docs/audits/project-cleanup-2026-09-27.md) |
| Visual templates | Current [DESIGN.md](DESIGN.md) and dated [design reviews](docs/design/) |
| Item-by-item parity | [Frozen inventory and mappings](docs/parity/README.md), then [core acceptance](docs/parity/final-release-report.md) |
| Performance baseline | [Frozen workloads and gates](docs/parity/performance-baseline.md), with separate later audit measurements |
| Public brand | **Trade basic** |

Later additions include personal achievements, public tool access, Member articles, account email, optional Redis rate limiting, manual AI Reports, Admin Research Studio, and article translations. Their current guides and independent release gates are indexed in [docs/README.md](docs/README.md). The parent rebuild PRD remains unchanged.

## 11. Article reading access (2026-09-24)

The current addition is exactly `PUBLIC` and `MEMBER` reading access on the existing Post entity. A member is an existing authenticated user satisfying the application's account and session validity rules. Payment, paid tiers, subscriptions, billing, entitlement expiry, and a separate membership entity are explicitly deferred. This work does not extend AI reports, market providers, native features, or private Diary/Review ownership.

Publication and reading access remain independent. Published Public articles are readable by guests; published Member articles require a valid session. Draft and Archived articles remain unavailable through reader endpoints, including to signed-in users; Admins use the existing authenticated editor and preview. Only Admins may mutate content, access, or publication state. Unknown access values fail closed.

The reader keeps `/articles` and existing article URLs, the public shell, Markdown rendering, filters, sorting, and pagination. Public discovery uses an explicit metadata projection; a Member teaser must be intentionally authored for public display, never inferred from its body. The locked page provides the existing sign-in and registration flows with a validated internal return destination. New articles start Draft and Member.

### Delivery surfaces and compatibility

The repository audit found public list/search and detail under `/api/blog`, Admin list/detail/write/bulk routes, `/articles` SSR and Router hydration, the `/blog/:slug` redirect, and sitemap URL discovery. There is no article feed, export, print API, prerendered article output, or app-hosted attachment authorization service to extend. Public search retains its title/excerpt full-text semantics; body text is not a search field. React Markdown and its existing sanitization remain unchanged.

The application has no shared article query cache. The service worker already excludes API responses and navigations and caches only allowlisted static assets. Reader loader data and in-flight browser responses still require explicit session invalidation; API `no-store` alone is insufficient for SSR HTML or React state. The configured Nginx/Ingress does not enable a response cache, but independently managed edge rules cannot be inferred from the repository.

Deployment must run the additive migration before the access-aware API/Web. Freeze article mutations during the first rollout, establish tested access-aware rollback images before enabling Member publication, and review conservatively classified records. See the exact first-release, rollback, cache-bypass, and external-purge procedure in [production deployment notes](ops/k8s/production/README.md#article-access-release-boundary). No production migration, content publication, edge purge, or cutover is authorized or performed by this task. Previously public copies cannot be recalled, and external/public cover or Markdown assets retain their independent URL access.

### Historical implementation and verification checkpoint

The following records the article-access delivery checkpoint on 2026-09-24. Counts and execution claims are retained as historical evidence; this documentation refresh did not rerun them. Use the [latest audit](docs/audits/project-cleanup-2026-09-27.md) for later repository verification.

The centralized API policy returns full content, a locked result, or not found. Reader metadata is explicitly projected, and `excerptAuthored` distinguishes deliberate public teasers from legacy/body-derived excerpts. The additive `0025_even_nightcrawler.sql` migration preserves existing identifiers, slugs, bodies, publication states and dates; only previously published records with a publication timestamp become Public. Other records remain Member with migration counts and an operator review query. Database enums, non-null defaults, runtime contracts, OpenAPI and the generated client agree.

The editor separates publication from access, defaults to Draft/Member, and retains existing secure previews. Three-language reader cards and lock screens provide validated sign-in/registration returns. SSR forwards the existing credentials, including explicitly empty authorization headers. Article HTML and Router data use private/no-store; API bodies and previews use no-store. Session revision checks reject stale in-flight responses, and cross-tab logout completion discards original article documents, including hydration scripts retained after SPA navigation away. Admin mutations, page visibility and navigation revalidate article access. Existing single-device logout/access-token expiry semantics are retained; account-wide revocation follows the existing token-version rules.

Executed checks on disposable local PostgreSQL and synthetic fixtures:

| Command | Result |
| --- | --- |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed; also included in the production build |
| `npm run contracts:check` | Passed |
| `npm run test:unit` | 88 files, 806 tests passed |
| `npm run test:integration` | 78 files, 303 tests passed |
| `npx vitest run tests/integration/posts.test.ts tests/integration/post-access-migration.test.ts` | 2 files, 14 tests passed after the final explicit-empty-credential assertion |
| `npm run build` | API and Web production artifacts built successfully |
| `npx playwright test tests/e2e/article-access.spec.ts` | 1 consolidated access journey passed, including cross-tab logout and retained SSR document removal |
| `npx playwright test tests/e2e/posts.spec.ts tests/e2e/web-session.spec.ts tests/e2e/account-security.spec.ts tests/e2e/first-diary.spec.ts tests/e2e/public-pages.spec.ts` | 10 tests passed across the four existing matching files; no separate public-pages spec exists |
| `npm run test:e2e:release` | 10 tests passed against production artifacts, including protected HTML/Router data and existing private-data journeys |

The first release-suite run found an ambiguous body/excerpt locator and synthetic clients sharing the production login rate-limit bucket. The locator now targets rendered Markdown, and the new Member test uses isolated synthetic client addresses; the complete rerun passed without relaxing the product rate limiter. Initial sandbox network restrictions were resolved for local disposable test services. No remaining failing checks or credential blockers are known; the entire unrelated browser suite and production infrastructure were not exercised.

Desktop (1440px) and mobile (390px) reader/editor captures are recorded under `.impeccable/review/article-access-*.png`. Independent visual review corrected mobile publish-control flex sizing and accepted the resulting screens. Independent security review identified retained hydration after SPA navigation and empty credential forwarding; both have regression coverage and passed re-review. No physical-device/mobile-keyboard automation was performed.

Remaining operational work is deployment-only: review conservatively classified records, deploy the migration and access-aware artifacts with the documented mutation freeze/rollback boundary, and bypass/purge any externally configured article cache. This task did not execute a production migration or cutover. Public/external image and attachment URLs remain independently accessible, and previously distributed Public content cannot be recalled. The parent rebuild PRD is unchanged. Payment, billing and paid tiers remain deferred.
