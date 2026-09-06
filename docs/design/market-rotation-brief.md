# Market Rotation — Astra Design Definition

Definition date: 2026-09-06. Astra owns this design and the final acceptance; Luna implements to spec. It carries over the "decision agenda" visual language of [DESIGN.md](../../DESIGN.md).

## Reading Order

First answer which market scope you are looking at and which day the data is from; then read the market summary and the leading/weakening groups; finally the ranking detail. The rank date and the sector summary date are displayed separately so different observation dates are never mistaken for one dataset.

On desktop, the title opens on the left and the scope selector on the right; the next row organizes the dates with a thin divider. The summary is a four-column figure area, grouped by edge lines and whitespace. Leading and weakening each take one column, presented as short text lists; the ranking table sits below. On mobile, title and selector stack in order, the summary drops to two columns, and leading/weakening go single-column. Wide tables scroll horizontally only inside their own container; the page keeps its normal width.

## Visual and Interaction

- Type, color, and focus use the existing design tokens. Page title 1.5rem/700, section heading 1.125rem/700, body 1rem, secondary dates and labels .875rem; figures use tabular numerals.
- Major sections sit 32–40px apart, with 16–24px spacing inside. Hierarchy comes from type size, arrangement, and dividers — no decorative gradients, shadows, or oversized cards.
- Green is for actions and positive figures; red marks only negative figures. Unknown values render as a neutral dash or "insufficient data" — never as zero, a positive color, or a normal market state.
- The scope lives in the URL; switching clears the previous scope's data and shows a loading state. With no snapshot, explain that no data exists yet and offer retry. Error retry and the scope control are both keyboard operable.
- Market state and signals show readable labels in all three languages; program enums and storage-schema jargon are never displayed, and the fixed core universe is never called the user's personal holdings.

## Acceptance Evidence

Acceptance must check both the real batch-write-to-guest-read flow and controlled scenarios for missing values, differing summary dates, and no-data/error retries. Screenshots cover desktop light and mobile dark; check text hierarchy, date visibility, figure readability, keyboard focus, and in-table scrolling. Astra updates this definition when the visual direction materially changes.

## Tickets 45/46: Comparison and Export Extensions

This section was defined by Astra on 2026-09-06 and extends the same market page in Operate mode. The source is the frozen `pages/tools/market-rotation.vue`; what follows is direction to implement, not a claim of completion.

Above the ranking table, add a visibly labeled signal filter select; keep every option — all, turning strong, losing momentum, rank up/down, above/below 50d, near high, extended — and translate their display names. Column headers use keyboard-operable sort buttons with `aria-sort`, keeping each column's default sort direction from the source. Filtering updates the count and the table in place without moving focus; when nothing matches, the filter is kept and a clear action is offered. On desktop the filter and the three export actions can share one row, wrapping naturally on mobile; no second large page header is added. core stays API-only.

The comparison date sits right beside the rank date, stating explicitly that the two-week comparison uses the tenth earlier qualifying snapshot day. Each row keeps the source columns: rank change, RSI change, performance, moving averages, and signals. The small trend chart uses the payload rebased to 100 at the same comparison date; label the start and end dates and provide text or an expandable numeric equivalent. The SVG line uses the action color against a faint divider baseline. Missing values break the line — never bridge a gap; with fewer than two consecutive valid points, show "insufficient data". On mobile, all columns are read through the table's separately focusable scroll region.

CSV, Copy Table, and PNG read only the same rows currently loaded, filtered, and sorted. Exporting pins that payload and language; an in-flight data refresh must never leak into the output. CSV/PNG keep the source's seven metadata items (summary, market state, breadth condition, confirmation, as-of, comparison date, scope) and twelve columns, additionally noting the current filter, sort, and differing observation dates. Copy Table keeps the source's five-cell tab-separated mini table. Empty results may still emit metadata and headers; Copy Table states plainly that there are no rows to copy.

The PNG is a shareable reading table: system fonts and the light semantic palette, a fixed opaque background, 24px outer margin, an 18px title, and table text of at least 14px. Width is sized to all twelve columns; long names, summaries, and trend series wrap before height is computed — rows must never be truncated or shrunk to unreadability to fit a fixed height. Wait for fonts to be ready before rendering. All provider text is drawn as text or safely escaped; injecting unescaped HTML is forbidden. If copying fails, keep the selectable mini-table text and offer retry; export success/error uses quiet status messages.

Source tech-debt fixes: the old sparkline filtered out nulls and bridged the gaps; the new chart must break the line. The old numeric comparator represented null as negative infinity, so two nulls subtracting produced NaN; the new comparator must handle null explicitly with a stable symbol tie-break, preserving the source's directional placement of nulls and the ordering of valid values. Record these fixes with regression cases; the authoritative ranking formula is unchanged.

Acceptance covers desktop/mobile operation of filtering, sorting, and scope switching, and directly inspects the downloaded CSV, clipboard text, and PNG content. Include quotes, newlines, long names, missing values, and empty results to prove that no other rows or extra quote requests were mixed in. Astra reviews desktop/mobile plus one real exported PNG and decides the final visual acceptance.
