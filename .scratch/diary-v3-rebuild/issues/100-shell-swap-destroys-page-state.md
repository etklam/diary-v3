# [100] Confirming the session destroys every page's unsaved state

Status: triaged
Execution: done (2026-10-08); unit tests and an SSR byte comparison green, the new e2e scenarios not yet run
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

## Resolution (2026-10-08)

There were two independent destroyers, not one. The shell swap was the visible half; the other
half was `<Outlet key={session.revision}>`, which remounted the routed tree on *every* session
event — including the first confirmation on a private route, where no chrome swap happens at all.
That is why `/diaries/quick` lost its writing even though it never wears the public shell.

**Both shells now render from one element tree.** `shellChrome(pathname, authenticated, role)`
(`apps/web/app/shell-chrome.ts`) is a pure decision — `public`, `private` or `pending` — and the
shell renders `main` and the `Outlet` inside it at the same position in either branch. Only the
surrounding chrome is mounted and unmounted: header and footer, or sidebar, command palette and
diary navigation. React reconciles everything under `main` instead of replacing it.

**Confirming a session is no longer a content boundary.** The session store gained `identity`
beside `revision`. `revision` still advances on every session event, so caches, in-flight read
guards and the per-surface `resultSessionRevision === session.revision` scoping are untouched.
`identity` advances only when the signed-in identity actually changes — a sign-in over a
signed-out or different session, a sign-out, an expiry — and the shell keys the routed content on
it. Resolving `authenticated: null → true` is not an identity change.

### Answers to the triage questions

- **One shared subtree?** Yes. The chrome differs by element type at index 0 and by what follows
  `main`; `main` itself and its children keep stable positions, including a `{!publicChrome &&
  <ForegroundReminders/>}` slot so the `Outlet` does not shift index between branches.
- **Is guest SSR still correct?** Yes, and verified rather than argued: the dev server's SSR output
  for `/`, `/about`, `/tools/relative-value`, `/diaries`, `/timeline` and `/login` is
  byte-identical before and after this change, apart from the HMR version nonce. The chrome
  decision itself did not move — only how it is rendered.
- **Does anything depend on the remount?** No. Every private surface audited re-reads on
  `[session.authenticated, session.revision]`, which still fires: `diary-list`, `evidence`,
  `stock-notes`, `seasonality`, `ai-reports`, `guru-notifications`, `trade-plan`,
  `review-continuation`, `company-context-input`, `use-review-count`, `foreground-reminders`.
  `diary-list` additionally withholds results until `resultSessionRevision === session.revision`,
  so the confirmed-session read is what reaches the screen either way.

### Evidence

- `tests/unit/shell-chrome.test.ts` — the chrome decision table, plus the invariant that a private
  address resolves to `private` both unresolved and confirmed.
- `tests/unit/session-identity.test.ts` — a confirmation advances `revision` and not `identity`;
  sign-in over a session, sign-out and expiry all advance both.
- `tests/e2e/shell-session-confirmation.spec.ts` — holds `/api/auth/me` so the page can be worked
  on while the session is unresolved, then releases it. On `/diaries` a typed filter, an opened
  `<details>` and focus all survive; on `/tools/relative-value` the typed prices and the computed
  ratio survive the public → private chrome swap.
- Full unit suite: 131 files, 1173 tests, green. `react-router build` green.

**Not yet run: the two new e2e scenarios.** They need the tunnelled Postgres the E2E harness
provisions against, and `127.0.0.1:55433` was closed for this session.

## Follow-up this unblocks

- **Done, same day, as a separate change**: `quick-composer.tsx` no longer withholds the writing
  area while `session.authenticated === null`, and the `preAccountDraft` module variable with its
  `PRE_ACCOUNT_CARRY_MS` window is gone. That is the rest of
  [90](90-quick-cold-start-wait.md) — see its second execution record.
- `tests/support/e2e.ts` `selectPreference` retries around the shell swap stealing its control
  mid-action. The chrome still swaps, so the retry stays, but the comment describing it as a tree
  replacement is no longer accurate.
