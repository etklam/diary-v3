# Design changelog

Dated design decisions, supersessions, and provenance notes. DESIGN.md states only the rules currently in force; this file records how they got there and what they replaced. Entries are additive — do not rewrite or delete recorded decisions.

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
