# API rate limiting

## Scope

The API limiter protects application work from repeated requests. It is not volumetric or network-layer DDoS protection. Keep edge filtering and ingress limits in place:

```text
Internet
  -> Cloudflare or external edge protection
  -> Ingress and reverse-proxy limits
  -> API application rate limits
  -> Endpoint-specific business budgets
```

Only the API's abuse counters use Redis. Sessions, application cache, queues, pub/sub, Socket.IO and distributed locks remain unchanged. Account registration verification, password reset and SMTP test throttles continue to use their existing PostgreSQL transactions.

## Runtime configuration

| Setting | Default | Behavior |
| --- | --- | --- |
| `RATE_LIMIT_BACKEND` | `memory` | Selects `memory`, `redis` or `auto`. |
| `REDIS_URL` | unset | Redis URL for `redis` or `auto`; ignored in `memory` mode. |

`memory` is process-local and works without Redis. Use it for development, tests and a single API replica. `redis` requires a valid `redis://` or `rediss://` URL and a healthy Redis connection at startup. If Redis later becomes unavailable, readiness fails and requests fail closed with a generic service-unavailable response. `auto` uses Redis when healthy and otherwise applies the same bounded local memory limiter while the API remains ready. `auto` probes for recovery no more often than once every 15 seconds while serving requests.

Redis recovery cannot merge the local fallback history with counters already stored in Redis. A transition may therefore grant a process a fresh local or distributed window. This is an availability tradeoff; endpoint-specific PostgreSQL budgets remain in force where they already exist.

All application policies use a 60-second sliding window. Existing policies are retained; new ceilings are deliberately roomy for normal use while limiting repeated expensive work:

| Operation | Scope | Limit |
| --- | --- | ---: |
| Registration | IP and normalized account identifier | 3/minute each |
| Web and Native login | IP and normalized account identifier | 5/minute each |
| Web and Native refresh | IP and refresh-token fingerprint | 10/minute each |
| Password change | IP and user | 3/minute each |
| Market routes and stock prices | IP | 60/minute |
| SEC metadata, document, package and batch routes | IP | 60, 30, 10 and 5/minute respectively |
| API key creation | User | 60/minute |
| Valid API-key requests | Credential record ID | 120/minute |
| AI report generation and regeneration | User | 6/minute combined |
| Research preparation and generation | Admin user | 6/minute combined |
| Article translation queue and retranslation | Admin user | 30/minute combined |
| Public article search | Trusted client IP | 60/minute |

AI, research and translation routes enqueue controlled work; workers do not run through HTTP limiter middleware. Existing database quotas, job idempotency and admission checks remain the authoritative business budgets.

## Local development and tests

The default `docker compose up` still starts PostgreSQL only. Start an isolated Redis instance when needed:

```bash
docker compose --profile redis up -d redis
```

The development Redis port is bound to loopback at `127.0.0.1:56379` and has no persistence or authentication. It must not be reused for production data.

Exercise each mode from the host:

```bash
# Default; Redis is not contacted.
RATE_LIMIT_BACKEND=memory npm run dev:api

# Required Redis; startup fails when the service is unavailable.
RATE_LIMIT_BACKEND=redis REDIS_URL=redis://127.0.0.1:56379 npm run dev:api

# Optional Redis; stop the container to observe memory fallback and recovery logs.
RATE_LIMIT_BACKEND=auto REDIS_URL=redis://127.0.0.1:56379 npm run dev:api

# Isolated real-Redis concurrency and TTL tests; uses only this disposable URL.
RATE_LIMIT_TEST_REDIS_URL=redis://127.0.0.1:56379 npm run test:redis
```

The ordinary unit, integration and build commands do not require Redis. The Redis integration file is skipped unless `RATE_LIMIT_TEST_REDIS_URL` is explicitly set.

## Redis behavior and privacy

Each request performs one Lua script round trip per checked scope. The script uses Redis server time, removes expired sorted-set entries, checks the count and adds a unique member atomically. It sets a key expiry on permitted requests and does not extend expiry when rejecting requests. Redis keys use the `diary-v3:ratelimit:v1:` namespace and a SHA-256 digest of the logical policy/scope/identity key. Raw emails, IP addresses, tokens, API keys, request bodies and diary content are not written to Redis or rate-limit logs.

The API uses 300 ms connection and command bounds and disables automatic reconnect retries. In `auto`, a failure closes the failed client before local fallback and a single cooldown-gated connection probe handles recovery. Redis memory exhaustion under the optional manifest's `noeviction` policy also follows this fail-safe path instead of evicting active counters.

The API only trusts `X-Forwarded-For` when `TRUST_X_FORWARDED_FOR=true`; it uses and validates the final hop, falling back to the socket address for an invalid value. Configure the trusted ingress/proxy to set the client address at that final hop. Do not enable proxy trust when the API can be reached directly.

Rate-limit rejection responses remain HTTP 429 with `AUTH_RATE_LIMITED` and a calculated `Retry-After`. Redis state and mode are never included in client errors. Rejection logs are sampled by policy and scope type; transition logs omit URLs, credentials and identities.

## Optional Kubernetes deployment

`ops/k8s/optional/redis.yaml` provides one authenticated, non-persistent Redis instance with a ClusterIP Service, resource bounds, probes and an ingress NetworkPolicy allowing only API pods. It is intentionally excluded from the normal production release bundle.

An operator who wants distributed limits must create the `diary-v3-redis` Secret with `REDIS_PASSWORD`, apply that optional manifest, and separately opt the API into `auto` or `redis`. Put an authenticated `REDIS_URL` in the existing `diary-v3-app` Secret; URL-encode special characters in the password. Add `RATE_LIMIT_BACKEND=auto` (or `redis`) and a Secret reference for `REDIS_URL` to the API Deployment, then deploy through the reviewed operational process. Do not add Redis settings to the production Secret or Deployment merely by applying the normal release manifests. `auto` is recommended when API replicas may be increased; `redis` is appropriate only when readiness should require Redis.

The included Redis Pod has no public Service and no persistent volume. Rate-limit state resets after a Redis restart, which is equivalent to an empty limiter window. The API remains single-replica by default; enabling this optional service does not itself authorize scaling or a production cutover.
