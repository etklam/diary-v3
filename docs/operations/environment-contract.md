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
| `MARKET_PROVIDER` | Optional provider setting | Defaults to the live provider. Set to `fixture` only in disposable test environments. |
| `MIGRATIONS_FOLDER` | Optional migration setting | Directory containing the Drizzle migration journal and SQL. Production migration jobs use `/app/packages/db/migrations`. |

The production and staging API/Web workloads share the same image entrypoints,
probes, migration commands, and API/Web routing. Keep database URLs, JWT
secrets, public origins, SEC contact values, TLS secrets, and persistent data
separate between environments. Do not commit or log secret values.
