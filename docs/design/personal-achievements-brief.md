# Personal achievements

Mode: Operate / Read
Direction owner: Astra
Implementation owner: Luna
Requested: 2026-09-22

## Product scope

Record private, manually entered milestones with a calendar date and achievement text. The motivating example is an account first reaching USD 100,000 on 2026-09-22. The example is illustrative, not seeded account data. Users can create, read, edit, and delete their own entries; multiple achievements may share a date. Entries appear newest first with deterministic ordering. No automatic balance detection or partner sharing is included.

Persist records through the authenticated API and PostgreSQL, with shared runtime contracts. Calendar dates remain unchanged across timezones. Validate dates and bounded, nonblank text at the API boundary, and enforce ownership for every operation.

## Visual direction

Expand the existing Decision Agenda workspace without introducing another visual system. Use its system typeface, blue action token, neutral surfaces, shared gutters, and existing control and card radii. The page heading introduces Personal achievements, followed by a short explanation and one primary creation action. Each entry emphasizes the achievement text with a quieter tabular date. Use existing form and secondary edit/delete patterns. The native date input and a labelled text field keep capture short.

Use a single-column reading flow on mobile, wrapping long content and action rows. Preserve the same hierarchy on desktop with a bounded content width. Financial green/red does not decorate milestones. No trophy illustration, confetti, asset generation, or achievement scoring is needed.

## Acceptance

- Navigation exposes the feature in the signed-in workspace.
- Create, reload, edit, and confirmed delete work against persisted data.
- Empty, loading, error, and pending states are clear; failed saves preserve input.
- Cross-user access and unauthenticated mutations are rejected.
- Three locales, both themes, keyboard operation, and desktop/mobile layouts retain existing conventions.
- Runnable API/database and browser evidence accompanies completion.

## Addition: personal goals (2026-10-04)

The same page gained the forward-looking half of the idea. A goal is free text with an optional target date; an open-ended goal carries no date at all. Goals were deliberately kept free text with no progress figure: portfolio valuation reports no YTD return and covers only priced holdings, so a computed progress bar would misstate the account, and a manually typed one would only restate what the goal text already says.

A goal is in progress or achieved. Overdue is derived from the target date when the list renders, so the state is always current without a stored transition. Marking a goal achieved stores the achievement date and prefills the achievement form with the goal's wording for the user to confirm — the handoff between the two sections, without writing on their behalf.

Visual direction: Goals lead the page, Achievements follow, each section introduced by its own heading with its Add action on the same line. The two Add buttons are the only filled marks; every row action is secondary, with delete carrying the danger treatment the achievement rows already use. Status is a tinted label following the timeline's badge rule — neutral for in progress, the negative tint for overdue, the action tint for achieved — never a lifted chip, and never financial green/red. Goals sort by nearest deadline, open-ended last, and sink below the active ones once achieved.

Evidence: `docs/design/evidence/achievements/goals-*.png` and `goal-editor-*.png` at 1440px and 390px, both themes.
