# PWA and complete navigation finish review

## Scope

Ticket 58 adds install metadata, an explicit service-worker update boundary, a static-resource cache, and the compact mobile navigation described in [complete-navigation-brief.md](./complete-navigation-brief.md). The worker does not cache SSR documents, `/api/**`, or Socket.IO requests. Logout sends a private-cache-clear message; no private cache namespace is populated by the static strategy.

## Verification

- `tests/unit/pwa.test.ts`: 2/2 passed. Manifest scope/display/icon sizes and the worker's API/document bypass, update message, cache namespace, and `no-store`/`private` response guard are covered.
- `tests/e2e/pwa.spec.ts`: 3/3 focused cases passed in installed Chrome. The existing installability/cache and authenticated mobile-menu cases remain green; the added update case registers a controlled v2 worker, observes it waiting, applies it through the real update control, and verifies an unsaved diary title survives activation. The run also checked the real manifest through Chrome CDP, Chrome installability errors, guest `/`, `/about`, `/guide`, static favicon recovery while offline, failed private `/api/auth/me` while offline, no API request in Cache Storage, and mobile Menu navigation to SEC filings with Escape focus return, locale change, and no page overflow.
- The update case uses the public synthetic fixture [`sw-update-v2.js`](../../apps/web/public/sw-update-v2.js) only to make the v1 → waiting v2 → user Apply → active lifecycle deterministic; it does not add an offline-write or background-sync path.
- Evidence: [1440.png](./evidence/pwa/1440.png) and [390.png](./evidence/pwa/390.png).
- Static `npx tsc --noEmit --pretty false` was blocked only by the concurrent `apps/web/app/routes/admin-users.tsx:28` enum indexing error; the PWA unit suite passed independently. The unrelated admin-users error was subsequently assigned to its owner.

## Independent UI review

The desktop capture keeps the established sidebar and grouped links while the writing surface remains readable. The mobile capture shows the native menu dialog with grouped translated links, account preferences, and the existing sign-out action; the route stays within the viewport. During review a real CSS specificity defect exposed the desktop navigation behind the mobile dialog; `.sidebar .desktop-nav` now hides it at the mobile breakpoint and the focused Chrome suite passes after that correction.

Root acceptance remains pending for this ticket; the acceptance checkboxes in the issue file are intentionally unchanged.
