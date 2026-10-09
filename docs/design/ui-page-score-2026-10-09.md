# Whole-app UI score — second pass

Date: 2026-10-09. Re-score of every route state in `apps/web/app/routes.ts` against
`DESIGN.md` ("The Ledger") and `PRODUCT.md`, three days after
[the first pass](ui-page-score-2026-10-06.md) and after tickets **101–116** were closed.

> **The findings below were then fixed in the same session.** Everything from "Verdict
> first" to "App-level heuristic score" records the state **as measured before
> remediation**; [What was fixed](#what-was-fixed) at the end records the change and the
> re-measured result. Clean route states went from **37 to 69 of 84**.

## How this was measured

Fresh captures and fresh in-browser measurement from the current tree. A temporary
Playwright harness booted the disposable E2E server (`scripts/e2e-server.ts`, local
Postgres on 55433), signed in as a seeded admin, seeded one realistic record through the
**real API contracts** (4 diaries with 8 transactions across 4 symbols including an
unquoted one, a completed review, an overdue review, 5 watchlist entries, 2 stock notes,
SEC evidence, 2 trade plans, 3 price reminders, a diary reminder, 3 principles, 2 goals,
an achievement, an API key, a published article, a member draft, a Guru profile), then
visited **88 route states** at 1440×900, 768×900 and 390×844 — 176 screenshots, kept in
the gitignored `.scratch/ui-score-1009/`.

Measurement ran in three passes, each one narrowing the last:

1. **Structure** — overflow at three widths, page height, counts of panels, cards, tables,
   empty states.
2. **Precision** — the first pass measured whole-page text and every styled element, which
   produced three classes of false positive: digits concatenated across element boundaries
   (`"04"` + `"115.95"` + `"2026"` read as one 12-digit number), `th` labels inheriting
   `tabular-nums` from their table, and checkboxes judged against the 44px target floor.
   The second pass works on **leaf elements and their own text nodes only**, and judges a
   checkbox on the label that wraps it.
3. **`DESIGN.md` rules** — one filled action per page, the eyebrow ban, the warm-tint-slab
   ban, the tile-grid ban, shadow on flat elements, selects narrower than their own
   longest option.

**One correction worth recording, because it invalidated a conclusion.** The first pass
reported that *no page in the app carries more than one filled action* — a perfect score
on a core rule. That was wrong. This engine returns computed colours as `oklch(...)`
verbatim, and the detector's colour parser only matched `rgb()`, so it matched nothing
anywhere. Repainting a probe element with `var(--action)` and comparing the same computed
string found **16 route states with two or three filled actions**. Any measurement that
came back perfectly clean in this report was re-derived a second way before being
believed.

Every finding below is either a browser measurement or cited to `file:line`. Composition
and hierarchy judgements are a reviewer's opinion and are not falsifiable the same way.

### Rubric

Unchanged from the first pass, so the scores are comparable: 0–20 on five dimensions.

| Dimension | What it covers |
|---|---|
| **Hierarchy** | Is the primary job obvious? One filled action? Does the layout compose? |
| **System fidelity** | Agreement with DESIGN.md: panel-before-card, ruled grouping, the Figure Rule, quiet row controls, no shadows. |
| **Load & IA** | Jobs per page, decision points, progressive disclosure, control grouping. |
| **States** | Empty, denied, loading, error, low-N and overflow data. |
| **Responsive & a11y** | 390/768/1440 behaviour, overflow, target size, label association, contrast. |

| Band | Meaning |
|---|---|
| **85–100** | Reference quality. Polish only. |
| **70–84** | Solid. Fix the named defects in place. |
| **55–69** | Weak. Needs a focused rework of specific regions. |
| **< 55** | **Redesign.** The structure, not the details, is the problem. |

---

## Verdict first

**The 101–116 programme worked, and it worked thoroughly.** Every one of the six pages the
first pass sent to redesign has left the redesign band; five of them left the rework band
too. `/admin/ai` went from a 4,051px undivided form to five task-scoped views at 1,806px.
`/admin/users` lost its broken search control, its four-up stat row and its 768px
overflow. `/strategy-performance` stopped drawing a chart that one data point cannot
support. **37 of 84 scored route states now return no mechanical finding at all.**

**No page in the app is in the redesign band.** That is the headline.

Two things replaced them as the top of the list, and neither is a page — both are
cross-cutting:

1. **The Figure Rule is broken on the money surfaces**, far more widely than the first pass
   found. It called this "a one-line CSS fix" at `overview.css:268`. It is 72 CSS blocks.
2. **The Guru module has never been scored**, by either pass, and it is the one area that
   breaks `DESIGN.md`'s explicit *Don't* list.

| Rank | Page | Score | Was | Why |
|---|---|---|---|---|
| 1 | `/tools/relative-value` | **55** | 58 | 976 figures in the sans cut; 13 controls under 44px; a table 92px wider than its region |
| 2 | `/gurus` | **62** | *unscored* | Tracked all-caps eyebrow, warm-tint slab, 768px overflow, two filled actions |
| 3 | `/gurus/compare` | **64** | *unscored* | 768px overflow; disabled filled button at rest |
| 4 | `/stocks/:symbol` | **68** | 58 | 3,270px scroll; 59 figures in the sans cut |
| 5 | `/tools/financial-freedom` | **70** | 78 | 57 figures in the sans cut |
| 6 | `/tools/seasonality` | **70** | 68 | 16 figures in the sans cut; 2,646px |
| 7 | `/trade-plans/:id` | **71** | 68 | Three filled actions, one disabled at rest |
| 8 | `/gurus/:slug` | **72** | *unscored* | Seven tracked eyebrows; 34px Follow button |
| 9 | `/stocks` (Holdings) | **73** | 66 | 36 figures in the sans cut |
| 10 | `/admin/research` | **74** | 76 | Three filled actions |

---

## What the programme fixed, verified

Each of these was a named defect in the first pass. All are re-measured, not assumed.

| First pass finding | State now |
|---|---|
| `/admin/ai` — 4,051px, one form, ~12 actions, four "Save draft" | **Fixed.** Five views (`routes.ts:68-72`), 1,806px, one filled action, kill switch at top with its consequence in plain language |
| `/admin/users` — broken search, 768px overflow, centred table, four-up stat row | **Fixed.** Measured 0 overflow at 768px; "System counts" is now a `.ledger`; label/field/button on one line |
| `/strategy-performance` — 448px bar slab, duplicate axis ticks | **Fixed.** Renders "Too few points to chart. The figures are in the table below." and the nine-metric grid is a `.ledger` closed by `.ledger-row-total` |
| `/stocks/watchlist` — six full-weight row controls, duplicated empty text | **Fixed.** No mechanical finding; the duplicate fallback is gone (`watchlist.tsx:54` and `:57` now guard on `recordCount > 0`) |
| `/reviews/ai-reports` — denied state and "generate a new one" together | **Fixed.** `ai-reports.tsx:509` computes `accessDenied` from `denied \|\| listDenied \|\| detailDenied` |
| `/alerts` — bare-paragraph empty state, no way to create a reminder | **Fixed.** No mechanical finding |
| `/login`, `/register`, `/forgot-password` — undesigned form in a void | **Fixed.** All three clean |
| `/diaries/:id` — "Review dueJan 1, 2020" missing space | **Fixed.** `diary.tsx:155` now emits `{' '}` between label and `<time>` |
| `/tools/relative-value` — buttons clipped to "Use this ro" | **Fixed.** Zero clipped elements app-wide |
| `/admin/blog` — "Published" breaking as "Publishe / d" | **Fixed.** Zero mid-word breaks app-wide |
| Sidebar — Settings, Sign out and Preferences below the fold | **Partly fixed.** The account controls are pinned and visible; see "navigation depth" below |

Three whole-app properties also hold, measured:

- **No horizontal overflow at 390px or 1440px on any of the 88 route states.** The only
  overflow anywhere is `/gurus` (+31px) and `/gurus/compare` (+28px) at 768px.
- **No shadow on any flat element on any page.** `--shadow-1: none` is genuinely enforced.
- **Zero clipped text and zero mid-word breaks** across all 88 states.

### Dark mode and market-colour conventions — the first pass's open caveat

The first pass did not review these. They are correct.

| Preference | `--market-up` | `--market-down` | Verdict |
|---|---|---|---|
| `standard` light | `oklch(.5 .125 150)` green | `oklch(.515 .175 25)` red | Correct |
| `cn` dark | `oklch(.745 .14 25)` **red** | `oklch(.8 .15 155)` **green** | Correctly inverted |
| `cb` dark | `oklch(.78 .11 243)` blue | `oklch(.79 .12 62)` orange | Correct, clear of the action hue |

Dark mode swaps semantic roles without inverting components, produces **zero** elements
whose text colour equals their own background, and introduces no overflow.
`scripts/check-design-contrast.mjs` passes **74 pairs in each theme** against WCAG 2.1.

---

## The two cross-cutting defects

### 1. The Figure Rule is broken on the money surfaces

This is the most visible systemic defect in the product and the one worth fixing first.

`DESIGN.md` states it twice: "Every number the user is asked to judge … is set in the
monospace cut at `0.95em` with tabular figures", and "Money and quantities in tables use
the mono cut with `tabular-nums`". The first pass found one instance and called it "a
one-line CSS fix".

**A static scan of every stylesheet under `apps/web/app` finds 72 rule blocks that set
`font-variant-numeric: tabular-nums` without `font-family: var(--font-mono)`, against 15
that set both.** The figures get tabular spacing and then render in IBM Plex **Sans**.

Confirmed in the browser, reading computed styles on seeded data:

| Route | Figures in the sans cut | Example |
|---|---|---|
| `/tools/relative-value` | **976** | `360.00`, `115.95` |
| `/stocks/:symbol` | 59 | `181.24`, `4,349.80`, `+10.00%` |
| `/tools/financial-freedom` | 57 | `15,000,000.00`, `6.67%` |
| `/stocks` (Holdings) | 36 | `3,048.60`, `-2,168.60`, `+67.89%` |
| `/admin/institutional` | 18 | `0` |
| `/tools/seasonality` | 16 | `+1.07%` |
| `/strategy-performance` | 12 | `+116.00`, `100.00%` |
| `/tools/etf` | 12 | `116.95`, `-0.86%` |
| `/diaries/:id` | 6 | `402.15` |
| `/trade-plans` | 5 | `1,040.00`, `184.50` |
| `/stocks/UNKNOWN` | 4 | `21.07`, `842.90` |
| `/reviews`, `/admin/research/settings`, `/diaries/3`, `/admin/ai/prompts` | 1–3 each | counts and ratios |

The effect is visible on `/strategy-performance` in one screen: the `.ledger` at the top
sets `+116.00` and `100.00%` in the mono cut correctly, and the "Results by period" table
forty pixels below sets *the same two values* in the sans cut.

The cause is structural, not accidental. `styles.css:111-119` gives `.num`, `.figure`,
`time`, `kbd`, `code` and `samp` the mono family globally, so **any figure wrapped in
`.num` or `.figure` is correct**. The route stylesheets that instead style a bare `td` or
`dd` get tabular spacing and the sans face. Representative:

- `apps/web/app/routes/company-market.css:65` `.market-metrics dd`, `:103` `.market-table td`
- `apps/web/app/routes/fire.css:47` `.fire-summary dd`, `:74` `.fire-projection td`
- `apps/web/app/market-research.css:29` the relative-value and history tables
- `apps/web/app/ledger.css:87` `.holdings-table table`
- `apps/web/app/trade-plan.css:93` `.plan-list dd`
- `apps/web/app/routes/guru-comparison.css:76`, `guru-analysis.css:48`, `admin-institutional.css:62`

Fix at the boundary, not per page: either add the mono family to those 72 blocks, or have
the display layer emit `.num`/`.figure` and delete the per-route font rules. The second is
the smaller diff and cannot drift again. Note that `tests/unit/figure-formatting-boundary.test.ts`
guards *which function formats a figure* — it does not guard *what face the figure renders
in*, which is why this drifted silently. A companion check belongs beside
`scripts/check-design-contrast.mjs`.

### 2. One filled action per page is not holding

`DESIGN.md`: "the page's single filled action stays at its header", and buttons are
disabled only when "a submit is in flight" or for "an unmet precondition that the surface
already names next to the control".

**16 route states carry two or three filled actions:**

| Route | Filled actions |
|---|---|
| `/trade-plans/:id` | Save trade plan · Confirm current plan · Save execution selection |
| `/admin/email-settings` | Enable mail · Save settings · Send test email |
| `/admin/research` | New research run · Filter runs · Prepare the first run |
| `/admin/ai/report-prompts` | **Save draft · Save draft** (Weekly prompt, Monthly prompt) |
| `/diaries/quick` | Create diary · Set reminder |
| `/diaries/:id/review` | Save schedule · Complete review |
| `/achievements` | Add goal · Add achievement |
| `/trade-plans`, `/articles`, `/admin/blog` | the page action · **Apply / Apply filters** |
| `/gurus` | Search · Follow |
| `/admin/article-translations` | Apply provider · Add provider |
| `/admin/blog/new`, `/admin/blog/:id/edit` | Translate Now · Save draft / Update article |
| `/` (guest home) | 開始記錄投資日記 · 建立帳戶 |
| `/design-preview` | Open quick diary · Overview |

Two patterns account for most of it and are each worth one decision:

- **A filter submit rendered filled.** `Apply`, `Apply filters`, `Filter runs`, `Search`
  compete with the page's real action on five pages. A filter submit is a secondary
  control.
- **Two peer actions on one page.** `Add goal`/`Add achievement` on `/achievements` is
  sanctioned by that page's own brief ("each section with one filled primary action"), so
  the rule needs amending to say *one per section* — or the brief does. Worth a ruling
  rather than a fix.

`/admin/ai/report-prompts` deserves a specific note: the first pass's sharpest complaint
about `/admin/ai` was "four separate 'Save draft' buttons … nothing on screen tells you
which one saves what." The split into views reduced that to two, and each now sits under
its own heading ("Weekly prompt", "Monthly prompt"), which does disambiguate. It is much
better and still two identical filled labels on one screen.

**Eight routes ship a disabled filled button as their resting state** — the first pass's
cross-cutting defect #6, unchanged: `/diaries/new` (Save diary), `/diaries/quick` (both
actions), `/gurus/compare` (Add to comparison), `/admin/email-settings` (Enable mail),
`/admin/article-translations` (Apply provider), `/admin/blog/new` and `/admin/blog/:id/edit`
(Translate Now), `/trade-plans/:id` (Save execution selection). Several are legitimate —
`/admin/ai` disables Publish and names the precondition in a sunken notice directly above
it, which is exactly what the rule asks for. The rest disable silently.

---

## The Guru module — scored for the first time

Eighteen routes, roughly a fifth of the app, absent from the first pass's 69 states. It is
also the only part of the product that breaks `DESIGN.md`'s explicit *Don't* list, which
is what you would expect of a module built after the design system was written down and
never scored against it.

**Two direct violations, both in `apps/web/app/routes/gurus.css`:**

1. **A tracked all-caps eyebrow.** `.guru-eyebrow` (`gurus.css:17-24`) sets
   `letter-spacing: 0.06em; text-transform: uppercase`. It renders "INSTITUTIONAL
   INTELLIGENCE" above the `/gurus` headline and seven more on `/gurus/:slug`.
   `DESIGN.md`: *"Don't put a tracked all-caps eyebrow above a section; the rule and a
   sentence-case label do that work."* The public home page brief says it again: *"No
   eyebrow above the headline or any section."*

2. **A warm low-alpha tint filling a wide region.** `.guru-disclosure` (`gurus.css:55-62`)
   sets `background: var(--tint-warn)` on the 13F delay notice, which renders 893px wide
   on a 1,096px content column. `DESIGN.md`: *"Don't fill a full-width region with a warm
   low-alpha tint — at that size it reads as beige paper, which is the default this system
   exists to avoid."* It reads as beige. The disclosure content is right and belongs in the
   first reading region; the treatment is the thing to change.

**Also measured:**

- `/gurus` overflows at 768px by 31px; `/gurus/compare` by 28px. The only overflow in the app.
- **Every select in the module is 42px tall**, 2px under the 44px floor — `/gurus`,
  `/gurus/activity`, `/gurus/consensus`, `/gurus/stocks`, `/gurus/sectors`, and the
  portfolio and changes pages. Systemic, one rule.
- The `Follow` button is 34px on `/gurus` and `/gurus/:slug`.
- The "Sort by" select is narrower than its longest option, so the value reads
  "Featured and cus".
- `/gurus` renders its directory as `.guru-card-grid` of bordered `.guru-card` tiles. With
  one seeded profile this is a single card and not yet the banned pattern; populated, it
  becomes the "grid of identical tiles" that `DESIGN.md` says should be a ruled list. The
  tool index — which `DESIGN.md` does have a recipe for — is a ruled list, and is one of
  the best pages in the app. The directory should copy it.

**Coverage caveat, stated plainly.** The seeded Guru profile has no 13F filing data, so
`/gurus/:slug/portfolio`, `/changes`, `/history`, `/filings` and `/analysis` were scored on
their **pending and empty states only**. Those states are honest and well-built — "This
quarter is partial. The figures and actions below are withheld until its data is ready."
is exactly the right sentence. The populated layouts of those five pages are **not covered
by this review**, the same caveat the first pass recorded for `/tools/market-rotation`.
One weakness is visible even empty: the portfolio table renders its header row inside a
bordered region with no rows and no message in the region itself.

---

## Full scorecard

### Public surfaces

| Page | Hier | Sys | Load | State | R&A | **Total** | Was | Verdict |
|---|---|---|---|---|---|---|---|---|
| `/` (guest home) | 18 | 19 | 18 | 17 | 17 | **89** | 90 | Reference |
| `/guide` | 17 | 17 | 16 | 16 | 16 | **82** | 82 | Keep |
| `/about` | 15 | 16 | 16 | 15 | 16 | **78** | 78 | Keep |
| `/login` | 16 | 16 | 16 | 15 | 15 | **78** | 58 | **Fixed** |
| `/register` | 16 | 16 | 15 | 15 | 15 | **77** | 58 | **Fixed** |
| `/forgot-password` | 15 | 16 | 15 | 15 | 15 | **76** | 55 | **Fixed** |
| `/reset-password` | 15 | 15 | 15 | 15 | 15 | **75** | 60 | **Fixed** |
| `/articles` | 14 | 15 | 15 | 14 | 15 | **73** | 73 | Keep |
| `/articles/:slug` | 15 | 15 | 15 | 13 | 15 | **73** | 72 | Keep |
| `/register/complete` | 14 | 15 | 14 | 14 | 14 | **71** | 63 | Keep |
| `/not-a-real-route` (404) | 15 | 15 | 15 | 16 | 15 | **76** | — | Keep |

The guest home loses one point against its 90 only because it carries two filled actions;
the page's own brief argues for the second, so this is a rule question, not a defect.

### The diary loop — the product's core

| Page | Hier | Sys | Load | State | R&A | **Total** | Was | Verdict |
|---|---|---|---|---|---|---|---|---|
| `/timeline` | 18 | 18 | 18 | 17 | 16 | **87** | 88 | Reference |
| `/calendar` | 17 | 18 | 17 | 17 | 16 | **85** | 86 | Reference |
| `/diaries` | 16 | 17 | 16 | 17 | 16 | **82** | 80 | Keep |
| `/alerts` | 16 | 17 | 16 | 16 | 16 | **81** | 52 | **Fixed** |
| `/reviews` | 16 | 15 | 16 | 16 | 16 | **79** | 80 | Keep |
| `/` (Overview) | 17 | 15 | 16 | 17 | 16 | **81** | 80 | Keep |
| `/diaries/:id/review` | 16 | 15 | 16 | 16 | 15 | **78** | 78 | Keep |
| `/diaries/new` | 15 | 16 | 15 | 15 | 15 | **76** | 76 | Keep |
| `/diaries/quick` | 14 | 16 | 15 | 15 | 15 | **75** | 76 | Keep |
| `/diaries/:id` | 15 | 14 | 15 | 15 | 15 | **74** | 74 | Fix in place |
| `/diaries/:id/edit` | 13 | 15 | 14 | 15 | 14 | **71** | 72 | Fix in place |

The loop is healthy and `/alerts` is repaired. `/timeline` and `/calendar` lose a point
each on target size: the timeline's two date filters are 38px, and the calendar's year
strip is 371 cells at 13×13px. The year strip is a deliberate heatmap — exactly **one** of
the 371 is tabbable, with arrow-key movement, as `DESIGN.md` specifies, and every
destination in it is also reachable from the 72×108px month grid above. It is below WCAG
2.5.8's 24px minimum for a pointer target, and it is mitigated; recorded as a known
trade-off, not scored as a defect.

`/diaries/:id/edit` is the tallest page in the app at 3,699px.

### Investing and trading

| Page | Hier | Sys | Load | State | R&A | **Total** | Was | Verdict |
|---|---|---|---|---|---|---|---|---|
| `/discipline` | 18 | 18 | 17 | 16 | 17 | **86** | 86 | Reference |
| `/stocks/watchlist` | 16 | 17 | 16 | 16 | 16 | **81** | 48 | **Fixed** |
| `/stocks/alerts` | 15 | 16 | 15 | 15 | 15 | **76** | 70 | Keep |
| `/strategy-performance` | 16 | 13 | 16 | 16 | 15 | **76** | 46 | **Fixed** |
| `/trade-plans` | 14 | 14 | 15 | 15 | 15 | **73** | 72 | Keep |
| `/stocks` (Holdings) | 15 | 12 | 15 | 16 | 15 | **73** | 66 | Fix in place |
| `/stocks/:symbol/thesis` | 14 | 15 | 14 | 14 | 15 | **72** | 64 | Keep |
| `/trade-plans/:id` | 13 | 14 | 14 | 15 | 15 | **71** | 68 | Fix in place |
| `/stocks/:symbol` | 13 | 12 | 13 | 15 | 15 | **68** | 58 | Rework |
| `/trade-plans/new` | 15 | 15 | 15 | 15 | 15 | **75** | — | Keep |

`/stocks/:symbol` is the only remaining page in the rework band in this group: 3,270px of
scroll and 59 figures in the sans cut. Its sectioning improved markedly (ticket 110) — the
score moved 58 → 68 — but the page still asks a reader to scroll three and a half screens.

`/strategy-performance`'s 13 on system fidelity is entirely the Figure Rule; everything
else about that page is now right.

### Gurus — first scoring

| Page | Hier | Sys | Load | State | R&A | **Total** | Verdict |
|---|---|---|---|---|---|---|---|
| `/gurus/notifications` | 15 | 15 | 15 | 16 | 15 | **76** | Keep |
| `/gurus/activity` | 14 | 14 | 14 | 15 | 13 | **70** | Keep |
| `/gurus/consensus` | 14 | 14 | 14 | 15 | 13 | **70** | Keep |
| `/gurus/stocks` | 14 | 14 | 14 | 15 | 13 | **70** | Keep |
| `/gurus/sectors` | 14 | 14 | 14 | 15 | 13 | **70** | Keep |
| `/gurus/:slug` | 14 | 13 | 15 | 16 | 14 | **72** | Rework |
| `/gurus/:slug/portfolio` \* | 14 | 14 | 14 | 15 | 13 | **70** | Keep |
| `/gurus/:slug/changes` \* | 14 | 14 | 14 | 15 | 14 | **71** | Keep |
| `/gurus/:slug/history` \* | 14 | 15 | 14 | 15 | 15 | **73** | Keep |
| `/gurus/:slug/filings` \* | 14 | 15 | 14 | 15 | 15 | **73** | Keep |
| `/gurus/:slug/analysis` \* | 13 | 13 | 14 | 15 | 14 | **69** | Rework |
| `/gurus/compare` | 13 | 14 | 13 | 13 | 11 | **64** | **Rework** |
| `/gurus` | 12 | 11 | 13 | 14 | 12 | **62** | **Rework** |
| `/stocks/:symbol/gurus` | 14 | 14 | 14 | 15 | 14 | **71** | Keep |

\* Scored on pending/empty states only — no seeded filing data. Populated layouts not covered.

### Tools

| Page | Hier | Sys | Load | State | R&A | **Total** | Was | Verdict |
|---|---|---|---|---|---|---|---|---|
| `/tools` | 17 | 18 | 17 | 16 | 17 | **85** | 84 | Reference |
| `/tools/position-sizing` | 16 | 15 | 16 | 15 | 16 | **78** | 78 | Keep |
| `/tools/sec-filings` | 15 | 16 | 15 | 15 | 15 | **76** | 74 | Keep |
| `/tools/market-rotation` | 14 | 14 | 14 | 15 | 14 | **71** | 71 | Keep |
| `/tools/etf` | 14 | 13 | 14 | 15 | 14 | **70** | 70 | Keep |
| `/tools/financial-freedom` | 15 | 11 | 15 | 15 | 14 | **70** | 78 | Fix in place |
| `/tools/seasonality` | 14 | 12 | 14 | 15 | 15 | **70** | 68 | Fix in place |
| `/tools/relative-value` | 12 | 9 | 12 | 13 | 9 | **55** | 58 | **Rework** |

`/tools` is still the model: a ruled two-column list, not a tile grid.

`/tools/relative-value` is now the lowest-scoring page in the app. Its clipped buttons and
three-identical-"Fetch quote" defects were fixed (ticket 113), and the page then kept the
two problems nobody measured: **976 figures in the sans cut**, and **13 controls below the
44px floor** (five inputs and two selects at 40px, five buttons at 42px). Its history table
is also the one table in the app that is wider than the region holding it — 518px of table
in a 426px host, inside a `<details>` with no scroll region.

`/tools/financial-freedom` fell 78 → 70 purely on the Figure Rule: 57 figures, including
the headline `15,000,000.00`, render in the sans cut. The first pass did not measure this.

### Account and sharing

| Page | Hier | Sys | Load | State | R&A | **Total** | Was | Verdict |
|---|---|---|---|---|---|---|---|---|
| `/achievements` | 16 | 17 | 17 | 16 | 17 | **83** | 84 | Reference |
| `/settings/security` | 17 | 17 | 16 | 16 | 16 | **82** | 82 | Keep |
| `/settings` | 16 | 16 | 16 | 16 | 16 | **80** | 80 | Keep |
| `/reviews/ai-reports` | 16 | 16 | 15 | 16 | 15 | **78** | 50 | **Fixed** |
| `/partners` | 15 | 15 | 15 | 15 | 15 | **75** | 64 | Keep |
| `/settings/api-keys` | 15 | 15 | 15 | 15 | 15 | **75** | 72 | Keep |
| `/etf/watchlist` | 14 | 15 | 15 | 15 | 15 | **74** | 62 | Keep |
| `/discipline/share` | 14 | 15 | 15 | 15 | 15 | **74** | 70 | Keep |
| `/partners/compare` | 14 | 15 | 15 | 15 | 15 | **74** | 70 | Keep |
| `/design-preview` | 14 | 15 | 14 | 15 | 14 | **72** | 72 | Internal |

Ticket 112's empty-state and list-section work shows clearly here: `/partners` 64 → 75,
`/etf/watchlist` 62 → 74.

`/settings` keeps its one real flaw from the first pass — **Date timezone is still a
free-text input** while Account language and Start page are selects, against `DESIGN.md`'s
"common options plus an explicit use-device-timezone action".

### Administration

| Page | Hier | Sys | Load | State | R&A | **Total** | Was | Verdict |
|---|---|---|---|---|---|---|---|---|
| `/admin/ai` | 16 | 17 | 16 | 16 | 16 | **81** | 38 | **Fixed** |
| `/admin/users` | 16 | 16 | 16 | 16 | 16 | **80** | 44 | **Fixed** |
| `/admin/email-settings` | 15 | 16 | 15 | 16 | 15 | **77** | 78 | Keep |
| `/admin/ai/usage` | 15 | 16 | 15 | 15 | 15 | **76** | — | Keep |
| `/admin/gurus` | 15 | 15 | 15 | 15 | 15 | **75** | — | Keep |
| `/admin/blog` | 15 | 15 | 15 | 15 | 15 | **75** | 58 | **Fixed** |
| `/admin/research/new` | 15 | 15 | 15 | 15 | 15 | **75** | 70 | Keep |
| `/admin/ai/prompts` | 15 | 15 | 15 | 15 | 14 | **74** | — | Keep |
| `/admin/research` | 14 | 15 | 15 | 16 | 15 | **75** | 76 | Keep |
| `/admin/etf` | 14 | 15 | 14 | 15 | 14 | **72** | 66 | Keep |
| `/admin/ai/report-prompts` | 13 | 15 | 15 | 15 | 15 | **73** | — | Keep |
| `/admin/institutional` | 14 | 13 | 14 | 15 | 14 | **70** | — | Keep |
| `/admin/blog/:id/edit` | 14 | 14 | 14 | 15 | 14 | **71** | 63 | Keep |
| `/admin/blog/new` | 14 | 14 | 14 | 15 | 14 | **71** | 63 | Keep |
| `/admin/article-translations` | 14 | 14 | 14 | 15 | 14 | **71** | 64 | Keep |
| `/admin/research/settings` | 14 | 14 | 14 | 15 | 14 | **71** | 70 | Keep |
| `/admin/institutional/mappings` | 14 | 14 | 14 | 15 | 14 | **71** | — | Keep |
| `/admin/ai/access` | 14 | 15 | 14 | 15 | 12 | **70** | — | Fix in place |
| `/admin/guru/:id` | 14 | 14 | 14 | 15 | 14 | **71** | — | Keep |
| `/admin/research/:id` | 14 | 14 | 14 | 15 | 14 | **71** | 67 | Keep |

Administration is the most improved area in the product: it held the two worst pages in
the first pass and now holds none below 70.

`/admin/ai/access` carries the one label-association defect in the app: **four checkboxes
in table cells with no label hit area**, so the only pointer target is the 18px box itself.
They have accessible names, so a screen reader is fine; a pointer user is given an 18px
target.

---

## Navigation depth — ticket 116 fixed the symptom, not the cause

Measured at three desktop sizes on `/timeline`:

| Viewport | Sidebar scroll height | Visible | Links below the fold |
|---|---|---|---|
| 1440×900 | 1,616px | 900px | **20 of 32** |
| 1440×1080 | 1,616px | 1,080px | **18 of 32** |
| 1680×1050 | 1,616px | 1,050px | **18 of 32** |

Ticket 116 did what it set out to do: Settings, Sign out and Preferences are pinned and
visible at every height, which was the specific complaint. But the nav list itself grew —
32 links now, because every tool and every Guru destination is listed inline — so the
*depth* problem is slightly worse, not better. At 1440×900 the first hidden items are
Price reminders, Trading principles and the entire Tools and Gurus groups.

The ticket records that giving the list its own scroll box was tried and rejected because
it left the list 242px tall. That was the right call. The remaining question is an IA one
and still unanswered: whether ~30 destinations belong in a single flat scrolling column at
all, given the standing capture → read → review priority.

---

## App-level heuristic score

| # | Heuristic | Score | Was | Key issue |
|---|---|---|---|---|
| 1 | Visibility of system status | 4 | 3 | The contradictory AI-reports state is gone; low-N charts now say why they are not drawn |
| 2 | Match system / real world | 3 | 3 | Copy remains excellent; money still renders in a prose face on the money pages |
| 3 | User control and freedom | 4 | 3 | `/alerts` can now create the thing it lists; confirmations remain consistent |
| 4 | Consistency and standards | 3 | 2 | Empty states and row controls converged; the Figure Rule and filled-action rule did not |
| 5 | Error prevention | 3 | 3 | Danger buttons and consequence copy are consistent; disabled-at-rest buttons still hide preconditions |
| 6 | Recognition rather than recall | 3 | 3 | 20 of 32 nav links below the fold; timezone is still free text |
| 7 | Flexibility and efficiency | 3 | 3 | Palette, ⌘J, ⌘K, saved views, CSV exports; still no bulk ops on watchlist or reviews |
| 8 | Aesthetic and minimalist design | 4 | 3 | No shadows, no clipping, no mid-word breaks anywhere; the Guru eyebrow and tint slab are the exceptions |
| 9 | Error recovery | 3 | 3 | Failed forms keep content, errors carry a selectable requestId |
| 10 | Help and documentation | 3 | 3 | `/guide` and inline explanatory copy remain better than most products ship |
| **Total** | | **33/40** | 29/40 | **Strong** — two systemic rules to close |

---

## Recommended order

1. **Close the Figure Rule at the boundary.** 72 CSS blocks, or better, have the display
   layer emit `.num`/`.figure` and delete the per-route font rules. Add a check beside
   `check-design-contrast.mjs` so it cannot drift again. Highest visibility-per-effort in
   this report, and it is a credibility problem: a tool for recording investment decisions
   should not set `15,000,000.00` in the same face as its body copy.
2. **`$impeccable harden /tools/relative-value`** — the lowest page in the app: the figure
   face, 13 under-floor controls, and a table 92px wider than its region.
3. **`$impeccable shape /gurus`** — retire `.guru-eyebrow`, take `--tint-warn` off the
   full-width disclosure, fix the 768px overflow, raise the module's selects to 44px, and
   make the directory a ruled list like `/tools`.
4. **Rule the filled-action question**, then apply it: filter submits become secondary, and
   `DESIGN.md` says *one filled action per section* or the page briefs stop asking for two.
5. **`$impeccable polish` the disabled-at-rest buttons** — eight routes; name the
   precondition beside the control the way `/admin/ai` already does.
6. **`$impeccable distill /stocks/:symbol`** — 3,270px is still too long for eight jobs.
7. **Answer the navigation-depth question** (116's open half) before the tree grows again.
8. **Seed Guru filing data and re-score those five pages** — their populated layouts are
   the largest remaining blind spot in this review.

## Coverage and caveats

- All 88 route states captured at 1440×900 and 390×844; overflow measured at 768px too.
- `/gurus/:slug/{portfolio,changes,history,filings,analysis}` scored on **pending/empty
  states only** — no seeded 13F data. Populated layouts not covered.
- `/admin/research/*` was seeded with Research Studio enabled but no instrument profile, so
  its run-detail page was scored on its empty state.
- Dark mode and both non-default market-colour conventions **were** reviewed this pass and
  are correct; zh-TW/zh-CN layout was spot-checked (the harness defaults to zh-TW and the
  sweep ran in English) but not systematically re-reviewed.
- Scores are a reviewer's judgement. The defects cited with `file:line` or a measurement
  are verified; composition judgements are not falsifiable the same way.
- The first pass's conclusion that no page carries more than one filled action was a
  detector bug, not a finding. It is corrected here.

---

## What was fixed

Everything above describes the tree as measured on 2026-10-09 before remediation. The
findings were then fixed in the same session and re-measured with the same three passes
against a freshly seeded harness. **Route states with no mechanical finding went from 37
to 69 of 84.**

### 1. The Figure Rule — closed, and guarded

Thirty-eight rule blocks gained `font-family: var(--font-mono)`. Three kinds of care were
needed, and the diff reflects them:

- **Tables were split.** A rule that styled `th` and `td` together could not simply take
  the family, because `thead` labels are prose. Each of those now has a sibling
  `tbody td` (or `tbody th, tbody td`, where a row header carries the ticker) rule
  alongside it — `ledger.css`, `portfolio-exposure.css`, `position-sizing.css`,
  `sec-filings.css`, `market-research.css`, `market-rotation.css`.
- **Mixed surfaces were marked at the display layer instead.** `.ledger-reading dd` holds
  quantity and price *and* strategy, emotion and notes in the same element, so blanket
  mono was wrong: `routes/diary.tsx` now emits `.num` on the figure fields and the
  all-figure consumers (`.portfolio-valuation`, `.realized-results`) take the family in
  CSS. `.ai-quota` and `.execution-selected-list li` were reverted for the same reason —
  both are sentences — and `.execution-selected-heading strong` carries the figure instead.
- **The market palette now carries the rule at its root.** `marketClass()` is only ever
  applied to a `formatMarketValue` result, so `.market-up`/`.market-down`/`.market-flat`
  in `styles.css` take the mono cut. Any cell that also carries a direction class is
  therefore correct by construction.

`scripts/check-figure-rule.mjs` is new and enforces this: a block asking for
`tabular-nums` must also name the mono family, or be listed as an exemption **with a
stated reason**. It checks 88 blocks and carries 36 reasoned exemptions (containers,
pagination status lines, sentences, `th` labels, and selectors already mono through the
global `.num`/`time` rule). It also fails when an exemption goes stale, so a selector that
moves or gains the family cannot leave a dead entry behind. `npm run design:check` runs it
with the contrast checker.

| Route | Figures in the sans cut, before → after |
|---|---|
| `/tools/relative-value` | 976 → **0** |
| `/stocks/:symbol` | 59 → **0** |
| `/tools/financial-freedom` | 57 → **0** |
| `/stocks` (Holdings) | 36 → **0** |
| `/admin/institutional` | 18 → **0** |
| `/strategy-performance` | 12 → **0** |
| `/tools/etf` | 12 → **0** |
| `/diaries/:id`, `/trade-plans`, `/reviews`, others | 1–6 → **0** |
| `/tools/seasonality` | 16 → **2**, then 0 after the market-palette rule |

### 2. The Guru module

- **The eyebrow is retired.** `.guru-eyebrow` (`gurus.css`) drops
  `text-transform: uppercase` and `letter-spacing: 0.06em` for the sentence-case muted
  label the rest of the app uses.
- **The warm-tint slab is gone.** `.guru-disclosure`/`.guru-stale-note` now use the
  blockquote treatment `DESIGN.md` already sanctions — a 1px `rule-strong` on the left plus
  indentation, bounded at 72ch — instead of `--tint-warn` across an 893px region.
- **Both 768px overflows are resolved**, and each had a different cause.
  `.guru-filters` was `repeat(4, minmax(110px, 1fr)) auto`, a 571px min-content floor
  inside the 540px column the 180px sidebar leaves at that width. It is now a wrapping
  flex row, which also fixed the **clipped "Featured and cus" select**: the old
  `width: 100%` override fought `DESIGN.md`'s rule that a select is as wide as its longest
  option and no wider. `.guru-comparison-select` was `minmax(260px, 1fr) minmax(280px, 1fr)`
  — also unable to shrink — and its only breakpoint was `max-width: 760px`, which never
  fires at 768px. Both guru stylesheets now break at `767px` to match `mobile-max`, and the
  comparison page stacks at 1100px like the rest of the module.
- **Eleven controls were raised to the 44px floor** across five Guru stylesheets, including
  the 34px Follow button.

### 3. One filled action per page

Sixteen route states carried two or three. Two rulings, then the edits:

- **A filter or search submit is secondary.** It re-runs the list the reader is already
  looking at. Applied on `/articles`, `/admin/blog`, `/trade-plans`,
  `/strategy-performance`, `/admin/research` and `/gurus`.
- **A supporting action beside a page's own save is secondary.** Applied to Confirm
  current plan and Save execution selection (`/trade-plans/:id`), Save schedule
  (`/diaries/:id/review`), Enable mail and Send test email (`/admin/email-settings`),
  Apply provider (`/admin/article-translations`), Translate Now (the blog editors), Set
  reminder (`/diaries/quick`), and the empty-state CTA on `/admin/research` that pointed at
  the same destination as the header's filled action.

**Three are left, deliberately.** `/achievements` (Add goal / Add achievement) and
`/admin/ai/report-prompts` (Save draft under *Weekly prompt* and under *Monthly prompt*)
are one filled action **per section**, each under its own heading, which is what those
pages' briefs ask for; `DESIGN.md`'s "the page's single filled action" should be amended to
say *per section* rather than these pages changed. `/design-preview` is an internal
surface. The guest home carries the same Register action twice — hero and closing CTA — not
two competing ones.

### 4. Target size and labels

| Fix | Where |
|---|---|
| Date filters 38px → 44px | `timeline.css` — the 36px compact height is for toolbar *buttons*, not fields |
| Inputs, selects and actions 40px → 44px | `market-research.css` (`/tools/relative-value`, `/tools/seasonality`) |
| Tool range select 40px → 44px | `public.css` `.tool-actions` (`/tools/market-rotation`) |
| Company Guru select 42px → 44px | `stock-guru-panel.css` |
| Evidence disclosure toggle 36px → 44px | `evidence.css` |
| Preset chips marked `.button-compact` | `routes/relative-value.tsx` — a real toolbar, so the 36px floor applies honestly |
| Checkbox given a 44px hit area | `routes/admin-ai-access.tsx` — wrapped in a `<label>`; the box alone was an 18px pointer target |

### 5. Other

- **The relative-value history table** is now inside the shared `.table-scroll` region
  (named, bordered, focusable) rather than overflowing a `<details>` by 98px.
- **Translate Now names its precondition** beside the control — "Save the article before
  requesting a translation" / "Choose at least one language to translate into" — instead of
  disabling silently, and a new `chooseTarget` key was added in all three locales.
- **The capture reminder no longer uses a disabled button for field validation.** It is
  disabled only while the field is empty; an invalid datetime is reported by the field via
  `aria-invalid`, per `DESIGN.md`.
- **`span.number` → `span.num`** on `/admin/ai/prompts`, reusing the global figure class.

### What remains open

Nothing in the redesign or rework band is left as a mechanical defect. The remaining
findings are judgement calls or structural reworks beyond a defect fix:

| Finding | Status |
|---|---|
| `/calendar` year strip: 371 cells at 13×13px | **Deliberate.** One tab stop with arrow movement, as `DESIGN.md` specifies; every destination is also in the 72×108px month grid. Below WCAG 2.5.8's 24px pointer minimum and mitigated — recorded, not "fixed" |
| Tall pages: `/diaries/:id/edit` 3,699px, `/stocks/:symbol` 3,274px, `/trade-plans/:id` 2,558px, `/tools/seasonality` 2,646px | **Open.** Sectioning reworks, not defects |
| `/diaries/new`, `/diaries/quick`: submit disabled on an empty writing area | **Compliant.** `DESIGN.md` names "an empty writing area" as a sanctioned precondition, and the empty textarea is directly above the control |
| `/gurus/compare`: Add to comparison disabled at rest | **Open.** Needs the precondition named beside it |
| `/admin/institutional/mappings`: a select clipped by `max-width: 100%` | **Open.** The longest option needs 272px in a 248px container |
| Sidebar: 20 of 32 links below the fold | **Open.** The IA question from ticket 116, unchanged |
| Guru data pages scored on pending states only | **Open.** Needs seeded 13F data to score the populated layouts |

### Verification

`npm run typecheck`, `eslint .`, `node scripts/check-figure-rule.mjs` (88 blocks),
`node scripts/check-design-contrast.mjs` (74 pairs per theme) and **1,190 unit tests in 133
files** all pass. The three measurement passes were re-run over all 88 route states against
a freshly provisioned harness; the consolidated result is 69 clean of 84 scored, with no
new finding introduced on any previously clean route.

The **full Playwright suite passes 338/338** against the disposable harness, holding the
clean run that [117](../../.scratch/diary-v3-rebuild/issues/117-remaining-e2e-failures.md)
established in `3819cbd` — this pass neither fixed nor broke an e2e case. Worth noting that
three of those specs assert on exactly what this pass changed and still pass unmodified:
`workspace-navigation.spec.ts:283` ("capture is filled once on a workspace page"), `:312`
("the account controls stay in view however far the navigation scrolls"), and
`workspace-width.spec.ts:30` (the 1280px data cap).
