# Guru portfolio research

Scope: `/gurus/:slug/portfolio`, `/changes`, `/history`, `/filings`, and `/gurus/activity`. These are Operate and Read-adjacent research surfaces inside the existing Ledger world.

## Direction

The task is to inspect institutional disclosures with enough context to distinguish a reported holding from a manager's current position or a transaction. The manager identity, reported quarter, quality state, and concise 13F disclosure sit before the figures. Editorial interpretation stays separate from filing-derived facts.

Portfolio holdings use a ruled desktop table inside its own horizontal scroll region. On narrow screens the same fields move into stacked cards. The quarter selector and quality label travel together, while filters remain explicitly labeled native controls. Changes are grouped by action, with prior/current shares, change percentage, weights, and ranks visible together. History keeps incomplete and ready periods in chronology, and links each period to its source. Individual security history uses a native disclosure so it does not compete with the current holding; it includes the quarter action, shares, reported value, weight, rank, accession, source link, and its own CSV export.

The activity stream uses the same action and source language as the profile view. CSV downloads sit next to the data they export, preserve deterministic column order and quoting, and carry period and source context. No new color, shadow, icon, or card language is introduced.

## Evidence

- Browser flow: `tests/e2e/guru-research.spec.ts`.
- Synthetic integration fixture: `tests/integration/guru-research-http.test.ts`.
- Desktop capture: `evidence/guru-research/portfolio-desktop.png`.
- Mobile capture: `evidence/guru-research/portfolio-mobile.png`.
