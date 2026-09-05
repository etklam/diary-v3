# SEC filings — Astra direction

2026-09-06. Tickets 51–52. Mode: Operate, with source-document reading. Astra owns this composition and acceptance; Luna implements. Extend DESIGN.md's flat research desk and existing Company/Evidence controls.

## Search to filing

Lead with a compact title and labelled company search, followed by explicit selectable results showing company name, tickers and CIK. Preserve guest access. Use ordinary input/list buttons with keyboard access rather than inventing an incomplete custom combobox. Keep search progress/errors separate from the selected company's filing results; delayed searches or company requests must not replace a newer selection.

After selection, show company identity as a heading, then a native filter form and filing list. Retain forms 10-K, 10-Q, 8-K, 20-F, 6-K, 40-F; filing date bounds, report-period bounds and include/exclude/only amendments. The source API supports periodTo although the old visible form omitted it; make both bounds available. Apply filters explicitly, reset cursor and batch selection on company/filter changes. Preserve canonical cursor pagination and the source 50-row default. Prev/next updates the result heading/focus without jumping out of the task.

Desktop uses one semantic table: selection, form/amendment, filed date, report period, accession and actions. Mobile uses compact rows with wrapped accession, labelled dates and 44px actions; no data or action disappears. Give each row a direct internal document-index link and a distinct original SEC index link, plus the existing Research Capture action. Capture preserves SEC_FILING metadata, source URL, CIK/accession/form/filing date/report date and available ticker prefill through the existing destination flow.

Batch selection keeps the existing maximum of 10. Show selected count, primary versus complete submission mode and Download together in a compact action bar after the filter/result heading. State the selection limit where controls disable. Retain selection across cursor pages within the same company/filter query. On narrow screens wrap controls without covering the table or focus target.

## Filing to documents

The detail route begins with Back to filings, company/form, amendment status, accession, filed date and report period; retain absent report date as unavailable. List documents below with primary/exhibit/PDF classification, type, basename, description and size. Basenames can wrap and must never be clipped into indistinguishable labels. A flat ruled list avoids a large card for every tiny exhibit. Keep per-file actions and the filing ZIP action distinct. Missing PDF is explanatory metadata, not a failed filing.

Preserve the source document response and download/header behavior; do not render remote HTML in the app's authenticated DOM. Read/download controls must match the actual validated response mode. If safe source viewing uses a separate document response or original SEC link, label it clearly and keep return context. No new embedded viewer or arbitrary proxy URL input is needed.

## Data, failures and evidence

Use a single SEC provider boundary with the frozen source's contact User-Agent configuration, queue/cache, timeouts, wait limits, validation and error mapping. Port exact service limits and canonical CIK/accession/basename rules before implementation; do not guess them from UI. Apply credential fail-closed behavior even on guest-readable routes. Preserve stale metadata and show it beside the affected response rather than a global flag left over from a previous search.

Keep bounded streaming/archive behavior, validated filenames and temporary-file cleanup. Test traversal/encoded traversal, excessive file count/bytes, upstream failure partway through a response, malformed cursor, cancellation and archive contents using controlled fixtures. Do not fetch real SEC data in tests. Browser proof must search, change filters, paginate, open internal document index, capture actual research and download a parseable file/ZIP. Verify both batch modes. Errors retain search/filter context and give a meaningful retry; a partial/corrupt download must not be announced as successful.

Use existing semantic tokens, 24px page heading, readable body text and tabular dates/size values. No new decoration or fake filing content. Astra inspects one desktop/light and 390px/dark pair covering the real list/detail flow, with one correction pass only for demonstrated defects.
