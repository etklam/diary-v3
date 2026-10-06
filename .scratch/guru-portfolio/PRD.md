# Guru Portfolio — Product Requirements

Status: approved extension scope; implementation not started
Date: 2026-10-06
Source: user-provided “Diary-v3 | Guru Portfolio Module Final Form”
Tracker: Local Markdown under .scratch/guru-portfolio/

This is a separately approved extension to diary-v3. The parent rebuild PRD remains immutable. The SEC filing browser remains a separate research tool; Guru Portfolio is an investment research product built from institutional holdings data, deterministic analytics, consensus, and clearly separated AI interpretation.

## Product outcome

Help users discover tracked investment managers, understand their disclosed portfolios and quarter-over-quarter changes, compare their decisions, and place that activity in stock and sector research context. SEC EDGAR is a source, not the user-facing product.

The module combines SEC Form 13F data, portfolio analytics, Guru consensus, stock-level institutional intelligence, AI interpretation, and diary-v3 research workflows. It must retain source lineage and state the limits of 13F disclosure.

## Information architecture

Required user routes:

| Route | Purpose |
| --- | --- |
| /gurus | Discover and sort tracked Gurus |
| /gurus/:slug | Portfolio overview |
| /gurus/:slug/portfolio | Quarter holdings table |
| /gurus/:slug/changes | Latest categorized moves |
| /gurus/:slug/history | Portfolio, concentration, sector, and position history |
| /gurus/:slug/analysis | Auditable AI analysis |
| /gurus/:slug/filings | Source filings and filing lineage |
| /gurus/consensus | Cross-Guru holdings and action consensus |
| /gurus/activity | Filterable platform activity stream |
| /gurus/stocks | Most-owned and most-changing securities |
| /gurus/sectors | Sector, industry, and mapped-theme direction |
| /gurus/compare | Comparison of two to five Gurus |
| /stocks/:symbol/gurus | Guru ownership and history for a stock |

Required admin routes:

| Route | Purpose |
| --- | --- |
| /admin/gurus | Create, discover, and manage Guru profiles |
| /admin/gurus/:id | Profile, filing, sync, mapping, analytics, and AI operations |
| /admin/institutional | Ingestion, parser, mapping, partial-quarter, and AI status |
| /admin/institutional/mappings | Resolve ambiguous and unresolved securities |
| /admin/ai/prompts | Shared prompt registry, overrides, audit, and playground |

On mobile, these routes may be presented as tabs. Backend domain boundaries remain independent of the UI.

## User-facing capabilities

### Discovery and profiles

The Guru directory supports search, style and fund-type filters, featured status, sector focus, and sorting by concentration, turnover, activity, latest filing, followers, name, and custom order. A directory row shows manager/fund, style tags, latest reported value, holding count, largest position, latest quarter, and categorized recent actions.

A Guru profile combines name, manager/fund identity, CIK, description, investment philosophy, style tags, manager type, website, country, featured status, active status, and image. Editorial metadata (for example Value, Growth, Activist, Macro, or Contrarian) is stored and labeled separately from SEC-derived facts.

The overview presents reported portfolio value, position count, top-five and top-ten concentration, largest position, turnover, entries/exits/adds/reductions, sector concentration, top holdings, latest moves, sector allocation, concentration, historical direction, and AI summary.

### Portfolio, changes, and history

The portfolio table provides ticker, company, portfolio weight, shares or principal amount, reported value, quarter-over-quarter quantity and weight changes, position rank and previous rank, security type, and Put/Call designation. It supports search, sort, sector and position-type filters, new/increased/reduced filters, quarter selection, and CSV export. Desktop uses a table; mobile uses readable holding cards.

Latest moves are grouped as new, increased, reduced, exited, largest weight changes, and largest rank changes. Each comparison shows prior and current quantity, percentage change, portfolio weight, and rank when available.

History retains every ingested quarter and supports portfolio value, position count, top-five/top-ten concentration, sector allocation, turnover, and per-security position history. Position history includes quarter, quantity, weight, reported value, rank, and action.

The activity feed is filterable by Guru, ticker, sector, quarter, action, minimum portfolio weight, and minimum quantity change percentage. Filing and quarter states must make missing, partial, superseded, and unavailable data distinguishable.

### Consensus, stocks, sectors, and comparison

Consensus reports holder count, new buyers, adds, reductions, exits, net buyers, average and median comparable quantity change, average weight, breadth, and quarter-over-quarter holder change. Any accumulation/neutral/distribution label must expose its rule and underlying counts; no opaque score is allowed.

The stock universe supports Most Held, Most Added, Most Reduced, Most New Positions, Most Exited, Largest Aggregate Weight, Fastest Rising Guru Interest, and Fastest Falling Guru Interest. Stock research pages show current holders, latest buyers/sellers, new positions/exits, average weight, ownership breadth history, net-buyer history, and average-weight history.

Sector and industry direction is computed deterministically from buyers, sellers, entries, exits, aggregate weight, weight change, and holder breadth. Increasing, Stable, and Reducing labels must be explainable from those metrics. Themes (including AI Infrastructure, Semiconductors, Cloud, Cybersecurity, Nuclear, Financials, Consumer, and Energy) are explicit security-to-theme mappings, supplied by existing research metadata or admin mapping; AI cannot invent classifications.

Guru comparison accepts two to five Gurus and compares reported value, holding count, top-ten concentration, turnover, sector allocation, common and unique holdings, latest additions/exits, and opposing actions. Common holdings show the number of selected Gurus holding each security.

### Research workflow, follows, and notifications

Authenticated users can follow a Guru and watch stock Guru activity. Notification types include new filings, new positions, exits, strong adds/reductions, new stock holders, and consensus changes. Each type can be enabled or disabled; meaningful-change thresholds can use portfolio weight and/or quantity-change percentage.

Global search supports Guru name, manager/fund name, and stock symbol/name, and routes each result to the relevant Guru or stock research page.

Structured Guru position, consensus, and sector context can be consumed by other research workflows. Journal entries may attach a decision-time Guru snapshot so later data rebuilds cannot change what the user saw when recording a decision.

The primary /gurus landing page emphasizes investor discovery, latest Guru moves, most-owned stocks, trending buys/exits, sector direction, and Guru consensus. Filing access is available from a Guru's Filings view as source transparency and traceability.

### Source transparency

Every Guru page displays the concise warning: “13F holdings are delayed quarter-end disclosures and may not represent the manager’s current or complete portfolio.” UI can show source, reported period, filing date, and a link to the SEC filing. Displayed holdings must be traceable to an effective snapshot, parsed holding, filing, and accession number.

## Institutional data and deterministic rules

### Shared SEC access and 13F ingestion

Reuse diary-v3’s existing SEC EDGAR client, queue, cache, validation, retry, and document download boundaries. Do not create an independent SEC networking stack. Route all institutional SEC requests through a shared scheduler with request identification, fair-access throttling, retry/backoff, and metrics. An instance-local queue alone does not satisfy a single scheduler when API and worker processes make requests.

Discover 13F-HR and 13F-HR/A filings by configured CIK. Preserve accession, form, report period, filed time, amendment metadata, source URL/documents, parser version, ingestion time, and processing state. Keep a content digest and a reprocessable raw-artifact reference under a documented retention policy; parsed rows alone are not sufficient for parser reprocessing. Parse information-table XML into raw filing metadata and normalized holdings as distinct records. Preserve issuer, title/class, CUSIP, FIGI when present, reported value and its unit/provenance, quantity, SH/PRN type, Put/Call, investment discretion, other manager, and voting authority.

Historical filings must retain their source-defined value units; do not apply one multiplier to every filing. Current SEC material labels Form 13F information-table values to the nearest dollar, while older filing formats may use thousands. See the [SEC Form 13F](https://www.sec.gov/files/form13f.pdf) and a [current SEC information-table example](https://www.sec.gov/Archives/edgar/data/2153025/000215302526000009/xslForm13F_X02/form13fInfoTable.xml).

Filing states are PENDING, DOWNLOADED, PARSED, PARTIAL, READY, ERROR, or SUPERSEDED and include mapping coverage. Mapping failure is recorded per position and must not fail an otherwise parseable filing.

### Amendments, snapshots, and securities

Resolve original filings and applicable amendments into exactly one effective portfolio snapshot per Guru/manager and report period. Distinguish restatements from additional-holdings amendments; never treat an amendment as another quarter. Processing must be deterministic, idempotent, retry-safe, and restart-safe.

Security identity is not ticker-only. Use stable identifiers, prioritizing CUSIP and other available stable IDs, then map identity to a security and current ticker. Mapping states are MATCHED, AMBIGUOUS, UNRESOLVED, or MANUAL_OVERRIDE. Admin can correct identity and handle ticker changes, mergers, delistings, spin-offs, and class changes. Corporate-action-aware comparison must avoid false EXIT + NEW classifications when the underlying security continues. An unresolved identity remains visible in quality metrics and cannot be silently coerced to a ticker.

### Comparison identity and action classification

Compare holdings only when their security identity, security class, quantity unit, and Put/Call exposure are comparable. Keep SH and PRN positions separate; do not combine option or principal positions with common shares. Corporate-action resolution must run before quarter comparison.

The primary classification input is comparable quantity change, never reported-value change. Define share change, share-change percentage, portfolio weight, weight change, position-rank change, and reported-value change independently. Apply configurable server-side default thresholds (not UI constants):

| Classification | Default rule |
| --- | --- |
| NEW | Present in the current effective snapshot and absent from the comparable prior snapshot |
| STRONG_ADD | Quantity change percentage is at least +50% |
| ADD | Quantity change percentage is greater than +5% and below +50% |
| UNCHANGED | Quantity change percentage is from -5% through +5%, inclusive |
| REDUCE | Quantity change percentage is below -5% and above -50% |
| STRONG_REDUCE | Quantity change percentage is at most -50% |
| EXIT | Present in the comparable prior snapshot and absent from the current effective snapshot |

NEW and EXIT take precedence when a comparable position is absent on one side. At overlapping numeric boundaries, the more specific strong classification takes precedence. Reported-value increases/decreases can never automatically imply ADD/REDUCE. Missing or non-READY quarters cannot produce inferred exits.

### Analytics and consensus

Precompute versioned portfolio snapshots containing total reported value, holdings, top-one/top-five/top-ten concentration, HHI, sector and industry allocation, turnover, entries/exits/adds/reductions, largest position, and largest additions/reductions. Turnover labels Low/Moderate/High must be based on a documented deterministic formula and version.

Consensus metrics are computed from aligned effective-quarter snapshots and an explicit eligible-Guru denominator. Coverage, partial filings, unmapped securities, inactive profiles, and unavailable quarters must be visible and must not be represented as zero ownership. Quarter holder counts, buyers/sellers, weights, and breadth must use the same documented eligibility policy.

## AI and prompt lifecycle

Reuse the existing AI provider, queued jobs, lease/heartbeat, retry/timeout, usage, token tracking, quota, budget, and result-persistence components where their current contracts fit. Do not create a second provider or quota system.

Build AI input only from application-computed structured context (Guru, quarter, portfolio, changes, concentration, sectors, history, and consensus); never send raw SEC XML. Analysis includes executive summary, portfolio direction, conviction positions, entries/adds/reductions/exits, sector/theme and concentration change, turnover interpretation, historical and consensus context, risks/caveats, and takeaways.

Persist facts separately from interpretations. Every result carries prompt key/source, source-code system-prompt version, override version when used, provider, model, generation time, input hash, usage, and status. Reuse an existing result when the structured input hash and effective prompt version have not changed unless an explicit regeneration is requested and admitted by quota/budget policy.

All analyses must preserve these disclosures: 13F is delayed and reflects quarter-end reported holdings; exact trade dates/prices are unknown; short positions are generally not disclosed; some derivatives/hedges may be absent; confidential treatment can temporarily hide holdings; market-value change does not prove a trade; and 13F does not represent a manager’s complete portfolio. A dispatched provider request with an unknown outcome is not blindly retried; it remains an auditable unknown and requires an explicit, quota-checked regeneration.

Prompt management is shared across AI modules such as Guru Analysis, Weekly Report, and Research Writer. Each prompt has an immutable source-code System Default that is viewable but not editable/deletable and remains the fallback. An active database override takes precedence and supports versioning, duplicate/test/preview/activate/rollback/archive/disable and audit. Immutable code-level guardrails are applied around any override. Allowed variables are registry-defined; unknown variables fail validation. Guru Analysis variables include {{guruName}}, {{managerName}}, {{period}}, {{portfolioValue}}, {{topHoldings}}, {{largestAdds}}, {{largestReductions}}, {{newPositions}}, {{exitedPositions}}, {{sectorChanges}}, {{concentration}}, {{historicalContext}}, and {{consensus}}. Output schemas and default model settings are code-owned/read-only. Admin playground shows structured input, rendered prompts, variables, schema, output validation, provider/model, token usage, latency, and test-vs-production usage. The generic prompt registry and test harness can be built independently; Guru/quarter structured input is integrated by the Guru Analysis slice. Ordinary APIs accept domain requests only and reject prompt text or override fields.

## Admin and operations

Guru Admin supports profile creation/editing, CIK and slug, editorial description/tags, featured/active state, image, and manual security notes. Guru detail shows latest filing/sync, next check, quarters, ingestion state, mapping coverage, errors, and guarded actions to sync, reprocess, rebuild analytics, or regenerate analysis.

Institutional Admin shows tracked managers, latest SEC check, pending filings, parser/mapping errors, partial quarters, and AI backlog/errors. Filing Inspector drills through manager, period, filing, accession, documents, parsed holdings, effective snapshot, and amendments. Diagnostics export is available to admins.

## Data model and architecture boundaries

Use the repository’s modular-monolith boundaries and PostgreSQL/Drizzle schema. Expected durable concepts include:

- Guru profiles and institutional manager identity
- SEC filings, filing documents, parsed 13F holdings, effective portfolios, and effective holdings
- Securities, stable identifiers, mapping overrides, and corporate-action identity links
- Versioned Guru-quarter analytics, holding changes, sector analytics, consensus snapshots, and stock consensus
- AI summaries and generation trace
- Guru followers, stock-activity follows, notification preferences, and decision-time journal snapshots
- Shared AI prompt overrides, immutable override versions, and audit events

SEC owns reliable source access. Institutional owns filing normalization, security identity, amendments, snapshots, and deterministic intelligence. Guru owns user-facing research. AI owns model execution. Guru Analysis owns structured context and interpretation. Prompt Management owns prompt lifecycle. No layer may take over another layer’s data or policy.

## Reliability, performance, and privacy

Filing discovery, ingestion, mapping, snapshots, analytics, consensus rebuilds, AI, and notifications use existing job conventions and are idempotent. Discovery cadence and single-owner scheduler operation are documented and observable. Rebuilding or changing structured input invalidates only affected AI summaries; invalidation and regeneration are separate auditable job outcomes. User-facing requests read prepared data; they do not parse filings, rebuild the entire consensus universe, or generate AI synchronously. Cache hot directory, portfolio, consensus, and stock endpoints; Redis stays optional.

Persist IDs and exact reported financial values without lossy JavaScript-number conversions. User API requests never select CIK without authorization or provide prompt content. Admin routes enforce server-side roles. Do not use live user data or production services in tests; use synthetic filing fixtures, controlled provider transports, and disposable PostgreSQL for integrity/concurrency acceptance.

## Acceptance gates

1. Each displayed holding traces to a filing accession and source document; each effective Guru/quarter has one deterministic snapshot.
2. Parser, amendment handling, mapping, action classification, weights, concentration, turnover, consensus, and sector direction have fixed synthetic fixtures and versioned deterministic behavior.
3. SEC requests share one fair-access scheduler across request and worker paths; retries and restarts do not duplicate effective holdings or notifications.
4. PostgreSQL tests cover constraints, retry/idempotency, concurrent rebuilds, and ownership; browser tests cover desktop and mobile principal flows.
5. UI is reviewed against DESIGN.md, with before/after evidence and a recorded visual rationale for material changes.
6. AI tests prove fact/interpretation separation, immutable caveats, schema validation, input-hash reuse, prompt provenance, and the boundary between ordinary API requests and admin prompt operations.
7. Directory, portfolio, changes, consensus, stock, sector, compare, admin, and export paths expose loading, empty, partial, stale, and error states without presenting unknown data as zero.
8. No ticket is complete without runnable acceptance evidence. Local implementation acceptance does not imply production cutover.

## Open implementation decisions

Resolve these in the owning ticket before depending on them in downstream slices:

- The deterministic turnover formula and Low/Moderate/High bands.
- Filing amendment precedence and additive/restatement interpretation against representative official source fixtures.
- The eligible-Guru denominator for each consensus period and treatment of PARTIAL/mapping coverage.
- Corporate-action source and the minimum identity links needed to prevent false exits/entries.
- The source of company sector/industry classifications and its refresh/version policy.
- Exact defaults for notification thresholds and any admin-managed configuration.
- Whether the current AI Reports prompt tables/workflow can be generalized without changing existing AI Report behavior.
