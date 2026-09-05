# Timeline reading review

2026-09-05. Retains the existing decision-agenda visual direction. Month headings, flat separators, civil dates, full titles and short excerpts provide the scan path; native disclosure controls reveal safely rendered original Markdown. The stream remains one column on mobile, with dates above entries.

Evidence:

- Four shared-domain tests pass: incoming/cross-page ID deduplication, decimal-ID ordering, month grouping, private Review-field exclusion and source-compatible excerpts.
- Initial browser round passed at both 1440px and 390px (11.6 seconds), using 25 synthetic diaries across two months in disposable PostgreSQL. Verified repeated page-two failure/retry, duplicate response entries, stale filter response rejection, empty ranges, three locales, dark mode, long Markdown and correct Diary destination.
- One detector run returned `[]`; targeted frontend lint passed. Initial screenshots inspected as a batch: [desktop](evidence/timeline/1440.png), [mobile](evidence/timeline/390.png). No layout correction was needed.
- Final functional confirmation passed both viewports (13.4 seconds), including capture-mutation refresh, preserved original title and logout privacy/sign-in recovery. The confirmation fixed English singular counts and made HTTP 401 recovery independent of openapi-fetch returning an empty-string error for an empty response body. This functional rerun disabled capture with `TIMELINE_CAPTURE=0`; no additional polish round was taken. A prior shared API rename briefly prevented server startup and produced no Timeline rendering.

Parent owns independent review and final whole-project gates. Related overview, comparison and relation-projection work is explicitly recorded in [the integration note](timeline-integration.md); this review does not claim those other slices are implemented.

## Independent root review

Root inspected both durable screenshots and the browser assertions. The civil-date scan order, readable expanded Markdown and mobile wrapping meet this slice's needs. Disposition: ship Timeline reading scope. The desktop screenshot exposed shared sidebar overflow; the shared sidebar now scrolls vertically with non-shrinking children so preferences remain reachable. This is a shell correction, not a change to Timeline content. Integrated checkpoint: 27 test files / 197 tests and production Web/API build passed. Contract drift from concurrent ledger work is tracked separately and must be regenerated before the next release gate.
