---
name: diary-v3
description: Neutral visual system and responsive layout rules for the investment decision diary web app
colors:
  canvas: "#f6f7f8"
  surface: "#fff"
  surface-raised: "#fff"
  muted-surface: "#eef0f2"
  text: "#20242a"
  muted: "#59616c"
  border: "#d5d9df"
  border-strong: "#b9c0c9"
  control: "#7b8491"
  action: "#2459b8"
  action-strong: "#1d4a9c"
  on-action: "#fff"
  selected: "#e5e8ed"
  negative: "#b62e3c"
  danger: "#b62e3c"
  focus: "#2459b8"
  tint-info: "rgb(79 117 194 / 0.12)"
  tint-info-text: "#2c4f92"
  tint-warn: "rgb(162 112 31 / 0.13)"
  tint-warn-text: "#7a5312"
  tint-neutral: "rgb(89 97 108 / 0.1)"
  market-up: "#167044"
  market-down: "#b62e3c"
  market-flat: "#59616c"
  market-up-cn: "#b62e3c"
  market-down-cn: "#167044"
  market-up-cb: "#1a5fb8"
  market-down-cb: "#8f4a0d"
  series-1: "#4f75c2"
  series-2: "#785ca8"
  series-3: "#a2701f"
  dark-canvas: "#17191d"
  dark-surface: "#202329"
  dark-surface-raised: "#24282f"
  dark-muted-surface: "#292d34"
  dark-text: "#edf0f4"
  dark-muted: "#b1b8c3"
  dark-border: "#454c57"
  dark-border-strong: "#5a626e"
  dark-control: "#858f9e"
  dark-action: "#9bbcff"
  dark-action-strong: "#bcd4ff"
  dark-on-action: "#10234a"
  dark-selected: "#343a44"
  dark-negative: "#ff939c"
  dark-danger: "#ff939c"
  dark-focus: "#9bbcff"
  dark-tint-info: "rgb(155 188 255 / 0.14)"
  dark-tint-info-text: "#b9d2ff"
  dark-tint-warn: "rgb(228 188 119 / 0.14)"
  dark-tint-warn-text: "#eccf9b"
  dark-tint-neutral: "rgb(177 184 195 / 0.14)"
  dark-market-up: "#70d49a"
  dark-market-down: "#ff939c"
  dark-market-flat: "#b1b8c3"
  dark-market-up-cn: "#ff939c"
  dark-market-down-cn: "#70d49a"
  dark-market-up-cb: "#9cc2ff"
  dark-market-down-cb: "#e8a35e"
  dark-series-1: "#9bbcff"
  dark-series-2: "#c1a7f0"
  dark-series-3: "#e4bc77"
typography:
  fontFamilyDefault: "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang TC\", \"Microsoft JhengHei\", sans-serif"
  fontFamilyZhCn: "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang SC\", \"Hiragino Sans GB\", \"Microsoft YaHei\", \"Noto Sans CJK SC\", sans-serif"
  fontFamilySerif: "Georgia, \"Times New Roman\", \"Songti TC\", \"Noto Serif TC\", \"Noto Serif CJK TC\", \"SimSun\", serif"
  headline: { fontSize: "1.5rem", fontWeight: 700, lineHeight: 1.35 }
  title: { fontSize: "1.125rem", fontWeight: 700, lineHeight: 1.4 }
  body: { fontSize: "1rem", fontWeight: 400, lineHeight: 1.65 }
  label: { fontSize: ".875rem", fontWeight: 600, lineHeight: 1.65 }
  reading: { fontSize: "1rem", fontWeight: 400, lineHeight: 1.85 }
  figure: { fontVariantNumeric: "tabular-nums" }
rounded:
  control: "6px"
  card: "10px"
  pill: "999px"
  container: "8px"
shadows:
  shadow-1: "0 1px 2px rgb(18 22 30 / 0.05)"
  shadow-2: "0 1px 2px rgb(18 22 30 / 0.05), 0 4px 14px rgb(18 22 30 / 0.06)"
  dark-shadow-1: "0 1px 2px rgb(0 0 0 / 0.35)"
  dark-shadow-2: "0 1px 2px rgb(0 0 0 / 0.35), 0 4px 14px rgb(0 0 0 / 0.3)"
spacing:
  space-1: "4px"
  space-2: "8px"
  space-3: "12px"
  space-4: "16px"
  space-5: "20px"
  space-6: "24px"
  space-7: "28px"
  space-8: "32px"
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
  hover-transition: "~150ms ease"
  skeleton-pulse: "1.2s ease-in-out infinite alternate"
  entrance-animations: "none"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.on-action}"
    rounded: "{rounded.control}"
    padding: "9px 18px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "9px 18px"
  button-danger:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.danger}"
    borderColor: "{colors.negative}"
    rounded: "{rounded.control}"
    padding: "9px 18px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
  skeleton:
    backgroundColor: "{colors.muted-surface}"
    rounded: "{rounded.control}"
    pulse: "{motion.skeleton-pulse}"
---
# Design System: Trade basic

[PRODUCT.md](PRODUCT.md) defines product boundaries; the [documentation index](docs/README.md) separates current guidance from dated design evidence, and [docs/design/CHANGELOG.md](docs/design/CHANGELOG.md) records superseded decisions and provenance. This document states only the rules currently in force, verified against `apps/web/app/styles.css`, `public.css`, and the existing React components.

## Principles

**North Star: "Decision Agenda."** The neutral gray canvas, white surfaces, and graphite text organize dates, judgments, and later reflections. The main workspace builds order through headings, dividers, and whitespace; the diary reading area lowers density so the original text stays reviewable.

Hard rules that follow from it:

1. **The Semantic Theme Rule.** Light and dark themes swap semantic roles; components never invert the whole page.
2. **Financial color isolation.** Green and red are reserved for market direction. Financial colors are never selected from locale, market, or brand/action roles, and never used as page decoration.
3. **Reading and working density stay separate.** Reading surfaces keep wide line height and a bounded measure; working surfaces keep compact controls and tabular figures.

## Tokens

### Color

- **Surfaces and text:** `canvas` (page background), `surface` (cards, forms, dialogs), `surface-raised` (hover-raised cards), `muted-surface` (sidebar, research context), `text`/`muted`, `border`/`border-strong`/`control`. Theme backgrounds stay neutral in both modes.
- **Interaction:** `action` is the restrained blue for primary buttons, links, and focus; `on-action` keeps button text legible; `selected` backs the current nav item; `focus` marks keyboard focus.
- **Status:** `negative` covers error text and invalid field borders; `danger` shares the value and backs destructive buttons. `tint-info`/`tint-warn`/`tint-neutral` (with `-text` pairs) back badges and category marks — never market direction.
- **Financial:** `market-up` (positive movement/profit), `market-down` (negative/loss), `market-flat` (zero or unknown). Missing quotes are never shown as 0.
- **Charts:** `series-1`/`series-2`/`series-3` do not imply gain or loss.

The dark theme swaps the same CSS roles for the corresponding `dark-*` values; they are alternative themes, not extra brand colors.

### Market color convention (user preference)

`formatMarketValue` always renders an explicit `+`/`−` sign, so color never carries direction alone. On top of that, users choose a convention (localStorage `diary-market-color`, applied early in `head` like the theme; `PreferencesControls` in `root.tsx`):

| Preference | `--market-up` / `--market-down` | Use |
| --- | --- | --- |
| `standard` (default) | green / red | International convention |
| `cn` | red / green | 紅漲綠跌 convention |
| `cb` | blue / orange | Colorblind-safe |

The preference overrides the variables on `[data-market-color]` in both themes; every `.market-up`/`.market-down` consumer follows automatically.

### Typography

One system sans-serif stack for the whole site — no decorative display typeface. `html[lang="zh-CN"]` switches to the Simplified-Chinese stack and `html[lang="en"]` drops CJK families, so readers see the correct glyph shapes. `--font-serif` exists for the trade-plan note surfaces only.

Page H1, H2, body, and labels use headline/title/body/label; H3 uses body size in bold. Headings carry no letter spacing. `time` uses tabular figures at secondary size; the small-text floor is 13px (`.8125rem`). Reading body uses the 1.85 line height, preserves line breaks, and is capped at 72ch; the textarea uses 1.7 and is vertically resizable. All numeric table content uses `tabular-nums` (`.num`, `time`, `.stat-value`).

### Space, radius, elevation, motion

Spacing uses `space-1`–`space-8`; the page gutter is owned by main content (16/24/32px — see Layout). Radii: 6px controls, 8px nested containers, 10px cards/panels/dialogs, pill for badges and allocation bars; the mobile full-viewport dialog has neither border nor radius.

Elevation is quiet: `shadow-1` on standard cards, tables, secondary buttons, and sticky shells; `shadow-2` reserved for the hero preview and card hover. Dark theme switches to higher-alpha black shadows. Contextual muted areas stay flat. Nothing lifts on hover except `.tool-card` (1px translate).

**The Layered Surface Rule.** Hierarchy comes from canvas → surface cards → muted context areas, hairline borders, and restrained shadows — never from large blurs, glows, or floating panels.

No entrance animations exist. The only motion is the tool-card hover transition and the skeleton pulse; reduced-motion rules disable transitions, animations, smooth scrolling, and the pulse.

## Layout

Desktop shell: 216px sticky sidebar (180px below 1099px) + main content. Main content owns the page gutter: 16px phones, 24px tablets, 32px at 1200px+. Data pages cap at 1280px; reading and editor pages use ~880px or 72ch; the two-column preview collapses below 1099px.

Sidebar navigation is grouped under small uppercase headings; every item uses the single `icons.tsx` family (24px grid, 1.7 stroke, `currentColor`). The active item is a raised surface pill with the icon in the action color. Below 768px the sidebar becomes a sticky top app bar (safe-area aware) plus a fixed four-column bottom bar: Diary library, Timeline, Calendar, Write diary. The drawer (Menu dialog) carries the remaining links, Quick Diary, and labeled preference selects; it reuses the private menu test ids so preference helpers work in both shells.

Public shell: sticky single-row surface header (brand + wordmark, nav, compact preference selects, session actions) and a shared footer with real links only. Below 1024px it switches to compact mode — brand, Sign in, Menu trigger — and moves everything else into an accessible drawer dialog; the row never wraps. Tools use the public shell for guests and the workspace shell for signed-in people; `/tools` and `/tools/*` always render inside the 1280px wrapper.

Wide tables live in named, bordered, rounded scroll regions with page-specific minimum widths; the page itself never widens to fit a table.

## Components

### Buttons

Primary buttons are solid action; secondary are surface with a strong border and `shadow-1`. Danger buttons (`.danger-button`) are surface with a negative border and negative text — reserved for delete/archive actions that name their consequence and pair with a confirmation. All buttons: 44px minimum height (`.button-compact` 36px for toolbars), 600 weight, 1.4 line height, inline icon slot with 8px gap. Hover dims primaries via brightness .94; disabled is .6 opacity with a waiting cursor. Focus: 2px outline with 3px offset.

### Fields

Visible label, control border, surface background, 44px minimum height; muted placeholders, action caret. Errors show a negative border plus `aria-invalid`, with descriptions and error summaries linked via `aria-describedby`. Failed forms keep their content; the error summary is focusable and shows translated messages with a selectable requestId. In-progress states disable submit; success uses `role=status`.

### Badges, cards, and stats

`.card` is the standard raised surface (surface, hairline border, 10px radius, `shadow-1`, 24px padding). `.section-head` keeps title, icon, and "view all" on one baseline. `.stat` pairs a muted label with a 22px tabular figure. `.badge` variants: neutral tint for categories, `info` for informational status, `warn` for needs-attention, `up`/`down` strictly for financial direction. `.empty-state` is a dashed-border quiet block.

### Skeleton loading

`.skeleton` is a pulsing muted block; `.skeleton-line`/`.skeleton-list` stand in for list and table rows at roughly final size, so layout does not jump. The `LoadingBlock` component pairs the blocks (aria-hidden) with `role="status"` text for assistive tech. Use it for initial loads of list and table surfaces; keep text-only status for in-place refreshes.

### Navigation and focus

Overview, then Diary & review, Investing & trading, Markets & tools groups; Diary management and Trade management hold their reminders/preferences; Account and Administration follow `apps/web/app/nav.tsx`. Each current route uses `aria-current="page"` and the selected surface treatment. The skip link appears on focus; a pathname change moves focus to main; main has a 4px inset keyboard outline. Plain links and native disclosures keep the browser keyboard model — no application-menu roles.

### Dialogs

The Quick Diary dialog is `min(680px, calc(100% - 32px))` on desktop, at most `calc(100dvh - 48px)` tall, 24px padding; full viewport on mobile with the footer stuck to the bottom edge (safe-area aware). On `/diaries/quick` the submit button is sticky above the bottom bar in its own slot. Opening moves focus to the textarea; Escape closes and restores focus. Delete confirmations use the small `.delete-dialog` pattern: name the consequence, cancel is autoFocus, confirm is the danger button.

## Patterns

- **Loading:** skeleton for list/table initial loads (see Components); text status for refreshes; forms keep content and disable submit.
- **Empty vs failure:** a successfully empty dataset gets one starting point (e.g. Start recording / Explore tools); resource failures stay distinct from empty data with scoped retry controls.
- **Destructive actions:** danger button + explicit consequence copy + confirmation dialog; the mobile admin layout keeps the destructive action on its own row.
- **Missing data:** missing quotes, unknown metadata, and stale values are labeled in text; never shown as 0. Synthetic content (preview, hero) is labeled "Interface illustration" / 合成資料.
- **Preferences:** locale (zh-TW/zh-CN/en), theme (light/dark/system), and market colors render from one `PreferencesControls` component — labeled in full mode, `aria-label` selects in compact mode, `mobile-*-select` test ids in the drawer. Guest preferences stay in localStorage; signed-in locale syncs to account settings (with retry when loading fails); theme and market colors stay local. The theme is applied early in `head` so a stored value is never applied late; locale updates `html.lang`.

## Data and finance

Signed values come from `formatMarketValue` (always `+`/`−`, exact string decimals preserved from API projections; `—` for unknown). Money and quantities in tables use `tabular-nums` and keep their container-scoped scroll. Series colors never imply direction; the position-sizing total is a large figure above a real ratio allocation bar. Company pages separate current views from follow-up evidence; Review separates the original judgment from later reflection (original → retrospective order).

## Content and i18n

Main interface copy uses full translation keys in zh-TW/zh-CN/en. Known partial coverage: the route boundary falls back to bilingual Chinese/English and the table Symbol header is fixed text. Trade times state the device IANA timezone; ambiguous DST times require an explicit UTC instant choice and nonexistent local times are rejected. Amounts stay as string inputs and are stored to two decimals.

## Page recipes

Each page follows the tokens/components above plus its scoped brief; acceptance lives beside each record.

- **Overview:** reading order is at most five current actions, three recent diaries, compact portfolio/watchlist context, then links to other destinations — context never competes in a right rail. `docs/design/daily-workspace-brief.md`, `docs/design/daily-workspace-acceptance.md`.
- **Diary library (`/diaries`):** filter bar, dates, title links, plain-text excerpts, tags in a flat list; URL preserves filters/pagination; applying a filter resets the page; focus moves to the results heading after paging. `docs/design/diary-list-finish-review.md`.
- **Diary reading/editing:** date precedes title on reading pages; body keeps 72ch and original line breaks; body is safe Markdown/GFM (raw HTML rejected, unsafe URLs stripped). The editor offers preview, tags, thesis/risk/execution fields, and a footer separating save status from actions.
- **BUY entries and holdings:** trade groups add/remove in the diary form; quantity and price stay decimal strings. `/stocks` uses a four-column cost holdings table. `docs/design/buy-finish-review.md`.
- **Timeline and Calendar:** month groups with dates/titles/excerpts and native Markdown disclosure; civil-date month grid with activity markers and a keyboard-moveable 371-day heatmap; holiday coverage shows "not computed" on failure. `docs/design/timeline-finish-review.md`, `docs/design/calendar-finish-review.md`.
- **Company market view (`/stocks/:symbol`):** definition-list quote (three columns desktop, two mobile), keyboard-operable history table capped at 50 rows/page, independent loading/failure/retry per section, native select for range. `docs/design/market-finish-review.md`.
- **Tools:** grouped icon-card index (calculators, then research); shared `ToolShell` breadcrumb header fed by the single tool registry in `tool-shell.tsx`; calculators keep left inputs / right results on desktop and stack on mobile. Public calculations stay interactive for guests; private actions are secondary ("Sign in to save") and preserve inputs. `docs/design/tools-access-matrix.md` via docs index.
- **Articles:** article editor states (Draft/Published/Archived) expose one filled primary action per state plus the stated separate action; native PUBLIC/MEMBER select defines post-publication access; public reading shell for all roles; locked MEMBER readers see the teaser and sign-in actions. Reading typography: 1rem/1.85, 72ch.
- **Personal achievements:** 800px bounded page, newest-first chronology, one filled primary action that flips Add/Save, focus moved to the date field on open and back to Add on close. `docs/design/personal-achievements-brief.md`.
- **Account security and FIRE:** two-section security page; FIRE assumptions/results in two columns (one below 850px), numbers in tables, projection in its own focusable scroll region. `docs/design/security-fire-finish-review.md`.
- **Settings:** fieldset/legend separates personal preferences from investment targets; timezone has common options plus an explicit use-device-timezone action, submitted only on save. Evidence: `docs/design/evidence/settings/`.
- **Brand and public navbar:** the mark is one geometric monogram (white T/b on the action tile) shared by `BrandMark`, favicon, and the PWA icon set (separate `any`/`maskable` entries); the wordmark is real text — `<strong>Trade</strong> basic` at weight 750/500. Desktop navbar ~72px (64px compact) with centered nav, chevron-disclosed tool shortcuts from the shared registry, and Create account as the only filled action. No arrows, candlesticks, or market-direction colors in the brand; static favicons pin light `#2459b8`. Evidence: `docs/design/evidence/pwa/1440.png`, `390.png`.

## Do's and Don'ts

**Do:**

- Keep the semantic theme roles and visible focus outlines.
- Label missing quotes, errors, and synthetic content with text; keep signs (`+`/`−`) on all market values.
- Preserve the reading order of original judgment, date, and later reflection.
- Confine wide tables to their own scroll regions and let text wrap on narrow screens.
- Use the danger button for every destructive action, with consequence copy and a confirmation.

**Don't:**

- Don't claim unimplemented interactions from preview templates or the deck as finished features.
- Don't stack decorative shadows, glows, or floating panels on the quiet card elevation.
- Don't replace status text with color alone — including market direction under any color-convention preference.
- Don't show missing quotes as 0 or present unlabeled sample data as real.
- Don't add entrance animations or hover lift beyond the tool card.
