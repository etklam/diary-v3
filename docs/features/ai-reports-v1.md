# Manual AI review reports V1

Status: IMPLEMENTED and locally VERIFIED. Live beta release gates remain PLANNED. Baseline: `de9286211682e513da2eb54bb84acd2fd92bb19d` (2026-09-21). The working tree was clean at intake. The approved attachment is the acceptance specification; this document records implementation decisions, not a claim that all gates have passed.

Only an authenticated owner explicitly submitting Generate or Regenerate creates a report. Loading, polling, changing language, logging in, worker maintenance and retention cleanup never create reports. Each admitted job can make at most one provider generation request; unknown upstream outcomes require manual retry.

## Source boundary

| Input | Projection | Limitation |
| --- | --- | --- |
| Owner diaries | Saved title, content, thesis, risk, execution, tags, date and retrospective | Generation-time content; field-level history is unavailable |
| Owner transactions | Period activity and pre-period ledger dependencies | Recorded trades only; no inferred historical currency |
| Holdings | Existing deterministic ledger replay at beginning/end | Not a complete account valuation |
| Disciplines | Current saved content and creation timestamp | Current rules used retrospectively; not historical enforcement |
| Market observations | Included diary text | The owner's opinions, not independently verified facts |
| Partner records, external markets/news, images, unsaved drafts, AI reports | Excluded | No browsing, tools, image loads or summarization chain |

Regeneration keeps the original canonical report type and start date; mismatches are rejected before any new reservation or dispatch. Each revision stores its own locale and timezone.

Dates use owner-local Monday weeks/calendar months, local date-only diary filtering and timezone-derived UTC transaction boundaries. Partial periods end at capture time. Metrics are server-owned, with unknown values distinct from zero; model prose is never an authoritative numerical source.

## Model and privacy boundary

The model receives report-local source aliases and projected context, not owner IDs or account metadata. Text can still contain identifiers entered by its author. Consent must describe the actual recipient and disclosure revision. No assertion of zero retention or exclusion from training is made without deployment-specific review.

AES-256-GCM envelopes bind purpose and key version with authenticated data. Keys and context snapshots are encrypted; raw provider responses and reasoning are never retained. Analysis is validated JSON rendered as text with verified source links. Admin settings and audits do not expose private report content.

The HTTPS transport uses exact deployment-controlled base URL allowlisting, rejects unsafe addresses and mixed DNS results, pins the verified address for the actual socket, retains hostname/TLS verification, limits response bytes, and does not follow redirects or retry.

## Delivery gates

- AI-1: deterministic context fixtures, owner isolation and local disposable PostgreSQL tests.
- AI-2: settings/versioning, encrypted secrets, consent/access, outbound tests and admin boundaries.
- AI-3: persistence, quota/leases/idempotency, cancellation/deletion/revocation races and single dispatch.
- AI-4: manual user/admin UI, shared client, trilingual desktop/mobile and session isolation.
- AI-5: full automated gates, synthetic quality rubric, operational runbook and separately authorized live smoke.

No production deployment, paid DeepSeek smoke test, provider-terms acceptance or beta enablement is implied by local tests. These remain explicit release gates.

## Local verification log

| Check | Observed result | Scope |
| --- | --- | --- |
| `npm run test:unit` | 86 files / 794 tests passed | Backend and session-boundary tree |
| Provider security unit tests | 46 passed | Encryption, outbound policy, single-call adapter and bounded metadata |
| Socket transport fixtures | 2 passed | Verified-address pinning, no redirect follow and DNS rebinding rejection |
| Native proof typecheck | Passed | Shared contracts remain consumable |
| Native proof compile | iOS and Android exports passed | Existing proof app, no native UI changes |
| OpenAPI/client and manifests | Checks passed | Runtime contracts and generated client agree; baseline migration journal entries remain unchanged |
| AI-1 date/context tests | 11 unit and 3 PostgreSQL tests passed | DST, partial periods, deterministic projections and owner isolation |
| AI unit coverage | Included in the full unit gate | Context, contracts, security, output, quality fixtures and socket transport |
| HTTP boundaries | 5 PostgreSQL/HTTP tests passed | Session and API-key isolation, current admin role, CSRF, strict input, disabled defaults and safe domain errors |
| Global monetary budget | 3 PostgreSQL tests passed | Concurrent admission, reservation release, original-month settlement and unknown cost |
| Historical migration fixtures | 2 PostgreSQL tests passed | Actual pre-backfill databases migrate to the current schema |
| Deployment manifest gate | 9 manifests validated; 13 deployment tests passed | Worker defaults to zero replicas, has no public port and includes restricted egress |
| Full PostgreSQL integration suite | 296 tests passed | Includes 27 durable-job cases, 9 admin cases and the existing application regressions |
| Existing browser regressions | 230 unique scenarios passed | Full existing suite, with the stale PWA cache-version assertion corrected and its four scenarios rerun |
| AI browser acceptance | 10 passed | Real synthetic worker, weekly/monthly consent/generation, immutable language, source links, reload/logout, network and 5xx idempotency, preview locale race, recipient changes, provider/prompt administration, audit pagination and active-job deletion |
| Visual acceptance | Four screenshots inspected and confirmed | Desktop English/light and 390 px Traditional Chinese/dark; Simplified Chinese and zero horizontal overflow asserted in browser tests |
| Independent lifecycle/UI review | No remaining blockers in reviewed scopes | Shared capacity, cancellation/deletion/settlement, provider version publication, pagination epochs, retained submission exclusivity and recipient/consent reconciliation |
| Production build / lint / typecheck | Passed | Web, API and worker artifacts; existing Vite/Node deprecation notices remain |
| Live DeepSeek / real report quality | Not run | Requires authorized synthetic smoke and human review |
| Claude UI implementation | Implemented and integrated | Requested Sonnet alias resolved to GLM-5.3-flash; parent completed integration corrections and acceptance after independent review |

The Z.ai boundary concerns the requested development tool, not the product's DeepSeek report processing. No real user diary data or production data is used in development tests.

## Delivery status and changed boundaries

| Phase | Implementation | Verification |
| --- | --- | --- |
| AI-1 | IMPLEMENTED: deterministic owner-scoped context and shared runtime contracts | VERIFIED: date, ledger, coverage, size and owner-isolation fixtures |
| AI-2 | IMPLEMENTED: settings, secrets, outbound policy, grants, consent and Admin UI | VERIFIED: local security/integration/browser gates |
| AI-3 | IMPLEMENTED: durable manual jobs, worker, quotas, retention and lifecycle fences | VERIFIED: disposable PostgreSQL integrity and concurrency gates |
| AI-4 | IMPLEMENTED: user UI, generated client, trilingual responsive reading and session isolation | VERIFIED: ten AI browser scenarios and inspected desktop/mobile evidence |
| AI-5 | IMPLEMENTED: twelve quality cases, rubric, automated gates and operations runbook | VERIFIED locally; live smoke, human model quality and deployment evidence remain PLANNED |

The main code boundaries are `packages/domain/src/ai-reports`, `packages/contracts/src/{ai-reports,admin-ai,ai-openapi}.ts`, `apps/api/src/ai-reports`, and the two Web routes `/reviews/ai-reports` and `/admin/ai`. The generated client/OpenAPI expose the same contracts. Migration `0023_ai_reports` is append-only; baseline migrations 0000–0022 remain unchanged. Historical migration tests now construct their actual historical schema before applying subsequent migrations. The PWA browser assertion now matches the pre-existing v3 static cache; no service-worker behavior changed.

The UI uses the existing product typography, neutral surfaces and spacing, a desktop history/reader split, stacked mobile reading, bounded form controls and horizontally contained Admin tables. [Visual evidence](../design/evidence/ai-reports/README.md) records the reproduction command. Initial visual review caught untranslated deterministic labels/coverage notes and ambiguous zero counts; the confirmation pass verified the corrections. Existing-suite screenshot side effects were kept outside the commit; only new AI evidence is included.

The configured Claude Sonnet alias used `glm-5.3-flash[1M]` at Z.ai under the user's explicit development-source authorization. Parent integration fixed hook ordering, retained-request exclusivity, current-recipient reconciliation, active-job controls, localization and test harness details.

## Remaining release gates

Local synthetic provider fixtures do not establish live model quality, provider terms, deployment-specific disclosure or production egress behavior. Before enabling beta, an authorized operator must complete the synthetic live DeepSeek smoke, human rubric review, provider/processing disclosure review, deployment/restore/key-rotation drill and restricted account grants described in the [operations runbook](../runbooks/ai-reports.md).

No production deployment, beta enablement, paid DeepSeek call or push was performed. The user authorized a local commit after verification. Generation remains disabled by default and the worker deployment defaults to zero replicas.
