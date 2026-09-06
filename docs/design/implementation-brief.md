# diary-v3 Visual and Interaction Implementation Brief

Status: pre-implementation design decisions, not yet validated by screen acceptance; this document cannot be used to mark ticket 03 complete.
Date: 2026-09-05. The user authorized autonomous design and parallel implementation while away. This direction is the agent's design judgment; the user did not pick through colors or layout item by item.

PRODUCT.md, PLAN.md, and `.scratch/diary-v3-rebuild/PRD.md` are the sources of feature and product facts. This document adds no business rules. DESIGN.md is deferred until completion and then recorded from the actual UI, so that intent is never written up as delivered fact.

## Chosen Direction: Decision Agenda

The primary workspace mode is **Operate**; diary detail and public articles are **Read**. The product's distinctive mechanism is letting the investment judgment made at the time, the evidence gathered afterwards, and the final review cross-check one another. The first viewport should tell you what needs handling today and where to record a judgment.

The user alternates between brief intraday capture, longer after-hours reading, and periodic retrospection. The inspiration is an investment committee's agenda and resolution record: clear dates, ordered action items, expandable content, and a timeline where "then" and "now" are always distinguishable. This is information structure; it does not imitate paper, stamps, or a boardroom.

The visuals build order from cool white, deep ink-green text, a low-saturation gray-green sidebar, and a deep-green primary action. Hierarchy comes from small solid status marks and field headings, not a row of oversized KPI cards. The interface uses a single system sans-serif; numbers use tabular numerals. The main area is composed of lists, headings, dividers, and whitespace; not every block is wrapped in a rounded, shadowed card.

Compared with the old `design-tokens.css` — blue primary actions, Fraunces display, 12–24px radii, and layered shadows — this replaces them with purposeful type sizes, 4–8px radii, and primary surfaces. The old colors and containers do not constrain the new interface. Valid capabilities such as the skip link, 44px touch targets, the Quick Diary global entry, and permission/empty states are kept.

### Direction Draw and Judgment Record

Seven source directions, ranked by scene resonance: research archive index, securities research tables, dated journal, **investment committee decision agenda**, corporate event timeline, data validation worksheet, library research catalog. They draw on indexes, data tables, chronologies, and deliberation process; candidate 4 fits the full workspace best through action ordering and before/after judgment. The category-conventional KPI-card dashboard, and its inverse, a blank minimalist diary, were both rejected as candidates.

The Impeccable direction seed was `4587f8b7`, designating candidate 4. The first attempt degraded for lack of network; after an escalated retry that explicitly only GETs the roll API, the six challengers of catalog `c3b204a1eed6` were retrieved. This was not a degraded draw and the seed was never changed.

| Challenger fusion | User-fit/product-clarity judgment | Conclusion and system discipline retained |
| --- | --- | --- |
| Parametrized identity: markers and palette change with each entry | A shifting identity clashes with a stable analysis environment; recoloring does not help distinguish data | declined; one set of semantic tokens keeps synchronously controlling every interactive state |
| Racing league: stocks as teams, data laid along a horizontal axis | The racing connotation pulls away from reflection; the selection color collides with up/down semantics | declined; table number alignment and selection-state consistency are improved |
| Tensegrity: theses and counter-evidence form a force diagram | Helps express opposing evidence, but adds graphic-reading cost to everyday writing | competitive (the clarity holds only in thesis exploration); the side-by-side traceability of original thesis and counter-evidence is kept, with no new graphic tool |
| Deep dive: research descends layer by layer from a summary | Layered reading works, but the ocean metaphor is not a familiar language for an investment diary | declined; consistent placement of company and date context as content deepens is kept |
| Depot blind: action items as a destination board | Clear arrangement, but glitching half-line type and diagonally clipped text hurt error readability | declined; every state keeps explicit text and data time, and staleness is never hinted at with low opacity |
| Drum machine: dates as step rows, recorded days lit up | The date pattern resonates, but sixteen steps do not match the product calendar | declined; calendar selection, non-color marks for recorded dates, and keyboard operability are kept |

Direction prep is code-led under the delegated authority: no generated-image comps were made and no user-approved comp exists. The main risks of this Operate UI are information density, focus, and long text; they need real content and interactive React screens to validate. No decorative imagery is required. The draw record and this brief are not quality acceptance.

## Global Layout

- **Desktop ≥ 1100px:** 216px fixed sidebar; content area 32px left/right and 24px top; standard workspace max 1440px, reading body max 72ch. The page header holds the page title, the local date, and the primary action — no marketing slogans. Do not also stand up a second large brand header.
- **Tablet 760–1099px:** the sidebar collapses into a labeled "Menu" button; the single-row header stays. Two-column content sits side by side only when each side still gets at least 280px.
- **Mobile < 760px:** 16px margins, single column. Bottom navigation: Overview, Diary, Review, More; "Capture" is a separate global action so opening the editor is never confused with a selected navigation tab. Add safe-area and content padding at the bottom. The menu lists all remaining entries.
- Sidebar group one: Overview, Diary (with Timeline/Calendar/search inside), Portfolio, Research, Review. Group two: Trade Plans, Alerts, Discipline, Partner. Settings and API keys at the bottom; admins see the admin entry. Exact route mapping follows existing entries in implementation — reorganizing navigation must not change the API.
- New features join live navigation only once complete; ticket 03's Company/Review/Overview templates appear only behind a development preview entry labeled "synthetic data · design preview", never as fake actions in real navigation.
- Every route has a visible H1; breadcrumbs appear only on genuinely hierarchical pages such as company research and article administration. The current page sets `aria-current="page"`. On narrow viewports, navigation and dialogs use native elements or portals to avoid being clipped by scroll containers.

## Representative Flows

### Overview: Start from What Needs Handling

The title row is "Overview" + the date in the user's timezone + "Log an entry". The main column, about 2/3 wide, lists due/due-soon reviews and action items first, then recent decisions grouped by date. The right column, about 1/3, holds a positions summary and the companies being tracked. A summary carries at most three figures per line; when data is incomplete, "partial quote" is written beside the figure and the source time is shown — totals never mask a missing quote. Each row states the item type, the source title, the date, and the next actionable step. On mobile: action items first, then recent entries, then positions.

An empty account shows "Start by logging one judgment for today" plus the new-diary action; never fabricate market value or stuff in demo trades. With no action items, say "No reviews awaiting action" and keep the recent entries. A missing quote and a real 0 must be visually distinguishable.

### Quick Diary / Full Editor: Write First, Add Structure After

Quick Diary keeps the existing keyboard shortcut with a visible label explaining it. Desktop uses a roughly 680px native dialog, mobile a full-height sheet; the top pins "Quick capture" + close, and the bottom pins save state + a clear primary action. First focus goes to the text content, the date is clearly visible, and templates are chosen via a labeled select or button menu — no unnamed icon rows. Free writing can complete immediately; on a date conflict, the existing behavior offers opening that day's diary or appending, never a silent overwrite.

The full editor puts date, title, and the Markdown body in the main column; original thesis/risk/execution, tags, transactions, and reminders expand stepwise in titled groups. On desktop, editor and preview can toggle or sit side by side; on mobile, "edit/preview" stays one region and unsaved content is preserved. Trade inputs show field names, units, and precision — the frontend never replaces the API with floating-point math. The bottom shows "unsaved / saving / saved"; on failure, content and retry are kept; closing an unsaved editor uses an understandable discard confirmation.

### Company: Current View and Historical Evidence Stay Separate

The header holds the company name and symbol; the quote follows immediately, including currency, as-of, and data quality. Quotes are readable as a guest; personal positions, notes, and theses show per permission. Stable tabs below: Summary, Research, Timeline. Summary shows personal positions (when permitted), the current Stock Note, and active theses; Research carries the thesis lifecycle, evidence, and review entries; Timeline preserves event times, sources, and original content.

The Stock Note is labeled "current view · editable"; immutable records are labeled "recorded on …" with no edit affordance. Thesis review sits beside the original thesis; the review outcome is not a generic up/down pill. On mobile, reading follows original thesis → evidence → current assessment; sources or assessment dates must never be hidden for compactness. An external provider error affects only the quote area; private research content already loaded stays readable.

### Review: Check the Record First, Then Conclude

On desktop, the left ~300px is the queue ordered by due time; the selected item sits on the right. Details present the original decision and date first, then the known outcome, reflection, and next steps. The writing area is clearly marked "retrospective" and never shares a textarea with the original thesis. Diary review and thesis review keep their kind and ownership links. The complete button stays unsubmitable until required fields are valid; the API decides status and reviewedAt, and the UI shows the server's result.

On mobile, queue and detail are consecutive pages with a "back to review list" affordance that restores scroll/filter. List views never leak a private full reflection; partner view renders only the API allowlist. Double submits are guarded, failures keep input, and after completion a recognizable entry to the next item appears.

## Candidate Tokens for Implementation

These values are starting points; contrast must be verified on actual foreground/background pairs. No WCAG pass is claimed.

| Semantic token | Light | Dark |
| --- | --- | --- |
| canvas | `#F5F7F6` | `#101916` |
| surface | `#FFFFFF` | `#17231E` |
| surface-muted/sidebar | `#EAF0EC` | `#1E2E26` |
| text | `#182B23` | `#EAF1ED` |
| text-muted | `#4E6258` | `#ADBCB3` |
| border | `#CAD5CE` | `#405249` |
| control-border | `#73867A` | `#7C9486` |
| action | `#215C43` | `#8BD2AF` |
| on-action | `#FFFFFF` | `#102C1E` |
| selected | `#DCECE2` | `#284C39` |
| negative | `#A32938` | `#FF9EA8` |
| positive | `#196946` | `#85D7AA` |
| warning | `#805B0B` | `#E6C371` |
| focus | `#285DC2` | `#A3BFFF` |

System font stack: `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang TC", "Microsoft JhengHei", sans-serif`. No letter spacing on mixed Chinese/Latin text. Type sizes: 12px (metadata, sparingly), 14px (compact labels), 16px (body/inputs), 18px (sections), 24px (page titles), 32px (headline figures only); use rem so the UI stays operable at 200% zoom. Body line-height 1.65 and UI 1.4; tabular-nums on numbers and dates, not whole-page monospace.

Spacing 4/8/12/16/24/32/48px; inputs and buttons min-height 44px. Radius 4px (buttons/inputs), 8px (dialogs), 2px (small badges). Fixed 1px dividers and a 2px focus ring with 2px offset; the default surface has no shadow, and only popovers/dialogs use medium elevation. Buttons are uniformly primary/secondary/quiet/danger; states never invent their own shapes.

## Shared Interactions and Accessibility

- Route loading keeps the shell and shows content as skeletons with matching line heights; request errors offer retry and a copyable requestId within their section. No full-page spinner that wipes out context. Save success uses a quiet `role=status`; alert is reserved for errors that block the operation.
- Every input has a visible label and, when needed, a description; errors map via `aria-describedby`, and the submit error summary is focusable and linked to fields. Never rely on placeholder alone for explanation.
- While auth state resolves, private data or a login error page must never flash; re-login after expiry keeps a safe return route, and public HTML must never contain private content. Session state is never signaled through theme colors.
- Focus is visible; dialogs trap focus, close with Esc, and return focus to the trigger; global shortcuts never intercept IME composition or field input and never change the meaning of existing shortcuts.
- Dangerous actions confirm with the object's name and the consequence; when links block deletion, the API's reason is shown — never hide the button and make users guess. Every row menu in a data table needs an accessible name that names the object.
- Tables state units clearly in the first row and right-align amounts; sort buttons stay in sync with `aria-sort`. Narrow viewports can switch to a summary/expand form that keeps every field; genuinely wide matrices go in a named horizontal scroll region that hints more columns exist, and the page itself must never overflow horizontally.
- All three languages use complete translation keys with interpolation, never concatenated sentences; zh-TW/zh-CN/en are all tested with long titles, long ticker names, negative numbers, and large numeric strings. Number/date display follows locale and the configured timezone; an API civil date is never formatted as a UTC instant.
- Status uses text plus a shape or symbol, never color alone. The initial theme comes from settings or the system and avoids SSR color flash; every state has both token sets — the page is never flipped with CSS invert.
- Motion is limited to 160ms expand/fade state feedback — no page entrances or counting numbers. Under prefers-reduced-motion, non-essential transitions are removed; focus, error, and success feedback stay clear.

## Representative Synthetic Data and Verification

The ticket 03 preview carries a persistent "synthetic data · not a real account or market" marker: a 2026-09-04 diary titled "After the pullback, what am I still waiting for?"; the sample company uses an explicitly fictional `DEMO` with the name "Example Company"; its text reads "I originally assumed demand would recover; this week's observations are not enough to confirm it, so I am holding cash for now." Reviews keep the original judgment and the hindsight reflection separate. Quotes are marked synthetic with fixed timestamps; a fictional symbol must never be sent to a real provider. Zero-data screens are tested independently and never papered over with samples.

The minimal post-implementation screen matrix: 1440×1000 desktop and 390×844 mobile, plus a 320px/200% zoom reflow check; light + dark, the longest strings in all three languages, full keyboard flows, and empty/loading/error/partial quote/forbidden/long Markdown/wide table states. The first batch of screenshots is reviewed together and fixed in one pass; the second batch confirms. Screenshots must be opened to verify the content is correct; functional and DB tests prove behavior separately.

On completion, run the Impeccable detector and an independent finish review, handing the reviewer the paths, the direction above, every required viewport, the states, and the detector results; after fixes, DESIGN.md is recorded from the actual styles. If the harness has no shipped reviewer role, say so to root and use a fresh independent reviewer — never claim to have run a role that does not exist. This brief's delivery does not include those completion artifacts.
