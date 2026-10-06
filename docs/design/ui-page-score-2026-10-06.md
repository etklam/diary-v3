# Whole-app UI score — which pages need a redesign

Date: 2026-10-06. Reviewer pass over every route in `apps/web/app/routes.ts` (69 reachable
page states), scored against `DESIGN.md` ("The Ledger") and the product principles in
`PRODUCT.md`.

## How this was measured

The committed captures under `docs/design/evidence/` and `artifacts/ui-ux-audit/` all
predate the 2026-10-02 "The Ledger" redesign (new palette, retired shadows, self-hosted
IBM Plex) and the 2026-10-06 home rebuild, so they are stale for scoring. This review
used **fresh captures taken from the current tree**: a temporary Playwright spec booted
the disposable E2E harness (`scripts/e2e-server.ts`, local Postgres on 55433), signed in
as the seeded admin, seeded a realistic record (3 diaries, 3 transactions, thesis,
evidence, note, 4 watchlist symbols, 2 trade plans, price + diary reminders, 3 principles,
goal, achievement, API key, 2 articles), then screenshotted all 69 routes at 1440×900 and
390×844 — 139 images, kept in the gitignored `.scratch/ui-score/`.

In-browser measurement covered sidebar overflow, whole-page horizontal overflow across
18 routes × 3 widths, and touch-target heights at 390px. Visual findings that drive a
verdict were then confirmed in source; each is cited with `file:line` below. The
temporary specs have been deleted and the working tree is back to its prior state.

**Two corrections worth recording.** Both came from the same page and the same cause.
The trade-plan detail capture appeared to show "Target price" and "Maximum position
size" as labels with no input fields; DOM measurement disproved it — all six price
inputs render at 44px and hold their values. The same capture appeared to show the
Save/Delete footer *between* the Prices and Decision-context sections; source order
(`routes/trade-plan.tsx:594-601`) puts `<footer className="plan-actions">` last inside
the `<form>`, after the context fieldset, which is correct. Both were full-page
screenshot stitching artifacts on a 2,392px page, not defects, and neither is counted
against the page.

Consequence for reading this report: claims about **content** on tall pages (a value's
format, a duplicated string, a button's label, the number of fields) are reliable;
claims about **vertical order or gap size** on pages taller than one viewport were
re-checked in source before being scored, and anything that did not survive that check
has been removed.

### Rubric

Each page scores 0–20 on five dimensions, for 100 total:

| Dimension | What it covers |
|---|---|
| **Hierarchy** | Is the primary job obvious? One filled action? Does the layout compose, or is it stacked boxes and voids? |
| **System fidelity** | Agreement with DESIGN.md: panel-before-card, ruled grouping, the Figure Rule, quiet row controls, no shadows. |
| **Load & IA** | Jobs per page, decision points over 4 options, progressive disclosure, control grouping. |
| **States** | Empty, denied, loading, error, low-N and overflow data. Does the page stay honest and useful? |
| **Responsive & a11y** | 390/768/1440 behaviour, overflow, target size, label association, contrast. |

| Band | Meaning |
|---|---|
| **85–100** | Reference quality. Polish only. |
| **70–84** | Solid. Fix the named defects in place. |
| **55–69** | Weak. Needs a focused rework of specific regions. |
| **< 55** | **Redesign.** The page's structure, not its details, is the problem. |

---

## Verdict first

Six pages need a redesign. Four more are close. Everything else is in good shape —
this is a well-designed app with a genuinely strong design system, and the weak pages
are concentrated almost entirely in **admin** and in the **data/chart surfaces**, which
are the areas `DESIGN.md` has no page recipe for.

| Rank | Page | Score | Why |
|---|---|---|---|
| 1 | `/admin/ai` | **38** | 4,051px single form, ~12 ambiguous actions, no sectioning |
| 2 | `/admin/users` | **44** | Broken search layout, centered table text, page overflows at 768px |
| 3 | `/strategy-performance` | **46** | Charts render wrong at low N; 9-metric stat grid |
| 4 | `/stocks/watchlist` | **48** | 6 full-weight buttons per row; duplicated empty text |
| 5 | `/reviews/ai-reports` | **50** | Denied state and "generate a new one" invite shown together |
| 6 | `/alerts` | 52 | Bare-paragraph empty state; no way to create a reminder |
| 7 | `/login`, `/register` | 58 | Undesigned form in a void |
| 8 | `/stocks/:symbol` | 58 | 8 jobs on one 3,354px scroll; 6-decimal percentages |
| 9 | `/tools/relative-value` | 58 | Clipped row actions; three buttons all labelled "Fetch quote" |
| 10 | `/admin/blog` | 58 | "Article management" printed three times; "Published" breaks mid-word |

---

## Full scorecard

### Public surfaces

| Page | Hier | Sys | Load | State | R&A | **Total** | Verdict |
|---|---|---|---|---|---|---|---|
| `/` (guest home) | 18 | 19 | 18 | 17 | 18 | **90** | Reference |
| `/guide` | 17 | 17 | 16 | 16 | 16 | **82** | Keep |
| `/about` | 15 | 16 | 16 | 15 | 16 | **78** | Keep |
| `/articles/:slug` | 15 | 15 | 15 | 12 | 15 | **72** | Fix in place |
| `/articles` | 14 | 15 | 15 | 14 | 15 | **73** | Keep |
| `/register/complete` | 12 | 13 | 13 | 12 | 13 | **63** | Rework |
| `/reset-password` | 12 | 12 | 12 | 12 | 12 | **60** | Rework |
| `/login` | 10 | 13 | 13 | 10 | 12 | **58** | **Rework** |
| `/register` | 10 | 13 | 13 | 10 | 12 | **58** | **Rework** |
| `/forgot-password` | 10 | 12 | 12 | 10 | 11 | **55** | **Rework** |

The home page is the best surface in the product and needs nothing. `/about` loses points
for one typographic choice: the pull-quote ("The Diary is the starting point…") is set at
display weight in a ~28-character measure, turning a two-line idea into seven ragged
lines while 60% of the row sits empty. `/articles/:slug` shows "English is unavailable.
Showing the original in 繁體中文" above an article whose body is in English, prints
"By —" for a missing author, and puts the language select and Refresh button *above* the
headline on a reading page.

### The diary loop — the product's core

| Page | Hier | Sys | Load | State | R&A | **Total** | Verdict |
|---|---|---|---|---|---|---|---|
| `/timeline` | 18 | 18 | 18 | 17 | 17 | **88** | Reference |
| `/calendar` | 17 | 18 | 17 | 17 | 17 | **86** | Reference |
| `/` (Overview) | 17 | 14 | 16 | 17 | 16 | **80** | Keep |
| `/diaries` | 16 | 16 | 15 | 17 | 16 | **80** | Keep |
| `/reviews` | 16 | 16 | 16 | 16 | 16 | **80** | Keep |
| `/diaries/:id/review` | 17 | 14 | 16 | 16 | 15 | **78** | Keep |
| `/diaries/quick` | 15 | 16 | 16 | 15 | 14 | **76** | Keep |
| `/diaries/new` | 15 | 16 | 15 | 15 | 15 | **76** | Keep |
| `/diaries/:id` | 15 | 14 | 15 | 15 | 15 | **74** | Fix in place |
| `/diaries/:id/edit` | 13 | 15 | 15 | 15 | 14 | **72** | Fix in place |
| `/alerts` | 9 | 10 | 12 | 10 | 11 | **52** | **Redesign** |

Timeline and Calendar are the two best workspace pages — ruled month groups, every mark
in a legend, honest "not computed" states. The loop is in good health apart from
`/alerts`.

**Overview** loses 6 points on system fidelity for one reason: `.overview-metrics dd`
(`apps/web/app/overview.css:268`) sets `font-variant-numeric: tabular-nums` but **not**
`font-family: var(--font-mono)`. Priced market value, quote coverage and unpriced cost
basis therefore render in the sans face at weight 650, breaking the Figure Rule on the
app's most-visited page. The concentration percentage in the attention list has the same
problem — it is a bare `<span>` (`overview.tsx:148`). Both are a one-line CSS fix.

**`/diaries/:id`** carries a visible text bug: `apps/web/app/routes/diary.tsx:150` emits
`<strong>{dueNow}</strong>` with no trailing space in the overdue branch, while the
non-overdue branch uses `` `${duePrefix} ` `` with one. An overdue diary renders
**"Review dueJan 1, 2020"**. Two characters.

### Investing and trading

| Page | Hier | Sys | Load | State | R&A | **Total** | Verdict |
|---|---|---|---|---|---|---|---|
| `/discipline` | 18 | 18 | 17 | 16 | 17 | **86** | Reference |
| `/trade-plans` | 15 | 15 | 15 | 14 | 13 | **72** | Keep |
| `/stocks/alerts` | 14 | 14 | 15 | 13 | 14 | **70** | Keep |
| `/stocks/:symbol/thesis` | 12 | 14 | 12 | 13 | 13 | **64** | Rework |
| `/stocks` (Holdings) | 14 | 12 | 14 | 13 | 13 | **66** | Rework |
| `/trade-plans/:id` | 13 | 13 | 13 | 14 | 15 | **68** | Rework |
| `/stocks/:symbol` | 11 | 12 | 10 | 12 | 13 | **58** | **Rework** |
| `/stocks/watchlist` | 8 | 8 | 10 | 11 | 11 | **48** | **Redesign** |
| `/strategy-performance` | 9 | 10 | 8 | 8 | 11 | **46** | **Redesign** |

`/discipline` is the quietest, most confident page in the app — serif principle
sentences, a real numbered list, quiet row controls. It is the model the other list
pages should copy.

`/stocks/:symbol/thesis` has a straightforward layout bug: the "Invalidation condition
triggered" checkbox renders centred on its own line with its label on the line *below*
and left-aligned, so control and label are neither adjacent nor aligned.

### Tools

| Page | Hier | Sys | Load | State | R&A | **Total** | Verdict |
|---|---|---|---|---|---|---|---|
| `/tools` | 17 | 17 | 17 | 16 | 17 | **84** | Reference |
| `/tools/position-sizing` | 16 | 16 | 16 | 14 | 16 | **78** | Keep |
| `/tools/financial-freedom` | 16 | 16 | 15 | 15 | 16 | **78** | Keep |
| `/tools/sec-filings` | 15 | 15 | 15 | 14 | 15 | **74** | Keep |
| `/tools/etf` | 14 | 14 | 14 | 14 | 14 | **70** | Keep |
| `/tools/market-rotation` | 14 | 14 | 14 | 15 | 14 | **71**\* | Keep |
| `/tools/seasonality` | 14 | 12 | 14 | 14 | 14 | **68** | Rework |
| `/tools/relative-value` | 11 | 12 | 11 | 13 | 11 | **58** | **Rework** |

\* `/tools/market-rotation` had no seeded snapshot in the harness, so only its empty
state was scored — and that state is good (honest message plus a scoped retry). Its
populated layout is **not covered by this review**.

The tool index is exactly what `DESIGN.md` specifies — a ruled two-column list, not a
tile grid. The individual tools drift the other way: Seasonality stacks **six bordered
cards** down the page, which contradicts "Group content with a rule and space before
reaching for a bounded `.card`."

`/tools/relative-value` has two concrete bugs: the scenario table's action buttons are
clipped by the panel's right edge and read as **"Use this ro"**, and the page shows
**three buttons all labelled "Fetch quote"** — one per symbol column plus a third filled
one below — with nothing distinguishing them.

### Account and sharing

| Page | Hier | Sys | Load | State | R&A | **Total** | Verdict |
|---|---|---|---|---|---|---|---|
| `/achievements` | 17 | 17 | 17 | 16 | 17 | **84** | Reference |
| `/settings/security` | 17 | 17 | 16 | 16 | 16 | **82** | Keep |
| `/settings` | 16 | 16 | 16 | 16 | 16 | **80** | Keep |
| `/settings/api-keys` | 14 | 15 | 15 | 14 | 14 | **72** | Keep |
| `/partners/compare` | 14 | 14 | 14 | 14 | 14 | **70** | Keep |
| `/discipline/share` | 14 | 14 | 14 | 14 | 14 | **70** | Keep |
| `/design-preview` | 14 | 15 | 14 | 15 | 14 | **72** | Internal |
| `/partners` | 12 | 13 | 13 | 13 | 13 | **64** | Rework |
| `/etf/watchlist` | 12 | 12 | 13 | 12 | 13 | **62** | Rework |
| `/reviews/ai-reports` | 9 | 11 | 11 | 8 | 11 | **50** | **Redesign** |

`/settings` is nearly there; its one real flaw is that **Date timezone is a free-text
input** while Account language and Start page are selects. `DESIGN.md` promises "common
options plus an explicit use-device-timezone action" — the common options are not in the
shipped control, so the user has to know IANA strings.

### Administration

| Page | Hier | Sys | Load | State | R&A | **Total** | Verdict |
|---|---|---|---|---|---|---|---|
| `/admin/email-settings` | 16 | 16 | 15 | 16 | 15 | **78** | Keep |
| `/admin/research` | 16 | 14 | 15 | 17 | 14 | **76** | Keep |
| `/admin/research/settings` | 14 | 14 | 14 | 14 | 14 | **70** | Keep |
| `/admin/research/new` | 14 | 14 | 14 | 14 | 14 | **70** | Keep |
| `/admin/research/:id` | 14 | 13 | 13 | 14 | 13 | **67** | Rework |
| `/admin/etf` | 13 | 13 | 13 | 14 | 13 | **66** | Rework |
| `/admin/article-translations` | 12 | 13 | 12 | 14 | 13 | **64** | Rework |
| `/admin/blog/:id/edit` | 13 | 13 | 12 | 13 | 12 | **63** | Rework |
| `/admin/blog/new` | 13 | 13 | 12 | 13 | 12 | **63** | Rework |
| `/admin/blog` | 11 | 11 | 12 | 13 | 11 | **58** | **Rework** |
| `/admin/users` | 8 | 9 | 10 | 10 | 7 | **44** | **Redesign** |
| `/admin/ai` | 6 | 8 | 5 | 10 | 9 | **38** | **Redesign** |

`/admin/email-settings` is the counterexample that proves admin doesn't have to be bad —
real sections, subsection rules, an explicit reason printed beside the disabled Enable
button, a danger button for Clear settings. It is the template the other admin pages
should follow.

`/admin/blog` prints **"Article management" three times on one page** — as the h1, as the
table caption, and as the title column's header — and the Status column is narrow enough
that "Published" breaks mid-word as "Publishe / d".

---

## The five redesign candidates

### 1. `/admin/ai` — 38/100

The longest page in the app at **4,051px**, and it is one undivided form. Provider
configuration (14 fields), a nested Pricing fieldset, a nested API-key fieldset, two
prompt editors each with a large textarea, then an Access table, then Usage & audit, then
an audit log.

- **~12 competing actions**, including **four separate "Save draft" buttons** at three
  different scopes. Nothing on screen tells you which one saves what.
- The "Allow generation site-wide" kill switch sits at the very top, 4,000px above the
  configuration it disables, with no visual indication that the rest is inert when off.
- The nested fieldsets render as boxes inside the page — `DESIGN.md`: "a card nested
  inside a card degrades to a plain block, because nested cards are always wrong."
- Usage table headers wrap to three lines each ("Reserved cost (cents)", "Estimated cost
  (cents)").

**Redesign:** split into Provider / Prompts / Access / Usage as separate routes or tabs,
one save scope per view, and move the site-wide switch into a state banner that stays
visible.

### 2. `/admin/users` — 44/100

- **The search control is structurally broken.** The label "Search email or name" sits on
  the *Accounts* heading baseline at x≈890, the input floats *above* it at x≈1090, and
  the Search button sits *below* the input. Label, field and button occupy three
  different lines across two columns.
- **Confirmed horizontal overflow at 768px** (measured): `documentElement.scrollWidth`
  784 vs `clientWidth` 768, with `table.admin-users-table` extending to 1104px. This
  violates the standing rule that "wide tables live in named, bordered, rounded scroll
  regions; the page itself never widens to fit a table."
- Table headers **and** cell content are centre-aligned, so emails wrap mid-address
  ("research-" / "member@example.test") instead of reading left-aligned.
- "System counts" is a **four-up stat row** — the exact pattern `DESIGN.md` names: "four
  of them side by side is the hero-metric template, not a design."
- Four full-weight **Delete account** danger buttons in the densest part of the page.

### 3. `/strategy-performance` — 46/100

The charts are wrong at low N, and low N is the normal state for a diary user.

`apps/web/app/performance-chart.tsx:7` sets `step = 640 / points.length`, so a
single-category bar is drawn `step * 0.7` = **448px wide × 160px tall** — a solid green
slab, not a chart. `performance-chart.tsx:9` prints `points[0].label` at the left tick
and `points.at(-1).label` at the right; with one point **both ticks print the same
label** ("2026-09" … "2026-09", "AAPL" … "AAPL"). The cumulative P&L chart renders as a
lone dot in an empty frame.

Above the charts sits a **nine-metric grid** (realized P/L, closed trades, win rate,
wins, losses, drawdown, Sharpe, best strategy, worst strategy) — more than double the
working-memory guideline, with "Not recorded" set at the same weight as real figures.

**Redesign:** give the charts a minimum-category floor (cap bar width, or fall back to
the table below a threshold), suppress duplicate axis ticks, and replace the stat grid
with the `.ledger` idiom the system already defines.

### 4. `/stocks/watchlist` — 48/100

- **Six controls on every row** — View research, a pencil icon, Move up, Move down, Pin,
  Remove — all at full button weight. Four rows means 24 buttons on screen; at 390px they
  wrap to two lines per row. `DESIGN.md` requires row controls to be quiet-weight "so
  they do not compete."
- **The empty text is printed twice per row.** `routes/watchlist.tsx:47` and `:49` both
  fall back to `c.none`, so an unresearched company shows "No research records yet." in
  two adjacent columns. Confirmed in source and visible at both widths.
- **Three stacked bordered boxes** before any content: a stat row, a Quick add card, and
  a filter card.

### 5. `/reviews/ai-reports` — 50/100

The denied state contradicts itself. `routes/ai-reports.tsx:630` renders `reportNone`
("Select a report from the history, or generate a new one.") whenever `!selectedId`,
**without checking `listDenied`**. An account without AI access sees "Your account does
not have access to this AI action" in the left column and an invitation to generate a
report in the right — with no generate control anywhere on the page. Both columns are
empty wells, so the two-column scaffold shows through with nothing in it.

---

## Cross-cutting defects

These span many pages and are worth fixing once rather than per page.

**1. Money and quantity formatting is inconsistent app-wide — the most visible systemic
defect.** The API stores and returns unnormalised strings (`POST /api/trade-plans`
returned `"entryPrice":"182.4"`, `"stopLoss":"164"`, `"targetPrice":"215"`,
`"maxPositionSize":"4400"`), and each page renders them its own way. The same AAPL
purchase price appears as:

| Page | Rendering |
|---|---|
| `/diaries/:id` | `182.4` |
| `/diaries/:id/review` | `182.4000` |
| `/stocks` (Holdings) | `182.4`, alongside `2918.4` and `3,892.4` |
| `/stocks/:symbol` | `182.4`, with portfolio share at `74.976878%` |
| `/timeline` | `182.4` |

Holdings alone shows two thousands-separator conventions (`2918.4` vs `3,892.4`) and two
date formats for the same value (`9/4/26, 3:00 PM UTC` in the table, `Sep 4, 2026,
3:00 PM UTC` four lines below). `/stocks/:symbol` prints six decimal places on a
percentage and on a price change. `DESIGN.md` states amounts "are stored to two decimals";
what ships does not match. Fix at the formatter boundary, not per page.

**2. The Figure Rule is not applied on Overview or Holdings.** `overview.css:268` is the
specific miss; the `.stat-value` rule 400 lines away in `styles.css` does it correctly.

**3. Empty states are inconsistent.** `DESIGN.md` defines `.empty-state` as "a quiet
sunken well that names the next action." Watchlist, Achievements, Partners, API keys and
Research Studio use it. `/alerts`, `/stocks/alerts` and `/etf/watchlist` instead print
bare paragraphs ("No active reminders.", "No ETFs followed yet.") with a link or a
floating Refresh button beneath. `/alerts` additionally explains the pagination of an
empty list ("The earliest 100 active reminders…") and states a display timezone with no
times on screen, and offers no way to create a reminder at all.

**4. A "Refresh X" secondary button floats above an unheaded list region** on `/partners`,
`/settings/api-keys`, `/etf/watchlist` and `/stocks/watchlist` — four pages repeating a
pattern that reads as a control with nothing to control.

**5. The sidebar is 1,745px of navigation in a viewport-height scroller.** Measured at
1440×1080 it still leaves 665px below the fold, including **Settings, Sign out and
Preferences**. It does scroll (`overflow-y` computes to `auto`), so nothing is
unreachable — but a second, unmarked scroll region holding the two controls people look
for most is a real findability cost with ~30 destinations in the tree.

**6. Disabled filled buttons used to signal invalid input.** `DESIGN.md` is explicit that
buttons are "disabled while a submit is in flight rather than to signal invalid input."
Quick diary, admin blog bulk actions, article translations "Apply provider" and trade
plan "Save execution selection" all ship a greyed filled button as the resting state.

**7. Duplicate "Quick diary" primary action** — once in the sidebar, once top-right of
the content area — on Overview, Diary library and most workspace pages.

### What the deterministic detector found

`scripts/detect.mjs` over `apps/web/app` returned **two findings in ~130 files**, both
minor: an `<img>` with a possibly-empty `src` in `markdown.tsx:21` (a false positive — it
is the sanitised Markdown renderer, and `alt` is defaulted), and one undocumented colour
`#cbd0d7` in `market-rotation.tsx:760`. No side-stripes, no gradient text, no glassmorphism,
no over-rounding, no stripe backgrounds. The anti-pattern discipline here is genuinely
excellent and none of the problems above are "AI slop" — they are ordinary drift in the
corners the design system never wrote a recipe for.

### Measured and clean

- **No horizontal overflow** at 390px or 1440px on any of the 18 swept routes.
- The only page overflow found anywhere was `/admin/users` at 768px.
- Touch targets at 390px: four inline text links measured 20–21px tall ("Strategy
  performance", "Manage ETF catalog", "Manage API keys", the Tools breadcrumb). Inline
  links, so not a 44px violation, but thin.
- `/admin/users` converts its table to stacked cards at 390px correctly — the responsive
  work is good even where the desktop layout is not.

---

## App-level heuristic score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Skeletons, `role=status`, scoped retries are good; `/reviews/ai-reports` reports two contradictory states at once |
| 2 | Match system / real world | 3 | Copy is unusually good and plain; six-decimal percentages and `182.4000` are not how money reads |
| 3 | User control and freedom | 3 | Cancel/confirm/undo are consistent and every destructive action confirms; `/alerts` offers no way to create the thing it lists |
| 4 | Consistency and standards | 2 | Money, date, empty-state and row-control conventions each diverge in three or more places |
| 5 | Error prevention | 3 | Danger buttons, consequence copy and confirmations are applied consistently |
| 6 | Recognition rather than recall | 3 | Every icon is labelled and legended; the 1,745px nav and free-text timezone lean on recall |
| 7 | Flexibility and efficiency | 3 | Command palette, ⌘J, ⌘K, saved views, bulk publish; no bulk ops on watchlist or reviews |
| 8 | Aesthetic and minimalist design | 3 | Typography and restraint are genuinely strong; `/admin/ai`, watchlist rows and the stat grids are not |
| 9 | Error recovery | 3 | Failed forms keep content, errors carry a selectable requestId, retries are scoped |
| 10 | Help and documentation | 3 | `/guide` and inline explanatory copy are better than most products ship |
| **Total** | | **29/40** | **Good** — address the weak areas on a solid foundation |

---

## What is working

**The design system itself is the asset.** One token file in OKLCH around a single hue,
a contrast checker (`scripts/check-design-contrast.mjs`, 148 pairs) that reads
`tokens.css` directly so it cannot drift from what ships, a semantic z-index scale, and
a changelog that records *why* each decision superseded the last. That infrastructure is
better than most teams have, and it is why the detector comes back nearly clean.

**Copy quality is unusually high.** "Keep the reasoning you will not be able to
reconstruct later", "A price move is not evidence that the thesis was right", "Missing
quotes stay separate from priced value" — the product's voice is specific and
non-generic, in three locales, with real translation keys rather than English fallbacks.

**The reading and reviewing surfaces earn their design.** `/diaries/:id/review` putting
original judgment and later reflection in separate columns, `/calendar` legending every
mark and admitting "not computed" on failure, `/discipline` setting principles in the
serif cut — these are considered choices, not defaults.

---

## Filed tickets

This review is split into tickets **101–114** under
`.scratch/diary-v3-rebuild/issues/`, indexed in
[ISSUES.md](../../.scratch/diary-v3-rebuild/ISSUES.md) under "Whole-app page score
follow-up". All are `needs-triage` / `Execution: todo`.

| Ticket | Covers |
|---|---|
| 101 | Money, quantity, percentage and date formatting (cross-cutting) |
| 102 | The six confirmed text and markup defects (cross-cutting) |
| 103 | `/admin/ai` split into task-scoped views |
| 104 | `/admin/users` rebuild, including the 768px overflow |
| 105 | `/strategy-performance` charts at low cardinality |
| 106 | `/stocks/watchlist` row controls |
| 107 | `/reviews/ai-reports` denied, empty and first-run states |
| 108 | `/alerts` rebuild |
| 109 | The authentication pages |
| 110 | `/stocks/:symbol` sectioning |
| 111 | `/trade-plans/:id` execution comparison region |
| 112 | Empty states and list sections (cross-cutting) |
| 113 | The research tool pages |
| 114 | `/admin/blog` row controls and column widths |

Pages that scored in the 60s but were not broken down in enough detail to specify a ticket
honestly are listed under "Scored but not filed" in the index, rather than having tickets
invented for them. Two findings are recorded there as needing a ruling before they can be
filed: the duplicate "Quick diary" primary action, and navigation depth.

## Recommended order

1. **`$impeccable harden` the formatting boundary** — one money/percentage/date formatter
   applied across Holdings, Company, Review, Timeline and Trade plans. Highest
   visibility-per-effort of anything here, and it fixes a credibility problem: a tool for
   recording investment decisions should not print `74.976878%`.
2. **Four two-character-to-two-line fixes** — `diary.tsx:150` (missing space),
   `overview.css:268` (missing `font-family`), `watchlist.tsx:47/49` (duplicate empty
   text), `ai-reports.tsx:630` (guard on `listDenied`).
3. **`$impeccable shape /admin/ai`** — split the 4,051px form before touching its visuals.
4. **`$impeccable layout /admin/users`** — rebuild the search control, left-align the
   table, put it in a scroll region to kill the 768px overflow.
5. **`$impeccable distill /stocks/watchlist`** — row controls to quiet weight, collapse
   the three leading boxes, drop the duplicate column.
6. **`$impeccable harden /strategy-performance`** — low-N chart behaviour and the
   nine-metric grid.
7. **`$impeccable craft /login`** — the auth pages are the only public surfaces that look
   undesigned next to the new home page.
8. **`$impeccable polish`** across the cross-cutting empty-state and refresh-button
   patterns.

## Coverage and caveats

- All 69 route states were captured and inspected at 1440px; 390px was inspected for the
  shell, the diary loop and every page scoring below 70.
- `/tools/market-rotation` was scored on its empty state only — no seeded snapshot.
- Dark mode and zh-TW/zh-CN layouts were **not** re-reviewed in this pass; the
  2026-10-02 changelog records contrast verification across both themes and all three
  market-colour preferences, and `check-design-contrast.mjs` guards it.
- Scores are a reviewer's judgement, not a measurement. The defects cited with `file:line`
  are verified; the layout and composition judgements are not falsifiable the same way.
