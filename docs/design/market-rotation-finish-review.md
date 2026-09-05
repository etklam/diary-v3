# Market rotation finish review

## Final acceptance — 2026-09-06

Root acceptance approved ticket43 after the source-preserved calculation review, generated contract check, real disposable PostgreSQL and controlled-provider evidence, final Chrome browser run, and inspection of the desktop/mobile captures against the Astra design brief. No production service or real user data was used.

- **Persistence and calculation:** The batch persists canonical daily prices before building scope-local snapshots. Canonical universe seeds, unique scope/symbol/date keys, nullable metrics, positive one-based ranks, idempotent replay, and the mixed-date/date-window corrections are covered by domain and PostgreSQL fixtures.
- **Batch and administrative entrypoints:** The HTTP administrator route and shared CLI call the same locked `runRotationBatch` use case. Real PostgreSQL/provider tests cover partial and stale failures, unknown/null metrics, qualified-date alignment, reruns, advisory-lock conflicts, terminal run tracking, and all-scope results. A frozen page/component scan found no separate rotation-batch caller; API and CLI are the ticket's administrative entrypoints, so a separate admin UI is not required.
- **Guest monitor:** The public API and `/tools/market-rotation` React route read canonical persisted rows and never refresh the provider on page reads. The response has explicit observation and nullable sector-summary dates, no-store responses including empty/validation paths, localized state/signal labels, scope controls, no-snapshot retry, and explicit unknown/insufficient values. Ticket45 owns the full historical comparison and expanded scope controls.
- **Evidence:** [`desktop.png`](evidence/market-rotation/desktop.png) and [`mobile.png`](evidence/market-rotation/mobile.png) were inspected against the design brief. The browser suite covers the real admin-batch-to-guest path, 404/retry, three locales, keyboard scope changes, date divergence, unknown/insufficient states, and responsive no-overflow behavior.
- **Verification:** Focused unit and contract tests passed 32/32; monitor PostgreSQL fixtures passed 2/2; admin HTTP/PostgreSQL passed 1/1; `npm run contracts:check`, `npm run typecheck`, and `npm run lint` passed; `PLAYWRIGHT_CHANNEL=chrome npx playwright test tests/e2e/market-rotation.spec.ts --reporter=line` passed 2/2 in 13.0s. The browser runner used the installed Chrome channel and disposable local database; no build, install, production service, or live provider was used for acceptance.

Market-state and breadth behavior remain ticket44. Portfolio20 market context integration remains a separate pending obligation. Neither is included in this ticket's completion claim.

## Tickets45/46 acceptance — 2026-09-06

Astra accepted filters, sorting, qualified comparison/trend behavior and current-view exports. The focused Chrome functional case passed; the actual English PNG is readable. The final native text measurement/header wrapping was source-reviewed without a fourth browser rerun, following the user's direction to skip trivial repeated verification. The added CJK capture assertion remains unexecuted, not claimed as observed evidence.
