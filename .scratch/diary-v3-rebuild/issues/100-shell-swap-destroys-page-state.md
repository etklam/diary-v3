# [100] Confirming the session destroys every page's unsaved state

Status: needs-triage
Execution: todo
Published: 2026-10-04

Category: bug
Type: Cross-cutting architecture

## Observation

Found while implementing [90](90-quick-cold-start-wait.md). On a cold document load the app renders
the public shell, then swaps to the private shell as soon as the first API response confirms the
session. Because the two shells are different element trees, React unmounts everything under
`main` and mounts it again.

Instrumenting `/diaries/quick` showed the sequence directly: composer mounts → the user types →
the session confirms → `COMPOSER UNMOUNT` / `COMPOSER MOUNT` → the textarea is empty, the
disclosures are closed and focus is gone. The same remount hits every route: a filter typed on a
list, a `<details>` opened on the editor, a scroll position, an in-progress selection.

Today this is mostly invisible because surfaces either wait for their own data before rendering
anything interactive, or carry their own device draft. Both are workarounds for the same cause.

## Requested outcome

Make session confirmation a chrome change, not a tree replacement: the routed content should keep
its identity across the public → private shell swap, so component state, focus and scroll survive.

## Open triage decisions

- Can both shells render one shared `<main>{children}</main>` subtree, with only the surrounding
  chrome differing, so React reconciles instead of remounting?
- Is the SSR output still correct for a guest if the private chrome is decided after hydration?
- Does anything depend on the remount today — for example surfaces that re-read data when the
  session confirms?

## Related work

- [90 — Quick cold-start wait](90-quick-cold-start-wait.md) — carries its pre-account writing across
  this remount in memory, which is the workaround this ticket would make unnecessary.
- [Current design system and layout rules](../../../DESIGN.md)

## Blocked by

None. The scope is `apps/web/app/root.tsx` and the shell components; resolve the triage questions
before implementation because the change touches every route.
