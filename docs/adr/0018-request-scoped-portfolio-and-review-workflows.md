# ADR-0018: Request-scoped portfolio reads and continuous review

Status: Accepted for local implementation, 2026-09-28.

## Context

The holdings page previously composed five independently fetching sections. Each endpoint independently replayed the owner ledger. Review pages required a return to the queue and full-document editing to change a schedule.

## Decision

Keep two independent portfolio reads. `/api/portfolio/ledger` reads and replays the owner ledger once, sharing holdings with exposure and recent-realized projections. `/api/portfolio/overview` retains its existing request-scoped snapshot for valuation and attention. No persistent projection or cross-request ledger cache is introduced. Market provider concurrency, freshness and single-flight remain owned by the existing market service. Missing quotes never erase the ledger.

Both responses carry an `X-Portfolio-Ledger-Revision` SHA-256 fingerprint of the ordered ledger input. A transaction changed between the two requests cannot silently mix new holdings with old valuation or attention. The Web suppresses all overview-derived values on a fingerprint mismatch and offers an explicit refresh. Headers preserve existing strict response contracts.

Browser account reads share an in-flight request and a confirmed response for at most thirty seconds, keyed by session revision. Each consumer receives its own Response clone. A consumer cancellation cannot cancel other consumers. Explicit invalidation aborts pending work; old successful responses cannot refill the cache. SSR bypasses this browser-only resource. Locale-only settings saves preserve the account snapshot; timezone writes invalidate it. This cache never replaces API authorization.

Timezone invalidation is broadcast to other tabs. An already open scheduling form continues to show its explicit timezone context; subsequent account reads use the updated setting. Effective Request bodies include any fetch init override without consuming the original body.

Continuous review uses an account-scoped, one-day sessionStorage record. URLs carry only an opaque session identifier. Progress distinguishes completed, skipped and the initial server-count snapshot. Skip performs no server write. After a confirmed save, the queue is read again starting at page one because completion compacts offset pages. Failures keep the current page and offer navigation retry without repeating the confirmed write.

New diary review-workflow endpoints expose a revision envelope without changing the existing strict review response. Review/schedule writes check the owner and expected revision under a row lock. The schedule endpoint only changes scheduling/status and revision fields. Scheduling a completed diary for a new date sets it pending while preserving the prior reflection. Thesis schedule and review writes use the existing per-owner/symbol lock plus an expected updatedAt token; updatedAt advances monotonically even under a fixed test clock. Review timestamps still represent the actual supplied clock.

Web thesis full saves also send an expected timestamp (null for a new thesis). The optional timestamp on existing write contracts preserves older consumers; the new narrow schedule endpoint requires it. An internal additive `review_pending` marker distinguishes explicit rescheduling from an already completed review, including a newly selected past due instant. Completion clears the marker without erasing review history. Queue and attention/health use the same rule. Equal instants with different ISO formatting do not reopen a schedule during full replacement.

Completed diary totals no longer stop at fifty candidates: normal bucket pagination applies to the full owner result. Continuous sessions exclude the completed bucket from their initial work snapshot and exhaust overdue pages before advancing to later buckets.

Local review scheduling uses account timezone calendar days and rejects nonexistent wall times. Repeated DST times require an explicit occurrence. Existing exact instants retain their seconds when unchanged.

## Consequences

The holdings page performs two ledger reads/replays instead of five per logical load, while the provider-backed segment remains independent. Existing endpoints and strict consumers remain compatible. Review sessions are local to a tab, not a server workflow; unavailable browser storage prevents starting a session with an explicit error. No production cutover is authorized by this decision.

## Evidence

See the integrated-improvement acceptance report and `tests/integration/integrated-portfolio.test.ts`, `diary-review.test.ts`, `investment-thesis.test.ts`, and the account-resource/review-workflow unit tests. Local synthetic timing is not production capacity evidence.
