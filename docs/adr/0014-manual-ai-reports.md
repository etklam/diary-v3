# Manual AI reports: deterministic context and fenced publication

Date: 2026-09-21
Status: Accepted for implementation under the user-approved AI reports V1 plan.

## Decision

Keep AI reports in the existing modular monolith. PostgreSQL stores report jobs; a worker in the same build handles only previously submitted jobs. No scheduler creates periodic reports. Keep shared runtime contracts and the standard-fetch client as the public interface.

The server owns dates, permissions, source selection, ledger arithmetic, quotas and references. The provider produces bounded analysis JSON only. Each job permits one generation request; uncertain dispatch is terminal rather than automatically retried.

Submission and source mutations share owner-level serialization. Acquire the owner lock before context queries under READ COMMITTED: waiting on a lock inside a REPEATABLE READ transaction can establish an obsolete snapshot before the lock is acquired. Do not hold a database transaction across a provider call. Final publication rechecks authorization, consent, versions, deletion and the current lease fence.

Source edits mark historical context as potentially changed. Source deletion purges derived private analysis and snapshots in the same database transaction. Pre-period ledger transactions are dependencies even when only their aggregate reaches the model. Owner deletion cascades all private AI data; aggregate cost accounting does not allow deletion to refund consumed quota.

An admitted provider attempt owns a durable call slot independently of report status. Cancellation fences publication and settles unknown usage, but does not itself prove that an outbound call has ended. Report and administrator admission share the same global capacity check; transport completion or the attempt's captured deadline releases the slot. Account deletion removes ownership links while retaining anonymous cost and active-slot metadata until reconciliation. Settlement uses a winning attempt-state transition and the original UTC billing month.

## Consequences

No Redis, generic workflow engine, vector store or provider SDK is required. Application idempotency does not claim provider-side exactly-once billing. Schema/reference validation cannot prove semantic correctness; synthetic human quality evaluation and deployment-specific consent review remain beta gates.
