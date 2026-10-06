# Guru discovery and overview

Date: 2026-10-06

## Rationale

The entry point is an investor discovery surface rather than a filing browser. Search and editorial filters sit above a compact investor card that leads with the manager and fund, then shows reported quarter metrics and categorized changes. Follow controls expose only the viewer's relationship and an aggregate count.

The overview uses a two-column reading order at desktop widths: the reported portfolio and latest moves stay in the main column, while editorial profile, sector allocation, history and the current AI report state sit beside it. Section labels and quarter dates keep SEC-derived data distinct from editorial description. The fixed 13F disclosure stays directly below the page heading.

The interface follows The Ledger rules in `DESIGN.md`: semantic theme tokens, ruled grouping, aligned figures, and no panel shadows. At narrow widths, cards and overview sections become a single column; filters wrap into two columns and the existing mobile navigation remains in control of the shell. Empty, pending, partial and error states retain the same page structure and tell the reader when metrics are withheld.

## Evidence

- `directory-desktop.png` and `overview-desktop.png` show the zh-TW discovery and overview surfaces using synthetic fixture content.
- `directory-mobile.png` shows the English directory at 390px.
- `tests/e2e/guru-discovery.spec.ts` verifies zh-TW, zh-CN and English navigation, loading and empty states, API failure/retry, partial-quarter messaging and the narrow layout.
- `tests/integration/gurus-http.test.ts` verifies prepared snapshots, sort/filter behavior, private follow state, source lineage and stale analytics suppression.
