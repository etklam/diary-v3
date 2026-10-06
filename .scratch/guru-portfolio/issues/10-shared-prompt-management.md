# [10] Generalize prompt management for shared AI modules

Status: ready-for-agent
Execution: done
Type: AFK

## Parent

[Guru Portfolio PRD](../PRD.md)

## What to build

Evolve the existing /admin/ai/prompts workflow into a shared prompt registry with source-code defaults, versioned database overrides, immutable guardrails, audit, and a safe playground. Preserve current AI Reports behavior.

## Acceptance criteria

- [x] Each prompt has an immutable source-code System Default with system version, user template, allowed variables, output schema, and default model settings; admin view is read-only and default cannot be edited/deleted.
- [x] Runtime precedence is active DB override then source default; fallback works if no override or the override is unavailable.
- [x] Custom prompt supports create-from-default, edit/save-version, duplicate, test/preview, activate, rollback, archive, and disable.
- [x] Guardrails are code-owned and always applied; schema and variable registry are read-only; unknown variables fail validation.
- [x] Audit records create/edit/activate/deactivate/rollback/archive/test with admin, timestamp, version, and action.
- [x] Generic playground shows a selected prompt, registered sample input, rendered prompts, variables, output schema, validation, provider/model, tokens, latency, usage, and prompt version. Test usage is separated from production usage; Guru/quarter context integration belongs to ticket 11.
- [x] Ordinary user API requests cannot submit system/user/custom prompt text or override IDs.
- [x] Existing AI Report prompts and generation remain behaviorally compatible; disposable DB/API/browser evidence covers migration, version conflict, fallback, and rollback.

## Notes

The existing AI Reports prompt store persists defaults as database drafts. Keep every existing `ai_prompt_version` row and ID so reports and queued jobs retain their exact prompt lineage. The old database `isDefault` drafts remain historical and never override the source-code System Default. Preserve each currently active published non-default version as the effective AI Reports override during migration; link it to the shared registry without changing its existing report references. New modules resolve through the shared prompt registry, while existing AI Reports jobs continue to read their pinned legacy version until explicitly migrated. Verify that no active custom prompt is silently replaced by a source default.

## Implementation checkpoint — 2026-10-06

- Added two source-owned AI Reports drivers to the shared prompt registry; each driver supplies its definition, allowed-variable validation, renderer, synthetic test, and optional legacy report bridge. New modules register their own driver rather than inheriting report behavior.
- Migration 0060 preserves every legacy prompt/report ID and imports only active published non-default overrides. Legacy publication mirrors the registry; archived versions cannot be republished through the older workflow.
- Shared lifecycle uses immutable appended versions, database update/delete guards, global transaction locking and revision checks. Activation requires a passed synthetic test; audit records every lifecycle action.
- Source fallback materializes a new legacy default for future reports while existing queued/running jobs retain their original published prompt and continue. Provider, consent, access, source, and quota fences remain authoritative.
- Added the dedicated `/admin/ai/prompts` interface and a link from the existing AI administration page. The playground accepts only registered synthetic input; test attempts reuse the existing global budget and are identified by null production report IDs.
- Source changes passed scoped ESLint and Impeccable detector. New API migration/lifecycle tests passed. Compatibility regression evidence and desktop/mobile browser review are complete.

Review: the first independent pass identified pinned-job cancellation and report-specific driver assumptions. Both were corrected with direct regression coverage. The second independent review confirmed both original P1 findings resolved and found no material new P1/P2. The initial browser harness integration failures were resolved before the final passing acceptance run.

### Runnable verification

- `npm test -- --run tests/unit/shared-prompts.test.ts tests/integration/shared-prompts-http.test.ts tests/integration/ai-reports-admin.test.ts tests/integration/ai-reports-jobs.test.ts`: 46 tests passed on fresh disposable local PostgreSQL databases. No production service or user data was used.
- `npx playwright test tests/e2e/shared-prompts.spec.ts`: the full lifecycle browser flow passed at 1440px and 390px, light/dark and en/zh-TW/zh-CN. Initial harness route integration and test locator failures were corrected; the final functional and visual confirmation flow passed in 9.8 seconds (12.9 seconds total), including an assertion that test audit records refresh without a registry revision change.
- `npm run typecheck`: passed after API contract and route integration. Scoped ESLint passed. The Impeccable mechanical detector reported `[]`.
- The legacy AI Admin cancellation fixture now pins its report creation timestamp to the test's September clock; previously its database-now October timestamp incorrectly selected a different quota month. This is a fixture correction, not a runtime quota change.

Visual review: the first desktop/mobile/dark screenshot batch exposed missing local action gaps, the wrong destructive button class, an inherited heading layout, and an over-wide template measure. One correction batch applies the existing danger-button treatment, a 72ch bounded reading form, ruled regions, and wrapped actions. The final desktop default/override, mobile light and mobile dark screenshot batch confirms the corrections, without clipping or horizontal overflow. Native controls, source provenance and readable ruled sections match DESIGN.md. The fixed mobile navigation shown inside full-page evidence is the existing shell behavior. No shipping raster assets were added. Finish verdict: accepted after one correction batch.

### Final acceptance

All eight criteria have runnable evidence. Ordinary-user strict request schemas reject prompt text/override IDs; migration, concurrency conflicts, inactive/unavailable fallback, rollback, archived legacy publication rejection and pinned queued/running reports are covered by the disposable database tests. The independent review has no unresolved material P1/P2 findings. API contracts, client generation and route registration are integrated by the primary agent. Guru/quarter-specific sample context remains assigned to ticket 11.
