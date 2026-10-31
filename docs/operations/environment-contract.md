# Runtime environment contract

| Variable | Classification | Contract |
| --- | --- | --- |
| `DATABASE_URL` | Required secret | API connection string. Use a dedicated database per environment. Never point tests at staging or production. |
| `JWT_SECRET` | Required secret | At least 32 random bytes. Generate a different value for every environment. |
| `WEB_ORIGIN` | Environment-specific | Public Web origin used by API origin and cookie checks. Explicitly set it in production and staging. |
| `API_ORIGIN` | Environment-specific | Internal API origin used by Web SSR for public article, article-detail, and sitemap reads. Use `http://diary-v3-api:3101` in K3s and `http://api:3101` in Compose. |
| `ACCOUNT_RECOVERY_SUPPORT_URL` | Optional public Web setting | HTTPS support page or `mailto:` address displayed when password recovery email is unavailable. Set it on the Web workload; it is public and must not contain credentials. |
| `SEC_USER_AGENT` | Optional at startup; required for SEC access | Application name and monitored contact email. Store it in the environment's secret store when SEC requests are enabled. |
| `NODE_ENV` | Environment-specific | `development`, `test`, or `production`. Production images run as `production`; test harnesses use synthetic fixtures. |
| `API_HOST`, `API_PORT` | Optional runtime settings | Default to `127.0.0.1`/`3101` outside production; production binds `0.0.0.0:3101`. |
| `HOST`, `PORT` | Optional Web server settings | React Router server bind address and port. Production uses `0.0.0.0:3000`. |
| `TRUST_X_FORWARDED_FOR` | Optional proxy setting | Set to `true` only behind a proxy that overwrites forwarded client addresses. Production Ingress is trusted. |
| `RATE_LIMIT_BACKEND` | Optional runtime setting | `memory` (default) keeps limits process-local; `auto` uses Redis when available and falls back to bounded memory; `redis` requires Redis at startup and readiness. None of the three authorizes a second API replica — see [ADR-0020](../adr/0020-single-api-replica-boundary.md). |
| `REDIS_URL` | Optional secret | Redis connection URL used only by `auto` or `redis`; required by `redis`. Use `rediss://` when the Redis endpoint requires TLS and never log the URL. |
| `SEC_CACHE_MAX_BYTES` | Optional runtime setting | Positive finite approximate serialized-byte budget for SEC metadata caches in the API process; defaults to 64 MiB. Each cache retains at least one entry, so the shared total can exceed the budget; entry-count caps remain as secondary limits. This is not a heap or RSS ceiling. The API reads this variable at startup; the Guru SEC discovery worker creates its own cache using the default. Capacity evidence: [`sec-metadata-cache-2026-10-25.json`](../audits/sec-metadata-cache-2026-10-25.json). |
| `MARKET_PROVIDER` | Optional provider setting | Defaults to the live provider. Set to `fixture` only in disposable test environments. |
| `MIGRATIONS_FOLDER` | Optional migration setting | Directory containing the Drizzle migration journal and SQL. Production migration jobs use `/app/packages/db/migrations`. |
| `AI_ENCRYPTION_KEYS` | Optional API secret; required by the AI/research/translation workers | JSON object mapping AI key versions to base64-encoded 32-byte keys. Use the same keyring in every workload that reads or writes encrypted AI data. |
| `AI_ENCRYPTION_ACTIVE_KEY` | Optional API secret; required by the AI/research/translation workers | Version in `AI_ENCRYPTION_KEYS` used for new encrypted values. Keep previous versions until retained data and backups no longer need them. |
| `AI_ALLOWED_BASE_URLS` | Optional provider setting | Comma-separated exact HTTPS base URLs for AI Reports and Research Studio recipients. The default is `https://api.deepseek.com`; host, port and base path are matched. Article translation profiles configure their endpoints separately and retain public-address/TLS checks. Apply matching egress restrictions. |
| `TAVILY_API_KEY` | Optional research-provider secret | Enables the Tavily source in Research Studio. Leave unset when that source is not approved; the API keeps the source unavailable rather than accepting an unconfigured key. |
| `SMTP_ENCRYPTION_KEYS` | Optional secret | JSON object mapping SMTP key versions to base64-encoded 32-byte keys. Required before enabling account email. Use the same keyring in API and mail worker; retain old versions for encrypted outbox data and backup recovery. |
| `SMTP_ENCRYPTION_ACTIVE_KEY` | Optional secret | Version name in `SMTP_ENCRYPTION_KEYS` used for new SMTP password and outbox encryption. Required before enabling account email. |
| `SMTP_ALLOWED_HOSTS` | Optional environment-specific setting | Comma-separated exact `host:port` values for explicitly trusted private SMTP relays. Application DNS pinning still applies; network policy/firewall egress must independently allow the relay. |
| `MAIL_WORKER_ID` | Optional worker setting | Stable operational label for the account email worker. |
| `MAIL_WORKER_POLL_MS` | Optional worker setting | Poll interval in milliseconds, from 250 through 60000; defaults to 1000. |
| `AI_WORKER_ID`, `AI_WORKER_INTERVAL_MS` | Optional AI worker settings | Worker label and poll interval. The interval defaults to 1000 ms; `AI_WORKER_ID` defaults to a process-specific value when omitted. |
| `RESEARCH_WORKER_ID`, `RESEARCH_WORKER_POLL_MS` | Optional Research Studio worker settings | Worker label and poll interval. Polling must be an integer from 250 through 60000 ms; the default is 1000 ms. |
| `ARTICLE_TRANSLATION_WORKER_ID`, `ARTICLE_TRANSLATION_WORKER_POLL_MS` | Optional article translation worker settings | Worker label and poll interval. Polling must be an integer from 250 through 60000 ms; the default is 1000 ms. |
| `GURU_ANALYSIS_WORKER_ID`, `GURU_ANALYSIS_POLL_MS` | Optional Guru analysis worker settings | Process-specific worker label by default; poll interval is an integer from 250 through 60000 ms, default 2000 ms. |
| `GURU_SEC_DISCOVERY_WORKER_ID`, `GURU_SEC_DISCOVERY_POLL_MS`, `GURU_SEC_DISCOVERY_INTERVAL_HOURS` | Optional Guru SEC discovery worker settings | Process-specific worker label by default; poll interval is 250–60000 ms (default 5000), discovery interval is 1–168 hours (default 24), both integers. This worker requires `DATABASE_URL` and a `SEC_USER_AGENT` containing a contact email. |
| `RESEARCH_PREPARATION_RETENTION_DAYS` | Optional maintenance setting | Enables the research-preparation retention CLI when set. Without it, the CLI logs that retention is disabled and exits without opening the database. |

`DEPLOY_HOST` and `DEPLOY_SSH_PORT` configure the one-off production secret
provisioning script; its SSH port defaults to `14500` and must be 1–65535.

`POSTGRES_PASSWORD` and `DB_PASSWORD` are database bootstrap/provisioning
inputs, not API variables. The local and production secret scripts use them to
create the PostgreSQL Secret and the derived `DATABASE_URL`; never put either
value in a committed manifest. `SEC_USER_AGENT` is optional for API process
startup but is required by SEC requests and by the production provisioning
script.

The production and staging API/Web workloads share the same image entrypoints,
probes, migration commands, and API/Web routing. Keep database URLs, JWT
secrets, public origins, SEC contact values, TLS secrets, and persistent data
separate between environments. Do not commit or log secret values.

The repository declares Node `^22.23.4 || ^24.22.1 || >=26.12.1` in `package.json`; Forgejo
pins Node `22.23.4` for source checks and staging, while the Dockerfile builds and runs
the production API/Web images on the pinned Node `24.22.1` image and bundles the API
for `node24`. Those floors are the October 2026 Node.js security releases
([v22.23.4](https://nodejs.org/en/blog/release/v22.23.4/),
[v24.22.1](https://nodejs.org/en/blog/release/v24.22.1/),
[v26.12.1](https://nodejs.org/en/blog/release/v26.12.1/)) and must not be lowered.
Use `npm run build` before starting a built entry point. The API image starts
`dist/api/server.js`; the Web image starts React Router's
`apps/web/build/server/index.js` from `/app/apps/web`.

The account email worker uses the API image and the same database and SMTP
encryption keyring as the API. It runs while SMTP is disabled and remains idle;
SMTP being enabled in the Admin Panel is the only application dispatch gate.
See [the account email runbook](../runbooks/account-email.md) before configuring
or enabling SMTP.

The production release keeps the mail worker at one replica. AI, Research
Studio, and article translation workers are manual workloads with no public
port and start at zero replicas in their manifests; enabling one requires a
separate reviewed rollout with the matching encrypted keyring and egress
policy. The normal production workflow does not scale these workers.

## Request resource limits

The API accepts at most 8 MiB of serialized request-body bytes. Oversized bodies
receive HTTP 413 with the canonical `SYS_VALIDATION_ERROR` envelope and request
ID. This is a byte limit, including JSON encoding overhead, rather than a
character limit. Declared oversized bodies are rejected early. Routes consume
streamed bodies through a lazy byte limit, allowing authentication and route
rate limits to reject requests before reading their payload. API-key revocation
retains its authentication-time cutoff.

SEC downloads and packages retain the existing 250 MiB document, 500 MiB total
document and 550 MiB ZIP limits. Resource-heavy responses use private temporary
files and bounded streams, with two active resource slots per API process.
Success, cancellation and failures release response resources; the API container
needs writable temporary storage. The Kubernetes API manifests budget 256 MiB
of ephemeral-storage requests and a 2 GiB limit for staging and runtime overhead.
