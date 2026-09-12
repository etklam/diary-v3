# Daily Workspace & First-use Flow

Status: implementation brief approved by Astra, 2026-09-12.
Mode: Operate. This bounded refinement follows DESIGN.md and the user's phase proposal.

## Outcome and boundaries

Make capture, finding a Diary, and completing a due Review immediately understandable after sign-in. Preserve existing routes, APIs, ownership rules, date semantics, Quick Diary saving and appending, and public Tools access. No wizard, onboarding persistence, new dashboard, new market data, or research-to-editor handoff is included.

## Navigation and capture

- A prominent capture action opens Quick Diary directly. An adjacent, accessible disclosure exposes Write diary; no mode-selection modal. Keep the existing keyboard capture behavior available independently.
- The primary workspace destinations, in order, are Overview, Diary library, Timeline, Calendar, Review queue, Trade plans, Holdings, Watchlist, Market research, and Tools. Use the existing route destinations and icon family. Diary library, Timeline, and Calendar are direct sidebar links on desktop and a persistent three-column shortcut row below the mobile brand/Menu bar. Keep them out of the mobile drawer to avoid duplicate routes. Diary library is active throughout its reading/editing routes, Timeline is active for Timeline and Partner comparison, Calendar is active for Calendar, and Review queue is active for Diary Review. Tools remains active throughout its catalog and tools.
- Keep Diary list/search, Timeline, Calendar, and Partner comparison on their separate routes; remove the duplicate three-destination browse strip from route content while preserving Timeline's personal/partner mode links. Let Diary list/search, Timeline, and Calendar use the available workspace main-column width; retain the existing bounded widths for excerpts, Partner comparison, Diary reading, and editing.
- Partners, Trading principles, Diary reminders, and Price reminders belong in a clearly named More workspace features disclosure. Settings stays directly visible; security remains clearly reachable. Preserve admin entries for administrators. Opening a secondary route reveals its group.
- The mobile Menu uses the same destinations and capture choice, with full-width touch targets and ordinary keyboard navigation. Retain dialog focus handling and Escape dismissal.
- Plain sign-in uses the account's selected start page; new and unset accounts default to Timeline. An explicit safe return destination takes priority over that setting. Keep Overview available as its own workspace destination.

## Overview hierarchy

- Keep the neutral Decision Agenda visual identity. One vertical reading order: needs attention, recent records, compact portfolio/watchlist context, other destinations. Avoid a competing right rail.
- Header: Today’s workspace, a quiet account-local date, and Quick diary. The successful-empty state uses its own Start recording action instead of repeating capture in the header. On narrow screens allow natural wrapping; no decorative eyebrow.
- Needs attention: at most five rows total, prioritizing actionable overdue/today reviews and significant portfolio risks. Deduplicate only verified equivalent overdue review reasons and targets. Preserve distinct reasons for the same target. Full Review queue and portfolio attention remain linked. Upcoming and unscheduled items remain in Review queue, not expanded on Overview. Show a compact no-current-actions line only after relevant resources successfully load.
- Recent records: three records from the current real summary endpoint, with date, title, a bounded excerpt, and a link to the full Diary library. A single saved record gets a small optional prompt to open the record or arrange a later review; it does not prescribe investing behavior.
- Context: portfolio priced value, quote coverage and unpriced cost remain explicit when holdings exist. Keep timestamps/partial-data caveats needed to interpret the summary. Watchlist shows at most three companies with their latest research. Empty summaries disappear after successful reads; failures retain a labeled retry instead.
- Trade plans, research, and Tools are direct destination links. Do not duplicate detailed trade-plan rows on Overview.

### Confirmed action identity

The independent source review confirmed that Attention classifies overdue at the current instant, while Review Queue classifies overdue/today at the account-local midnight. Canonical review keys therefore identify the obligation: `review:diary:<id>` and `review:thesis:<normalized symbol>`. Only the corresponding overdue Attention reason maps to those keys. Queue classification and title win when both sources supply the same obligation, including an earlier-today deadline. Other Attention keys include target kind, target ID, and reason; invalidation and concentration remain distinct.

Presentation order preserves existing risk priority while placing today reviews ahead of portfolio hygiene: invalidated held thesis, overdue thesis, overdue Diary, today thesis, today Diary, concentration, missing thesis. Equal groups sort by due time and stable target identity. This is a bounded display projection; the existing APIs remain authoritative. Both the full Review Queue and Portfolio attention destinations remain reachable.

## First-use and resource states

- After all relevant account resources successfully load and show no recorded workspace activity, replace the collection of empty sections with one compact, left-aligned starting point: “Record a judgment you may want to revisit.” Supporting copy welcomes observations, questions, and unexecuted ideas. Primary action: Start recording. Secondary action: Explore tools.
- No holdings or thesis is required. Diary-only, research-only, and tools-only use is valid. Do not infer account creation or onboarding completion from lack of holdings.
- Failed, malformed, or still-loading resources cannot establish first use. Keep readable successful sections alongside scoped failures and retry controls. No false all-clear if attention or review loading fails.

## Visual implementation

- Use the existing system font, semantic theme tokens, blue action color, neutral canvas/surfaces, 6px controls and 10px containers. Financial green-up/red-down tokens remain independent.
- H1 follows the existing headline scale; H2 uses the title scale. Body stays 1rem, secondary copy .875rem, dates use tabular numerals. No new fonts, colors, decorations, or animation.
- Maintain the shell's 16/24/32px gutters. Overview uses the existing maximum width, with 24px between sections and 12–16px within groups. Use dividers and spacing instead of nested cards. Context can use two columns below the main records on desktop, stacked on mobile.
- Links wrap long translations; controls retain 44px touch targets and visible focus. Three locales and light/dark themes are required.

## Runnable acceptance

1. Plain sign-in → first-use prompt → Quick Diary → save → find/open the same record from Overview or Diary.
2. Overview due item → complete Review → return → removed due item and consistent recent status.
3. Mobile Menu → Diary / Tools / Settings; secondary features and full editor remain reachable; all three Diary browse routes share navigation.
4. More than five candidate reminders stays bounded; equivalent overdue reasons merge and different reasons survive. Failed or loading data never becomes first use or a false all-clear; retry recovers.
5. Existing public Tools, keyboard capture, draft/save behavior, locales, themes, and financial color checks pass.

Use synthetic users, disposable PostgreSQL, and controlled provider fixtures. Capture desktop/mobile evidence together, fix identified defects in a batch, and use at most one confirmation pass. Independent review precedes acceptance. Production deployment and Forgejo runner verification are outside this local phase.
