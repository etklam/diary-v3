# [91] Revisit the destination summary sitting above Quick writing

Status: ruled 2026-10-04 — write first; implementation absorbed by [97](97-quick-composer-redesign.md)
Execution: done (delivered by 97)
Published: 2026-10-04

Type: design decision
User stories covered: US-015, US-016, US-017.

## Why this is triage, not AFK

This questions a design decision that [64](64-quick-content-first.md) already made and had
accepted, so it must not be implemented as a silent reversal. [64](64-quick-content-first.md)
specified content-first writing "with a compact editable date and create/append destination
summary", and its final acceptance records a passing 1440×900 and 390×844 confirmation that the
complete textarea is in the first viewport with optional details collapsed. That acceptance is
self-consistent and is not in dispute.

The layout decision belongs to whoever implements the composer. This ticket asks for a ruling,
and should be closed as `wontfix` if the delivered arrangement is the intended one.

## The observation

In `apps/web/app/quick-composer.tsx:72` the rendered order inside the form is:

1. `<section className="quick-destination">` — an h2 reading "destination", a date input, and a
   create/append `<select>`
2. `<section className="quick-writing">` — the h2 and the content textarea

So while the textarea is within the first viewport as accepted, a section heading and two form
controls still precede it. [64](64-quick-content-first.md) measured "writing available without
scrolling past optional setup", and the destination block is not optional setup — templates and
snippets are, behind `<details className="quick-options">`. Both statements are true at once.

A second, narrower observation: the create/append `<select>` restates a decision the code has
already made. The destination lookup at `apps/web/app/quick-composer.tsx:56` sets the mode from
the real server readback; the control exists so the author can override it.

## The question for triage

Would moving the writing area above a collapsed one-line destination summary be an improvement
over the accepted arrangement, or does an explicit visible destination belong before writing
precisely because append-versus-create changes where the text lands?

There is a real argument for the status quo: appending to an occupied date is a consequential,
easily-missed outcome, and surfacing it before the author commits words is a correctness
affordance, not decoration.

## Constraints on any change

- Presentation only. The `modeTouched` ref, the by-date lookup, the destination title lock,
  and the uncertain-append protection must be untouched. A reordering ticket that modifies
  write semantics is out of scope.
- `data-testid="quick-existing-destination"` and `data-testid="quick-existing-title"` are
  depended on by browser tests and must survive with their current meaning.
- `.quick-destination` and `.quick-writing` share grid, gap and heading rules in
  `apps/web/app/quick.css`; separating them requires untangling those.
- Removing the create/append `<select>` entirely is explicitly **not** proposed here. It is
  threaded through `modeTouched` and `persistUncertainMarker`
  (`apps/web/app/quick-composer.tsx:55`, `:56`, `:66`, `:67`, `:68`) and guarded by
  `tests/e2e/diary-response-loss.spec.ts`. A capture-cost review rated that change high risk
  against a benefit of one saved glance.

## Ruling — 2026-10-04

**Write first.** The writing area leads the form; the destination becomes a summary line —
date, create/append, and the existing-diary note — that expands to the current date input and
save-mode `<select>`. The correctness affordance argued for above is preserved by keeping the
existing-diary note in the collapsed summary, so an occupied date is still surfaced before the
author commits words; what changes is that it stops occupying a section heading and two form
controls ahead of the textarea.

Every constraint recorded above holds: presentation only, `modeTouched`, the by-date lookup,
the title lock and the uncertain-append protection untouched, both `data-testid` hooks
preserved with their current meaning, and the `<select>` not removed.

This does not close as `wontfix`. Execution is absorbed by
[97](97-quick-composer-redesign.md) step 1, which carries the shared grid/gap untangling in
`quick.css` as part of the same change set. This ticket stays as the record of the decision
and the constraints it must respect.

## Comments

Published 2026-10-04 from a capture-cost review of the two authoring paths. The review listed
this as a refinement of delivered work rather than a defect, and recommended it be ruled on
rather than scheduled — which is why it carries `needs-triage` instead of `ready-for-agent`.

2026-10-04 ruling recorded above; the question this ticket escalated is settled and its
implementation moves to [97](97-quick-composer-redesign.md).
