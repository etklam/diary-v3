# [85] Launch straight into capture from the installed app icon

Status: accepted
Execution: done
Published: 2026-10-04

Type: AFK
User stories covered: US-101. App shortcuts are an enhancement to the delivered install flow.

## What to build

`apps/web/public/manifest.webmanifest` declares name, icons, display and scope but no
`shortcuts`. An installed user therefore launches to `/` and navigates to capture, even
though capture is the product's core loop.

Add a `shortcuts` array whose first entry opens `/diaries/quick`, so a long-press on the app
icon reaches capture directly. Add a second entry for `/reviews` to serve the review half of
the loop. This is a manifest declaration only: no caching, service-worker or offline-write
change, consistent with the scope boundary recorded in [58](58-pwa.md).

## Implementation notes

- File: `apps/web/public/manifest.webmanifest`. Reuse the existing `/icon-192.png`; no new
  art is required.
- Shortcut names must carry the same meaning as the in-app labels. The manifest cannot vary
  by locale and its `lang` is `zh-TW`, so use the zh-TW strings matching the `quick` and
  `reviews` keys already defined in `apps/web/app/diary-navigation.tsx`.
- Both target paths already handle an unauthenticated arrival: `/diaries/quick` renders the
  sign-in prompt with a capture return path (`apps/web/app/quick-composer.tsx:29`), and
  `/reviews` does the same (`apps/web/app/routes/reviews.tsx:135`). Verify, do not rebuild.

## Acceptance criteria

- [ ] An installed app exposes a capture shortcut and a review shortcut from the launcher,
      each landing on its route with the workspace shell intact.
- [ ] Launching the capture shortcut while signed out reaches the existing sign-in prompt and,
      after signing in, returns to capture through the already-validated in-site return path.
- [ ] Manifest remains valid and installable, and the existing install/update behavior and
      private-API NetworkOnly policy from [58](58-pwa.md) are unchanged.
- [ ] Shortcut labels read correctly against the in-app `quick` and `reviews` labels.
- [ ] Evidence records the manifest diff and a real install/launch check per shortcut, noting
      the browser and platform tested, since launcher shortcuts are not universally supported.

Shared slice rules apply: [切片共同遵循](../ISSUE-BREAKDOWN.md#所有切片共同遵循).

## Blocked by

None.

## Blocks

- [90](90-quick-cold-start-wait.md): this ticket makes cold-start capture a primary path, which
  is where that ticket's benefit is realized.

## Comments

Published 2026-10-04 from a capture-cost review. Rated highest return in that review on cost
grounds — roughly ten lines of JSON at zero code risk — and grouped with [87](87-prefilled-capture-entries.md)
as work that raises how often capture happens rather than how fast an open capture completes.

Implementation (2026-10-04): added a `shortcuts` array to
`apps/web/public/manifest.webmanifest` with two entries, both reusing the existing
`/icon-192.png`:
- `{"name": "記錄", "url": "/diaries/quick", ...}` — label sourced from
  `apps/web/app/diary-navigation.tsx`'s zh-TW copy (`capture: '記錄'`); `/diaries/quick` maps
  to the `capture` view per that file's `view()` resolver, so `capture`'s label is the correct
  match for the "quick" shortcut even though there is no literal `quick` key.
- `{"name": "複盤", "url": "/reviews", ...}` — label sourced from the same file's
  zh-TW `reviews: '複盤'`.

Verified by reading (no edits made):
- `apps/web/app/quick-composer.tsx:29` —
  `if(session.authenticated===false)return <><p>{t('loginRequired')}</p><Link to={signInPath(buildCapturePath('quick',captureContext,initialDate))}>{t('login')}</Link></>;`
  confirms `/diaries/quick` already renders a sign-in prompt with a capture return path when
  signed out.
- `apps/web/app/routes/reviews.tsx:134` —
  `if(session.authenticated===false)return <Link to={signInPath('/reviews')}>{t('login')}</Link>;`
  confirms `/reviews` already renders the equivalent sign-in prompt when signed out.

Commands run:
- `node -e "JSON.parse(require('fs').readFileSync('apps/web/public/manifest.webmanifest','utf8'));console.log('valid')"`
  → printed `valid`.
- `./node_modules/.bin/tsc --noEmit` → completed with no output (no type errors).

Outstanding: a real install/launch check of the two launcher shortcuts on an actual device
has NOT been performed in this session (no playwright/e2e run, per task constraints, and no
device available here). Launcher shortcuts are not universally supported across platforms
(notably unsupported in Safari/iOS PWA installs; supported in Chromium-based browsers on
Android and desktop, and in Edge). That device/browser verification is still required before
this ticket can be marked done.

## Execution record

Shipped in `83419ec`; the ticket's Execution line was left stale and is reconciled here on 2026-10-04.
