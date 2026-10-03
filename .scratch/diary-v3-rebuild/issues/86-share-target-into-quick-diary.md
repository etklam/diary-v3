# [86] Receive shared links and text into a Quick Diary draft

Status: ready-for-agent
Execution: todo
Published: 2026-10-04

Type: AFK
User stories covered: US-101. Receiving shared content is an enhancement to the delivered install flow.

## What to build

The highest-value capture moment for an investment diary is reading something elsewhere — a
filing, a news item, an analysis — and having a reaction. Today that requires leaving the
reader, opening the app, and retyping or pasting context by hand.

Register the installed app as a Web Share Target so the system share sheet can send a title,
text and URL straight into a Quick Diary draft with that content already in the writing area.
The user then writes their own reaction and saves through the existing confirmed-write path.

Scope is receiving shared text. No offline writes, no background sync, no shared files or
images, and no change to the private-API caching policy from [58](58-pwa.md).

## Implementation notes

- Declare `share_target` in `apps/web/public/manifest.webmanifest` with `action: "/diaries/quick"`,
  `method: "GET"`, and `params` mapping `title`, `text` and `url`. GET keeps the existing
  route and SSR loader path and needs no new server endpoint. If a later need for shared
  files appears, that is a separate escalation to `POST` with `multipart/form-data`.
- `apps/web/app/routes/quick.tsx` already parses the query string through
  `parseCaptureContext` (`apps/web/app/capture-context.ts`), which today understands only
  `date` and company context. Extend that parsing — do not add a second ad hoc query reader.
  Note the existing path whitelist at `apps/web/app/capture-context.ts:152` and `:159`;
  keep share params inside the same validated surface.
- `QuickComposer` currently accepts `initialDate` and `captureContext` only. Add an initial
  content seed alongside them and route it through the existing `empty()` draft constructor
  in `apps/web/app/quick-composer.tsx:23` so draft persistence, `contentTouched` and template
  suggestion behavior stay consistent. A seeded draft is user content: it must set
  `contentTouched` so template generation does not overwrite it
  (`apps/web/app/quick-composer.tsx:54`).
- Compose the seed from the available params as plain text — a URL alone, a title with its
  URL, or shared text with its source. Shared values are untrusted external input: treat them
  as literal text destined for the textarea, never as trusted markup, and bound their length
  against the content limit in `packages/contracts/src/index.ts:516`.
- Web Share Target is unsupported in iOS Safari. Absence must be silent: no broken entry
  point and no visible promise of a capability the platform will not deliver.

## Acceptance criteria

- [ ] Sharing a page from a supporting browser to the installed app opens Quick Diary with the
      shared title, text and/or URL already in the writing area, and a normal save persists the
      user's writing together with that content, read back through the real API.
- [ ] An existing unsaved draft is never silently destroyed by an incoming share. The existing
      Restore/Discard affordance (`apps/web/app/quick-composer.tsx:72`) governs the conflict, and
      choosing either outcome leaves a coherent draft state.
- [ ] Missing, empty, oversized or hostile share params degrade to an ordinary empty capture
      with no crash and no invalid write. Shared text containing Markdown or HTML syntax is
      stored and previewed as safe content under the existing Markdown rules.
- [ ] A share arriving while signed out reaches the existing sign-in prompt and the shared
      content survives to the composer after signing in, using the already-validated in-site
      return path rather than a new redirect mechanism.
- [ ] Existing capture-context handoff from the Company page is unaffected, and
      `tests/unit/capture-context.test.ts` passes with coverage extended to the new params.
- [ ] Evidence records the browser and platform used for the real share, and states explicitly
      that iOS Safari does not support the capability.

Shared slice rules apply: [切片共同遵循](../ISSUE-BREAKDOWN.md#所有切片共同遵循).

## Blocked by

- [85](85-app-shortcuts-to-capture.md): lands the manifest change first so both declarations
  are verified against one installable manifest.

## Comments

Published 2026-10-04 from a capture-cost review. The review initially deferred this item
because the benefit is zero on iOS Safari; the user asked on 2026-10-04 for it to be included,
so it is scheduled with the platform limitation recorded in the acceptance criteria rather
than left as an open question.
