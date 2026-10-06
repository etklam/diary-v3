---
target: Guru Portfolio surfaces (analysis, institutional ops, filing inspector, guru alerts)
total_score: 25
p0_count: 0
p1_count: 4
timestamp: 2026-10-06T14-55-28Z
slug: apps-web-app-routes-guru-analysis-tsx
closed: true
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | "Inspect filings" filters a table 500px below with no scroll, count, or confirmation; no skeletons on initial table loads |
| 2 | Match System / Real World | 2 | Raw enums (PARTIAL, MAPPING_INCOMPLETE, ROW_VALUE_UNIT_ASSUMED), invented `4 · 1P · 1E` grammar, and fact ids (`portfolio.reportedValueUsd`) shown to members |
| 3 | User Control and Freedom | 3 | No undo on mark-all-read; no UI to cancel a queued analysis though the API supports it |
| 4 | Consistency and Standards | 2 | New admin tables abandon the module's bordered/rounded scroll region + mobile-card convention; link and button mixed in one cell; chip renders inline on one page, full-width on another |
| 5 | Error Prevention | 3 | Quarter filter is a free date picker accepting any day; alerts form has no unsaved-changes guard |
| 6 | Recognition Rather Than Recall | 2 | Abbreviation grammar has no legend; digests truncated to `bbbbbbbb…` with no copy affordance |
| 7 | Flexibility and Efficiency | 2 | No bulk reprocess, no sortable columns, no keyboard shortcuts, no saved filters on an operator surface |
| 8 | Aesthetic and Minimalist Design | 2 | 16 undifferentiated queue counters; 8 stacked bordered cards on the analysis page; full-bleed warn-tint slab |
| 9 | Error Recovery | 3 | Scoped retry and specific failure sentences throughout; raw error codes still shown bare in tables |
| 10 | Help and Documentation | 3 | Good explanatory ledes and state copy; no gloss for the enum vocabulary, no link to the shipped docs |
| **Total** | | **25/40** | **Acceptable — significant improvements needed** |

## Anti-Patterns Verdict

**LLM assessment**: This does not read as brand-register AI slop. No gradient text, no glassmorphism, no hero-metric template, no icon+heading+text card grid, no over-rounded corners, no eyebrow above every section. Typography, spacing, and color come from the project's tokens throughout, and the contrast checker passes 74/74 pairs in both themes.

It fails the *product* slop test instead, which is the one that applies here: a user fluent in Linear or Stripe would pause at subtly-off components. Stretched state chips, columns clipped off-screen on mobile, `1000000.00000000` where a formatted figure belongs, and a header button labelled "Recent events" that navigates to a different page. Strangeness without purpose, not flatness.

Two shared absolute bans are violated in CSS the markup detector cannot see: `border-left: 2px` side-stripes in `guru-analysis.css:101` and `guru-notifications.css:111`.

**Deterministic scan**: `detect.mjs --json` over all 8 new markup files returned `[]` (exit 0). The CSS pass also returned `[]`, but CSS-only files are outside the detector's scope, which is exactly why both side-stripes went unflagged. The detector agrees with my read on markup-level slop and is blind to the stylesheet-level violations.

**Visual overlays**: Not attempted. Browser automation here is Playwright-driven screenshot capture, not a live injectable session, so no user-visible overlay exists. Evidence is five full-page captures at 1440px and 390px.

## Overall Impression

The information architecture is the strongest thing here, and it is genuinely strong. The filing inspector walks an operator from a filing through documents, preserved artifacts, parsed rows, the effective snapshot and its amendment sources, to prepared analytics — in that order, with provenance at every step. The analysis page's separation of prepared facts from cited interpretation, with a code-owned caveat list, is a real design idea and not decoration.

The execution underneath it has not caught up. Numbers ship at raw database precision on member-facing pages, a CSS override breaks every state chip in both admin tables, mobile tables clip columns with no affordance, and one header button goes somewhere other than where it says. These are small individually and they are everywhere.

The single biggest opportunity: run every figure through the formatting helpers the sibling Guru pages already use, and adopt the module's existing table-scroll component instead of a bare `overflow-x: auto`. Both are mechanical, both fix whole categories at once.

## What's Working

- **Lineage as layout.** The inspector's section order *is* the audit trail. Nothing is grouped by "what's convenient to query"; it reads filing → documents → artifacts → parsed rows → snapshot → sources → analytics, which is the order an operator debugs in.
- **Honest state vocabulary on the analysis page.** `NOT_GENERATED`, `QUEUED`, `RUNNING`, `READY`, `STALE`, `FAILED`, `BLOCKED_BY_COVERAGE` each get a full explanatory sentence, and prepared facts stay visible in every state that has them. A stale analysis is labelled stale and kept, not hidden.
- **Reassurance where it matters.** "Follows and watches are private. No one else sees them." sits directly above the lists it describes. "Actions queue existing jobs; they never delete preserved source data." sits above the destructive-sounding buttons. Both are placed at the moment of doubt.

## Priority Issues

- **[P1] Figures ship at raw API precision on member-facing surfaces**
  - **Why it matters**: `1000000.00000000`, `100.00000000`, and `71.42857143%` are unreadable at a glance and contradict the Figure Rule's purpose — a figure the user is asked to judge. Sibling Guru pages already render these through `compactUsd`, `percent`, and `formatExactDecimal`; mine print the string straight from the API.
  - **Fix**: Route every value in `guru-analysis.tsx` (prepared facts), `guru-notifications.tsx` (event detail percentages), and the inspector's parsed-row quantity/value columns through `apps/web/app/guru-format.ts`.
  - **Suggested command**: `$impeccable polish`

- **[P1] State chips render as full-width blocks in both admin tables**
  - **Why it matters**: `.admin-institutional-table td span { display: block }` (0-2-2) overrides `.admin-institutional-state { display: inline-block }` (0-1-0), so every ERROR/READY/PARTIAL chip stretches to its column. It reads as a broken input, not a status, and it is visible on the manager table and on "Filings for this quarter".
  - **Fix**: Scope the block rule to the muted sub-label (`td > span.admin-institutional-subtext`) or raise the chip's specificity. One line.
  - **Suggested command**: `$impeccable polish`

- **[P1] Admin tables clip columns on mobile with no scroll affordance**
  - **Why it matters**: At 390px the STATE, OPERATION and SEC SOURCE columns of "Filings for this quarter" are entirely off-screen, and the parsed-row table cuts mid-header at "QUA…". There is no border, no rounding, and no edge to signal that the region scrolls. The module's own `guru-research.css` already solves this with a bordered, rounded scroll region that swaps to cards below 760px; the new tables use bare `overflow-x: auto`.
  - **Fix**: Reuse the established scroll-region treatment and give each table a page-specific `min-width`, per DESIGN.md's "named, bordered, rounded scroll regions".
  - **Suggested command**: `$impeccable adapt`

- **[P1] The Guru alerts header button is mislabelled**
  - **Why it matters**: The button reads "Recent events" and navigates to `/gurus`. "Recent events" is also a section heading further down the same page, so the obvious expectation is an in-page jump. It wraps to two lines at desktop width, which makes it look broken as well as behave wrongly.
  - **Fix**: Label it for its destination ("All Gurus") or make it an anchor to `#guru-notifications-inbox`.
  - **Suggested command**: `$impeccable clarify`

- **[P2] The institutional overview is 16 equal counters with no severity and no grouping**
  - **Why it matters**: An operator opens this page to find trouble. "Filings awaiting ingestion 1" and "AI invalidated 2" carry identical visual weight, zeros look the same as non-zeros, and the only emphasis is a font-weight bump that is imperceptible. Sixteen items at one decision point is four times the working-memory limit, with no chunking by subsystem.
  - **Fix**: Group into ingestion / mapping / analytics / AI, and give a non-zero backlog a real signal — a `warn` badge or a leading rule — so the eye lands on it.
  - **Suggested command**: `$impeccable layout`

## Persona Red Flags

**Alex (Operator / power user)**: Twenty error filings means twenty page visits — there is no bulk reprocess and no multi-select. No sortable columns, so finding the oldest stuck filing means reading. "Inspect filings" sets a filter on a table 500px below the fold without scrolling to it, so the first click feels like a dead control. Content digests truncate to `bbbbbbbb…` with no `title` and no copy button, so the one thing an operator wants to compare against the SEC document cannot be compared. No keyboard shortcuts anywhere.

**Sam (Screen reader / keyboard)**: The confirmation dialog on the inspector is a bare `<p>` plus two buttons — no heading, no `aria-labelledby`, so it announces as an unnamed dialog. The project's own delete-dialog pattern autofocuses Cancel; this one autofocuses nothing, so focus lands on Confirm for a reprocess action. The dialog also borrows `.admin-guru-dialog` from a stylesheet the inspector never imports, so it drops to the base `dialog` rules and ships with square corners and default sizing. Positives: every chip carries its text token rather than relying on colour, tables use `scope`, and status and alert regions are announced.

**Casey (Mobile)**: On the alerts page a doubled hairline leaves a dead ~40px band between the header and the first section. On the inspector, enum tokens break mid-word (`MAPPING_INCOMPLET` / `E`) because of `overflow-wrap: anywhere`. Table columns run off-screen with no hint they scroll. Touch targets inside table cells — the SEC links, the accession links — are small and tightly stacked.

## Minor Observations

- Two `border-left: 2px` side-stripes (`guru-analysis.css:101`, `guru-notifications.css:111`) are a shared absolute ban. On the alerts list the stripe is also the *only* unread signal.
- The analysis page stacks eight bordered `.guru-panel` cards. DESIGN.md's default is `.panel` — flush on the canvas, heading with a rule under it, no box. Eight equal boxes also flatten the hierarchy between "Executive summary" and "Takeaways".
- The `.guru-disclosure` banner fills a whole region with `--tint-warn`. DESIGN.md says warn tints never fill a whole region, "because at full-bleed slab size it reads as beige". Pre-existing component, inherited by the new page.
- `4 · 1P · 1E`, `2R · 1P · 0E` and `1Q · 1E · 2I` are three different abbreviation grammars in three adjacent columns, with no legend and `E` meaning two different things.
- Initial table loads use text-only `role="status"`; DESIGN.md prescribes `LoadingBlock` skeletons for list and table initial loads so layout does not jump.
- "Profile" (link) and "Inspect filings" (button) sit in the same cell for sibling actions.
- The alerts save button sits under the thresholds, reading as if it saves only those, while it also saves the seven toggles above. Nothing marks the form dirty.
- The reported-quarter filter is a free date picker; any day of any month is accepted where only quarter ends exist.
- The seven alert toggles are one undifferentiated list. Four concern a followed Guru, two a watched stock, one consensus — a user who follows nobody cannot tell which toggles do nothing.

## Questions to Consider

- The analysis page shows members `Cites: portfolio.reportedValueUsd`. Would the fact's *label* ("Reported portfolio value") carry the same audit weight while being readable, with the identifier kept for admins?
- `/admin/institutional` answers "what is the state of everything". Would it be more useful if it answered "what needs me today" first, and kept the full census below?
- The analysis page is a stack of equal boxes. What would it look like if the executive summary were the page's lead and the rest were ruled sections under it?
