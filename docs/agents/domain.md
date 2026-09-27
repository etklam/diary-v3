# Domain documentation

This monorepo uses one domain context across Web, API, shared packages, and the native proof. There is no standalone `CONTEXT.md` or `CONTEXT-MAP.md`; use the actual records below rather than assuming a missing glossary exists.

## Reading order

1. [PRODUCT.md](../../PRODUCT.md) for current capabilities, access models, and release boundaries.
2. [PLAN.md](../../PLAN.md) and the [immutable rebuild PRD](../../.scratch/diary-v3-rebuild/PRD.md) for original approved scope. The plan's initial proposals and the PRD's planning-era status are historical intent, not live execution status.
3. The relevant approved extension specification and [feature guide](../README.md#feature-guides). Do not rewrite the parent PRD to absorb subsequent features.
4. [ADRs](../adr/) for accepted decisions and deliberate legacy corrections. Read any separate implementation-status notes before interpreting an older pending statement.
5. [DESIGN.md](../../DESIGN.md) for the current built UI rules and the relevant [design brief/review](../design/) for scoped evidence.
6. [Architecture](../architecture.md), shared contracts, schema/migrations, and the relevant tests for implementation and runnable evidence.

## Domain language and invariants

Use the names in product copy and contracts: Diary, Quick Diary, Timeline, Calendar, Review queue, Trade Plan, Portfolio, Company Hub, Watchlist, Investment Thesis, Evidence, reminder, Partner, Article, AI Report, and Research Studio. A Diary's calendar date is distinct from a UTC event instant. Persisted financial decimals and IDs use string contracts.

An authenticated member is not a paid subscriber. Partner sharing grants an explicit subset of another user's data; it is not general ownership. AI Reports and Admin Research Studio have separate workflows and release gates. A native consumer proof is not a shipped mobile app.

The API owns authorization and authoritative business validation. PostgreSQL constraints and transactions enforce ownership links, diary uniqueness, ledger integrity, and session concurrency. Shared domain rules must remain portable. Consult [ADR-0001](../adr/0001-parity-baseline-and-contract-corrections.md) before treating an erroneous legacy behavior as a requirement.

## Scope and evidence

Use the [sanitized frozen baseline](../parity/README.md) for parity; diary-vue is read-only and is not a moving implementation reference. Current acceptance is linked from the [documentation index](../README.md#acceptance-and-historical-evidence). Test results prove only the recorded date and scope.

Use [local issue-tracker conventions](issue-tracker.md) and [canonical labels](triage-labels.md). Triage roles and execution states are distinct. A ticket is done only when its acceptance criteria have runnable evidence.

If a proposed change contradicts a product rule, accepted ADR, or approved specification, identify the conflict explicitly and record the resulting decision. Do not silently replace the documented rule or infer new scope from a historical checklist.
