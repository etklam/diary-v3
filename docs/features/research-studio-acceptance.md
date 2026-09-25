# Research Studio acceptance record

Date: 2026-09-25. Scope: local implementation and offline acceptance. No production cutover or real-market publication is authorized by this record.

## Completed local capabilities

The implementation includes versioned method/instrument profiles, administrator settings and permissions, immutable canonical OHLCV evidence, adjustment/session/missing/stale validation, deterministic TypeScript indicators and structural WATCH candidates, independent worker persistence, durable generation/search budgets, duplicate-dispatch and unknown-outcome fencing, structured writer validation, safe rendering, revision-specific QA/approval, and one unpublished Member article handoff. Article editing, re-import and re-approval preserve provenance. Public/Member article behavior is retained; every research publication path rejects synthetic evidence.

The supplied model key remains in the ignored owner-only local configuration file. It is not part of the tracked source, test fixtures, screenshots or this report. No test needs that file. A secret-pattern scan across 1,522 tracked and non-ignored candidate files found no OpenRouter credential pattern; the ignored local file permission was independently checked as 0600.

## Runnable offline verification

| Check | Result |
| --- | --- |
| `npm run test:unit` | 96 files, 919 tests passed |
| `npx vitest run tests/integration --maxWorkers=4` | 85 files, 347 tests passed using disposable PostgreSQL |
| `npm run test:e2e -- tests/e2e/research-studio.spec.ts` | 2 principal browser journeys passed |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm run contracts:check` | Passed |
| `npm run build` | Web and API/worker/retention bundles passed |
| `npm run manifests:check` | 11 manifests validated; research worker disabled with zero replicas |
| `node dist/api/research-retention.js` | Disabled by default; no database opened or records deleted |
| `node --import tsx scripts/research-restore-smoke.ts` | Physical dump/restore passed on latest migrations; both temporary databases and archive cleaned up |

The full integration run initially exposed a scheduling-dependent assertion in an existing price-alert concurrency test. A two-arrival barrier now holds both synthetic quote responses until both checkers have loaded candidates. This preserves the quote, notification, and persisted-row assertions while making the intended overlap deterministic; the checker implementation was not changed. The complete disposable-PostgreSQL suite passed after this test-only correction.

Restoration preserves identifiers, evidence/title/body hashes, approval identity and time, article links, dispatch state and the exhausted live budget. A recovery pass sends zero transport calls. Attempting to publish the restored synthetic article returns 409 `RESEARCH_ARTICLE_PROVENANCE` and leaves it Draft/Member.

Astra independently reviewed concurrency/publication, atomic budget admission, WATCH candidate derivation and historical source availability. Confirmed findings were fixed with regressions: cancelled dispatches cannot accept a different idempotency key, and date-only publication metadata cannot leak future information across UTC midnight.

Desktop and dark mobile captures are stored under docs/design/evidence/research-studio/. Astra accepted their layout; the final misleading already-approved dependency message was removed and the browser journeys passed again. Captures use synthetic fixtures and injected configuration states; they do not show a live Tavily credential or grant source rights.

## Implemented adapters without live acceptance

- Yahoo daily OHLCV mapping reuses the existing adapter, queue, cache and errors. Missing open, adjusted close, volume and history remain missing; fixtures verify faithful mapping.
- Tavily has a real bounded adapter, explicit missing-configuration/error states, persisted request/credit accounting and mock contract tests. Search snippets remain discovery metadata.
- Direct official-source extraction has approved URL/extractor injection, bounded safe fetching, independent source-use checks, publication-as-of filtering and explicit event-window limitations. It does not require a search call first.
- OpenRouter uses the exact authorized `openrouter/free` route, purpose-isolated encrypted configuration, usage capture and no automatic retry, model fallback or repair loop. Full structured-report live behavior has not been established.

## Missing configuration and source-use evidence

No Tavily key/account configuration was supplied. Yahoo's applicable acquisition/downstream-use entitlement and exact official/ETF issuer/IR source entries remain unverified. See [source-policy review](../research-method/source-policy-review.md) for reviewed terms, dates, scope and specific unanswered questions.

Each source separately records automated fetch, evidence storage, LLM inference, analysis/excerpt publication and raw redistribution. Unknown blocks the affected operation. Raw redistribution permission is not required for analysis publication. Administrator input records a decision and its basis; it cannot create rights. Public terms may be sufficient without additional written authorization.

## Actual live tests

The initial three-attempt LLM ceiling is exhausted: one unknown sandbox network outcome, one HTTP 400, and one minimal successful request using exactly `openrouter/free`. The successful route returned `OK`, actual model `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`, 23 input tokens, 49 output tokens and reported cost zero. This establishes limited connectivity only.

No live market, Tavily search or research-content extraction acceptance was run. No real source material was sent to the model during these tests. Ordinary unit, integration and E2E checks made zero real LLM calls. Further live LLM work requires a new explicit authorization; the implementation does not reset or replace the exhausted session.

## Readiness

Local functionality is implemented and verified. Formal current-market research and publication are not ready until applicable source uses, configuration, live canonical evidence and a full report receive separate acceptance. The local tracker retains RS-06 as blocked for those external dependencies; synthetic success never closes that ticket.
