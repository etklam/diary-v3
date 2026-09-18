# Trade basic All-pages UI/UX Audit and Fine-tuning Report

Audit date: 2026-09-18

Baseline branch: `main`

Baseline commit: `7e3a39ad5c4900f88d9d8193b7077610d48f9418`

The working tree was clean before this audit. No production cutover, dependency upgrade, API change, schema change, or new product module was introduced.

## Outcome

The audit covered 52 registered routes plus the unknown-route and error-boundary checks. The final route status counts are:

| Status | Count |
|---|---:|
| `fixed-and-verified` | 16 |
| `verified` | 33 |
| `not-applicable` | 3 |
| `blocked` | 0 |
| Total registered routes | 52 |

No P0 or P1 product defect was confirmed after runtime verification. One real P2 responsive state defect was fixed. One baseline WebKit failure was identified as a test interaction false negative and corrected in the test, not in product code.

The complete route-level record is in [uiux-page-matrix.md](./uiux-page-matrix.md).

## Baseline and scope

The audit started from the current route configuration, not a previous ticket or screenshot assumption. The inspected sources included:

- `AGENTS.md`, `README.md`, `PLAN.md`, `PRODUCT.md`, the active rebuild PRD, domain and issue-tracker instructions.
- `apps/web/app/routes.ts`, `root.tsx`, `nav.tsx`, `styles.css`, `public.css`, shared UI primitives, tokens, theme and locale handling.
- Route components, loaders, forms, error boundaries, Markdown rendering, and authorization gates.
- Existing unit, integration, Chromium E2E, WebKit critical tests, and design evidence.
- `.impeccable/design.json`, current design documentation, and the existing evidence folders.

The current route declaration contains 52 entries. Dynamic checks used disposable synthetic fixtures, including diary IDs created by the diary suites, trade-plan IDs created by the trade-plan suite, `AAPL`/`SPY` research fixtures, and the synthetic SEC CIK/accession pair documented in the matrix.

## Findings and fixes

### UI-002 — Public drawer survives the desktop breakpoint

- Severity: P2.
- Type: Confirmed defect.
- Affected surface: the shared `PublicMenu`, including public content and public Tools routes below the compact breakpoint.
- Reproduction: open the public mobile drawer below 1024px, then resize or rotate to 1024px or wider.
- Expected: the compact drawer closes, the desktop navigation becomes available, and focus returns to a visible desktop navigation control.
- Baseline behavior: the trigger was hidden by the desktop media query, while the dialog state could remain open and leave a stale drawer/focus target.
- Root cause: CSS hid the trigger but there was no state cleanup on a breakpoint crossing.
- Minimal fix: `PublicMenu` now closes and returns focus to the first public navigation link on a desktop resize; `public.css` also hides an open public dialog at the desktop breakpoint as a rendering safety net.
- Regression evidence: `tests/e2e/pwa.spec.ts` test `public mobile menu closes when the desktop breakpoint is restored @webkit-critical`; it passed in Chromium and WebKit.

### AUD-001 — Baseline mobile-menu WebKit false negative

- Severity: P2 test reliability issue, not a confirmed product defect.
- Type: Confirmed test-harness defect.
- Baseline reproduction: the existing test used Playwright `locator.click()` on a sticky mobile-header trigger after setting `scrollY` to 300. WebKit's actionability scroll step moved the target into view and reset the page to 0 before the click handler ran, so the assertion reported `Expected: 300, Received: 0`.
- Control evidence: a DOM/viewport-coordinate click at the same 390x844 viewport preserved the 300px background position with the unchanged native dialog implementation. The menu then blocked wheel movement, navigated to SEC filings, closed on Escape, and returned focus.
- Minimal fix: the regression now checks the trigger's laid-out bounding box and clicks its visible viewport coordinates. This keeps the test focused on menu behavior instead of Playwright's pre-click scroll helper.
- Final evidence: the full Chromium suite passed 202/202 and WebKit critical passed 9/9, including the private menu test.
- Product consequence: no scroll-lock rewrite was retained. The audit avoids replacing the existing accepted native dialog design or adding a body-position hack for a false product signal.

## Implemented changes

- `apps/web/app/nav.tsx`: added a resize cleanup effect for the public compact drawer, including focus return to visible desktop navigation.
- `apps/web/app/public.css`: hides an open public drawer at `min-width: 1024px` as a CSS safety net.
- `tests/e2e/pwa.spec.ts`: made the sticky mobile-menu interaction use its actual viewport coordinates and added the breakpoint regression, tagged for WebKit critical coverage.
- `docs/audits/uiux-page-matrix.md`: added the current 52-route inventory, access boundaries, fixture/state coverage, evidence references, and explicit statuses.
- No new dependency, framework, API, database, auth bypass, production fallback, or fake data was added.

## Shared and page-level review conclusions

The existing shared shell is already using the intended Trade basic direction: neutral surfaces, compact navigation, blue/indigo/slate interaction tokens, separate market-direction tokens, and light/dark plus three-locale persistence. The audit deliberately retained:

- Trade basic branding and the accepted navbar/sidebar direction.
- Public Tools access without requiring login or a manually entered token.
- Private diary, personal list, settings, and admin authorization boundaries.
- Green-up/red-down financial preferences as separate from semantic success/error/danger tokens.
- Capture → Decision → Review, draft recovery, review queue, watchlist, Markdown, and research handoff behavior.
- Existing React Router, Hono, Drizzle, PostgreSQL, shared contracts, and standard-fetch structure.

Page-specific review was performed through the route suites and evidence groups in the matrix. The suites cover dense tables, long Markdown, large numbers and symbols, empty/error/unavailable states, failed submissions, retry behavior, locale changes, theme changes, focus return, protected routes, and narrow viewport behavior. No route required a forced cosmetic rewrite after these checks.

## Verification gates

All requested repository gates completed successfully after the implementation changes:

| Command | Result |
|---|---|
| `npm run contracts:check` | PASS |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run test:unit` | PASS — 76 files, 685 tests |
| `npm run test:integration` | PASS — 67 files, 242 tests |
| `npm run test:e2e` | PASS — 202 tests |
| `npm run test:e2e:webkit:critical` | PASS — 9 tests |
| `npm run build` | PASS |

Focused evidence also passed:

- Mobile menu route/scroll/focus regression plus public breakpoint cleanup: 2/2.
- Impeccable changed-target detector: `[]` for `apps/web/app/nav.tsx` and `apps/web/app/public.css`.

The integration and E2E suites used the repository's disposable local/test database and synthetic fixtures. They were not pointed at production.

## Visual and diagnostic evidence

The existing design evidence folders remain the visual record for the tested surfaces, including:

- `docs/design/evidence/navigation/`
- `docs/design/evidence/public-pages/`
- `docs/design/evidence/public-tools/`
- `docs/design/evidence/diary/`, `review/`, `quick/`, and `markdown/`
- `docs/design/evidence/watchlist/`, `portfolio/`, `company-hub/`, `thesis/`, and `trade-plans/`
- `docs/design/evidence/settings/`, `security/`, `api-keys/`, and admin evidence folders
- `docs/design/evidence/pwa/1440.png` and `docs/design/evidence/pwa/390.png`

The E2E runs generated temporary screenshots and traces while diagnosing the baseline test. Passing runs did not retain a failure trace; the generated tracked PNG diffs were restored after verification so the delivery diff contains only intentional source, test, and audit-document changes. The terminal output retained the relevant baseline failure and final pass counts.

## Residual risks and unverified scope

- WebKit automation is not real-device iPhone Safari testing. Safe-area, browser chrome, OS keyboard, and touch inertia remain device-level risks.
- The coverage is layered, not every route x viewport x theme x locale x state combination. The matrix states the actual evidence group for each route.
- The local Vite server emitted recurring `ws proxy ECONNRESET` and manifest-patch fetch warnings during E2E runs. They did not fail any test or alter the verified outcomes; they remain environment diagnostics rather than silently ignored product errors.
- The intentionally missing `/missing-synthetic-cover.png` request exercises the error boundary and appears in the E2E server log; it is synthetic evidence, not a production asset failure.
- No issue remains at P0/P1 priority from this audit. Future visual work should preserve the existing public/private/admin boundaries and token separation rather than introduce a new shell or product workflow.
