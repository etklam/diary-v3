# [11] Generate traceable Guru portfolio analysis

Status: ready-for-agent
Execution: done
Type: AFK

## Parent

[Guru Portfolio PRD](../PRD.md)

## What to build

Build the server-side context builder, output schema/validator, queued report lifecycle, and user-facing AI analysis history using prepared institutional snapshots and shared prompt/provider infrastructure.

## Acceptance criteria

- [x] Context contains structured Guru, quarter, portfolio, changes, concentration, sectors/themes, history, and consensus data; no raw SEC XML is sent.
- [x] Output validates facts, interpretations, and summary as separate fields and includes all required 13F caveats.
- [x] Report covers executive summary, direction, conviction positions, entries/adds/reductions/exits, sector/theme and concentration changes, turnover, historical/consensus context, risks, and takeaways.
- [x] Generation, regeneration, and previous generations use existing provider/job/lease/heartbeat/timeout/usage/quota/budget infrastructure where compatible. Retry only before provider dispatch; an unknown post-dispatch outcome remains terminal and requires an explicit regeneration.
- [x] Input hash plus effective prompt version supports reuse; explicit regeneration is auditable and admitted by budget/quota policy.
- [x] Persist generation ID, input hash, prompt key/source/version, override version, provider/model, tokens, generated time, and status.
- [x] Structured synthetic fixtures prove deterministic context and facts/interpretation validation; controlled provider tests cover malformed output, pre-dispatch recovery, timeout/unknown outcome, explicit regeneration, and accounting.
- [x] UI distinguishes pending, failed, degraded, blocked-by-coverage, and completed analyses with traceability.

## Blocked by

- [05 portfolio analytics](05-portfolio-analytics.md)
- [08 consensus and stock intelligence](08-consensus-sectors-stocks.md)
- [10 shared prompt management](10-shared-prompt-management.md)

## Resolved analysis decisions

- Generation is always an explicit admin request on `/api/admin/gurus/:id/analysis`. Nothing generates automatically, so provider budget is never spent without an actor, and every attempt has an accountable `requestedByUserId`. Users read results on `/gurus/:slug/analysis`.
- The structured input is built only from an active READY publication whose snapshot matches the prepared analytics row. `QUARTER_NOT_READY`, `ANALYTICS_NOT_PREPARED`, and `ANALYTICS_SUPERSEDED` are refusals, not degraded generations.
- The context is `guru-analysis-context-v1` and carries an identified `facts` list. Statements cite `factRefs` and `positionKeys`; validation rejects unknown citations and any `kind: "fact"` statement without a citation.
- Disclosures are code-owned. The model returns `caveatIds`, validation requires the complete set, and the server renders the canonical sentences, so no prompt or model output can drop a required 13F caveat.
- `guru.analysis` registers in the shared prompt registry with its own camelCase variable set, guardrails, output schema, and synthetic fixture. The AI Reports `[a-z_]` validator is not reused. Runs pin prompt source, system version, override version, and template hash.
- Guru runs own their lifecycle table but share the existing global AI concurrency slot, budget reservation, and `ai_report_attempt` accounting. The per-user monthly quota and consent model does not apply, because a Guru analysis is platform data rather than a user's private record.
- Only a pre-dispatch failure returns its reservation. A dispatched call is terminal; an unknown outcome keeps the committed cost and requires an explicit regeneration. Regeneration is rejected within 60 seconds of the previous run for the same quarter.
- Invalidation is a separate outbox consumer that never generates. A rebuilt quarter marks succeeded runs `invalidated` and cancels queued runs with their reservations returned. An invalidated analysis stays readable as `STALE` with its full generation record.

## Implementation evidence

- Before: `/gurus/:slug/analysis` was linked from the overview and research tabs but had no route, so it rendered the not-found shell. After: desktop and mobile captures of the ready, stale, queued, and blocked states in [design evidence](../../../docs/design/evidence/guru-analysis/).
- Visual direction follows `DESIGN.md`: prepared figures stay in ruled, tabular regions; interpretation is set as ruled statements that carry their own fact/interpretation label and citations, so the two never read as one voice.
- Rules and lifecycle are documented in [docs/guru-analysis.md](../../../docs/guru-analysis.md).
- `npm run typecheck` — passed.
- `npm run contracts:generate` and `npm run contracts:check` — passed.
- `npm run build --workspace=@diary/web` — passed.
- `npx eslint` on the changed API, web, and test files — no findings.
- `npx vitest run tests/unit/guru-analysis.test.ts` — 9 passed.
- `npx vitest run tests/unit/shared-prompts.test.ts` — 4 passed, including the new Guru module registration case.
- `npx vitest run tests/integration/guru-analysis.test.ts` — 3 passed, using a disposable PostgreSQL database and a controlled provider transport.
- `npx playwright test tests/e2e/guru-analysis.spec.ts` — 1 passed, covering ready, stale, queued, blocked, and mobile states.
