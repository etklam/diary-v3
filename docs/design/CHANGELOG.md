# Design changelog

Dated design decisions, supersessions, and provenance notes. DESIGN.md states only the rules currently in force; this file records how they got there and what they replaced. Entries are additive — do not rewrite or delete recorded decisions.

## 2026-10-06 — Guru consensus and sector intelligence

The cross-Guru views add `/gurus/consensus`, `/gurus/stocks`, and `/gurus/sectors` to the individual portfolio research surfaces. Cohort coverage, mapping coverage, and the filing-state counts precede the aggregate rows so a missing disclosure cannot read as a manager's non-ownership. Direction labels always retain their buyer/seller or holder-count evidence. The 13F warning uses the established warning tint and a full quiet border; direction colors come from semantic tokens.

Desktop preserves the comparison ledger in its own horizontal scroll region. Mobile turns each stock or group into a card containing the same metrics. The sector page switches among sector, industry, and explicitly mapped themes. Filter, ranking, quarter, pagination, and CSV controls remain native and labeled. Formula and denominator decisions are documented in `docs/guru-consensus.md`; synthetic browser evidence is in `docs/design/evidence/guru-intelligence/`.

## 2026-10-06 — Guru portfolio research surfaces

The Guru extension adds five research views under `/gurus`: current quarter holdings, categorized changes, quarter history, source filings, and the cross-manager activity feed. The product leads with manager identity and reported-period data, while the 13F delay notice stays visible before the figures. SEC lineage is attached to the quarter, holding, filing, and individual position history so users can distinguish the disclosed snapshot from present-day activity.

The portfolio table remains a desktop ledger with its own horizontal scroll boundary; on phones, each holding becomes a card with the same share/value/weight/rank and quarter-change fields. Filters use labeled native controls, period switching stays in the data row, and position history is a native disclosure with quarter action and source links. Portfolio, change, and position-history exports sit next to their corresponding data. Screenshots and browser acceptance use synthetic holdings and live in `docs/design/evidence/guru-research/`.

## 2026-10-06 — Shared AI prompt registry

`/admin/ai/prompts` extends the existing Admin grammar into a shared registry. Prompt provenance comes before editing: module and version selectors lead to the effective source, followed by the immutable System Default and a bounded 72ch template editor. The output contract stays read-only; registered synthetic input, rendered playground output, and audit history follow below. Archive and disable use the established danger button and consequence dialog. Desktop/mobile/light/dark evidence is in `docs/design/evidence/shared-prompts/`; the module integration brief is `docs/design/shared-prompt-management-brief.md`.

## 2026-10-06 — Guru discovery and portfolio overview

The first Guru product surfaces are `/gurus` and `/gurus/:slug`. The directory is organized around investor discovery: search, style and fund filters, sector focus, featured profiles, and transparent sorting precede a card that separates editorial style from reported portfolio data. Follow buttons expose the current viewer's state and an aggregate count; no follower identity is serialized.

The overview keeps reported metrics and moves in the main column and editorial profile, sector allocation, portfolio history, and AI summary state in the side column. Each portfolio section carries its reported quarter, the page identifies its SEC filing source, and the 13F delay disclosure stays visible near the top. New filing snapshots remain pending until analytics for the active snapshot are ready, so an amendment cannot make the previous quarter summary appear current.

The layout uses the current Ledger system: ruled groups, semantic tokens, monospace figures, and no floating-card shadows. Filters and columns collapse for narrow screens. Loading, empty, partial, and service failure states remain explicit. Synthetic desktop and 390px screenshots plus browser assertions are recorded in `docs/design/evidence/guru-discovery/`.

## 2026-10-06 — Public home rebuilt around the record; T-account brand mark

The user asked for a redesign of the home page and the icon. Scope was confirmed as the **guest landing page only**: `/` renders `Overview` for authenticated users, and that is a working surface with different density rules, so it keeps its own record and was not touched.

**Priority inversion corrected.** The landing page led with "Try the tools" as the filled action and put all seven tools in the first and largest section, leaving the decision diary as three bullets near the bottom. That contradicted PRODUCT.md principle 2 and the project's standing diary-first rule. Start your diary is now the filled action, the tools are secondary, and the three-step sequence precedes the tool list. The no-account affordance that the tools-first button used to carry is now stated explicitly in a note under the actions, so demoting the button does not hide that the tools are open to guests.

**The hero preview now proves the mechanism.** `docs/design/public-content-brief.md` contracted for a labelled synthetic excerpt showing original thesis, dated observation and later review *in chronological order*; what had shipped was one title, one line and a detached quote row — a card, not a traceable decision. It is now a date axis carrying the same synthetic decision posted three times on hairlines, closed by a ledger quote showing the price up 10% while the thesis failed, which is the product's actual argument. The card also carried `--shadow-2`, violating the Structural Hierarchy Rule that DESIGN.md states for every panel and card; the shadow is gone. The synthetic label moved from a bare caption into the sunken notice the Patterns section already required for synthetic content. `role="img"` plus a descriptive label is retained, so assistive tech gets the illustration described rather than fake figures read as a real account.

**Structure.** The `.public-eyebrow` pill above the headline was removed along with its rule — the last surviving eyebrow on a public surface, and redundant against both the h1 and the nav wordmark. The three-step sequence became a continuous ruled list instead of three equal columns, which is what the original brief asked for and what an ordered flow should look like; the `01/02/03` markers stay for the reason recorded on 2026-10-02. The last step drops its bottom rule: the next section opens on its own hairline 56px below, and two identical rules with nothing between them read as an empty ruled band rather than as a close. The tool list keeps its row rules where it meets the closing section, because there the weights differ — a half-width 1px row rule ending a column, then the full-width 2px section rule — so the two are visibly doing different jobs. `.public-closing` now closes on the heavier `--rule-strong`, the accounting convention for totalling a column.

**No motion was added.** The brand register would permit one orchestrated reveal on a persuade surface, but DESIGN.md's standing rule forbids entrance animations and page-load choreography project-wide. The committed system wins; the page remains state-feedback only.

**Brand mark replaced.** The T/b monogram is superseded by a **T-account**: the ledger's top rule, the divider descending from its centre, and one posting staggered in each column. It is simultaneously the brand initial and the oldest form of a ruled two-sided record, so it carries the same claim as the "Ledger" north star. The driving defect was legibility — the `b` was drawn as a separate 3.6px stem plus a 9px ring whose counter filled in at favicon size, so the mark read as `T|●` at 16px. The replacement is four stroke-only shapes with no counter. Six geometries were rendered at 16/24/32/64/180px on light and dark before choosing; the first four candidates were rejected because a single left-hand posting merged with the rule's left arm and read as `Ŧ` or a bold `F`, which is what forced the two-column staggered form. `#4549a7` and the manifest/theme colours are unchanged, and the PNGs were regenerated by `scripts/render-icons.mjs`.

**Coverage added.** The guest landing page had no e2e coverage at all, which is why this redesign broke no tests — and equally why the drift it corrects went unnoticed. `tests/e2e/public-home.spec.ts` now pins the decisions rather than the pixels: that the filled action starts a diary and the tools are secondary, that the ordered sequence precedes the tool list, that the hero holds three postings whose dates ascend and whose labels run original reasoning → later evidence → review, that the synthetic illustration carries `role="img"` with a "not a real account" label and a visible notice in all three locales, that `.home-preview-window` computes `box-shadow: none`, that the eyebrow does not return, and that the page reads at 390px and with JavaScript disabled. Each assertion was mutation-checked: reverting the CTA order and restoring the card shadow each failed exactly the intended test and nothing else.

Verification: typecheck, lint, `scripts/check-design-contrast.mjs` (148 pairs), 1058 unit tests and the web production build pass; the new 7-case Playwright spec passes against the disposable harness; the impeccable detector reports no findings on the changed files. Inspected at 390/768/1440px in light and dark across English and zh-TW.

## 2026-10-02 — "The Ledger" supersedes "Decision Agenda"

The user rejected the existing visual language as feeling templated and machine-made, and asked for a redesign of the design language itself. The diagnosis was four systemic choices rather than any single detail: the cool-grey canvas `#f6f7f8` with white cards and the generic blue `#2459b8`; hierarchy carried entirely by `border + shadow-1` so every surface read as a floating tile; `system-ui` everywhere with figures distinguished only by `tabular-nums`; and no motion at all. Secondary tells: tracked all-caps sidebar group headings, a dashed `.empty-state`, and identical icon-card grids on the tool index.

**North Star replaced.** "Decision Agenda" is superseded by **"The Ledger"** — a bound professional record rather than a dashboard. Three new hard rules join the standing ones:

- **The Structural Hierarchy Rule.** Grouped content is bounded by a rule and separated by space. `--shadow-1` is now `none`, which retires elevation as a hierarchy device across all 27 route stylesheets at once; shadow is spent only on dialogs, popovers and the skip link. This supersedes the 2026-09-07 "visual layering" decision that had itself superseded the original Flat Surface Rule — the system returns to flat surfaces, but by a different argument: not minimalism, but because a ledger's structure is ruled, not stacked.
- **The Figure Rule.** Every figure the user must judge is set in the monospace cut at `0.95em` with tabular figures.
- The sidebar is one step recessed from the canvas in **both** themes; the first dark build had it lighter than the content, which inverted the light theme's mental model, and was corrected.

**Tokens moved to `apps/web/app/tokens.css`**, imported ahead of every other stylesheet. Colours are authored in OKLCH around one brand hue — ink blue-violet, hue 277 — with every neutral carrying 0.004–0.022 chroma of it. `--border`/`--border-strong` remain as aliases of `--rule`/`--rule-strong`. Radii tightened from 6/10px to a 2/4/8px family. A motion layer was added (120–260ms, exponential ease-out) covering hover, focus, selection, disclosure and overlay entry via `@starting-style`; there are still no entrance animations or page-load choreography. A semantic z-index scale replaced the arbitrary 1/2/5/6/20 values.

**Typeface.** IBM Plex Sans and IBM Plex Mono, self-hosted from `apps/web/public/fonts` under OFL-1.1, Latin subsets only (~59KB on the critical path, both preloaded). `unicode-range` leaves CJK on the platform faces, so zh-TW/zh-CN glyph selection is unchanged. The Latin subset deliberately includes U+2212 because `formatMarketValue` emits a true minus. As a side effect the intermediate weights already in the codebase (650, 680, 750) now render as authored instead of snapping.

**Accessibility.** Every text/background pair, control affordance and badge tint in both themes — including all three market-colour preferences — is verified by `scripts/check-design-contrast.mjs`, which reads `tokens.css` directly so the check cannot drift from what ships. 148 pairs pass at WCAG 2.1 (text 4.5:1, non-text UI 3:1). `--border-strong` is explicitly **not** a control-contrast token: it is a divider, and controls use `--control`, which is the only one of the three edges that reaches 3:1.

**Anti-pattern removals.** Side-stripe accents (`position-sizing`, `market-research`, and the markdown blockquote, which became a 1px rule plus indentation); the dashed `.empty-state` and the dashed partner-compare divider; tracked all-caps eyebrows in `public.css`, `partner-compare.css` and `trade-plan.css`; the scaffolding `Trade basic` eyebrow above the `/guide` and `/about` headings. The tool index became a ruled two-column list of rows instead of a grid of identical icon tiles, and the three home-page steps lost their boxes while keeping their `01/02/03` markers, which are legitimate because that section genuinely is an ordered sequence. The calendar's holiday hatching was kept — it encodes "not a trading day" without relying on colour — and only its contrast was raised.

**Brand.** The monogram tile moved from `#2459b8` to the new action ink `#4549a7` across `favicon.svg` and the four PWA SVGs; the PNG icons are now generated from those sources by `scripts/render-icons.mjs`, with `apple-touch-icon.png` taken from the full-bleed maskable source because iOS composites it opaque. The manifest and `meta[name=theme-color]` moved to the new canvas `#f9fafd`, and the early head script now resolves the theme colour before first paint instead of leaving it to hydration.

Verification: typecheck, lint and the web build pass; 1026 unit tests pass; the full Playwright suite was run before and after and compared against a stashed baseline. One real regression was found and fixed (`repeat(auto-fill, minmax(420px, 1fr))` on the tool list overflowed a 390px viewport; guarded with `minmax(min(420px, 100%), 1fr)`). Eight failures in `company-market`, `portfolio`, `portfolio-exposure` and `trade-plans` were confirmed pre-existing by running the same specs on the unmodified tree, and are untouched by this work.

## 2026-10-01 — Market color preference, danger buttons, language font stacks, skeleton

- **Market color convention preference.** New user preference (localStorage `diary-market-color`, applied in the head script like `diary-theme`): `standard` (green up / red down, default), `cn` (red up / green down), `cb` (colorblind-safe blue/orange). Implemented as CSS variable overrides on `[data-market-color]`; sign characters (`+`/`−`) from `formatMarketValue` remain the primary direction signal, so color never carries direction alone.
- **Danger button promoted.** The `.danger-button` style moved from `diary-editor.css` to the shared stylesheet and is applied to delete actions (diary delete dialog, achievements, admin accounts, admin blog, ETF catalog, diary saved views). Every destructive action keeps its explicit consequence text and confirmation step.
- **Per-language font stacks.** `html[lang="zh-CN"]` now selects Simplified-Chinese glyphs (PingFang SC, Microsoft YaHei, Noto Sans CJK SC); `html[lang="en"]` drops CJK families. The default stack remains Traditional-Chinese-first for zh-TW.
- **Skeleton loading.** Shared `.skeleton` pulsing placeholder plus a `LoadingBlock` component; applied to holdings, timeline, and achievements initial loads. Loading is no longer text-only for list/table surfaces.
- Known gaps deliberately deferred: signed-in market-color sync to account settings, skeleton coverage beyond the three pages above, a shared quiet-button variant.

## 2026-09-07 — Visual layering supersedes the Flat Surface Rule

The user approved a visual upgrade with more layering and product polish. The former **Flat Surface Rule** (no shadows anywhere) and the 4px/8px radius record were superseded by the `shadow-1`/`shadow-2` tokens, the `--radius-control` (6px) / `--radius-card` (10px) / `--radius-pill` tokens, and raised card surfaces. Everything else in the earlier record that was not restated remained in force: semantic theme swapping, financial color isolation, gutter ownership, and reading-density rules.

Same date: the external product name became **Trade basic** (strict casing), replacing the former `diary-v3` wordmark in user-facing surfaces only. Repo, package, database, env, storage keys, auth cookies, and historical documents kept their names.

## Decision Agenda (North Star) — provenance

"Decision Agenda" is the direction name the agent adopted under the user's delegated design authority, not a confirmed external brand commitment. It describes the intent — neutral gray canvas, white surfaces, graphite text organizing dates, judgments, and later reflections — and remains a working name until the user confirms or replaces it.

## Earlier records and standing caveats

- The original records are superseded piecewise by DESIGN.md; where an earlier record says something DESIGN.md no longer states, DESIGN.md wins.
- The design deck's "all inputs 16px" claim was never the implementation — record the working sizes (44px minimum control height, `.75rem`→13px small text floor) instead of the deck's claim.
- Documentation-only refreshes (for example the 2026-09-27 navigation review) change documentation, not visual implementation; a review date is not a runtime verification claim.
- Route-boundary fallback text (bilingual Chinese/English) and the fixed table Symbol header are known partial i18n, not full trilingual coverage.
