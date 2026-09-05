# Shared market provider and explicit freshness

Status: accepted

One provider instance per API runtime owns Yahoo SDK access, a two-request queue, in-flight canonical-key deduplication, two retries with 500/1500 ms delays and a 500-entry cache. Pending work is bounded at 256 entries. Each upstream attempt has a 10-second abort deadline. Batch consumers accept at most 25 unique normalized symbols and retain successful partial results. These bounds do not imply a total queue-wait deadline.

The canonical quote and historical HTTP reads remain guest-accessible after the common credential middleware; invalid explicit credentials cannot fall back to guest access or valid cookies. They share the existing 60-request IP budget per minute. Provider failures use the canonical sanitized external-service error envelope. HTTP responses use no-store because freshness belongs to the provider and ambient browser session middleware can set cookies.

`X-Market-Data-Source` distinguishes upstream, cache and stale fallback. `X-Market-Data-Fetched-At` remains the instant of the last successful fetch; it is not rewritten on a failed refresh. Consumers must display stale status and distinguish this fetch time from the nullable exchange quote time.

Authorized corrections to the sanitized legacy implementation:

- Missing previous close, currency, market state or exchange time remains null. It is not fabricated as the current price, USD, REGULAR or the current time. A zero previous close cannot produce a percentage change.
- Symbol aliases share one canonical cache key. A mismatched upstream quote symbol fails validation.
- Expired cache entries remain available for stale fallback until capacity eviction; an unrelated write cannot delete them merely because their fresh TTL elapsed.
- Historical range subtraction clamps UTC month ends. Invalid symbols and ranges are rejected instead of silently selecting an unrelated range.

The installed Yahoo SDK owns the cookie/crumb protocol. Tests inject an upstream or the SDK fetch transport; CI never depends on live Yahoo prices. Evidence: `tests/unit/market-data.test.ts` covers queue, retries, deadlines, bounds, partial results, aliases, metadata, range and TTL behavior; `tests/integration/market-http.test.ts` exercises actual HTTP and disposable PostgreSQL authentication, guest access, rate limits and freshness. Company presentation remains ticket 18 work until its browser acceptance is complete.

## SPX session classification

The authenticated SPX helper reuses the provider queue and a five-minute intraday cache. It retains the frozen classification precedence and unrounded thresholds. Intraday bars are sorted and matched to the quote's America/New_York trading date, permitting the latest matching closed session over weekends. Missing prior close, quote time or matching bars produces the canonical unavailable error; no synthetic range-bound classification is substituted. The response preserves the full summary, including open, high, low and percentage components. Tests cover exact boundaries, gaps/recovery/fade/choppiness, missing inputs and authenticated HTTP/cache behavior.
