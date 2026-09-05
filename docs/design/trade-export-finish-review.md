# Closed-trade export — independent finish review

Verdict: **ship** for ticket 22's export control.

Reviewed `apps/web/app/trade-export.tsx`, its holdings integration, `tests/e2e/trade-export.spec.ts`, and both `.impeccable/review/trade-export-{1440,390}.png` captures. The control fits the incumbent holdings page, has an explicit optional symbol label, explains inclusion of partial sales, wraps within the mobile viewport, and exposes download preparation as a live status. Light desktop and dark mobile remain readable. The visible mobile skip link is a keyboard-focus state, not an export defect.

The implementation uses the authenticated session transport, aborts stale work on unmount, retains the symbol across failure, disables duplicate submission, downloads the server response as a Blob, and revokes its object URL. Errors use the existing structured recovery notice; authentication failure links to sign-in with a safe holdings return path.

Root supplied a passing two-viewport browser run. Its tests validate the actual downloaded filename and exact CSV contents for a partial sale, controlled 500 failure and retry, three locales, and absence of document overflow. No material UI or functional issue identified in this focused review. No further rerender or polish requested.
