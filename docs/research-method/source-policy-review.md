# Source-policy review

Reviewed: 2026-09-25 (Asia/Taipei). This is a narrow implementation policy record, not a new licensing platform. Documentation/terms were inspected; no live market, Tavily search, or research-content extraction request was made by this review.

## Operation-specific decisions

Record `allowed`, `restricted`, or `unknown` separately for automated_fetch, evidence_storage, llm_inference, publication_of_analysis_and_excerpts, and raw_data_redistribution. Each decision includes scope, conditions, supporting terms URL or entitlement evidence, and review date. Unknown blocks only the affected operation. Raw redistribution is not required for analysis publication and is not offered by the product.

An administrator recording a decision does not create source rights. Public terms can be sufficient; do not demand a separate written license when applicable terms already permit the use. Apply any third-party notices and source-specific exceptions before using individual content.

| Source | Technical role | Current evidence and operational consequence |
| --- | --- | --- |
| Existing Yahoo adapter | Candidate daily OHLCV source through the existing queue/cache | The additive daily research mapping now preserves open, adjusted close, volume, session and timestamp availability through the existing queue/cache; fixtures verify missing fields are not invented. Applicable endpoint/provider entitlement for automated collection and downstream use is unresolved; keep new live research collection/model use/publication disabled. |
| Tavily | First search discovery provider | Official API documentation provides the search endpoint and bounded parameters. No key or account entitlement was supplied. Return SEARCH_NOT_CONFIGURED without a request. Search snippets remain discovery, not proof of a full-text read. |
| Federal Reserve Board | Official FOMC information | The Board's disclaimer permits reuse of its own information unless otherwise indicated, requests attribution, and excludes third-party material. Storage, analysis/inference and attributed excerpts can be allowed within that scope; this does not establish a license for linked third-party content or arbitrary bulk crawling. Verify the exact retrieval path and any access restrictions before enabling automated_fetch. |
| BEA | Official economic release dates/data | The BEA copyright FAQ permits use/reproduction unless otherwise stated, with attribution appreciated. Apply that scope to BEA-origin text/data for storage, analysis/inference and excerpts. Exact acquisition route and exceptions must still be checked. |
| BLS | Official CPI/employment events | BLS publishes an automated-access policy: excessive/malicious activity is prohibited and robots need owner contact information. Automated access may be configured only with bounded requests and contact identification. Verify reuse notices applicable to the exact event text/data; an unrelated publication's copyright statement is not a blanket calendar license. |
| ETF issuers and company IR | Instrument identity, dated holdings and issuer events | Per-issuer/per-page terms and acquisition methods are not yet verified. Keep affected uses unknown until checked; do not infer iShares permission or endpoint identity from a hostname. |
| StockAnalysis / ChartExchange | Method-specified discovery and cross-check leads | No authorized API/automated access contract was supplied. No private endpoints, login bypass, scraping circumvention, or inferred rights. |

## Evidence links and specific open questions

- [Tavily Search API](https://docs.tavily.com/documentation/api-reference/endpoint/search): use basic search, explicit bounded result count, auto-parameters off, no answer/raw-content/images, and usage reporting. This prevents implicit deeper searches. The adapter must separately bound calls and credits, including failure/unknown attempts.
- [Tavily terms](https://www.tavily.com/terms), sections 6 and 10: account service use does not replace compliance with third-party source terms. Resolve the user's actual plan/key and rights for retained result metadata separately from content on discovered URLs. No signup, plan purchase or overage activation is authorized.
- [Yahoo terms, current Canadian English page](https://legal.yahoo.com/ca/en/yahoo/terms/otos/): automated collection is restricted without prior permission. This is supporting evidence of a restriction, not a determination that this regional page governs the user's account. The US terms URL could not be retrieved during this review. Open question: which applicable Yahoo/data-provider agreement permits this application's automated chart retrieval and downstream analysis/excerpt uses? Existing code is not the answer.
- [Federal Reserve disclaimer](https://www.federalreserve.gov/disclaimer.htm): limit reuse decisions to Board-origin public information without contrary notices; retain source attribution.
- [BEA copyright FAQ](https://www.bea.gov/help/faq/147): limit reuse decisions to information without contrary notices; retain provenance and attribution.
- [BLS terms](https://www.bls.gov/bls/blsterms.htm): enforce contact identification and non-excessive request limits. Open question: exact event acquisition format and content-specific reuse notice.

The inference/storage decisions for unencumbered Federal Reserve/BEA text follow their stated reuse scope; they do not claim that those sites explicitly discuss this application's LLM workflow. No source marked unknown should be silently upgraded to allowed in fixtures or production. Synthetic fixtures may use explicitly synthetic policies only and cannot be published through the article flow.
