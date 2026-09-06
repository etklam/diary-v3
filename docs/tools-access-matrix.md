# Tools access matrix

The public boundary is explicit per operation. Public reads retain input validation, IP limits, upstream timeouts, stale fallback rules, bounded downloads, and `Cache-Control: no-store` where responses can vary. No guest account or guest token is created.

| Surface | Anonymous | Signed-in user | Admin / owner boundary |
| --- | --- | --- | --- |
| `/tools` and tool pages | Open and interactive | Same implementation in workspace | Same |
| Position sizing and Financial Freedom | Calculate, copy, export/selectable output | Same; save Diary or prepare Trade Plan | Private writes remain owner-scoped |
| Relative Value and Seasonality | Quotes/history, charts, tables, copy | Same; research capture | Evidence and Diary writes remain owner-scoped |
| ETF research | Public profile, risk, valuation and relative-return reads | Same; ETF Watchlist link becomes available | Watchlist remains owner-scoped; catalog administration is admin-only |
| Market Rotation | Persisted monitor, filters, charts, CSV/copy/PNG export, market-state reads | Same | Batch trigger remains admin-only |
| SEC filings | Company search, filing filters/details, original documents, bounded single/batch ZIP downloads | Same; capture remains private | No admin bypass is added |
| Diary, Trade Plan, Watchlist, Evidence, Notes, reminders, holdings/settings | Rejected with structured 401 | Owner checks apply | Admin APIs require authenticated admin role |

## Browser and API evidence

- Public tool pages are routed through the public shell, so guests do not load foreground reminders, private workspace navigation, or private data requests as a prerequisite.
- Explicit invalid credentials are still rejected by the shared credential resolver; absence of credentials is the only anonymous case.
- `returnTo` is generated through `safeReturnPath` and accepts only known in-site routes. Tool inputs and research content are not serialized into it.
- OpenAPI marks public market, ETF, and SEC reads with an empty security alternative plus optional authenticated transports; private endpoints retain authenticated security requirements.
