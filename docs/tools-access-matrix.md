# Tools access matrix

The public boundary is explicit per operation. Public reads retain input validation, IP limits, upstream timeouts, stale fallback rules, bounded downloads, and `Cache-Control: no-store` where responses can vary. No guest account or guest token is created.

| Surface | Anonymous | Signed-in user | Admin / owner boundary |
| --- | --- | --- | --- |
| `/tools` and tool pages | Open and interactive | Same implementation in workspace | Same |
| Position sizing and Financial Freedom | Calculate, copy, export/selectable output | Same; save Diary or prepare Trade Plan | Private writes remain owner-scoped |
| Relative Value and Seasonality | Quotes/history, charts, tables, copy | Same; research capture | Evidence and Diary writes remain owner-scoped |
| ETF research | Public profile, risk, valuation and relative-return reads | Same; ETF Watchlist link becomes available | Watchlist remains owner-scoped; catalog administration is admin-only |
| Market Rotation | Persisted monitor, filters, charts, CSV/copy/PNG export, market-state reads | Same | Batch trigger remains admin-only |
| SEC filings | Company search, filing filters/details, original documents, bounded single/batch ZIP downloads | Same; capture remains private | No admin bypass is added; document/package/ZIP limits and cleanup apply to guests |
| AI reports | No access to report or consent data | Owner consent, preview, report history, regeneration, cancellation and deletion; runtime and quota gates still apply | Admin controls provider/runtime settings, grants, usage and audit; generation is disabled by default |
| Research Studio | No access | No access | `/api/admin/research/*` is admin-only; feature and generation remain disabled by default, and synthetic evidence requires explicit test wiring |
| Article translations | Public articles use the current published/source fallback; Member articles remain access-gated | Same reader behavior for an accessible article; readers never trigger a provider call | Jobs and provider settings are Admin-only; Edge is PUBLIC-only, AI translation of MEMBER articles requires the selected profile's `allowMemberArticles`, and published translations inherit the source article's access |
| Diary, Trade Plan, Watchlist, Evidence, Notes, reminders, holdings/settings | Rejected with structured 401 | Owner checks apply | Admin APIs require authenticated admin role |

## Browser and API evidence

- Public tool pages are routed through the public shell, so guests do not load foreground reminders, private workspace navigation, or private data requests as a prerequisite.
- Explicit invalid credentials are still rejected by the shared credential resolver; absence of credentials is the only anonymous case.
- `returnTo` is generated through `safeReturnPath` and accepts only known in-site routes. Tool inputs and research content are not serialized into it.
- OpenAPI marks public market, ETF, and SEC reads with an empty security alternative plus optional authenticated transports; private endpoints retain authenticated security requirements.

## Resource and request boundaries

- SEC document downloads cap each document at 250 MiB, package input at 500 MiB, and the generated ZIP at 550 MiB. Documents and ZIP output are staged on disk with incremental byte/CRC checks; a process-wide admission gate limits concurrent heavy guest responses and releases its slot when the response finishes or is cancelled. Guest access remains public.
- API JSON bodies have an 8 MiB serialized limit. The body reader is lazy, so authentication and route rate limits run before a request is consumed; an actual overflow returns the canonical 413 response and cancels the source stream.
- The SEC implementation and the production API's ephemeral-storage budget are documented in `apps/api/src/sec-edgar/{download.ts,package.ts}`, `apps/api/src/sec-filings.ts`, and `ops/k8s/production/02-api.yaml`. The limits bound the application stream; they do not replace ingress or filesystem capacity controls.
