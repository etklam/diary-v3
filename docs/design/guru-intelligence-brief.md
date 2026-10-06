# Guru intelligence design brief

## Product role

Consensus and sector views extend Guru Portfolio from individual-manager research to a cross-manager view. Their lead is the portfolio question—where tracked managers overlap, add, reduce, or shift their reported allocation—while SEC Form 13F remains visible as the source.

## Information hierarchy

The three surfaces share a small tab row for the Guru directory, consensus, stock rankings, and sector direction. The page title and explanatory sentence state the current task. The 13F delay disclosure comes before reported values. A compact quarter control and source line sit above coverage measures for tracked managers, READY portfolios, quarter coverage, mapping coverage, comparable managers, and other filing states. Filters follow those denominators so the user can read every result in context.

Consensus and stock rankings show security, company, holder count and breadth, action counts, net buyers, comparable share change, average portfolio weight, and quarter trend. Sector direction shows the dimension, buyer/seller counts, action counts, aggregate allocation, comparable weight change, and allocation coverage. Theme selection changes the grouping dimension; it does not introduce AI classification.

## Layout and interaction

Desktop keeps the result set in a ruled ledger table with a local horizontal scroll boundary because the comparison needs more columns than a typical viewport can show at once. Filters stay native and labeled. Quarter, ranking, dimension, direction, search, and pagination operate on prepared API results. The stock-ranking page places CSV export beside the quarter controls.

At the narrow layout breakpoint, table rows become cards. Each card retains holder breadth, action counts, weight, and trend or direction evidence; no metrics are dropped for mobile. Search is submitted explicitly, while categorical filters and quarter selection update the query immediately. The filter panel and coverage block remain in reading order above the result cards.

Color follows the shared semantic positive and negative tokens. Counts and explicit Increasing/Reducing labels carry direction so color is never the sole signal. The 13F disclosure uses the existing warning tint inside a full subtle border, not a thick side accent.

## Evidence

Screenshots use synthetic data and are kept under `docs/design/evidence/guru-intelligence/`:

- `consensus-desktop.png`
- `sectors-desktop.png`
- `consensus-mobile.png`

The browser spec verifies quarter selection and cohort changes, classification and search queries, pagination, ranking and CSV export, theme direction, Traditional Chinese copy, and the mobile card layout.
