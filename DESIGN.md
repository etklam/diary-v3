---
name: diary-v3
description: Implemented initial visual system for the investment decision diary web app
colors:
  canvas: "#f5f7f6"
  surface: "#fff"
  muted-surface: "#eaf0ec"
  text: "#182b23"
  muted: "#4e6258"
  border: "#cad5ce"
  control: "#73867a"
  action: "#215c43"
  on-action: "#fff"
  selected: "#dcece2"
  negative: "#a32938"
  focus: "#285dc2"
  dark-canvas: "#101916"
  dark-surface: "#17231e"
  dark-muted-surface: "#1e2e26"
  dark-text: "#eaf1ed"
  dark-muted: "#adbcb3"
  dark-border: "#405249"
  dark-control: "#7c9486"
  dark-action: "#8bd2af"
  dark-on-action: "#102c1e"
  dark-selected: "#284c39"
  dark-negative: "#ff9ea8"
  dark-focus: "#a3bfff"
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
  control: "4px"
  container: "8px"
spacing:
  step-4: "4px"
  step-8: "8px"
  step-12: "12px"
  step-16: "16px"
  step-20: "20px"
  step-24: "24px"
  step-32: "32px"
  step-40: "40px"
  step-48: "48px"
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
# Design System: diary-v3

## Overview

**Creative North Star: "Decision Agenda"**

Cool white, gray-green surfaces, and deep ink text organize dates, judgments, and later reflections. The main workspace builds order through headings, dividers, and whitespace; the diary reading area lowers density so the original text stays reviewable. This is a direction name the agent adopted under the user's delegated design authority, not a confirmed external brand commitment.

This record is based on `apps/web/app/styles.css` and the existing React components, covering the initial web flows and the design preview. Sign-up, sign-in, creating and reading diaries, and the API-connected quick capture in the preview are implemented; Overview/Company/Review remain clearly labeled synthetic representative screens. No claim is made that full business modules or a React Native app are complete.

**Key Characteristics:**

- Flat workspace, grouped by dividers and gray-green backgrounds.
- Deep green primary actions; text explains status and data gaps.
- Working and reading density kept separate, with long text wrapping naturally.
- The same semantic color roles support light, dark, and system themes.

## Colors

### Primary

`action` is the deep green for primary buttons, links, and short status text; `on-action` keeps button text legible. `selected` backs the current nav item, selections, and success messages. The dark theme swaps the same CSS roles for the corresponding `dark-*` values; these are alternative themes, not extra brand colors.

### Neutral

`canvas` is the page background, `surface` covers forms and dialogs, and `muted-surface` backs the sidebar and research context areas. `text` and `muted` carry primary and secondary copy; `border` draws general dividers and `control` borders interactive fields.

`negative` covers error text and invalid field borders; `focus` marks keyboard focus. No separate positive/warning color roles are implemented yet.

**The Semantic Theme Rule.** Light and dark themes swap semantic roles; components never invert the whole page.

## Typography

The whole site uses the system sans-serif stack listed in the frontmatter; there is no separate decorative display typeface. This records the existing working-interface type; the larger system-font heading on the home page is not promoted into a brand display rule.

Page H1, section H2, body copy, and field labels use headline, title, body, and label respectively. H3 uses body size in bold. Headings carry no letter spacing, and long headings wrap where needed. The `time` element for dates uses tabular figures at a smaller secondary size; a few .75rem small sizes appear in brand subtext and mobile preference labels.

Reading body uses the reading line height and preserves line breaks and whitespace, with paragraphs and the reading area capped at 72ch. The textarea has a 1.7 line height and is vertically resizable. Fields inherit their label font; the title field is raised to 1.125rem. Do not misrecord the deck's "all inputs 16px" as the current implementation.

## Layout

The desktop shell is a 216px sidebar with a collapsible main content area; the sidebar is sticky, full viewport height, with 32px 20px padding. Main content maxes out at 1440px with 48px 40px padding. Below 1099px the sidebar is 180px and main content padding becomes 32px 24px; the two-column preview collapses to one column.

Below 759px the sidebar becomes top navigation: the brand and the two real nav entries share one row, with the language and theme menus on the next row. Main content padding is 32px 16px 48px. This is the scoped adaptation for the current two-entry shell; the deck's collapsible tablet menu, mobile bottom navigation, and full module list are not built.

The work preview uses 2:1 columns with 40px gap and a 240px minimum for the secondary column; agenda groups use a top divider and 24px top padding. The editor maxes at 880px, sign-in/sign-up forms at 440px, with a 20px form gap. No abstract spacing token API exists in the frontend; the frontmatter spacing records values already repeated in the code.

Wide tables are at least 800px and live in named, keyboard-focusable, horizontally scrolling regions. Mobile keeps all columns; the page itself does not widen to fit a table.

## Elevation & Depth

There are currently no box shadows. Forms are distinguished by surface, thin borders, and rounding; background context areas by muted-surface. The native modal isolates the background with an `rgb(10 25 17 / .5)` scrim and does not apply the deck's unimplemented shadow.

**The Flat Surface Rule.** Build working hierarchy from backgrounds and dividers, and keep the current shadow-free look for components.

No entrance animations or general transitions are set; the reduced-motion rules disable transitions, animations, and smooth scrolling. Do not record the deck's 160ms motion as an implemented token.

## Shapes

Controls and navigation use the control radius; the editor frame and desktop dialogs use the container radius. General dividers and control borders are 1px. Research context areas keep square corners; the mobile full-viewport dialog has no border and no radius. There is no implemented chip/badge component library.

## Components

### Buttons

Primary buttons are solid action; secondary buttons are surface with a control border. Both have a 44px minimum height, 600 font weight, and 1.4 line height. Hover brightness is .94; disabled is .6 opacity with a waiting cursor. Keyboard focus is a 2px focus outline with a 3px offset. The existing components have no quiet/danger variants.

### Inputs / Fields

Fields have a visible label, a control border, and a surface background, with a 44px minimum height. Placeholders use muted and the caret uses action. Errors show a negative border plus `aria-invalid`, with descriptions and error summaries linked via `aria-describedby`. Failed forms keep their content; the error summary is focusable and shows translated messages with a selectable requestId. In-progress states show a text status and disable submit; success uses `role=status`. Sign-in confirmation and read flows use text loading/retry; there is no skeleton system yet.

### Navigation

There are just two main entries: "Start" and "Write diary". The item matching the route gets `aria-current=page`, a selected background, and 650 font weight. The diary detail page has no invented "current list" page. The skip link appears on focus; a pathname change moves focus to main, and main has a 4px inset keyboard outline. The preview's three toggle buttons use `aria-pressed`; they are not full business navigation.

### Containers and reading

The editor is a single bordered form container with 28px desktop padding and 20px 16px on mobile; the footer separates save status from actions with a divider. On the reading page the date precedes the title, header/footer use thin rules, and the body keeps 72ch and original line breaks. Body content renders as safe Markdown/GFM — raw HTML is rejected and unsafe URLs are stripped. The editor offers a preview, a separate tags field, and the original thesis/risk/execution fields; failed submissions keep the input.

### Quick Diary

The native dialog is `min(680px, calc(100% - 32px))` wide on desktop, at most `calc(100dvh - 48px)` tall, with 24px padding; on mobile it is full viewport height with 16px padding. The footer sticks to the bottom edge of the dialog and gains safe-area on mobile. Opening moves focus to the text area; Escape closes and returns focus to the trigger. It reuses the real create-diary form; this representative entry lives in the design preview and is not a finished global shortcut, template, follow-on entry, or unsaved-changes confirmation.

### First representatives and preferences

Overview leads with pending items and recent theses, then research context; Company separates current views from follow-up evidence; Review separates the original judgment from later reflection, and the narrow layout reads original → retrospective. All three keep synthetic-data labels and explicit missing-quote text, and empty states can be toggled in the preview; missing quotes are never shown as 0.

The language menu supports zh-TW/zh-CN/en and the theme menu supports light/dark/system. When signed in, language is restored and saved through account settings, and the menu is disabled while loading so a stored value is not overwritten; guest language and theme stay local, the theme is read early in head so a stored theme is not applied late, and locale updates html.lang. Main interface copy uses full translation keys and the preview's fixed sample dates stay visible; the route boundary currently falls back to bilingual Chinese/English and the table Symbol header is fixed text — do not misrecord these as full trilingual coverage.

## Do's and Don'ts

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
- **Don't** turn every background context area into shadowed cards, breaking the existing flat hierarchy.
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
