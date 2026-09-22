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
