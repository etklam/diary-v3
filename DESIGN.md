---
name: diary-v3
description: "The Ledger: an ink-on-paper visual system and responsive layout rules for the investment decision diary web app"
tokenSource: apps/web/app/tokens.css
colors:
  canvas: "oklch(.985 .004 277)"
  surface: "oklch(1 0 0)"
  surface-sunken: "oklch(.968 .006 277)"
  surface-raised: "oklch(1 0 0)"
  muted-surface: "oklch(.957 .008 277)"
  text: "oklch(.265 .022 277)"
  muted: "oklch(.505 .022 277)"
  faint: "oklch(.62 .018 277)"
  rule: "oklch(.905 .008 277)"
  rule-strong: "oklch(.815 .012 277)"
  control: "oklch(.655 .016 277)"
  action: "oklch(.455 .148 277)"
  action-hover: "oklch(.4 .148 277)"
  action-strong: "oklch(.355 .14 277)"
  on-action: "oklch(.99 .004 277)"
  action-tint: "oklch(.455 .148 277 / .09)"
  selected: "oklch(.455 .148 277 / .11)"
  focus: "oklch(.455 .148 277)"
  focus-halo: "oklch(.455 .148 277 / .16)"
  negative: "oklch(.505 .175 25)"
  danger: "oklch(.505 .175 25)"
  negative-tint: "oklch(.505 .175 25 / .08)"
  backdrop: "oklch(.2 .02 277 / .5)"
  tint-info: "oklch(.455 .148 277 / .12)"
  tint-info-text: "oklch(.42 .12 255)"
  tint-warn: "oklch(.52 .115 75 / .16)"
  tint-warn-text: "oklch(.455 .095 70)"
  tint-neutral: "oklch(.505 .022 277 / .12)"
  market-up: "oklch(.5 .125 150)"
  market-down: "oklch(.515 .175 25)"
  market-flat: "oklch(.525 .016 277)"
  market-up-cn: "oklch(.515 .175 25)"
  market-down-cn: "oklch(.5 .125 150)"
  market-up-cb: "oklch(.47 .15 235)"
  market-down-cb: "oklch(.52 .135 55)"
  series-1: "oklch(.5 .11 215)"
  series-2: "oklch(.5 .15 320)"
  series-3: "oklch(.52 .115 75)"
  dark-canvas: "oklch(.185 .013 277)"
  dark-surface: "oklch(.232 .015 277)"
  dark-surface-sunken: "oklch(.205 .013 277)"
  dark-surface-raised: "oklch(.26 .016 277)"
  dark-muted-surface: "oklch(.158 .012 277)"
  dark-text: "oklch(.935 .008 277)"
  dark-muted: "oklch(.735 .016 277)"
  dark-faint: "oklch(.6 .015 277)"
  dark-rule: "oklch(.335 .017 277)"
  dark-rule-strong: "oklch(.44 .02 277)"
  dark-control: "oklch(.555 .02 277)"
  dark-action: "oklch(.785 .115 283)"
  dark-action-hover: "oklch(.845 .09 283)"
  dark-action-strong: "oklch(.865 .085 283)"
  dark-on-action: "oklch(.21 .06 280)"
  dark-negative: "oklch(.745 .14 25)"
  dark-danger: "oklch(.745 .14 25)"
  dark-backdrop: "oklch(.1 .01 277 / .66)"
  dark-market-up: "oklch(.8 .15 155)"
  dark-market-down: "oklch(.745 .14 25)"
  dark-market-flat: "oklch(.72 .014 277)"
  dark-market-up-cb: "oklch(.78 .11 243)"
  dark-market-down-cb: "oklch(.79 .12 62)"
  dark-series-1: "oklch(.76 .105 215)"
  dark-series-2: "oklch(.76 .12 320)"
  dark-series-3: "oklch(.82 .11 80)"
typography:
  fontFamilySans: "'IBM Plex Sans Web', system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang TC\", \"Microsoft JhengHei\", sans-serif"
  fontFamilyMono: "'IBM Plex Mono Web', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
  fontFamilyZhCn: "'IBM Plex Sans Web', system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang SC\", \"Hiragino Sans GB\", \"Microsoft YaHei\", \"Noto Sans CJK SC\", sans-serif"
  fontFamilySerif: "Georgia, \"Times New Roman\", \"Songti TC\", \"Noto Serif TC\", \"Noto Serif CJK TC\", SimSun, serif"
  scale: { 2xs: ".75rem", xs: ".8125rem", sm: ".875rem", base: "1rem", lg: "1.125rem", xl: "1.3125rem", 2xl: "1.5rem", 3xl: "1.875rem" }
  leading: { tight: 1.25, snug: 1.4, normal: 1.6, relaxed: 1.85 }
  weight: { normal: 400, medium: 500, semibold: 600, bold: 680 }
  tracking: { title: "-.015em", figure: "-.01em" }
  figure: { fontFamily: "{typography.fontFamilyMono}", fontSize: ".95em", fontVariantNumeric: "tabular-nums" }
rounded:
  inset: "2px"
  control: "4px"
  card: "8px"
  pill: "999px"
shadows:
  shadow-1: "none"
  shadow-pop: "0 1px 2px oklch(.265 .022 277 / .07), 0 6px 12px oklch(.265 .022 277 / .09)"
  shadow-sticky: "0 1px 0 oklch(.265 .022 277 / .07)"
  dark-shadow-pop: "0 1px 2px oklch(.12 .01 277 / .5), 0 6px 12px oklch(.12 .01 277 / .45)"
spacing:
  space-1: "4px"
  space-2: "8px"
  space-3: "12px"
  space-4: "16px"
  space-5: "20px"
  space-6: "24px"
  space-7: "28px"
  space-8: "32px"
  space-10: "40px"
  space-12: "56px"
  section-gap: "24px"
  page-gutter-mobile: "16px"
  page-gutter-tablet: "24px"
  page-gutter-desktop: "32px"
breakpoints:
  mobile-max: "767px"
  tablet: "768px"
  public-compact: "1024px"
  sidebar-narrow: "1099px"
  wide-gutter: "1200px"
  data-page-max: "1280px"
motion:
  dur-1: "120ms"
  dur-2: "180ms"
  dur-3: "260ms"
  ease-out: "cubic-bezier(.16, 1, .3, 1)"
  ease-in-out: "cubic-bezier(.65, 0, .35, 1)"
  skeleton-pulse: "1.4s {motion.ease-in-out} infinite alternate"
  entrance-animations: "none"
  overlay-entry: "opacity + 4px rise over {motion.dur-2}, via @starting-style"
zIndex:
  z-base: 1
  z-sticky: 100
  z-nav: 200
  z-dropdown: 300
  z-overlay: 400
  z-toast: 500
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.on-action}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    hover: "{colors.action-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.control}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.action}"
    hover: "{colors.action-tint}"
  button-danger:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.danger}"
    borderColor: "{colors.negative}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  input:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.control}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
    focus: "border {colors.action} + 3px {colors.focus-halo} ring"
  panel:
    border: "none"
    headerRule: "1px solid {colors.rule}"
  ledger-row:
    columns: "label / figure"
    separator: "1px solid {colors.rule}"
    figureFont: "{typography.fontFamilyMono}"
  skeleton:
    backgroundColor: "{colors.tint-neutral}"
    rounded: "{rounded.inset}"
    pulse: "{motion.skeleton-pulse}"
---
# Design System: Trade basic

[PRODUCT.md](PRODUCT.md) defines product boundaries; the [documentation index](docs/README.md) separates current guidance from dated design evidence, and [docs/design/CHANGELOG.md](docs/design/CHANGELOG.md) records superseded decisions and provenance. This document states only the rules currently in force, verified against `apps/web/app/tokens.css`, `styles.css`, `public.css`, and the existing React components.

## Principles

**North Star: "The Ledger."** This product's subject matter is a dated record of judgments and the figures attached to them. The interface is built like a bound professional record — ruled, aligned, and legible — not like a dashboard. Hierarchy comes from hairlines, alignment and the treatment of figures; it never comes from tiles floating over a grey canvas.

Hard rules that follow from it:

1. **The Structural Hierarchy Rule.** Grouped content is bounded by a rule and separated by space. `--shadow-1` is `none`: no panel, toolbar, table, card or navigation item is lifted off the page. Shadow is spent only on surfaces that genuinely sit above it — dialogs, popovers, the skip link.
2. **The Figure Rule.** Every number the user is asked to judge — amount, price, quantity, percentage, ticker, date, timestamp, identifier — is set in the monospace cut at `0.95em` with tabular figures. Prose and labels are never monospace.
3. **The Semantic Theme Rule.** Light and dark swap semantic roles; components never invert the whole page. The sidebar is one step recessed from the canvas in both themes — deeper in light, darker in dark.
4. **Financial color isolation.** Green and red are reserved for market direction. Financial colors are never drawn from locale, market, brand/action or status roles, and never used as decoration.
5. **Reading and working density stay separate.** Reading surfaces keep the 1.85 line height and a bounded measure; working surfaces keep compact controls and tabular figures.

## Tokens

All tokens live in [`apps/web/app/tokens.css`](apps/web/app/tokens.css), which is imported before every other stylesheet. `styles.css` and the 27 route stylesheets consume these roles and do not hard-code a colour, radius, duration or type size.

### Color

Colours are authored in OKLCH around one brand hue — **ink blue-violet, hue 277**. Every neutral carries 0.004–0.022 chroma of that hue, so the page reads as paper with ink in it rather than as a default cool grey. Every text/background pair and every control affordance in both themes is verified against WCAG 2.1 by `scripts/check-design-contrast.mjs`, which reads `tokens.css` directly: body text ≥ 4.5:1, non-text UI ≥ 3:1. Badge tints are checked flattened over the surfaces they actually sit on, and every market-colour preference is checked in both themes.

- **Surfaces and text:** `canvas` (page), `surface` (bounded regions, forms, dialogs), `surface-sunken` (table headers, toolbars, wells, empty states), `surface-raised` (overlays), `muted-surface` (sidebar, context panels); `text`/`muted`/`faint`. `faint` is for disabled and decorative use only and never carries prose.
- **Structure:** `rule` is the hairline the system is built on; `rule-strong` divides major regions and closes a total; `control` is the input and secondary-button edge and is the only one of the three that meets 3:1.
- **Interaction:** `action` is the ink blue-violet used for primary buttons, links, current selection and focus; `action-hover`/`action-strong` are its explicit states — hover is never a `brightness()` filter. `on-action` keeps button text legible; `action-tint` and `selected` are its low-alpha fills.
- **Status:** `negative` covers error text and invalid field borders; `danger` shares the value. `tint-info`/`tint-warn`/`tint-neutral` (with `-text` pairs) back badges and category marks — never market direction. A warm tint at badge size is amber; at full-bleed slab size it reads as beige, so warn tints never fill a whole region.
- **Financial:** `market-up`, `market-down`, `market-flat`. Missing quotes are never shown as 0.
- **Charts:** `series-1`/`series-2`/`series-3` are teal, magenta and amber — no green and no red, so a series can never read as gain or loss, and none of them collides with the ink action colour.

`--border` and `--border-strong` remain as aliases of `rule`/`rule-strong` for the route stylesheets.

### Market color convention (user preference)

`formatMarketValue` always renders an explicit `+`/`−` sign, so color never carries direction alone. On top of that, users choose a convention (localStorage `diary-market-color`, applied early in `head` like the theme; `PreferencesControls` in `root.tsx`):

| Preference | `--market-up` / `--market-down` | Use |
| --- | --- | --- |
| `standard` (default) | green / red | International convention |
| `cn` | red / green | 紅漲綠跌 convention |
| `cb` | blue / orange | Colorblind-safe |

The `cb` blue sits at hue 235, held clear of the ink action hue so a colour-blind reader never confuses a rising figure with a link. The preference overrides the variables on `[data-market-color]` in both themes; every `.market-up`/`.market-down` consumer follows automatically.

### Typography

**IBM Plex Sans** carries text and **IBM Plex Mono** carries figures. Both are self-hosted from `apps/web/public/fonts` under OFL-1.1 (`LICENSE-IBM-Plex.txt`); only the Latin subsets ship, about 59KB on the critical path (`plex-sans-latin-var.woff2` + `plex-mono-latin-400.woff2`, both preloaded in `root.tsx`). The Latin face leads each stack and `unicode-range` hands CJK to the platform faces, so `html[lang="zh-CN"]` still gets SC glyph forms and `html[lang="en"]` drops the CJK families. Because the sans is a variable font, the intermediate weights in the codebase (650, 680, 750) now render as authored instead of snapping. `--font-serif` exists for the trade-plan note surfaces only.

The scale is fixed rem at roughly a 1.15–1.2 ratio: 13px is the small-text floor and 12px is reserved for badges. Headings are weight 600 and use `text-wrap: balance`; prose uses `text-wrap: pretty` and caps at 72ch. Tracking never goes below -0.02em. Reading body uses 1.85 line height, preserves line breaks, and is capped at 72ch; the textarea uses 1.7 and is vertically resizable.

Per the Figure Rule, `.num`, `.figure`, `time`, `kbd`, `code`, `.stat-value`, `.ledger-row` figures and the native numeric/date inputs all take the mono cut. A Markdown table cell holding nothing but a figure takes it too, detected in `markdown.tsx`, so an authored price column aligns like a ledger column without the author marking it up.

### Space, radius, elevation, motion

Spacing uses `space-1`–`space-12`; the page gutter is owned by main content (16/24/32px — see Layout). Radii are a crisp 4px family: 2px inset, 4px controls, 8px cards/panels/dialogs, pill for badges and allocation bars; the mobile full-viewport dialog has neither border nor radius.

Elevation is structural. `shadow-1` is `none`; `shadow-pop` (≤ 12px blur) belongs to dialogs, popovers and the skip link; `shadow-sticky` is a 1px edge for sticky chrome. Nothing lifts on hover.

Motion is state feedback only, at 120–260ms on an exponential ease-out: hover and focus on controls and navigation, the disclosure chevron, the selection fill, the skeleton pulse, and overlay entry (a fade plus a 4px rise via `@starting-style`). There are no entrance animations and no page-load choreography. `prefers-reduced-motion: reduce` collapses every duration to 1ms and stops the skeleton pulse.

Stacking order is a semantic scale — `z-base`, `z-sticky`, `z-nav`, `z-dropdown`, `z-overlay`, `z-toast`. No arbitrary values.

## Layout

Desktop shell: 216px sticky sidebar (180px below 1099px) + main content. Main content owns the page gutter: 16px phones, 24px tablets, 32px at 1200px+. Data pages cap at 1280px; reading and editor pages use ~880px or 72ch; the two-column preview collapses below 1099px.

Sidebar navigation is grouped by a hairline above each group plus a sentence-case muted label — not a tracked all-caps eyebrow. Every item uses the single `icons.tsx` family (24px grid, 1.7 stroke, `currentColor`). The current item is marked by the ink selection fill with the label and icon in the action colour, in the same box and the same padding as an inactive item, so the states do not reflow. Below 768px the sidebar becomes a sticky top app bar (safe-area aware) plus a fixed four-column bottom bar: Diary library, Timeline, Calendar, Write diary. The drawer (Menu dialog) carries the remaining links, Quick Diary, and labeled preference selects; it reuses the private menu test ids so preference helpers work in both shells.

Public shell: sticky single-row surface header (brand + wordmark, nav, compact preference selects, session actions) and a shared footer with real links only. Below 1024px it switches to compact mode — brand, Sign in, Menu trigger — and moves everything else into an accessible drawer dialog; the row never wraps. Tools use the public shell for guests and the workspace shell for signed-in people; `/tools` and `/tools/*` always render inside the 1280px wrapper.

Wide tables live in named, bordered, rounded scroll regions with page-specific minimum widths; the page itself never widens to fit a table.

## Components

### Buttons

Primary buttons are solid action with an explicit `action-hover` and `action-strong` active state. Secondary are surface with a `control` border — the only border value that meets 3:1 — and no shadow. Quiet (`.quiet-button`) is transparent with action text and an `action-tint` hover, for row-level controls that must not compete. Danger (`.danger-button`) is surface with a negative border and negative text, reserved for delete/archive actions that name their consequence and pair with a confirmation. All buttons: 44px minimum height (`.button-compact` 36px for toolbars), 14px text at weight 600, 1.4 line height, inline icon slot with 8px gap. Disabled is .5 opacity with a waiting cursor, because buttons here are disabled while a submit is in flight rather than to signal invalid input. Focus: 2px outline with 2px offset.

### Fields

Visible label, `control` border, surface background, 44px minimum height; placeholders at `muted` because a placeholder is text and carries the same 4.5:1 requirement as body copy. Focus draws the action border plus a 3px `focus-halo` ring. Disabled fields drop to the sunken surface with a not-allowed cursor. Errors show a negative border plus `aria-invalid` and a negative focus ring, with descriptions and error summaries linked via `aria-describedby`. Failed forms keep their content; the error summary is focusable and shows translated messages with a selectable requestId. In-progress states disable submit; success uses `role=status`.

### Panels, cards, ledger rows and stats

`.panel` is the default way to group content: a heading with a rule under it and content below, flush on the canvas — no box, no shadow. `.card` (surface, hairline, 8px radius, no shadow) is for a form, a dialog body, or content that genuinely needs an edge; a card nested inside a card degrades to a plain block, because nested cards are always wrong. `.section-head` keeps title, icon and "view all" on one baseline.

`.ledger`/`.ledger-row` is the core idiom for amounts: a muted label, a right-aligned monospace figure, a hairline between rows, and `.ledger-row-total` closing the column with a heavier rule. Prefer it to a row of stat tiles. `.stat` pairs a muted 13px label with a 21px monospace figure and is legitimate for a single headline number; four of them side by side is the hero-metric template, not a design.

`.badge` variants: neutral tint for categories, `info` for informational status, `warn` for needs-attention, and `up`/`down` strictly for financial direction — the direction variants stay unfilled and monospace, because the market palette is never a fill. `.empty-state` is a quiet sunken well that names the next action; it is not a dashed outline, since nothing there is a drop target.

### Skeleton loading

`.skeleton` is a pulsing neutral-tint block; `.skeleton-line`/`.skeleton-list` stand in for list and table rows at roughly final size, so layout does not jump. The `LoadingBlock` component pairs the blocks (aria-hidden) with `role="status"` text for assistive tech. Use it for initial loads of list and table surfaces; keep text-only status for in-place refreshes.

### Navigation and focus

Overview, then Diary & review, Investing & trading, Markets & tools groups; Diary management and Trade management hold their reminders/preferences; Account and Administration follow `apps/web/app/nav.tsx`. Each current route uses `aria-current="page"` and the ink selection treatment. The skip link appears on focus; a pathname change moves focus to main; main has a 4px inset keyboard outline. Plain links and native disclosures keep the browser keyboard model — no application-menu roles.

### Dialogs

Dialogs carry a hairline, an 8px radius and `shadow-pop`, and enter with a fade plus a 4px rise via `@starting-style`; the backdrop fades with them and uses the shared `--backdrop` scrim. The Quick Diary dialog is `min(680px, calc(100% - 32px))` on desktop, at most `calc(100dvh - 48px)` tall, 24px padding; full viewport on mobile with no border, no radius, no entry offset, and the footer stuck to the bottom edge (safe-area aware). On `/diaries/quick` the submit button is sticky above the bottom bar in its own slot. Opening moves focus to the textarea; Escape closes and restores focus. Delete confirmations use the small `.delete-dialog` pattern: name the consequence, cancel is autoFocus, confirm is the danger button.

## Patterns

- **Loading:** skeleton for list/table initial loads (see Components); text status for refreshes; forms keep content and disable submit.
- **Empty vs failure:** a successfully empty dataset gets one starting point (e.g. Start recording / Explore tools); resource failures stay distinct from empty data with scoped retry controls.
- **Destructive actions:** danger button + explicit consequence copy + confirmation dialog; the mobile admin layout keeps the destructive action on its own row.
- **Missing data:** missing quotes, unknown metadata, and stale values are labeled in text; never shown as 0. Synthetic content (preview, hero) is labeled "Interface illustration" / 合成資料 in a neutral sunken notice.
- **Preferences:** locale (zh-TW/zh-CN/en), theme (light/dark/system), and market colors render from one `PreferencesControls` component — labeled in full mode, `aria-label` selects in compact mode, `mobile-*-select` test ids in the drawer. Guest preferences stay in localStorage; signed-in locale syncs to account settings (with retry when loading fails); theme and market colors stay local. The early `head` script applies the stored theme and market colour and sets `meta[name=theme-color]` to the resolved canvas before first paint; locale updates `html.lang`.

## Data and finance

Signed values come from `formatMarketValue` (always `+`/`−`, exact string decimals preserved from API projections; `—` for unknown). The Latin font subset deliberately includes U+2212 so the true minus renders in the self-hosted face. Money and quantities in tables use the mono cut with `tabular-nums` and keep their container-scoped scroll. Series colors never imply direction; the position-sizing total is closed by a heavier rule — the accounting convention — above a real ratio allocation bar. Company pages separate current views from follow-up evidence; Review separates the original judgment from later reflection (original → retrospective order).

## Content and i18n

Main interface copy uses full translation keys in zh-TW/zh-CN/en. The route boundary renders outside the UI provider, so it resolves the stored preference after mount and starts from the document language; its 404 and failure states carry separate copy and separate actions (reload, back, home). Known partial coverage: the table Symbol header is fixed text, and search/share metadata (`route-meta.ts`, article `meta`) stays English. Trade times state the device IANA timezone; ambiguous DST times require an explicit UTC instant choice and nonexistent local times are rejected. Amounts stay as string inputs and are stored to two decimals.

## Page recipes

Each page follows the tokens/components above plus its scoped brief; acceptance lives beside each record.

- **Overview:** reading order is at most five current actions, three recent diaries, compact portfolio/watchlist context, then links to other destinations — context never competes in a right rail. `docs/design/daily-workspace-brief.md`, `docs/design/daily-workspace-acceptance.md`.
- **Diary library (`/diaries`):** filter bar, dates, title links, plain-text excerpts, tags in a flat list; URL preserves filters/pagination; applying a filter resets the page; focus moves to the results heading after paging. `docs/design/diary-list-finish-review.md`.
- **Diary reading/editing:** date precedes title on reading pages; body keeps 72ch and original line breaks; body is safe Markdown/GFM (raw HTML rejected, unsafe URLs stripped). Blockquotes are a 1px rule plus indentation, not a coloured stripe. The editor offers preview, tags, thesis/risk/execution fields, and a footer separating save status from actions.
- **Rendered Markdown (`.safe-markdown`, shared by diary, articles, notes, research and previews):** only links and code may break inside a word, so an ordinary word never splits mid-word. Tables are the same bordered, rounded scroll region as `.table-scroll`: columns size to their content and the region scrolls, rather than the table being squeezed into the measure, with a 32ch cap so a long note wraps at a readable width. Code blocks are a sunken well and, like the table region, are keyboard-focusable because they scroll. An image keeps its natural size — bounded, never stretched to fill the measure.
- **BUY entries and holdings:** trade groups add/remove in the diary form; quantity and price stay decimal strings. `/stocks` uses a four-column cost holdings table. `docs/design/buy-finish-review.md`.
- **Timeline and Calendar:** month groups with dates/titles/excerpts and native Markdown disclosure; civil-date month grid with activity markers and a keyboard-moveable 371-day heatmap; market holidays are hatched, which encodes "not a trading day" without relying on colour; holiday coverage shows "not computed" on failure. `docs/design/timeline-finish-review.md`, `docs/design/calendar-finish-review.md`.
- **Company market view (`/stocks/:symbol`):** definition-list quote (three columns desktop, two mobile), keyboard-operable history table capped at 50 rows/page, independent loading/failure/retry per section, native select for range. `docs/design/market-finish-review.md`.
- **Tools:** the index is a **ruled list, not a tile grid** — each tool is one row carrying its icon as a mark, its name and action on the first line and its purpose below, in two columns of rows on wide screens, grouped under calculators then research. Shared `ToolShell` breadcrumb header fed by the single tool registry in `tool-shell.tsx`; calculators keep left inputs / right results on desktop and stack on mobile. Public calculations stay interactive for guests; private actions are secondary ("Sign in to save") and preserve inputs. `docs/design/tools-access-matrix.md` via docs index.
- **Articles:** article editor states (Draft/Published/Archived) expose one filled primary action per state plus the stated separate action; native PUBLIC/MEMBER select defines post-publication access; public reading shell for all roles; locked MEMBER readers see the teaser and sign-in actions. Reading typography: 1rem/1.85, 72ch.
- **Personal achievements:** 800px bounded page, newest-first chronology, one filled primary action that flips Add/Save, focus moved to the date field on open and back to Add on close. `docs/design/personal-achievements-brief.md`.
- **Account security and FIRE:** two-section security page; FIRE assumptions/results in two columns (one below 850px), numbers in tables, projection in its own focusable scroll region. `docs/design/security-fire-finish-review.md`.
- **Settings:** fieldset/legend separates personal preferences from investment targets; timezone has common options plus an explicit use-device-timezone action, submitted only on save. Evidence: `docs/design/evidence/settings/`.
- **Public home:** one hero with the product descriptor, the headline, and a single labelled interface preview (the one place a card is correct); the tool list; a three-step sequence whose `01/02/03` markers are kept because the section genuinely is an ordered flow, each step separated by a rule rather than boxed. No eyebrow above other sections.
- **Brand and public navbar:** the mark is one geometric monogram (white T/b on the action tile) shared by `BrandMark`, favicon, and the PWA icon set (separate `any`/`maskable` entries); the wordmark is real text — `<strong>Trade</strong> basic` at weight 750/500, which the variable face now renders exactly. Desktop navbar ~72px (64px compact) with centered nav, chevron-disclosed tool shortcuts from the shared registry, and Create account as the only filled action. No arrows, candlesticks, or market-direction colors in the brand; static favicons and the PWA PNGs pin the light action ink `#4549a7`, and the manifest and `meta[name=theme-color]` pin the light canvas `#f9fafd`. The PNG icons are rendered from the SVG sources by `scripts/render-icons.mjs`; `apple-touch-icon.png` comes from the full-bleed maskable source because iOS composites it opaque.

## Do's and Don'ts

**Do:**

- Keep the semantic theme roles and visible focus outlines.
- Set every figure the user must judge in the mono cut; keep signs (`+`/`−`) on all market values.
- Group content with a rule and space (`.panel`, `.ledger`) before reaching for a bounded `.card`.
- Label missing quotes, errors, and synthetic content with text.
- Preserve the reading order of original judgment, date, and later reflection.
- Confine wide tables to their own scroll regions and let text wrap on narrow screens.
- Use the danger button for every destructive action, with consequence copy and a confirmation.

**Don't:**

- Don't give a panel, card, toolbar, table or navigation item a shadow; `--shadow-1` is `none` and must stay that way.
- Don't build a grid of identical icon-and-heading tiles. A list of things is a ruled list.
- Don't use a coloured stripe down one side of a card, callout or list item.
- Don't put a tracked all-caps eyebrow above a section; the rule and a sentence-case label do that work.
- Don't fill a full-width region with a warm low-alpha tint — at that size it reads as beige paper, which is the default this system exists to avoid.
- Don't replace status text with color alone — including market direction under any color-convention preference.
- Don't show missing quotes as 0 or present unlabeled sample data as real.
- Don't claim unimplemented interactions from preview templates or the deck as finished features.
- Don't add entrance animations, page-load choreography, or hover lift.
