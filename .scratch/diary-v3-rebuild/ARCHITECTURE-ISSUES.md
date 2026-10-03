# Architecture deepening follow-up issues

Approved and published on 2026-09-20 from the architecture review and five-slice breakdown in this conversation. All five tickets use the canonical `ready-for-agent` triage state. Implementation and acceptance completed on 2026-09-20. All five tickets have `Execution: done`; their 30 acceptance criteria have runnable evidence. Ticket 79 was accepted before 80 and 81 began.

| Ticket | Draft | Type | Blocked by |
| --- | --- | --- | --- |
| [77 — Capture immutable Stock Timeline Records through browser and Agent writers](issues/77-stock-timeline-capture.md) | B01 | AFK | None |
| [78 — Read authorized Stock Notes in the list and Company Hub](issues/78-stock-note-reading.md) | B02 | AFK | None |
| [79 — Preserve exact Transaction Instants through shared editing policy](issues/79-transaction-instant-editing.md) | B03 | AFK | None |
| [80 — Preserve Diary Alert Instants through shared editing policy](issues/80-alert-instant-editing.md) | B04 | AFK | [79](issues/79-transaction-instant-editing.md) |
| [81 — Preserve Diary Review scheduling through shared Instant editing policy](issues/81-review-instant-editing.md) | B05 | AFK | [79](issues/79-transaction-instant-editing.md) |

## Execution order

Tickets 77, 78 and 79 can start independently. After ticket 79 meets its acceptance criteria, tickets 80 and 81 can proceed independently of each other. Shared files require edit coordination, not additional product dependencies.

The capture and reading slices each integrate both existing callers so their duplicated rules are actually removed. Ticket 79 establishes shared Instant editing policy through a complete Transaction path; tickets 80 and 81 then adopt it in their complete Alert and Review scheduling paths. No infrastructure-only or test-only ticket is required.

## Scope and decisions

- The three source candidates were all rated Worth exploring. Prioritize Stock Timeline Record capture, then Stock Note reading; Instant editing work is split by independently verifiable authoring paths. No urgent rewrite, current privacy leak or measured speedup is claimed.
- Capture retains distinct browser and Agent orchestration, Watchlist behavior, source vocabulary, batch atomicity and replay responses. Only immutable insertion and collision knowledge are shared.
- Stock Note reading retains targeted partner denial and pagination versus Company Hub owner/all-authorized-partner omission and bounded preview, inside their existing read snapshots.
- Instant editing retains device-time input and exact UTC Instants. Alert recurrence stays in account time; Review completion and draft lifecycle keep their current owners.
- All tickets are AFK under the existing Astra/Luna/Sol responsibilities. The approved scope includes no production cutover. Each ticket contains runnable acceptance requirements and delivery constraints.
- Existing features and tickets 64–76 are complete and are not republished. The original PRD and existing issue bodies are unchanged.

## Final acceptance

Parallel Luna implementation and two focused Sol reviews are complete; Astra accepted all five tickets. Validation passed: 697 unit tests, 68 targeted PostgreSQL integration tests and 48 distinct browser cases, plus typecheck, full lint, Web/API build and contract drift checks. See `docs/design/architecture-deepening-acceptance.md` for Module ownership, behavior preservation and test details. Existing in-progress workspace changes were preserved; no production action was performed.
