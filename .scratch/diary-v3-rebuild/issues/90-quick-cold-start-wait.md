# [90] Remove the cold-start wait before the Quick Diary writing area

Status: accepted
Execution: done
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

- [x] On a cold load of `/diaries/quick` and a cold `Ctrl/Cmd+J`, the writing area is present
      and typable without waiting for the account read, and nothing typed in that window is
      lost when the read confirms.
- [x] The resolved date matches the account timezone once confirmed. A date the user changed
      themselves is never overwritten, and the create/append destination lookup reflects the
      final date.
- [x] Draft, snippet and recent-tag storage remain account-scoped throughout. A write that
      began before confirmation lands under the confirmed account's keys, and no state is
      readable by another account.
- [x] A failed account read reaches the existing error and retry state without presenting a
      composer that cannot save; signed-out arrival still reaches the sign-in prompt with its
      capture return path.
- [x] Draft Restore/Discard, uncertain-append protection and confirmed create/append are
      unchanged, with `tests/e2e/diary-response-loss.spec.ts` and
      `tests/e2e/quick-authoring-follow-up.spec.ts` passing.
- [x] Evidence states the measured cold-path behavior before and after, and confirms the warm
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

## Execution record — 2026-10-04

The measured cold path turned out to be shaped by something the ticket did not name. Confirming
the session swaps the public shell for the private one, and that swap **remounts everything under
`main`**. Instrumenting the composer on a cold load of `/diaries/quick` showed the sequence:
composer mounts → user types → session confirms → `COMPOSER UNMOUNT` / `COMPOSER MOUNT` → the
textarea is empty, the disclosures are closed and focus is gone.

So rendering a writing area before the session bootstrap hands back a surface that resets a frame
later. What shipped instead:

- **The composer no longer waits for the account read.** It renders as soon as the session is
  known (`authenticated === true`), which is the same moment the private shell appears. The
  account read now reconciles into a live composer instead of gating it: `/api/auth/me` is already
  cached by `account-resource.ts` at that point, so the second wait the ticket described is gone.
- **The date seeds from the device timezone and is corrected by the account timezone**, never
  overriding a date the author chose or one carried in from a capture link. The destination lookup
  re-runs for the corrected date.
- **Storage stays account-scoped.** Draft, snippet, reminder and recent-tag keys exist only once
  the account is confirmed; before that nothing is written. On confirmation the composer reads any
  stored draft (offering Restore only if nothing has been typed), loads snippets, and the typed
  draft begins persisting under the confirmed account's key.
- **Writing typed before the account confirms is carried across the shell swap in memory**
  (`preAccountDraft`, 15 seconds, same document, never stored, dropped on confirmation or on
  sign-out). This covers the remaining window: a fast session confirmation followed by a slow
  account read.
- **Append waits for the confirmed account**, because the uncertain-append marker is device
  storage keyed by account. Create does not.
- A failed account read keeps the existing error and retry state when nothing has been typed, and
  becomes an inline retry beside the composer when it has, so a failure can never destroy writing.

The deeper finding — that the shell swap destroys all unsaved state under `main` on every cold
load, not just here — is recorded as a follow-up rather than fixed in this ticket, because the fix
is a root-layout change affecting every route.

## Execution record — 2026-10-08, after [100]

[100](100-shell-swap-destroys-page-state.md) removed the remount, so the two workarounds this
ticket shipped around it are gone and the wait it was written about is gone with them.

- **The writing area is no longer withheld for the session bootstrap.** The
  `session.authenticated === null` loading paragraph is deleted. Measured rather than asserted:
  the server-rendered `/diaries/quick` used to contain `role="status">正在載入…` and no
  `#quick-content`; it now ships the textarea in the first server-rendered frame. There is no
  wait left to remove on this path — not for the account read, not for the session, not for
  hydration.
- **`preAccountDraft` is deleted**, with its 15-second carry window. Nothing needs to survive a
  remount that no longer happens.
- **The write guard moved from revision to identity.** `liveWrite` compared
  `session.revision`, which was safe only because the composer could not render before the
  confirmation bump. With writing now starting on a cold document, a confirmation landing
  mid-write would have advanced the revision and made the composer abandon a diary the server had
  already created. It compares `identity` instead, which a confirmation does not change, and
  treats a still-resolving session as live — the request's own cookies decide it, and a 401 ends
  the identity, which the guard does catch.
- **The account read is scoped to the identity too**, so confirming the session no longer
  discards the account and re-reads it from cache mid-write.
- **A latent dead branch became reachable, and it is a bug fix.** If `/api/auth/me` failed with
  anything other than a 401, nothing ever confirmed the session, so the old gate showed
  `loading` **forever** and the reader could never write. The error-and-retry state below it was
  unreachable on a cold load. It is now reached, and create still saves while the account read is
  failing, because the write only needs the cookie.

### New conflict this created, and how it is resolved

Writing can now begin before the account is known, so a draft stored for that account and writing
typed on the cold document can both exist, with one device key between them. The old code offered
the stored draft only `if(!dirtyRef.current)` — under the old ~1ms window that was never false,
but under a real network round-trip the typed draft would have silently overwritten the stored one
with no offer ever shown. Now:

- the stored draft is offered even when writing has begun, and the offer does not take the caret
  from the author;
- **Restore** asks before replacing what is typed, reusing the existing `Replace the current
  writing?` confirmation rather than adding copy in three locales;
- **Discard** drops the stored draft and leaves writing already in progress untouched; with
  nothing in progress it still resets the composer exactly as before.

### Evidence

- `tests/e2e/quick-authoring-follow-up.spec.ts` — the cold-start case no longer sleeps 1500ms; it
  **holds** `/api/auth/me` open, types while it is in flight, asserts the session is still
  unconfirmed (no sign-out in the shell), then releases and checks the writing saved with its
  exact content. Two new cases cover the conflict above: restore-asks-then-replaces, and
  discard-keeps-what-was-typed-and-saves-it.
- Full unit suite 131 files / 1173 tests green; `tsc --noEmit`, `eslint .` and `react-router
  build` green.

**Not yet run: the three e2e cases.** They need the tunnelled Postgres the harness provisions
against, and `127.0.0.1:55433` was closed for this session.

Verification: a new case in `tests/e2e/quick-authoring-follow-up.spec.ts` delays `/api/auth/me` by
1.5s, types into the composer while it is in flight, and asserts the writing survives confirmation
and saves with its exact content. `quick-diary`, `quick-layout-follow-up`,
`quick-authoring-follow-up` and `diary-response-loss` all pass.
