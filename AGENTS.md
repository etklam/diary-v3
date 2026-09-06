# diary-v3

Use Traditional Chinese for user-facing updates. Write all code comments and documentation (README, PLAN, PRODUCT, DESIGN, docs/) in English — this includes every new or edited comment and doc; Chinese stays only in product i18n copy, test fixtures and parity evidence data. Read PLAN.md, PRODUCT.md and the active PRD before changing behavior. The diary-vue source is read-only; parity must use the recorded sanitized source baseline. Never use real user data or production services in tests.

## Collaboration

User-confirmed model responsibilities (2026-09-06): Astra owns direction, architecture decisions, aesthetic definition and final acceptance. Luna (`gpt-5.6-luna`, max reasoning) owns implementation, code changes and test fixes. Before UI implementation, Astra defines the layout, typography, color, spacing and interaction direction using DESIGN.md and Impeccable; Luna implements that brief. Material visual changes return to Astra for a decision, not to the user for routine approval.

The primary agent remains responsible for integration and verification. Use the sol-expert agent for focused complex analysis or review; it must not recursively delegate. Workers own explicitly assigned paths and must accommodate other agents' edits. Do not mark tickets done until their acceptance criteria have runnable evidence.

## Agent skills

### Issue tracker

Local Markdown under `.scratch/<feature>/`; see `docs/agents/issue-tracker.md`. The active feature is `diary-v3-rebuild`. Do not modify its parent PRD.

### Triage labels

Use the canonical vocabulary in `docs/agents/triage-labels.md`. Execution may use `in-progress`, `blocked`, and `done`; these do not replace the five triage roles. Ready tickets still require their blockers to finish.

### Domain docs

Single domain context across this monorepo; see `docs/agents/domain.md`. PLAN.md and the PRD currently define the approved architecture and domain scope.

## Implementation

React Web, Hono API, PostgreSQL with Drizzle, shared runtime contracts and standard-fetch client. Keep database/server dependencies out of Web and native-compatible packages. Preserve valid API behavior, ownership constraints, date semantics and decimal precision. The user explicitly authorized fixing legacy bugs and technical debt: preserve feature intent, not erroneous behavior. Record intentional corrections with regression evidence; consult docs/adr/0001-parity-baseline-and-contract-corrections.md. Use real disposable PostgreSQL for integrity and concurrency tests, controlled external-provider fixtures, and browser tests for principal flows.

## Autonomous work decision

The user authorized parallel subagent implementation while away. Routine implementation and design decisions may proceed with recorded evidence and independent review. This authorization does not include a production cutover. Tracker setup uses AGENTS.md, canonical labels and a single domain context as practical defaults.
