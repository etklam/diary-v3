# [07] Add portfolio, changes, history, activity, and export

Status: ready-for-agent
Execution: done
Type: AFK

## Parent

[Guru Portfolio PRD](../PRD.md)

## What to build

Deliver quarter-aware holdings, categorized moves, full history, position history, the platform activity feed, and CSV exports.

## Acceptance criteria

- [x] /gurus/:slug/portfolio supports quarter switch, sort/search, sector/security-type filters, new/increased/reduced filters, and CSV export.
- [x] /gurus/:slug/changes groups new, increased, reduced, exited, largest weight, and largest rank moves with prior/current quantities, change percentage, weight, and rank.
- [x] /gurus/:slug/history includes portfolio value, position count, concentration, sector allocation, turnover, and a selector for every READY/partial quarter with data state.
- [x] /gurus/:slug/filings is delivered with filing status and source links; filing detail preserves accession/source lineage.
- [x] Position history exposes quantity, weight, reported value, rank, and quarter action for each comparable quarter.
- [x] /gurus/activity filters by Guru, symbol, sector, quarter, action, minimum weight, and minimum quantity-change percentage.
- [x] CSV exports cover the Guru portfolio, quarter changes, position history, and consensus stocks; files are stable, correctly escaped, and include report-period/source context.
- [x] Browser evidence covers table/card layouts, filters, quarter selection, history, activity, and export.

## Blocked by

- [05 portfolio analytics](05-portfolio-analytics.md)
- [06 Guru discovery and overview](06-guru-discovery-overview.md)

## Implementation evidence

- `/gurus/:slug/portfolio`, `/changes`, `/history`, `/filings`, and `/gurus/activity` are served by `routes/guru-research.tsx` against `apps/api/src/guru-research.ts`; CSV exports cover the portfolio, quarter changes, position history, and (in ticket 08) consensus stocks.
- Browser evidence for the table and card layouts, filters, quarter selection, history, activity, and exports is in [design evidence](../../../docs/design/evidence/guru-research/).
- Reconciled during ticket 11 after the slice shipped without its tracker update.
- `npm run typecheck` — passed.
- `npx playwright test tests/e2e/guru-research.spec.ts` — 1 passed, covering desktop tables, mobile cards, filters, quarter selection, history, activity, and both CSV downloads.
