# Company Hub finish review

## Current independent acceptance pass (2026-09-06)

The full-route desktop and mobile captures were regenerated from the existing Company Hub flow: [`1440.png`](evidence/company-hub/1440.png) is 1440×3906 and [`390.png`](evidence/company-hub/390.png) is 390×5313. They include the market quote/history reader, Company Hub context, Notes and Evidence readers in one route. The capture fixture waits for each reader to load and supplies five controlled history rows, so the complete route remains visible in the evidence. The mobile capture keeps the existing responsive table behavior and the route remains navigable without a page-level horizontal overflow.

`tests/e2e/company-hub.spec.ts` passed 3/3 in Chrome (14.3s):

- the 1440px and 390px holdings → Company → Diary/Thesis flows open the actual later-review `#review-*` anchor;
- a focused desktop fixture makes Notes fail and retry, then makes Evidence fail and retry, while the already-loaded quote, Company Hub and other reader stay available.

The latest capture-only rerun, `PLAYWRIGHT_CHANNEL=chrome npx playwright test tests/e2e/company-hub.spec.ts --grep "Company Hub connects"`, passed 2/2 in Chrome (15.7s). The prior full focused run passed 3/3 (14.3s), including the reader failure/retry case; the capture-only rerun intentionally did not duplicate that unchanged reader test. The existing integration evidence remains authoritative: `tests/integration/company-hub.test.ts` covers state transitions, cost concentration, relation precedence, candidate caps, owner isolation, missing/zero quote and credential behavior; `tests/integration/partner-http.test.ts` covers authorized partner Notes projection and private-field isolation accepted under ticket 38. No production defect was reproduced and no production files changed.

Root/Astra inspected the original-detail desktop/mobile pair and accepted the current-view/original-decision/review hierarchy, complete quote/Notes/Evidence route, and mobile wrapping without page overflow. The ticket acceptance boxes are now checked and status is `done`.

## Final acceptance record (2026-09-06)

The full focused suite passed 3/3 (14.3s), the final capture-only rerun passed 2/2 (15.7s), the existing 3 API scenarios passed, and ticket 38 partner Notes evidence remains accepted. No production defect was reproduced and no production files changed.

## Historical author checkpoint

The initial review was author-only because independent review agents had reached usage limits. The earlier captures were scoped to the Company Context region, while quote/history/Notes/Evidence had separate evidence. The count explanation was tightened to refer specifically to ten original decisions and ten Thesis reviews, since the separate Notes/Evidence readers expose their own larger pages.

The historical browser checkpoint recorded 2 passed (8.6s), followed by the DB relation-precedence scenario and suite result of 3/3 (2.64s). The first browser attempt had an incorrect test-only accessible table name, corrected from Current holdings to the actual Cost holdings label.

Ticket 38's authorized Partner Notes integration and owner/private-field isolation are now accepted; the former “pending” note in earlier review text is retained here only as history.
