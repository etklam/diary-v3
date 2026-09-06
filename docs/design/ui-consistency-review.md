# Layout and financial-color review

## Scope and baseline

Baseline: `73433cebc1b174fa01671fe007391fa1a28ea131` (clean worktree before this task).
This change is limited to Web presentation, responsive layout, theme metadata,
and financial display semantics. The user's detailed financial-color requirement
governs the contradictory opening summary: green up, red down by default.
No production cutover is part of this review.

The local production build was served from `apps/web`, matching the corrected
Docker working directory. Browser API traffic used the existing disposable local
E2E API and synthetic accounts/providers. No production data or services were used.

## Reproduced before implementation

- At 390px, the workspace displayed the desktop preference controls and a second
  quick-entry button above the mobile header. See
  [mobile portfolio](evidence/ui-consistency/before-rich/portfolio-390-viewport.png).
- At 768px, Overview retained two columns beside the 180px sidebar, squeezing
  the primary attention column below the secondary context column's width. See
  [tablet overview](evidence/ui-consistency/before-rich/overview-768-viewport.png).
- The editor's bordered form inset its contents again after the shell gutter,
  leaving the page title and input labels on different alignment lines. See
  [desktop editor](evidence/ui-consistency/before-rich/editor-1440-viewport.png).
- Canvas, sidebar, text, controls, and selected navigation used green-tinted
  roles. The browser reported canvas `rgb(245, 247, 246)`.
- The populated baseline loaded 501 CSS/JS requests successfully with HTTP 200.
  No static-asset request failed; this is not evidence of an asset-path defect.
  Details: [baseline checks](evidence/ui-consistency/before-rich/checks.json).
- A separate fresh-browser direct load of `/login` reproduced a missing
  stylesheet *reference*: root renders the public header, but only home/about/
  guide imported `public.css`. The login document requested root, quick-composer,
  and Markdown CSS, all successfully, but never requested public CSS. Its header
  computed to `display: block; padding: 0px`. See
  [direct-login screenshot](evidence/ui-consistency/before-rich/login-direct-390.png)
  and [request evidence](evidence/ui-consistency/before-rich/login-direct.json).
  This must be fixed at the shared stylesheet import owner, not with a local
  padding workaround.

## Source-confirmed risks

- Global `table` and `td` minimum widths forced unrelated tables to inherit
  800px/130px sizing; general `nav` and `form` layout declarations also leaked
  across component boundaries.
- Positive financial charts depended on the green action color. Replacing the
  brand color alone would also recolor financial gains.
- Seasonality referenced undefined `--danger`; both Seasonality and Performance
  classified zero as positive. These are source findings, distinct from a
  screenshot-based claim about every affected value.
- Rotation PNG export hardcoded the old green-gray palette independently of CSS.
- No existing financial-color preference was found. CSS market roles provide
  the extension point; this task does not introduce settings persistence.

## Design direction

Keep the existing navigation, page purposes, system typography, and interaction
flows. Use neutral gray-white/graphite backgrounds, white/dark neutral surfaces,
neutral selected surfaces, and restrained blue actions and focus. The shell owns
workspace gutters (16px mobile, 24px tablet, 32px desktop). Section separation is
24px; related controls use 8–16px gaps. Reading and data widths remain distinct.
Collapse columns when the available workspace cannot support useful text widths.

Only changes, returns, and profit/loss receive independent market colors. Prices,
quantities, costs, values, and general series do not inherit positive coloring.
Keep signs and labels, distinguish neutral zero from missing `—`, and apply the
same financial roles to chart legends and PNG output in both themes.

The proposed role pairs were checked numerically: market text against the light
canvas exceeds 5.6:1; dark market text against the dark muted surface exceeds
6.5:1; primary action text exceeds 6.5:1 in both themes.

## Test-environment observations

The first capture explicitly blocked Service Workers, causing the existing PWA
component to encounter an undefined registration in that artificial environment.
The baseline was recaptured with normal browser Service Worker behavior. This
observation does not establish a production failure and was not patched as CSS.

The standalone Web runtime has no ingress proxy for Socket.IO; its polling 404s
are recorded separately from successful assets. Rotation's unseeded snapshots
also return 404 in the disposable database. Populated Rotation acceptance uses
controlled response fixtures rather than production snapshots.

## Final verification

The shared shell now owns workspace padding; public pages use the same gutter
scale. Header/form alignment, the tablet Overview column collapse, scoped table/
form/navigation rules, and the single mobile Menu preference entry were verified.
The quick-entry dialog remains mounted so its keyboard shortcut still works on
mobile. Public CSS is imported by root, including fresh direct login requests.

Neutral theme roles also cover manifest, icons, and runtime theme-color metadata.
Independent market roles cover Portfolio, Company, Performance, Seasonality,
Rotation, ETF displays, and existing Rotation PNG export. General chart series
and native exposure meters use independent series colors. Positive drawdown
magnitudes remain losses; their displayed values and calculation are unchanged.
Missing financial values render as `—` without a percent suffix; signed zero is
neutral. Locale changes do not reverse market colors.

Production-browser evidence:

- [Light mobile Portfolio](evidence/ui-consistency/after/portfolio-390-viewport.png)
  and [dark English Portfolio](evidence/ui-consistency/after-dark-english/portfolio-390-viewport.png).
- [Tablet Overview](evidence/ui-consistency/after/overview-768-viewport.png)
  and [mobile editor](evidence/ui-consistency/after/editor-390-viewport.png).
- [Light capture checks](evidence/ui-consistency/after/checks.json): 21 route/width
  checks, 540 CSS/JS responses, all 200; no whole-page horizontal overflow.
- [Dark English checks](evidence/ui-consistency/after-dark-english/checks.json):
  14 route/width checks, 360 CSS/JS responses, all 200; no whole-page overflow.
- [Direct public-route checks](evidence/ui-consistency/after-public/public-direct.json):
  fresh browser contexts for login, registration, and articles at desktop and
  mobile widths, including 320px; shared header CSS and gutters present.
- Final meter-specific checks: [light](evidence/ui-consistency/after-meter/checks.json)
  and [dark](evidence/ui-consistency/after-meter-dark-english/checks.json), with
  [light meter](evidence/ui-consistency/after-meter/exposure-390.png) and
  [dark meter](evidence/ui-consistency/after-meter-dark-english/exposure-390.png).
  Portfolio screenshots above were refreshed from this final build.

The final RSI-adjusted production build also loaded all 23 CSS/JS requests on
Rotation with HTTP 200; see [final asset evidence](evidence/ui-consistency/final-build-assets.json).

Production Web build, TypeScript, ESLint, and market-display unit tests passed.
Browser regression: 44 distinct principal-flow cases passed after targeted
retries, plus both new layout/theme cases (46 passed in total). Both market-display
unit cases passed. Rotation's six-case retry (including the two BUY ledger widths)
passed with the final RSI table and PNG color correction. The layout detector
reported no layout findings. [Populated Rotation fixture evidence](evidence/ui-consistency/rotation-fixture/desktop.png)
is separate from the unseeded production capture.

One additional admin-users case remains failing: its synthetic diary creation
returns 201 and appears in recent diaries, but the account row reports a diary
count of 0 rather than the expected 1. Its assertion is retained. The root cause
was not established; this is not classified as a CSS regression or a confirmed
pre-existing defect. See [observed mismatch](../../.scratch/ui-consistency/admin-users-diary-count-mismatch.md).
The role-selection test race was fixed independently by waiting for the initial
settings response. No backend workaround or weakened count assertion was added. No backend, contracts, database,
permissions, or transaction-calculation files were changed. No deployment was
performed.
