# Guru AI analysis: structured input, provenance, and disclosures

The Guru analysis slice interprets prepared institutional data for one manager and one reported quarter. It never reads filings. Its only input is the structured context built from prepared portfolio analytics, holding changes, and consensus snapshots, so the same quarter always produces the same model input.

## Structured input

`buildGuruAnalysisInput` requires an active, READY effective publication whose snapshot matches the prepared analytics row for the quarter. Anything else is refused with `QUARTER_NOT_READY`, `ANALYTICS_NOT_PREPARED`, or `ANALYTICS_SUPERSEDED`, and no provider call is made.

The context (`guru-analysis-context-v1`) carries the editorial profile, quarter and data state, the analytics version and the server-side action thresholds, the reported portfolio and its concentration, turnover, the categorized quarter moves, up to eight earlier quarters, and the cross-Guru consensus for the top holdings and their sectors and mapped themes. It also carries a `facts` list: identified, labelled, server-computed values such as `portfolio.reportedValueUsd`, `concentration.topTen`, `turnover.band`, `actions.NEW`, and `holding.rank-1`.

Raw SEC XML, filing documents, parsed rows, and user data are never included. The structured input is hashed (`inputHash`) and stored with the run, so a published analysis can always be compared against the data it was generated from.

## Facts, interpretation, and disclosures

The output schema (`guru-analysis-v1`) is code-owned. Each section is a list of statements, and every statement declares `kind: "fact"` or `kind: "interpretation"`, the `factRefs` it cites, and the `positionKeys` it refers to. Validation rejects a result that cites an unknown fact or position, or that marks a statement as a fact without citing one.

Disclosures are not model text. The model returns `caveatIds`, validation requires the complete code-owned set, and the server renders the canonical sentences. An analysis can therefore never ship without the delayed-disclosure, unknown-trade-date, undisclosed-shorts, missing-derivatives, confidential-treatment, value-change-is-not-a-trade, and incomplete-portfolio statements.

## Prompt lifecycle

`guru.analysis` is a module in the shared prompt registry. Its immutable system default, guardrails, output schema, model settings, and synthetic fixture live in source code. Its allowed variables are `guruName`, `managerName`, `period`, `portfolioValue`, `topHoldings`, `largestAdds`, `largestReductions`, `newPositions`, `exitedPositions`, `sectorChanges`, `concentration`, `historicalContext`, and `consensus`; any other variable fails validation. An active database override supplies only the editorial guidance, which is quoted inside the immutable rules. A run pins the prompt source, system version, override version, and template hash at request time, so a later override cannot change an existing result.

## Generation lifecycle and accounting

Generation is an explicit admin request on `/api/admin/gurus/:id/analysis`. There is no automatic generation, so no provider budget is ever spent without an actor.

- A `generate` request whose structured input hash and effective prompt template already match a succeeded, current run reuses that run and spends nothing.
- A `regenerate` request is auditable, ignores reuse, and is rejected within 60 seconds of the previous run for the same quarter.
- Requests reserve the global AI budget, share the single AI call-slot gate with AI Reports and admin tests, and record their provider attempt in `ai_report_attempt`.
- Only a pre-dispatch failure returns its reservation. A dispatched call is never retried implicitly: an unknown outcome is terminal, keeps the committed cost, and requires a new explicit regeneration.
- The worker re-verifies the prepared input before dispatch. If the captured `inputHash` no longer matches, the run fails with `AI_SOURCE_INVALIDATED` instead of describing stale data.

## Invalidation

Invalidation is a separate consumer of the effective-snapshot outbox and never generates. When a rebuild changes a quarter's analytics context hash, succeeded runs for the changed quarter and the following quarter become `invalidated` with reason `GURU_ANALYTICS_REBUILT`, and queued runs for that quarter are cancelled with their reservations returned.

An invalidated analysis stays readable. `/api/gurus/:slug/analysis` reports it as `STALE` with its full generation record, so the audit trail survives the rebuild. The user-facing states are `NOT_GENERATED`, `QUEUED`, `RUNNING`, `READY`, `STALE`, `FAILED`, and `BLOCKED_BY_COVERAGE`; prepared facts remain visible in every state that has them.

## Operations

`npm run guru-analysis:worker` drains invalidation and then generation. `--once` processes a single invalidation event and a single run, which is what the integration tests use.
