# All-ticket acceptance inventory — 2026-09-25

This inventory reconciles local ticket records and verification as of 2026-09-25. Ticket-level status and runnable evidence remain authoritative in each issue file. Local verification is recorded separately from external research and release gates.

| Ticket scope | Recorded state | Tracker evidence |
| --- | --- | --- |
| 01–61: core rebuild | Each ticket records `Status: done`. Ticket 61 records the phase-level parity, deployment, restore, and release evidence. | [Core ticket index](../../.scratch/diary-v3-rebuild/ISSUES.md); [ticket 61](../../.scratch/diary-v3-rebuild/issues/61-final-verification.md) |
| 62: Daily Workspace and first-use flow | `Execution: done`; local acceptance and its evidence are recorded for the desktop/mobile workspace and first-use flows. | [Ticket 62](../../.scratch/diary-v3-rebuild/issues/62-daily-workspace.md); [acceptance evidence](../design/daily-workspace-acceptance.md) |
| 63: Research-to-Diary handoff | `Execution: done`; the 2026-09-19 reconciliation supersedes earlier pending notes and records the completed browser, built-artifact, and visual acceptance. | [Ticket 63](../../.scratch/diary-v3-rebuild/issues/63-research-diary-handoff.md); [handoff acceptance](../design/research-diary-handoff-acceptance.md) |
| 64–76: convenience follow-ups | All thirteen tickets record completed local acceptance and runnable evidence. | [Follow-up index](../../.scratch/diary-v3-rebuild/FOLLOW-UP-ISSUES.md) |
| 77–81: architecture deepening | All five tickets record `Execution: done`; the architecture index records runnable evidence for all 30 acceptance criteria. | [Architecture issue index](../../.scratch/diary-v3-rebuild/ARCHITECTURE-ISSUES.md) |
| 82: exact per-user Diary counts in Admin | `done`; the focused HTTP and Admin browser reruns passed. | [Ticket 82](../../.scratch/diary-v3-rebuild/issues/82-admin-users-diary-count.md) |

## Final local verification — 2026-09-25

| Check | Result |
| --- | --- |
| Unit suite | 94 files / 871 tests passed. |
| Integration suite | 84 files / 337 tests passed using disposable PostgreSQL. |
| Full E2E initial run | 244/248 passed. The four remaining failures were stale test assumptions: Markdown expected an obsolete publish control; Portfolio expected a one-shot route although StrictMode caused reads in two viewports; and Admin navigation expected a missing Research Studio entry. Astra confirmed the Portfolio issue was fixture-only. |
| Focused E2E rerun | After correcting those test expectations and the fixture, all four previously failing cases passed in a separate 10-test focused rerun. This was not a single green 248-test run. |
| Release E2E | `npm run test:e2e:release`: 10/10 passed. |
| Build and static gates | `npm run build`, lint, `contracts:check`, and `manifests:check` passed. |
| Restore smoke | `npm run db:restore-smoke` passed at N=`0032_research_search_budget`, schema 33→34; fixture `2|1|1|1|1|1|1|1`; seed `24|213`; N+1 restore ledger 34; invalid restore exited 1 with zero public tables in the failed target. |

A plain sandbox `npm test` attempt is not valid verification evidence: local PostgreSQL/socket access failed with EPERM. The separate unit and integration reruns above passed.

## Separate acceptance boundaries

Research Studio's RS-01 through RS-05 have local acceptance evidence. [RS-06](../../.scratch/research-studio/issues/06-live-source-acceptance.md) remains externally blocked: applicable source-use evidence and exact official/issuer retrieval configuration are unverified, Tavily configuration was not supplied, and the initial live LLM attempt budget is exhausted. RS-06 requires a new explicit live budget and a full current SOXX report review. Synthetic fixtures and local implementation evidence do not satisfy those live-source criteria. See the [Research Studio acceptance record](research-studio-acceptance.md).

AI Reports V1 is not a ticket in the 01–82 tracker. Its implementation and local verification are recorded, while beta release gates remain planned: an authorized synthetic live DeepSeek smoke, human quality review, provider and processing disclosure review, deployment/restore/key-rotation drill, and restricted account grants. See [AI Reports V1](ai-reports-v1.md) and its [operations runbook](../runbooks/ai-reports.md).

These local results do not establish remote CI, deployment, live model or market-data calls, production release, or formal Research Studio research/publication readiness.
