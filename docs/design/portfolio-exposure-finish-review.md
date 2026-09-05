# Portfolio exposure finish review

The earlier author-only review below is retained as history. The latest candidate remains in-progress pending root acceptance.

Inspected `evidence/portfolio-exposure/1440.png` (light) and `390.png` (dark). Seven named buckets display exact readable percentages beside native accessible meters. Unknown classification is explicit and included in the cost denominator. Copy distinguishes cost exposure from quoted market-value concentration and avoids presenting fallback allocation targets as a live recommendation.

Evidence: 84 domain fixtures passed; 1 real PostgreSQL scenario passed; 2 browser scenarios passed (9.0s) covering partial quotes, differing denominators, Company navigation, retry, locales and logout.

## Latest candidate evidence — 2026-09-06

The persisted Rotation comparison now carries separate provenance: `lastUpdated` remains the rank snapshot instant, while `marketStateAsOfDate` and `summaryAsOfDate` identify the market-state and sector-breadth dates. A mixed-date PostgreSQL fixture verifies rank/summary `2026-09-04` versus market state `2026-09-03`; the focused integration suite passed 4/4.

The focused Chrome browser suite passed 2/2 in 11.9s. It covers the known allocation comparison, separate dates, cost versus priced concentration, Company navigation, local table scroll and keyboard focus at 390px, page overflow, retry, three locales, dark mode and logout. Regenerated evidence is `evidence/portfolio-exposure/1440.png` (light) and `evidence/portfolio-exposure/390.png` (dark). Independent inspection found the three dates readable on desktop and mobile; the narrow table remains within its named local scroll region and the page has no horizontal overflow.

Pending root/Astra acceptance and generated contract artifact refresh. Ticket 20 remains in-progress until that gate is recorded.

## Astra acceptance — 2026-09-06

Root independently inspected both latest exposure captures and both attention captures. Composition, readable provenance, explicit cost/quoted denominators and local-scroll behavior are accepted. Generated contracts are current and root contracts:check passes. Ticket20 is done; Overview remains ticket30. Global typecheck currently fails only in the unfinished ticket34 price-alert form union and remains a separate tracked implementation gate.
