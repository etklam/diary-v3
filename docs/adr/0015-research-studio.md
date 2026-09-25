# Research Studio: immutable evidence and exact-content publication

Date: 2026-09-25
Status: Accepted for implementation under the user-approved Research Studio PRD and development request.

## Decision

Add an admin-only Research Studio context to the existing modular monolith. Research is independent of owner-private weekly/monthly AI reports: it has separate runs, immutable evidence, revisions, purpose-scoped configuration, dispatch admission, and retention. Reuse reviewed low-level transport, encryption and authorization primitives where they preserve existing behavior. Do not repurpose private consent, context selection, or purge rules.

Implement the deterministic calculator in Node.js/TypeScript, as explicitly requested by the user. The retrieved source method and all seven appendices define formulas, seeds, warm-up, price/volume bases, dates and manual review duties. Independent golden fixtures establish the new engine's behavior. The original Python runtime and its claimed 36 tests are not part of the delivered runtime or local acceptance evidence.

Capture method, instrument, source, prompt and calculator versions with each evidence snapshot. Freeze the universe before returns are calculated. The model writes structured prose against approved metric/source/candidate IDs; it cannot set quality, permissions, cost, approval or publication. Required source rights, calendar coverage or evidence gaps block the relevant capabilities rather than being converted into invented data.

Use PostgreSQL durable admission and a separate worker process. One generation attempt dispatches at most once locally. Ambiguous dispatch is terminal for automatic recovery, and cancellation does not prove that the provider stopped or that billing is zero. No database transaction waits for the provider. Keep conservative reservations and late-result fencing.

Research creates unpublished Member Posts only. Approval belongs to an exact content revision/hash. All article mutations capable of publishing or changing published content share the research eligibility check, including create-as-published, PUT-as-published, single publish and bulk publish. Ordinary requests cannot remove server-owned provenance. Editing a research article cannot expose content under obsolete approval. Latest-session freshness is checked at handoff/publication; historical articles are not automatically unpublished on the next market close.

Feature and generation switches default off. The authorized test model is exactly `openrouter/free` on OpenRouter, with a zero monetary ceiling and no paid fallback. An exhausted live-test session cannot be reset by creating a run or changing provider settings. Ordinary tests use isolated PostgreSQL, synthetic data and controlled transports without external services.

## Consequences

Existing Public/Member readership, deliberate public teasers, SSR protection, ordinary article lifecycle and private AI reports retain their contracts. Research needs narrow article revision/provenance extensions, not another membership system or CMS.

Research source material is maintained as original evidence fixtures with source URLs and hashes. It is untrusted input and does not authorize embedded shell examples or external actions. Missing original calculator files no longer block the user-selected TypeScript implementation, but missing source rights and real-report acceptance still block production readiness.

Schema validation does not prove factual or semantic correctness. Exact G01–G10 mapping, manual source support review and transparent LIMITED/STALE/FAILED outcomes remain required. Live connectivity success and offline mock success are separate from complete real-market research acceptance.

## Concurrency and retention clarification

Serialize research admission, claim and settlement through the singleton runtime and budget records, with one durable active attempt token and fixed dispatch deadline. Heartbeats cannot extend that deadline indefinitely. Cancellation after dispatch retains capacity until transport completion or deadline expiry; an expired ambiguous attempt becomes OUTCOME_UNKNOWN once and is never resent automatically. Budget accounting uses disjoint reserved, known-consumed and unknown counts. Their sum is bounded by the session limit; unknown is not counted again as consumed. The initial externally recorded session contains two known outcomes and one unknown outcome, exhausting its three-attempt ceiling.

Publication eligibility and the article write share a transaction and a consistent lock order. The current-session resolver uses local verified calendar data, never network I/O while holding database locks. An existing provenance link with missing related records fails closed. Handoff defaults to Draft/Member; subsequent Public or Member selection remains an editorial choice. Synthetic evidence is permanently ineligible for formal publication.

Retain research evidence and approval history independently of account-private report deletion. Preserve existing account/article deletion semantics: deleting an author may delete their Post, while detached research records retain immutable actor and handoff identifiers without retaining the deleted personal profile. Nullable live user references do not erase historical approval evidence. Do not introduce a separate archival platform.

The canonical calculation window targets the latest 400 completed sessions. A wider provider response may be narrowed to that explicit window, with fetched and used coverage recorded honestly. Calendar support has an explicit verified horizon and exceptional closures, early closes and DST rules; unsupported dates remain blocked rather than extrapolated silently.

### Writer projection and conditional plans

Keep full canonical bars and indicator histories in the immutable snapshot. The writer receives the complete method bundle and an explicit, versioned projection of metrics: latest values, bounded recent series keyed by their original indices, completed-week summary and structural evidence. Admission rejects overflow instead of increasing a live budget, silently truncating rules or choosing another model. Generated metric references are checked against that projection; report links must come from the source registry. Numeric computed claims must match cited metric/zone/plan values under documented display rounding. These are mechanical checks, not a replacement for citation and contradiction review.

Trade-plan candidates may use existing structural zones without pretending that a setup has triggered. A conditional breakout/retest entry uses the nearest resistance, the nearest lower structural support as a conditional stop, and successive actual resistance targets. A pullback entry requires a supported gap/pivot/confluence zone, the next lower support and actual resistance targets. Never enlarge an entry, tighten a stop or skip an intervening target to manufacture acceptable reward/risk. Compute both midpoint and conservative ratios from the selected intervals. Missing required structure stays N/A; unverified retest, benchmark or event confirmation leaves the plan WATCH. Position size and executable stop/order details remain unset. Human QA decides whether evidence supports an actionable interpretation.

### Bounded preparation retention

An opt-in, bounded cleanup can remove old research preparations only when they have no dispatch attempt, approval, article link or detached handoff identifier. Preserve all other provenance and budget accounting. The current adapters persist normalized or extracted evidence, not full raw documents; enabling any source that requires additional raw-content retention behavior requires implementing that behavior first.
