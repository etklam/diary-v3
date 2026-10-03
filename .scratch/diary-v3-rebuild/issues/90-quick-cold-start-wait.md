# [90] Remove the cold-start wait before the Quick Diary writing area

Status: ready-for-agent
Execution: todo
Published: 2026-10-04

Type: AFK
User stories covered: US-015, US-016, US-017. Removing the pre-write wait is an enhancement to these stories.

## What to build

`QuickComposer` resolves `GET /api/auth/me` before rendering anything writable, and shows a
loading status until it returns (`apps/web/app/quick-composer.tsx:28` and `:31`). It needs two
things from that response: the account timezone, to compute today's date, and the account id,
which keys the draft, snippet and recent-tag storage.

The cost is narrower than it first appears. `apps/web/app/account-resource.ts` already caches
confirmed account reads for 30 seconds and dedupes concurrent reads, mounted at
`apps/web/app/session.ts:173`. A second `Ctrl/Cmd+J` within that window resolves from memory in
a microtask. The wait is real only on the first capture after a cold page load — which is
precisely the path [85](85-app-shortcuts-to-capture.md) turns into a primary one by letting the
launcher open capture directly.

Make the writing area available immediately on that cold path, and reconcile the date and
account-scoped storage once the account read confirms.

## Implementation notes

- Prefer carrying account id and timezone from the root loader so the composer renders from
  data the shell already has, instead of adding a second client fetch or a bespoke cache.
  Check what `apps/web/app/root.tsx` and `apps/web/app/session.ts` already expose before adding
  anything; `useSessionState` currently reports authentication state, not account identity.
- `Composer` is mounted with `key={account.id}` (`apps/web/app/quick-composer.tsx:31`), so an
  id arriving later would remount and discard in-progress typing. Resolve the identity before
  or without that remount — do not let a late-arriving id destroy typed content. This is the
  main risk in the ticket.
- `account.id` keys `diary-quick-draft:`, `diary-quick-snippets:` and the recent-tag storage
  (`apps/web/app/quick-composer.tsx:39`, `:44`, `apps/web/app/recent-tags.ts:4`). Writing to an
  unscoped or guessed key, or failing to migrate what was typed before confirmation, would
  cross account boundaries or lose a draft. Neither is acceptable.
- The date seeds from the account timezone (`calendarDateInTimezone`). If writing starts before
  the timezone is known, the date must be corrected on confirmation without silently changing a
  date the user chose, and the destination lookup must re-run for the corrected date.
- Unauthenticated and error states must stay exactly as delivered: the sign-in prompt with a
  capture return path, and the retry affordance.

## Acceptance criteria

- [ ] On a cold load of `/diaries/quick` and a cold `Ctrl/Cmd+J`, the writing area is present
      and typable without waiting for the account read, and nothing typed in that window is
      lost when the read confirms.
- [ ] The resolved date matches the account timezone once confirmed. A date the user changed
      themselves is never overwritten, and the create/append destination lookup reflects the
      final date.
- [ ] Draft, snippet and recent-tag storage remain account-scoped throughout. A write that
      began before confirmation lands under the confirmed account's keys, and no state is
      readable by another account.
- [ ] A failed account read reaches the existing error and retry state without presenting a
      composer that cannot save; signed-out arrival still reaches the sign-in prompt with its
      capture return path.
- [ ] Draft Restore/Discard, uncertain-append protection and confirmed create/append are
      unchanged, with `tests/e2e/diary-response-loss.spec.ts` and
      `tests/e2e/quick-authoring-follow-up.spec.ts` passing.
- [ ] Evidence states the measured cold-path behavior before and after, and confirms the warm
      path within the 30-second cache window is unaffected.

Shared slice rules apply: [切片共同遵循](../ISSUE-BREAKDOWN.md#所有切片共同遵循).

## Blocked by

- [85](85-app-shortcuts-to-capture.md): scheduling condition. The launcher shortcut is what
  makes cold-start capture a primary path, so this ticket's benefit is only realized after it.

## Comments

Published 2026-10-04 from a capture-cost review. The review initially rated this the single
most valuable fix and then downgraded it after finding the 30-second account cache in
`account-resource.ts` — the wait is a cold-start cost, not a per-capture one. Sequenced after
[85](85-app-shortcuts-to-capture.md) for that reason.
