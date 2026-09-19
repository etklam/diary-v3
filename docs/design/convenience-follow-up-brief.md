# Daily-work convenience follow-up

Date: 2026-09-19. Authority: Astra. Mode: Operate for capture/editing; Read for Diary and Timeline. Scope: approved tickets 64–71 and 75, preserving the incumbent Trade basic visual system.

## Visual direction

Keep DESIGN.md's system typography, neutral canvas/surfaces, blue action color, 6px controls, 10px containers, visible focus, and financial-only red/green. Use existing 16px mobile gutters, 24px desktop group spacing, and 12px action gaps. Reading remains 72ch. Reuse ordinary buttons, links, details/summary, labeled fields, and the current responsive shell. Do not add decorative cards, gradients, animation, new fonts, or a competing navigation layer.

## Writing and completion

- Quick Diary opens with a compact date/destination summary, then the content label and textarea in the first mobile viewport. Its writing area is the dominant element. Date/mode editing and optional title, templates, Company links, tags, snippets, and preview remain available through clearly named disclosures after content. Selecting a template exposes its relevant fields without silently replacing authored writing. Append displays the existing title as read-only destination context; an unoccupied date permits a title. Retain the existing mobile sticky save and safe-area behavior.
- Keyboard shortcut opening focuses content after account/draft readiness. Pointer/touch opening does not force a software keyboard. Restore/Discard takes precedence over defaults and retains accessible focus. Native dialog Escape and return-to-trigger remain intact.
- After confirmed Quick save, replace the editing task with a quiet persistent saved state using the confirmed identity. Open Diary is the leading action; Edit details, New note, and valid Return to Company are secondary. No timed dismissal, automatic navigation, or replay. New note explicitly clears the saved draft and restores valid incoming defaults.
- Full-authoring date conflict uses an inline named choice region beside the error: existing date/title, retained draft, and Edit existing / Append / Cancel. Explain meaningful append changes before commit. Append is the sole filled action, Edit is a link, Cancel is secondary. Keep uncertain results visibly locked and recoverable; never drop authored structured fields.
- Recent tags use up to eight wrapping text buttons with pressed state and whole-tag labels. They remain optional and account-scoped, update only on confirmed saves, and never initialize or overwrite form content. A comma is part of a tag.

## Reading and follow-up

- Place Edit beside the Diary title/date action area, with wrapping on narrow screens. If all original judgment fields are empty, show one short neutral line. If any is present, show meaningful populated fields without collapsing them into the all-empty state. Keep the original/retrospective distinction explicit.
- Evidence starts as one contextual action after the reading content. Open it into the existing labeled form; put focus at its first field, preserve entered data when collapsed, and return focus to the action. Avoid a modal for this optional task.
- Review scheduling links carry a real scheduling anchor and a validated in-app return context. After data/draft readiness, scroll/focus the scheduling field; do not reset it on ordinary edits. Save/cancel return to the originating Diary or Review. No new partial write endpoint is required.
- Timeline shows a compact date-range disclosure. Active bounds stay visible and clearable while closed. Keep apply/reset semantics and URL history. Put the first record in the 390×844 fixture's first screen by reducing unused filter space, not shrinking text or controls. Exact date fields remain available; no speculative preset or tag-filter API.

## State and verification

Provide all new copy in en, zh-TW, and zh-CN. Preserve validation, loading, error/retry, ambiguous saves, dirty guards, long text, empty states, and account boundaries. Use semantic controls and at least 44px primary touch targets. Inspect a batched desktop/mobile light/dark set after implementation, fix material findings together, then confirm once. Root owns serialized E2E servers and visual acceptance; workers own their focused unit/integration evidence and browser test changes.

## Architecture decisions

Diary detail and by-date projections read owner existence and all their associations from one read-only repeatable-read snapshot. Lists and private Review retain their distinct bounded projections. Market context is shared without monitor-only trend construction. Rotation orchestration shares ordered progress but preserves the distinct CLI and HTTP failure/count policies. Draft lifecycle sharing stops at storage/session ordering; payload/dirty/merge rules remain local, and Quick uncertain append stays outside that refactor.
