# SEC filings implementation review

Status: implementation complete; controlled API, disposable-PG, and browser acceptance evidence recorded.

The React tool exposes guest company search, company selection, filing filters, amendment modes, cursor pagination, bounded selection of up to ten filings, primary or complete batch ZIP links, a separate filing detail route, document index rows, original SEC links, and explicit research capture metadata. The detail page keeps upstream HTML out of the app and provides individual document downloads plus a bounded ZIP package.

The API boundary uses a single injected SEC EDGAR service. Production construction requires `SEC_USER_AGENT` with a contact address; tests inject a fixture client and never contact SEC. Metadata responses carry stale/cache/fetched-at information. Provider requests use the host/path allowlist, queue, retry policy, response-wide abort deadline, and byte limits. Document and package paths validate CIK, accession, and basenames; package limits are checked against actual downloaded bytes before ZIP creation. ZIP entries use safe names and include a manifest.

Evidence currently available:

- `tests/unit/sec-edgar.test.ts`: 5 provider/domain tests pass, including guarded redirects and provider boundaries.
- `tests/integration/sec-filings-http.test.ts`: 2 disposable-PostgreSQL HTTP tests pass, covering guest metadata, detail, document download, package response, validation, and unsafe names with a controlled provider.
- `npm run contracts:generate` and `npm run contracts:check` pass with generated SEC paths and response schemas.
- Global TypeScript has no SEC errors, and the focused provider/integration command passes 5 unit + 2 integration tests.
- `tests/e2e/sec-filings.spec.ts` is wired to the synthetic SEC provider in `scripts/e2e-server.ts`. The controlled Chrome flow passed `1 passed (6.1s)` through the real React → Hono → fixture provider path. It downloaded both the selected batch ZIP and the filing detail ZIP, verified `unzip -t` CRC integrity, asserted manifest/document entries, and extracted the synthetic document body. The same run produced [desktop evidence](./evidence/sec-filings/desktop.png) and [mobile evidence](./evidence/sec-filings/mobile.png).

The parent agent owns final ticket status and independent review; this document records the runnable implementation evidence without authorizing production SEC access.
