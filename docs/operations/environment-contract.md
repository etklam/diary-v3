# Runtime environment contract

| Variable | Classification | Contract |
| --- | --- | --- |
| `DATABASE_URL` | Required secret | API connection string. Use a dedicated database per environment. Never point tests at staging or production. |
| `JWT_SECRET` | Required secret | At least 32 random bytes. Generate a different value for every environment. |
| `WEB_ORIGIN` | Environment-specific | Public Web origin used by API origin and cookie checks. Explicitly set it in production and staging. |
| `API_ORIGIN` | Environment-specific | Internal API origin used by Web SSR for public article, article-detail, and sitemap reads. Use `http://diary-v3-api:3101` in K3s and `http://api:3101` in Compose. |
| `SEC_USER_AGENT` | Optional at startup; required for SEC access | Application name and monitored contact email. Store it in the environment's secret store when SEC requests are enabled. |
| `NODE_ENV` | Environment-specific | `development`, `test`, or `production`. Production images run as `production`; test harnesses use synthetic fixtures. |
| `API_HOST`, `API_PORT` | Optional runtime settings | Default to `127.0.0.1`/`3101` outside production; production binds `0.0.0.0:3101`. |
| `HOST`, `PORT` | Optional Web server settings | React Router server bind address and port. Production uses `0.0.0.0:3000`. |
| `TRUST_X_FORWARDED_FOR` | Optional proxy setting | Set to `true` only behind a proxy that overwrites forwarded client addresses. Production Ingress is trusted. |
| `RATE_LIMIT_BACKEND` | Optional runtime setting | `memory` (default) keeps limits process-local; `auto` uses Redis when available and falls back to bounded memory; `redis` requires Redis at startup and readiness. |
| `REDIS_URL` | Optional secret | Redis connection URL used only by `auto` or `redis`; required by `redis`. Use `rediss://` when the Redis endpoint requires TLS and never log the URL. |
| `MARKET_PROVIDER` | Optional provider setting | Defaults to the live provider. Set to `fixture` only in disposable test environments. |
| `MIGRATIONS_FOLDER` | Optional migration setting | Directory containing the Drizzle migration journal and SQL. Production migration jobs use `/app/packages/db/migrations`. |
| `SMTP_ENCRYPTION_KEYS` | Optional secret | JSON object mapping SMTP key versions to base64-encoded 32-byte keys. Required before enabling account email. Use the same keyring in API and mail worker; retain old versions for encrypted outbox data and backup recovery. |
| `SMTP_ENCRYPTION_ACTIVE_KEY` | Optional secret | Version name in `SMTP_ENCRYPTION_KEYS` used for new SMTP password and outbox encryption. Required before enabling account email. |
| `SMTP_ALLOWED_HOSTS` | Optional environment-specific setting | Comma-separated exact `host:port` values for explicitly trusted private SMTP relays. Application DNS pinning still applies; network policy/firewall egress must independently allow the relay. |
| `MAIL_WORKER_ID` | Optional worker setting | Stable operational label for the account email worker. |
| `MAIL_WORKER_POLL_MS` | Optional worker setting | Poll interval in milliseconds, from 250 through 60000; defaults to 1000. |

The production and staging API/Web workloads share the same image entrypoints,
probes, migration commands, and API/Web routing. Keep database URLs, JWT
secrets, public origins, SEC contact values, TLS secrets, and persistent data
separate between environments. Do not commit or log secret values.

The account email worker uses the API image and the same database and SMTP
encryption keyring as the API. It runs while SMTP is disabled and remains idle;
SMTP being enabled in the Admin Panel is the only application dispatch gate.
See [the account email runbook](../runbooks/account-email.md) before configuring
or enabling SMTP.
