# Shared prompt management

The Admin registry at `/admin/ai/prompts` owns prompt override lifecycle. Source defaults, guardrails, allowed variables, output schemas, model defaults, and synthetic input remain in source code. The existing AI Reports configuration page links to this registry and its legacy prompt endpoints remain compatible.

## Runtime and lineage

The effective prompt is the active, available, valid database override; otherwise it is the source default. Migration 0060 imports currently active published non-default AI Reports prompts, preserving their exact legacy IDs. Historical database defaults stay historical and never replace the source default.

Overrides are append-only versions. Template, name, key, revision, legacy lineage, and creation time cannot be updated or deleted in PostgreSQL. Archive changes availability while retaining history. A key-level state revision protects all saves and lifecycle operations; concurrent stale requests return a conflict.

AI Reports still pin `ai_prompt_version.id` when admitted. Shared overrides keep a link to their corresponding legacy row. Activating, rolling back, disabling, or archiving affects future admissions; queued and running reports continue on their original published prompt. Provider changes, revoked consent/access, generation disable, deleted/invalidated sources, leases, quota, and budget continue to fence execution. A source fallback creates a new legacy row when required and never rewrites an existing report reference.

## Admin operations

Create from default, edit/save a new immutable version, duplicate, preview, run a synthetic test, activate, roll back, archive, and disable are available. Activation and rollback require a passed test for that immutable version; imported active legacy versions retain their established publication status. An active override must be disabled before archival. Legacy publication cannot resurrect an archived shared version.

The playground accepts a registered version and preview/test mode only. It rejects submitted prompt text, provider/model settings, guardrails, and arbitrary input. Rendering always applies the code-owned guardrails and module schema. Unknown template variables fail validation. Ordinary report endpoints remain strict domain requests and reject prompt or override fields.

Tests use the existing published provider, transport, concurrent-call limit, conservative global budget reservation, and outcome settlement. Their attempts have no production report ID, and the playground labels usage as test. Preview opens no provider connection. Unknown outcomes are charged conservatively, audited, and never automatically retried.

## Adding a module

Add the key to the shared contract and register an exhaustive `PromptDriver` in `apps/api/src/shared-prompts/registry.ts`. The driver owns its immutable definition, variable validation, rendered messages, registered synthetic input, and schema-validating test. The optional `legacyReportType` bridge is reserved for Weekly and Monthly AI Reports; other modules persist shared versions without creating legacy report prompts. Guru/quarter selection and structured context are ticket 11 scope.

## Acceptance evidence

- `tests/unit/shared-prompts.test.ts`: immutable rules, unknown variables, strict admin payloads, and a non-report driver.
- `tests/integration/shared-prompts-http.test.ts`: upgrade from migration 0059, original lineage, Admin/CSRF boundaries, concurrent revision conflict, immutable database versions, preview/test usage, activation/rollback/archive/disable, legacy archive rejection, unknown outcome, and source fallback.
- `tests/integration/ai-reports-jobs.test.ts`: existing report execution plus pinned queued/running prompt survival through registry changes.
- `tests/e2e/shared-prompts.spec.ts`: source defaults, lifecycle, synthetic output and usage, desktop/mobile/dark, and three interface locales.
- `docs/design/shared-prompt-management-brief.md`: direction rationale and evidence locations.

Local synthetic acceptance does not authorize production cutover or live-provider use.
