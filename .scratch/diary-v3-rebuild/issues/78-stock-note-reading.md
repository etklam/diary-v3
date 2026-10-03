# [78] Read authorized Stock Notes in the list and Company Hub

Status: ready-for-agent
Execution: done
Draft reference: B02
Published: 2026-09-20


Type: AFK
User stories covered: US-047, US-054, US-067, US-069, US-074 (preserved behavior).

## What to build

Give a Stock Note reading Module ownership of accepted-Partner visibility and authorized row acquisition for both the standalone note list and Company Hub. Preserve the complete reading experience: a viewer sees their own notes and only the partner-authored notes allowed by the existing directional sharing rules, with the current response projections, attribution and browser presentation. Keep standalone targeted reading and the multi-author Company Hub preview distinct.

## Acceptance criteria

- [x] Both existing readers use one owned Implementation of accepted-link and author-side Stock Note sharing policy together with authorized note acquisition. Extracting only a boolean or SQL fragment while callers independently reconstruct the policy does not satisfy the ticket.
- [x] Standalone partner reading preserves its selected author, filters, pagination, totals, stable ordering and 403 denial, including authorization behavior for a missing Stock. Company Hub preserves owner plus all authorized partner notes, current ordering, ten-note bound, omission of inaccessible notes and its separate attribution projection.
- [x] Permission checks and row acquisition remain inside each caller's existing read-only repeatable-read snapshot. Do not introduce a permission cache, detached authorization query or general Partner-content framework.
- [x] Preserve both HTTP acceptance paths for pending links, both directions of the author-sharing flag, revocation, unlinking, unowned writes and owner isolation. Partner Transaction, holdings, Evidence, Thesis and private Review data remain excluded.
- [x] Browser acceptance reads shared notes in both existing views, verifies attribution, then changes the author sharing setting or unlinks and re-fetches through the existing workflow; the standalone denial and Hub omission match persisted permissions. No new realtime revocation guarantee is introduced.
- [x] Keep the existing privacy tests as the main acceptance surface and add only uncovered integration regressions from the consolidation. Document the shared reading Seam and why each caller retains its own projection; no current leak is claimed.

## Blocked by

None — can start immediately.

## Delivery constraints

- Astra owns architecture direction and final acceptance; Luna owns implementation and test fixes. Use a focused Sol review for integrity, privacy and time semantics. Routine agent review is not a human blocker. No production cutover is included.
- Each ticket completes its affected persistence, contract, HTTP/client and browser paths with runnable evidence. Existing schema and wire behavior should remain compatible; do not invent migrations or endpoint changes merely to touch every layer.
- Keep runtime contracts and native compatibility, owner isolation, immutable evidence, directional Partner sharing, decimal precision, civil dates and exact UTC Instants. ADRs 0001, 0006 and 0011 constrain this work.
- Retain the current presentation, native datetime-local controls, labels, focus, error feedback, three locales and theme behavior. Domain payload validation, copy, rendering and draft lifecycle stay in their existing owning Modules. Any material visual change needs an Astra brief and acceptance under DESIGN and Impeccable.
- Use synthetic browser fixtures, controlled provider responses and real disposable PostgreSQL for persistence, concurrency, permissions and rollback. Never use real user data or production services.
- Reuse existing behavioral suites and add only meaningful consolidation regressions. Record commands and results before marking execution complete. Run relevant type, lint and contract checks for affected paths.

## Comments

Published on 2026-09-20 after the user approved the five-slice breakdown and authorized publication. The source architecture review rated this opportunity Worth exploring; this ticket makes no claim of an observed defect. The original PRD is unchanged. Implementation acceptance remains pending.

## Implementation acceptance — 2026-09-20

Astra accepted the shared read Module after Luna implementation and focused Sol privacy review. `authorIsShared` owns the accepted-link and author-direction rule; `readStockNotesForAuthor` and `readAuthorizedStockNotePreview` acquire authorized rows inside caller-owned repeatable-read snapshots. The list retains pagination and 403-before-Stock behavior, while Hub retains its bounded projection without a full count.

- `npx vitest run tests/integration/partner-http.test.ts tests/integration/company-hub.test.ts tests/integration/stock-notes.test.ts`: 14 tests passed.
- `npx playwright test tests/e2e/stock-note-sharing.spec.ts tests/e2e/stock-notes.spec.ts tests/e2e/partners.spec.ts tests/e2e/company-hub.spec.ts --reporter=list`: 7 passed initially; the new test had an incorrect partial-object assertion and one existing test encountered a concurrent unfinished editor edit. Both were corrected/stabilized.
- `npx playwright test tests/e2e/stock-note-sharing.spec.ts tests/e2e/stock-notes.spec.ts --grep "shared Stock Notes|Company note pagination" --reporter=list`: both affected tests passed. All nine selected browser cases now pass.
- Full unit suite (697 tests), typecheck, full ESLint, contract drift check and diff whitespace checks passed.

The existing CompanyContext component consumes the Hub response but does not separately render its `notes` array. Browser acceptance therefore checks actual page-triggered Hub responses for attribution and permission omission, alongside the existing visible Company Notes reader. No additional notes UI or realtime revocation behavior was added. Revocation and unlinking are verified by fresh reads against persisted permissions.
