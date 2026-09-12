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
  focus: "#2459b8"
  tint-info: "rgb(79 117 194 / 0.12)"
  tint-info-text: "#2c4f92"
  tint-warn: "rgb(162 112 31 / 0.13)"
  tint-warn-text: "#7a5312"
  tint-neutral: "rgb(89 97 108 / 0.1)"
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
  dark-focus: "#9bbcff"
  dark-tint-info: "rgb(155 188 255 / 0.14)"
  dark-tint-info-text: "#b9d2ff"
  dark-tint-warn: "rgb(228 188 119 / 0.14)"
  dark-tint-warn-text: "#eccf9b"
  dark-tint-neutral: "rgb(177 184 195 / 0.14)"
  market-up: "#167044"
  market-down: "#b62e3c"
  market-flat: "#59616c"
  dark-market-up: "#70d49a"
  dark-market-down: "#ff939c"
  dark-market-flat: "#b1b8c3"
  series-1: "#4f75c2"
  series-2: "#785ca8"
  series-3: "#a2701f"
  dark-series-3: "#e4bc77"
typography:
  headline:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang TC\", \"Microsoft JhengHei\", sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.35
  title:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang TC\", \"Microsoft JhengHei\", sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.4
  body:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang TC\", \"Microsoft JhengHei\", sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang TC\", \"Microsoft JhengHei\", sans-serif"
    fontSize: ".875rem"
    fontWeight: 600
    lineHeight: 1.65
  reading:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang TC\", \"Microsoft JhengHei\", sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.85
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
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
---
# Design System: Trade basic

## Overview

**Creative North Star: "Decision Agenda"**

Neutral gray canvas, white surfaces, and dark graphite text organize dates, judgments, and later reflections. The main workspace builds order through headings, dividers, and whitespace; the diary reading area lowers density so the original text stays reviewable. This is a direction name the agent adopted under the user's delegated design authority, not a confirmed external brand commitment.

> Superseding note (2026-09-07, delegated design authority): the user approved a visual upgrade with more layering and product polish. The former "Flat Surface Rule" (no shadows anywhere) and the 4px/8px radius record are superseded by the `shadow-1`/`shadow-2` tokens, the `--radius-control` (6px) / `--radius-card` (10px) / `--radius-pill` tokens, and raised card surfaces. Everything else in the earlier record that is not restated here remains in force: semantic theme swapping, financial color isolation, gutter ownership, and reading-density rules.

This record is based on `apps/web/app/styles.css`, `public.css`, and the existing React components. All public pages, public Tools, the private workspace, and the mobile web/PWA shell are implemented against real APIs; Overview sections show only real account data. No claim is made that a React Native app exists.

**Key Characteristics:**

- Layered workspace: canvas, surface cards with hairline borders and one-step shadows, and muted context surfaces.
- Blue interaction accents; tinted badges (info/warn/neutral) for categories and status; text still explains status and data gaps.
- Working and reading density kept separate, with long text wrapping naturally.
- The same neutral and semantic color roles support light, dark, and system themes.

## Colors

### Primary

`action` is the restrained blue for primary buttons, links, and focus states; `on-action` keeps button text legible. `selected` backs the current nav item and selections with a neutral surface. The dark theme swaps the same CSS roles for the corresponding `dark-*` values; these are alternative themes, not extra brand colors.

### Neutral

`canvas` is the page background, `surface` covers forms and dialogs, and `muted-surface` backs the sidebar and research context areas. `text` and `muted` carry primary and secondary copy; `border` draws general dividers and `control` borders interactive fields. Theme backgrounds stay neutral in both modes; red and green are reserved for financial direction.

`negative` covers error text and invalid field borders; `focus` marks keyboard focus. `market-up`, `market-down`, and `market-flat` are independent financial tokens: positive movement/profit is green, negative movement/loss is red, and zero or unknown direction is neutral. `series-1` and `series-2` are chart series colors and do not imply gain or loss. Financial colors are never selected from locale, market, or brand/action roles.

**The Semantic Theme Rule.** Light and dark themes swap semantic roles; components never invert the whole page.

## Typography

The whole site uses the system sans-serif stack listed in the frontmatter; there is no separate decorative display typeface. This records the existing working-interface type; the larger system-font heading on the home page is not promoted into a brand display rule.

Page H1, section H2, body copy, and field labels use headline, title, body, and label respectively. H3 uses body size in bold. Headings carry no letter spacing, and long headings wrap where needed. The `time` element for dates uses tabular figures at a smaller secondary size; a few .75rem small sizes appear in brand subtext and mobile preference labels.

Reading body uses the reading line height and preserves line breaks and whitespace, with paragraphs and the reading area capped at 72ch. The textarea has a 1.7 line height and is vertically resizable. Fields inherit their label font; the title field is raised to 1.125rem. Do not misrecord the deck's "all inputs 16px" as the current implementation.

## Layout

The desktop shell is a 216px sidebar with a collapsible main content area; the sidebar is sticky, full viewport height. Main content is the sole workspace owner of the page gutter, using 24px vertical spacing and responsive horizontal gutters: 16px on phones, 24px on tablets, and 32px on wide desktop. Data pages cap at 1280px, while reading and editor pages use about 880px or 72ch. Below 1099px the sidebar is 180px and the two-column preview collapses to one column.

Sidebar navigation is grouped under small uppercase headings; every item carries an icon from the single `icons.tsx` family (24px grid, 1.7 stroke, `currentColor`). The active item is a raised surface pill (surface background, hairline border, `shadow-1`) with the icon in the action color; hover uses a neutral tint. The brand block pairs the rounded brand mark with the wordmark and the "投資決策日記" subline.

Below 768px the sidebar becomes a sticky top app bar: brand and menu trigger share one row, language and theme controls live in the Menu dialog, and the bar respects `env(safe-area-inset-top)`. Main content keeps the same 16px page gutter. The desktop preferences and quick-entry trigger are hidden at this size, but the menu preferences and keyboard quick-entry dialog remain available.

The public shell has a sticky single-row surface header — brand mark plus "Trade basic" wordmark linking home, primary nav (Tools, Articles, Guide, About), then compact language/appearance selects and session-aware actions — and a shared footer with real links only. Guests see Sign in and Create account, while signed-in people see Workspace; Admins additionally get a quiet Manage articles link. Below 1024px the row switches to compact mode and moves the remaining navigation, session actions, preference selects, and full tool list into an accessible drawer dialog; the row never wraps to a second line. Articles, Guide, About, and Blog retain this public reading shell for every role. Tools use the public shell for guests and the workspace shell for signed-in people. The `/tools` index and every `/tools/*` route render inside the 1280px page wrapper — including `.rotation-page`, which previously missed the gutter and is now fixed.

Overview and the public Tools build from shared primitives: `.card` (raised surface), `.section-head`, `.stat`/`.stat-value`, `.badge` with `info`/`warn`/`up`/`down` variants, `.toolbar` for filter rows, and `.empty-state`. Tool pages share one `ToolShell` header (breadcrumb `工具 / 分類`, icon tile, title, lede, optional actions) fed by a single tool registry in `tool-shell.tsx` that also renders the tools index and the home exploration grid.

Wide tables live in named, horizontally scrolling regions with page-specific minimum widths. Mobile keeps all columns inside those regions; the page itself does not widen to fit a table.

## Elevation & Depth

Elevation is deliberately quiet: `shadow-1` (a one-step hairline shadow) sits on standard cards, tables, secondary buttons, and the sticky shells; `shadow-2` is reserved for the hero preview and card hover. The dark theme switches to higher-alpha black shadows because borders alone cannot separate graphite surfaces. Contextual background areas still use muted-surface without shadows, and the native modal isolates the background with a neutral graphite scrim.

**The Layered Surface Rule (supersedes the Flat Surface Rule).** Hierarchy comes from canvas → surface cards → muted context areas, hairline borders, and restrained shadows — never from large blurs, glows, or floating panels. Nothing else on the page lifts on hover except `.tool-card` (1px translate).

No entrance animations exist; the only motion is the tool-card hover transition, which the reduced-motion rules disable along with transitions, animations, and smooth scrolling.

## Shapes

Controls and inputs use the 6px control radius; cards, panels, dialogs, and the tool icon tile use the 10px card radius; badges and the allocation bar use the pill radius. General dividers and control borders are 1px. The mobile full-viewport dialog keeps no border and no radius.

## Components

### Buttons

Primary buttons are solid action; secondary buttons are surface with a strong border and `shadow-1` (their hover strengthens the border). Both have a 44px minimum height, 600 font weight, 1.4 line height, and an inline icon slot with a 8px gap. Hover dims primaries with brightness .94; disabled is .6 opacity with a waiting cursor. Keyboard focus is a 2px focus outline with a 3px offset. `.button-compact` (36px) exists for toolbars and dense rows; the existing components still have no quiet/danger variants.

### Inputs / Fields

Fields have a visible label, a control border, and a surface background, with a 44px minimum height. Placeholders use muted and the caret uses action. Errors show a negative border plus `aria-invalid`, with descriptions and error summaries linked via `aria-describedby`. Failed forms keep their content; the error summary is focusable and shows translated messages with a selectable requestId. In-progress states show a text status and disable submit; success uses `role=status`. Sign-in confirmation and read flows use text loading/retry; there is no skeleton system yet.

### Navigation

The workspace navigation starts with Overview, then groups primary destinations under Diary & review (Diary, Review queue), Investing & trading (Holdings, Watchlist, Trade plans), and Markets & tools (Market research, Tools). Capture remains a separate primary action with an adjacent full-diary disclosure. Diary reminders and Partners live in Diary management; Price reminders and Trading principles live in Trade management. Account contains Public articles and Settings. Administration orders Article management, User management, then ETF catalog. Desktop and mobile render the same configuration. Ordinary links and native disclosures retain the browser keyboard model, without application-menu roles.

Diary list/search, Timeline, and Calendar share in-page navigation while retaining their separate routes. The sidebar highlights Diary throughout those routes and Diary reading/editing; each browse view marks its own in-page link with `aria-current=page`. The selected background and 650 font weight remain unchanged. The skip link appears on focus; a pathname change moves focus to main, and main has a 4px inset keyboard outline. The preview's three toggle buttons use `aria-pressed`; they are not full business navigation.

### Containers, cards and status primitives

`.card` is the standard raised surface (surface background, hairline border, card radius, `shadow-1`, 24px padding) used by Overview sections, tool panels, research sections, filter toolbars, and table containers. `.section-head` keeps titles, icons, and "view all" actions on one baseline. `.stat` pairs a muted label with a 22px tabular-nums figure. `.badge` variants are bounded: neutral tint for categories, `info` tint for informational status, `warn` tint for needs-attention, and `up`/`down` reserved strictly for financial direction. `.empty-state` renders a dashed-border quiet block; loading stays a text status. `.table-scroll` and equivalent page-level wraps are now bordered, rounded surface containers with a muted header row — data still scrolls horizontally inside them.

### Containers and reading

The diary editor aligns its header and form to the shared workspace gutter; the form itself does not add a second page frame. The footer separates save status from actions with a divider. On diary reading pages the date precedes the title, header/footer use thin rules, and the body keeps 72ch and original line breaks. Body content renders as safe Markdown/GFM — raw HTML is rejected and unsafe URLs are stripped. The diary editor offers a preview, a separate tags field, and the original thesis/risk/execution fields; failed submissions keep the input.

The article editor makes its stored state explicit beside the title and exposes one filled primary action per state. Draft uses Save draft with a separate Publish publicly action; Published uses Update published article with a separate Archive article action; Archived uses Save changes with a separate Republish publicly action. Successful public links always come from the server response and appear only for Published. Failed or expired sessions keep bounded, account-and-article-scoped recovery data. Published articles use the public reading shell for guests, ordinary users, and Admins; Admins receive only contextual New, Manage, and Edit links.

### Quick Diary

The native dialog is `min(680px, calc(100% - 32px))` wide on desktop, at most `calc(100dvh - 48px)` tall, with 24px padding; on mobile it is full viewport height with 16px padding. The footer sticks to the bottom edge of the dialog and gains safe-area on mobile. On the full `/diaries/quick` page the submit button is sticky at the viewport bottom on phones — it keeps its own layout slot with a surface background and an upward shadow, so it never covers content that cannot be scrolled past. Opening moves focus to the text area; Escape closes and returns focus to the trigger. It reuses the real create-diary form; date and save-mode stay side by side on phones.

### First representatives and preferences

Overview follows one reading order: at most five current actions, three recent Diaries, compact portfolio/watchlist context, and links to other destinations. Context appears below the primary work rather than competing in a right rail. A successfully empty workspace gets one starting point with Start recording and Explore tools; holdings and thesis creation are optional. Resource failures stay distinct from empty data and keep scoped retry controls. The full direction and acceptance are recorded in `docs/design/daily-workspace-brief.md` and `docs/design/daily-workspace-acceptance.md`.

Company separates current views from follow-up evidence; Review separates the original judgment from later reflection, and the narrow layout reads original → retrospective. All sections keep real data and explicit missing-quote text; missing quotes are never shown as 0.

The language menu supports zh-TW/zh-CN/en and the theme menu supports light/dark/system. When signed in, language is restored and saved through account settings, and the menu is disabled while loading so a stored value is not overwritten; guest language and theme stay local, the theme is read early in head so a stored theme is not applied late, and locale updates html.lang. Main interface copy uses full translation keys and the preview's fixed sample dates stay visible; the route boundary currently falls back to bilingual Chinese/English and the table Symbol header is fixed text — do not misrecord these as full trilingual coverage.

## Do's and Don'ts

### Public Tools and private workspace

The `/tools` index and confirmed `/tools/*` routes use the public shell for guests and the workspace shell for signed-in people. In either shell the page uses a neutral canvas, shared page gutter and container rules, and does not expose private data to guests. The index is a grouped icon-card grid (calculators, then research); the home page renders the same cards as a "start with the tools" exploration grid. Every tool page opens with the shared `ToolShell` breadcrumb and icon-tile header; calculators keep left inputs / right results on desktop and stack input → results → actions on mobile, with the position-sizing total as a large figure above a real ratio allocation bar. Public calculations and research remain fully interactive for guests. Private actions stay secondary and use direct copy such as "Sign in to save"; they preserve local inputs and return to the same safe in-site tool path after sign-in. Green and red remain reserved for market direction, not page backgrounds. The home hero pairs the headline with a synthetic interface preview explicitly labeled 介面示意 with a `SYN` ticker and synthetic note — no fabricated user counts, market events, or unreachable buttons.

### Implemented account security and FIRE surfaces

Account security uses form and device action sections separated by two thin rules, keeping reading width on desktop and full-width controls on mobile; errors keep field values, and a successful revocation offers a way to sign in again. FIRE uses assumptions/results in two columns, dropping to one below 850px; numbers are presented in tables, the projection stays in its own focusable horizontal-scroll region, and if copy fails the text is directly selectable. Both reuse existing tokens; no new color roles were added.

Mobile navigation has its own row and can wrap, so new entries do not crowd the brand and text. See `docs/design/security-fire-finish-review.md` for the actual acceptance and screenshots; follow-up acceptance for full settings and diary Markdown editing is recorded separately in tickets 07 and 08.

### Do:

- **Do** keep using the semantic theme roles and visible focus outlines.
- **Do** label missing quotes, errors, and synthetic content with text.
- **Do** preserve the reading order of original judgment, date, and later reflection.
- **Do** let text wrap on narrow screens and confine wide tables to their own scroll regions.

### Don't:

- **Don't** claim unimplemented interactions from the preview templates or the deck as finished product features.
- **Don't** stack decorative shadows, glows, or floating panels on top of the quiet card elevation; muted context areas stay flat.
- **Don't** replace status text with color alone.
- **Don't** fill screens with missing quotes shown as 0 or unlabeled sample account data.

### Account preferences

The settings page uses fieldset/legend to separate personal preferences from investment goals, and amounts stay as string input. Timezone offers a text input, common options, and an explicit use-device-timezone action, submitted only on save. Errors keep the form; loading language after sign-in has its own retry, and signing out ignores late save responses. Verified across all three languages, light and dark themes, and desktop/mobile; evidence in `docs/design/evidence/settings/`.

## Company market view

`/stocks/:symbol` gives guests stock/index quotes: the latest quote uses a definition list with three columns on desktop and two on mobile; historical prices use a keyboard-operable semantic table capped at 50 rows per page. Quotes and history each render their own loading/failure/retry states, missing metadata stays unknown, and the stale fallback states its status and original fetch time. The query range uses a native select, keeping the existing colors and spacing with no new tokens. Separate desktop/mobile review in `docs/design/market-finish-review.md`.

## Diary library

`/diaries` continues the existing diary reading system: a filter bar, dates, title links, plain-text excerpts, and tags form a flat list. The URL preserves filters and pagination, applying a filter resets the page, and after paging focus moves to the results heading. Filters and entries go single-column on mobile, reusing the existing semantic tokens. Acceptance and an independent review in `docs/design/diary-list-finish-review.md`.

## BUY entries and cost holdings

The diary creation form records buys with trade groups that can be added and removed; quantity and price stay as decimal strings and decision notes are expandable. Trade times clearly state the device IANA timezone; ambiguous DST times require an explicit UTC instant choice and nonexistent local times are rejected. `/stocks` uses a four-column cost holdings table; on mobile ordinary values all fit on screen and only very long numbers scroll within their container. This slice reuses existing tokens; independent fix acceptance in `docs/design/buy-finish-review.md`.

## Timeline and Calendar

Timeline builds a reading order from month groups, dates, original titles, and short excerpts, with a native disclosure expanding the safe Markdown. Calendar uses a civil-date month grid, activity markers, and holiday texture; the 371-day heatmap initially lands on the nearest date and can be moved day by day with the keyboard. If holiday data fails, coverage shows as not computed. Both pages reuse existing tokens and go single-column on mobile; independent acceptance in `docs/design/timeline-finish-review.md` and `docs/design/calendar-finish-review.md`. The desktop sidebar scrolls vertically, keeping preference controls reachable after new entries are added.

## Trade basic brand and public navbar (2026-09-07)

The external product name is **Trade basic** — strict casing and spacing. It replaces the former `diary-v3` wordmark in the public navbar, footer, private sidebar/mobile shells, page `<title>` suffixes, and the PWA `name`/`short_name`. Repo, package, database, env, storage keys (`diary-theme`, `diary-locale`), auth cookies, and historical documents keep their names; only the user-facing brand moved.

**The Brand Mark Rule.** One geometric monogram — white **T**/**b** letterforms on the action-colour rounded tile — is the single brand source. The in-app `BrandMark` (`icons.tsx`) draws the same three paths as `favicon.svg`, `icon-192.svg`, `icon-512.svg`, and the separate `icon-maskable-*.svg` pair (full-bleed tile, mark scaled to ~70% inside the safe zone; `purpose: any` and `purpose: maskable` are separate manifest entries). The mark uses `--action`/`--on-action`, so it follows the semantic theme swap like every other surface; the static favicons pin the light-theme blue `#2459b8`. No arrows, candlesticks, or market-direction colors in the brand.

**The Wordmark Rule.** The brand line is real text: `<strong>Trade</strong> basic` at weight 750/500 — Trade slightly heavier, basic slightly lighter. The public navbar and footer show the mark plus the single-line wordmark only; no subline under the navbar brand. The private shells keep the "投資決策日記" descriptor subline.

**Public navbar (single row, 1024px+).** Desktop header is a sticky surface bar at ~72px (64px in compact mode): brand links home (no duplicate Home item), centered nav (Tools, Articles, Guide, About), then right-aligned compact unlabeled language/appearance selects (`aria-label`, same ready/disabled/error/retry behavior as the labeled ones), Sign in, and Create account as the only filled action button. Tools is a plain link to `/tools`; a chevron button beside it discloses tool shortcuts rendered from the shared `TOOLS` registry in `tool-shell.tsx` — no second list of tool names or URLs exists. The disclosure is a plain expanded/collapsed region (no ARIA menu): outside pointer-down and Escape close it, Escape restores focus to the chevron, and link clicks close it.

**Compact mode (<1024px).** The row shows brand, Sign in, and a Menu trigger; it never wraps. The drawer dialog carries the full nav, the complete tool list, labeled preference selects (mobile test ids), and Create account. The drawer and trigger reuse the private menu's test ids (`mobile-menu`, `mobile-menu-dialog`, `mobile-*-select`), so preference-selection helpers keep working across both shells. Login and registration stay fully public; saving private work still routes through sign-in. No `overflow-x` traps, negative margins, or `!important` layout patches are used in the header. Evidence: `docs/design/evidence/pwa/1440.png`, `docs/design/evidence/pwa/390.png` (regenerated by the e2e suite), plus the prior commit's versions as the "before" state.
