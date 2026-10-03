# [84] Close the Quick Diary keyboard loop with Cmd/Ctrl+Enter

Status: ready-for-agent
Execution: in-progress
Published: 2026-10-04

Type: AFK
User stories covered: US-015, US-016, US-017. Keyboard submission is an enhancement to these stories.

## What to build

`Ctrl/Cmd+J` opens the global capture dialog and focuses content (`apps/web/app/quick-entry.tsx:43`),
but there is no keyboard path to submit — the loop ends at a pointer action. Add
`Ctrl/Cmd+Enter` submission to the Quick Diary content textarea so open → write → save
completes without leaving the keyboard, on both the page (`/diaries/quick`) and the dialog.

Submission must go through the existing `save()` handler and respect every current
disabled condition. This ticket adds a trigger, not a new write path.

## Implementation notes

- Content textarea lives in the `quick-writing` section of `apps/web/app/quick-composer.tsx`.
  Use the owning form's `requestSubmit()` so `save()`, `aria-busy`, and the submit
  button's disabled conditions (`pending || checking || lookupError || uncertain || !content.trim()`)
  all stay authoritative.
- Reuse the established modifier/IME guard rather than writing a new one. Both
  `apps/web/app/quick-entry.tsx:43` and `apps/web/app/command-palette.tsx:103` already
  check `defaultPrevented`, `isComposing`, `altKey`, and `shiftKey`. The `isComposing`
  check is the critical one: pressing Enter mid-composition in a Chinese IME must commit
  the candidate and never submit the form.
- Add the shortcut to the visible hint copy in `apps/web/app/quick-copy.ts`, presented like
  the existing `⌘ / Ctrl J` affordance (`.quick-entry-shortcut`, `apps/web/app/quick-entry.tsx:46`).

## Acceptance criteria

- [ ] `Ctrl/Cmd+Enter` in the content textarea saves through the same confirmed-write path as the
      submit button, on both `/diaries/quick` and the global dialog. Create and same-day append
      both work and read back through the real API.
- [ ] The shortcut cannot bypass a disabled submit: while a write is pending, a destination
      lookup is in flight or failed, a draft is in the uncertain state, or content is empty,
      the keystroke performs no write.
- [ ] Enter during IME composition commits the candidate text and does not submit, verified in
      all three locales. Plain Enter still inserts a newline. The shortcut does not fire from
      other fields in the composer.
- [ ] The shortcut is discoverable in visible copy in all three locales and does not conflict
      with `Ctrl/Cmd+J` or `Ctrl/Cmd+K`.
- [ ] Browser evidence covers keyboard-only capture end to end: open with `Ctrl/Cmd+J`, type,
      submit with `Ctrl/Cmd+Enter`, and reach the continuation state from [71](71-quick-save-continuation.md)
      without a pointer.

Shared slice rules apply: [切片共同遵循](../ISSUE-BREAKDOWN.md#所有切片共同遵循).

## Blocked by

None. Additive to the delivered Quick Diary flow.

## Comments

Published 2026-10-04 from a capture-cost review of `/diaries/quick` and `/diaries/new`.
Rated the cheapest item in that review: roughly five lines plus copy, with the IME guard
pattern already present twice in the codebase, against a benefit paid on every capture.

2026-10-04 implementation (execution: in-progress; e2e evidence still owed).

Changed:

- `apps/web/app/quick-composer.tsx`: hoisted the submit-disabled expression into
  `submitBlocked` so the button and the new shortcut share one source of truth, added an
  `onKeyDown` guard on the content textarea only
  (`defaultPrevented || nativeEvent.isComposing || altKey || shiftKey || key!=='Enter' ||
  !(metaKey||ctrlKey)` → return), and submit through `event.currentTarget.form.requestSubmit()`
  so `save()`, `aria-busy` and the fieldset stay authoritative. The textarea's
  `aria-describedby` now also points at the hint.
- `apps/web/app/quick-copy.ts`: `submitShortcut` in all three locales (`Save with` /
  `儲存快速鍵` / `保存快捷键`), rendered beside the submit button with `<kbd>⌘ / Ctrl Enter</kbd>`.
- `apps/web/app/quick.css`: `.quick-submit` becomes a wrapping flex row and
  `.quick-submit-shortcut` is muted `--text-2xs`; hidden under `max-width: 767px`, matching
  the existing `.mobile-menu-capture .quick-entry-shortcut` precedent.

Commands run:

- `./node_modules/.bin/tsc --noEmit` — clean. This is also the locale-parity check: `quickCopy[locale]`
  is a union of the three literal types, so a key missing from one locale fails the build.
- `./node_modules/.bin/eslint apps/web/app/quick-composer.tsx apps/web/app/quick-copy.ts` — clean.
- `./node_modules/.bin/vitest run --exclude 'tests/integration/**' --exclude 'tests/e2e/**'` —
  120 files / 1049 tests passed.

No unit test added: `vitest.config.ts` collects only `tests/**/*.test.ts` under the node
environment with no jsdom or testing-library, so the keydown guard is not reachable from a
unit test. `tests/unit/quick-composer.test.ts` is domain-level only and shared with the other
Quick Diary tickets in flight, so it was left untouched.

Still needs browser evidence (all remaining acceptance criteria):

- Create and same-day append by `Ctrl/Cmd+Enter` on `/diaries/quick` and in the `⌘J` dialog,
  read back through the real API.
- No write while pending, while a destination lookup is in flight or failed, while uncertain,
  or with empty/whitespace-only content.
- IME: Enter mid-composition commits the candidate and does not submit, in all three locales.
  Plain Enter still inserts a newline; no fire from the title, tags or snippet fields.
- Keyboard-only loop to the [71](71-quick-save-continuation.md) continuation state without a pointer.
