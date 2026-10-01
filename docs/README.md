# Documentation index

Reviewed against repository source on 2026-09-27. The product is **Trade basic**; repository and infrastructure names remain `diary-v3`.

## Start here

| Need | Read |
| --- | --- |
| Install, run, and verify locally | [Project README](../README.md) |
| Understand current capabilities and limits | [Product](../PRODUCT.md) |
| Navigate runtimes, packages, and data boundaries | [Architecture](architecture.md) |
| Implement or review the UI | [Current design system](../DESIGN.md), [scoped design records](design/), and the [design changelog](design/CHANGELOG.md) |
| Understand accepted technical decisions | [ADRs](adr/) |
| Configure and operate a deployment | [Environment contract](operations/environment-contract.md), [CI/CD](operations/ci-cd-notes.md), and [K3s guide](../ops/k8s/README.md) |
| Check the latest local engineering evidence | [2026-09-27 cleanup, performance, and security audit](audits/project-cleanup-2026-09-27.md) |

## Document authority and status

- **Current guides:** README, PRODUCT, DESIGN, architecture, feature guides, and runbooks describe source behavior and operating requirements. A review date is not a new runtime verification claim.
- **Approved scope and decisions:** the [original plan](../PLAN.md), [immutable rebuild PRD](../.scratch/diary-v3-rebuild/PRD.md), separately approved extensions, and ADRs explain intent and constraints. Initial planning status is historical. Later implementation-status notes do not rewrite a decision's original rationale.
- **Dated evidence:** acceptance reports, audit reports, design reviews, smoke logs, and screenshots prove only their recorded revision, environment, and scope. Preserve results and limitations; link newer evidence instead of replacing old counts.
- **Frozen parity inputs:** the [sanitized source archive and manifest](parity/README.md) are the reference for ordinary parity work. Do not substitute the live diary-vue checkout or silently refresh the baseline.

The original core rebuild and subsequent numbered tickets have local acceptance. This does not authorize a production cutover or resolve every extension's release gate. In particular, AI Reports beta readiness, Research Studio live sources/full-report publication, native device delivery, and hosted deployment evidence remain separately scoped. CI also retains advisory checks; see the [recorded gate policy](operations/ci-cd-notes.md).

## Feature guides

| Area | Current guide and related decision |
| --- | --- |
| Public tools and private actions | [Tools access matrix](tools-access-matrix.md) |
| Public and Member articles | [Product access model](../PRODUCT.md#article-access-model), [rollout boundary](../ops/k8s/production/README.md#article-access-release-boundary) |
| Article translations | [Translation guide](article-translations.md), [search decision](adr/0016-public-article-translation-search.md), [automatic admission](adr/0017-automatic-translation-admission.md) |
| Manual AI reports | [AI Reports V1](features/ai-reports-v1.md), [ADR-0014](adr/0014-manual-ai-reports.md), [runbook](runbooks/ai-reports.md) |
| Admin research | [Research Studio](features/research-studio.md), [ADR-0015](adr/0015-research-studio.md), [method bundle](research-method/README.md), [source-use review](research-method/source-policy-review.md) |
| Account email | [Verification, recovery, and SMTP runbook](runbooks/account-email.md) |
| Abuse controls | [Memory/Redis rate limiting](runbooks/rate-limiting.md) |
| Market jobs | [Rotation and Market State CLI](rotation-cli.md) |

Core diary, trading, sharing, authentication, and market semantics are mapped in the [frozen parity inventory](parity/README.md) and [ADRs](adr/). Their current code boundaries are summarized in [architecture](architecture.md).

## Native readiness

- [Native proof guide](native/native-proof.md): prerequisites, commands, session behavior, and scope.
- [Package artifacts](native/package-artifacts.md): packing, provenance, and a consumer outside the workspace.
- [App-ready audit](native/app-ready-audit.md): evidence and unresolved mobile-delivery boundaries.
- [Proof workspace README](../proofs/native/README.md): the isolated Expo consumer and its independent dependency installation.

Bundle export and an API consumer proof do not establish a native binary, simulator/device execution, app-store release, push, or offline-write support.

## Operations

- [Environment contract](operations/environment-contract.md) and [example environment](../.env.example).
- [CI/CD notes](operations/ci-cd-notes.md): triggers, blocking/advisory gates, artifacts, and deployment behavior.
- [K3s operations](../ops/k8s/README.md): images, seed, migration, scheduled jobs, backup/restore, and local exercises.
- [Production overlay](../ops/k8s/production/README.md): configuration, release/rollback, access-aware article rollout, and worker boundaries.
- [Account email](runbooks/account-email.md), [AI Reports](runbooks/ai-reports.md), and [rate limiting](runbooks/rate-limiting.md) runbooks.

Operational instructions describe what to run; dated smoke reports below describe what was actually exercised. Never infer production execution from a manifest, local build, or documentation edit.

## Acceptance and historical evidence

| Record | What it establishes |
| --- | --- |
| [2026-09-27 project audit](audits/project-cleanup-2026-09-27.md) | Later local security/resource fixes, dependency checks, test results, restore, synthetic performance, and remaining capacity/CI limits |
| [2026-09-25 all-ticket acceptance](features/all-tickets-acceptance-2026-09-25.md) | Core and follow-up ticket execution, with AI/Research external gates kept separate |
| [Original core release report](parity/final-release-report.md) | 2026-09-06 core rebuild and frozen performance checkpoints |
| [Frozen baseline](parity/README.md) and [performance record](parity/performance-baseline.md) | Reproducible source inputs and original workload evidence |
| [Research Studio acceptance](features/research-studio-acceptance.md) | Offline/synthetic workflow acceptance and the live-source boundary |
| [Deployment exercise](operations/deployment-59-smoke.md), [restore exercise](operations/restore-60-smoke.md), [staging smoke](operations/staging-smoke.md) | The recorded environment, commands, and limits of those specific runs |
| [Core workflow RC1](acceptance/core-workflow-rc1.md), [RC2](acceptance/rc2.md) | Release-candidate checkpoints, not continually updated test inventories |
| [UI/UX audit](audits/uiux-polish-report.md), [page matrix](audits/uiux-page-matrix.md), [design evidence](design/) | Scoped visual and interaction reviews; current design rules remain in DESIGN.md |
| [Static bottleneck review](reviews/2026-09-14-static-bottleneck-remediation.md) | Dated investigation and remediation evidence |

Host-local `/tmp` and `.impeccable` capture paths in historical reports may be session artifacts rather than portable checked-in files. Use the linked checked-in evidence and documented reproduction commands; do not assume those paths exist on a fresh clone.

## Contributor and agent workflow

Follow [AGENTS.md](../AGENTS.md), [domain documentation](agents/domain.md), [issue-tracker conventions](agents/issue-tracker.md), and [triage labels](agents/triage-labels.md). The [local ticket index](../.scratch/diary-v3-rebuild/ISSUES.md) distinguishes planning triage from execution evidence. Read the relevant specification before changing behavior, preserve immutable PRDs and frozen evidence, and record deliberate corrections in an ADR with regression evidence.

The [deployment acceptance direction](agents/deployment-acceptance.md) and [final performance acceptance direction](agents/final-performance-acceptance.md) are historical ticket instructions. Use current runbooks for commands and dated reports for completed execution.
