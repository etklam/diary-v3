# Single API replica boundary

Status: accepted. Date: 2026-10-25.

The 2026-09-27 audit left this as an open boundary rather than a decision: "the default
in-memory rate limiter and in-process schedulers assume the documented single API process.
This audit does not establish multi-replica capacity."
[Ticket 132](../../.scratch/diary-v3-rebuild/issues/132-rule-on-the-single-replica-assumption.md)
asked for a ruling, because an open boundary stops nobody: a `kubectl scale` to two
replicas would have passed every gate in the repository while silently doubling the
effective rate limit and duplicating reminder work.

## Decision

**Exactly one API process is authoritative.** Multi-replica is not a supported
configuration, and `RATE_LIMIT_BACKEND=redis` does not make it one. Redis shares the abuse
counters; it does not share the reminder schedulers or the Socket.IO connection registry,
which are the other two reasons the boundary exists.

The ruling is enforced where it can be broken: `scripts/validate-production-manifests.ts`
rejects any `diary-v3-api` Deployment that does not declare `replicas: 1`, and
`npm run manifests:check` runs that validator in the deploy workflow. Relaxing the guard
requires separately accepted scaling work, not a configuration change.

## What each in-process component does with more than one replica

Stated per component, because "assumes a single process" is three different failure modes:

| Component | With N replicas |
| --- | --- |
| Rate limiter, memory backend (`apps/api/src/rate-limit/`) | Counters are per process, so the effective limit is N× the policy. The production manifest selects `auto`, which falls back to per-process memory whenever Redis is unhealthy — so even the configured backend cannot guarantee shared enforcement. |
| Socket.IO registry (`apps/api/src/socket-server.ts`) | Connection state lives in the process holding the socket. `onAccountRevoked` calls `sockets.revokeUser` on one replica only, so a revoked account keeps an open socket on every other replica until it reconnects. This is the security-relevant one. |
| Reminder push (`apps/api/src/alert-pusher.ts`) | No database write and no dedupe by design — it emits a foreground hint. Every replica runs the tick, so the lookahead query is read-amplified N×, and a reader with tabs balanced across replicas receives the same hint more than once. |
| Price reminder check (`apps/api/src/price-alert-checker.ts`) | Correct but wasteful. `select … for update` plus the `isTriggered` re-check inside the transaction means a second replica cannot double-trigger or double-write. It will still fetch every quote again, multiplying consumption of a rate-limited upstream by N. |
| Market data cache and queue (`apps/api/src/market-data/`) | Cache, request dedupe and the three-way concurrency limit are per process, so upstream load is N× and the TTL no longer bounds fetch rate as intended. |
| SEC shared scheduler (`apps/api/src/sec-edgar/postgres-scheduler.ts`) | **Safe.** Coordinates through a Postgres lease. |
| Tavily search budget (`apps/api/src/research-studio/search-budget.ts`) | **Safe.** Accounted in Postgres. |
| Queue workers (AI reports, guru analysis, article translation, account email, institutional discovery) | **Safe, and already scaled independently.** Each claims work with `pg_advisory_xact_lock` plus `for update skip locked` and a lease token. They are separate Deployments and this ruling does not constrain them. |

## What would have to change first

Not a flag flip. In order of necessity:

1. **Require Redis for rate limiting** — `RATE_LIMIT_BACKEND=redis`, not `auto`, so a
   degraded Redis fails closed rather than silently reverting to per-process counters.
2. **Move the two reminder schedulers to a shared lease**, following the SEC scheduler's
   Postgres pattern, so one replica owns a tick.
3. **Decide Socket.IO topology** — a Redis adapter, or ingress session affinity — and make
   account revocation reach every replica holding a socket for that account.
4. **Give the market data layer a shared cache**, or accept N× upstream consumption
   explicitly and re-derive the TTL policy from it.
5. **Establish capacity evidence** for the chosen topology, since none exists today.

Each is independently acceptable work. Until all of them are accepted, the guard stays.

## Acceptance

Verified locally on 2026-10-25:

- `npm run manifests:check` validates 12 release manifests and passes.
- Rewriting `ops/k8s/production/02-api.yaml` to `replicas: 2` makes it fail with
  `diary-v3-api must declare replicas: 1, not 2`; the file was restored and the check passes
  again. Covered permanently by `tests/unit/single-replica-guard.test.ts` (5 tests),
  including an absent replica count and the workers staying unconstrained.
- The per-component table above was read off the source, not inferred: the mail worker was
  initially assumed single-process and corrected after reading its claim query.

No production rollout or cluster change is included in this ruling. The live cluster's
Redis state is unverified from this repository and is not evidence either way.

## Addendum — market queue correction (2026-10-30)

The table's "three-way concurrency limit" is an error: the current market queue permits
two active jobs per API runtime, as recorded in the current queue bounds addendum in [ADR 0007](0007-market-provider-and-freshness.md) and `apps/api/src/market-data/queue.ts`.
The per-process cache and deduplication and the single-replica decision remain unchanged.
