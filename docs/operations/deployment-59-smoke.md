# Ticket 59 deployment smoke evidence

This record covers the bounded local deployment exercise for ticket 59. It uses
the isolated Compose project `diary-v3-production`, its separate
`diary-v3-production-postgres` volume, a synthetic account, and the deterministic
market fixture. The existing `diary-v3-dev-postgres-1` container and volume were
not used.

## Image and startup proof

The stack was started with:

```sh
docker compose -f compose.production.yaml -p diary-v3-production up -d --no-build
```

The migration and seed one-shot services exited successfully, and API, Web and
Postgres reported healthy. The observed structured logs included:

- `{"operation":"database_migrate","status":"ok"}`
- `{"operation":"seed_system",...,"addedEtfs":24,"addedUniverse":213}`
- `{"operation":"api_started","hostname":"0.0.0.0","port":3101,"scheduler":true}`

The final local image revisions were API
`sha256:c3d1fc50b725d086ee5e2210b3dafa1f49c2a0f7ddf93ceee0d45bc2b4940d5f`
and Web
`sha256:378c7e1f88bb6a40ef241e84714f6c8e16533d43b9775cdfc813ebf70bddd5d6`.
The final update applied the current migration ledger (21 entries, including
`0020_posts`) before starting the API.

Gateway checks returned `200` for `/healthz` (`{"status":"ok"}`), `/readyz`
(`{"status":"ready"}`), and the SSR `/` route. The health response included
an `x-request-id` header. The gateway routes `/api/` and `/socket.io/` through
Nginx; the Kubernetes Ingress manifests carry the same route split and TLS
boundary.

## Login, diary write/read, and batch proof

Through `http://127.0.0.1:8080` a disposable synthetic account registered,
logged in, obtained the CSRF cookie, created diary row `1`, and read it back
from `GET /api/diaries`. No credential or token is stored in this record.

The deployed API image ran the deterministic fixture batch directly:

```sh
docker compose -f compose.production.yaml -p diary-v3-production exec -T \
  -e MARKET_PROVIDER=fixture api node dist/api/rotation.js --scope=core
```

The initial result was job `03f1f577-74db-4302-a9f5-f573df236486`, scope
`core`, `23/23` symbols upserted and zero errors. The persisted result was then
read through `GET /api/market/rotation-monitor?scope=core`. The initial
`market-state.js --seed` command also completed for `213/213` symbols with job
`7eb9fbd9-4d1c-4d3f-af54-225c8025af07`.

After the first image rebuild and migration update, the same two named CLI
entrypoints were rerun: `rotation.js --scope=core` completed job
`d424c9d5-0ed7-4324-ac54-1a6e6bbf92fe` with `23/23` upserts and zero errors;
`market-state.js --seed` completed job
`460177af-3324-48d3-ab62-4805244dd5de` with `213/213` successes. The monitor
response remained readable through the gateway.

## Update proof

The API and Web services were recreated with the same isolated database and
secret values:

```sh
docker compose -f compose.production.yaml -p diary-v3-production up -d \
  --no-build --force-recreate api web
```

After the recreate, the existing synthetic account logged in again, created
diary row `2` for the next date, and read both persisted rows. This verifies the
update path does not generate a new database password or JWT secret. The K3s
`deploy-local.sh` follows the same rule: first creation requires explicit
`DB_PASSWORD` and `JWT_SECRET`; an existing complete secret pair is retained,
and partial secrets fail closed.

The final image update then repeated the same login/write/read flow, creating
diary row `3` and reading all three rows after the `0020_posts` migration. The
Compose project remained healthy throughout.

The source-aligned API image was then recreated once more after the last
typecheck-clean posts change. The same flow created diary row `4`, read all four
rows, and the current image rerun completed rotation job
`d3f0b77f-094d-47d9-9871-76471e03849b` (`23/23`, zero errors) plus market-state
seed job `d017e4a6-18a2-4550-8347-2deab68002c3` (`213/213`).

## Boundary of this proof

The local HTTP exercise uses `NODE_ENV=development` only because the disposable
gateway is plain HTTP and cannot satisfy a production Secure-cookie origin. The
Kubernetes API/Web manifests remain production mode behind the TLS Ingress. The
Compose section is a local HTTP supporting exercise; the K3s section below
records the actual production-mode TLS/Ingress proof.

## K3s production proof

The production path ran in a dedicated `rancher/k3s:v1.31.5-k3s1` container
named `diary-v3-k3s`, with no pre-existing kubectl context and host ports
`16443` (API), `8088` (HTTP), and `8443` (HTTPS). The node became `Ready`, the
API/Web images were imported with `ops/k3s/load-images.sh`, and the namespace
used its own PVC `diary-v3-postgres-data`. The temporary kubeconfig was
`/tmp/diary-v3-local.yaml`; it was not merged into the normal kubeconfig.

`ops/k3s/deploy-local.sh` created only synthetic DB/JWT Secrets, and
`ops/k3s/create-tls-secret.sh` created a two-day disposable certificate for
`diary.local`. The production API init migration and Web/API deployments reached
ready, the seed Job completed, and the CronJob was applied with its `Forbid`
overlap policy. The observed seed log was
`{"operation":"seed_system",...,"addedEtfs":24,"addedUniverse":213}` and the
API startup log reported `{"operation":"api_started",...,"scheduler":true}`.
Rerunning `deploy-local.sh` with no credential environment variables printed
`Existing deployment secrets retained; no password or JWT rotation performed.`
The live CronJob reported schedule `30 21 * * 0-5`, `concurrencyPolicy=Forbid`,
and 1800-second starting/active deadlines; the live API Deployment reported
`strategy=Recreate`, `replicas=1`, and a 45-second termination grace period.

Using `curl --resolve diary.local:8443:127.0.0.1 -k` against the TLS Ingress,
`/healthz`, `/readyz`, and `/` returned 200. The API-only system Ingress has an
explicit higher priority than the Web catch-all so readiness cannot fall back to
SSR. The synthetic account received `Secure=TRUE` access, refresh, and CSRF
cookies; it logged in, created a Diary, and read it through the production
Ingress.

A bounded K3s Job ran `node dist/api/rotation.js --scope=core` with
`MARKET_PROVIDER=fixture`. Job `97dd99c7-1407-41f4-82ba-a17beeb4f9b3` persisted
`23/23` symbols with zero errors, and the result was read through the deployed
`/api/market/rotation-monitor?scope=core` endpoint.

The foreground path was exercised against the same TLS Ingress: a real
WebSocket client connected and received `alert:triggered`; after transport loss,
a second synthetic alert was recovered from REST, then a polling Socket.IO
client reconnected and read that alert. No alert or account content is stored in
this record. The bounded client assertions were
`socket_transport=websocket connected=true user=1`,
`socket_event=alert:triggered`,
`rest_after_transport_loss=second_alert_present=true`,
`socket_transport=polling connected=true user=1`, and
`rest_after_polling_reconnect=second_alert_present=true`.

For the update proof, API pod `diary-v3-api-949497ddc-h8qn6` was replaced by
`diary-v3-api-5b5df45564-cpsdm`. The Deployment reported
`strategy=Recreate replicas=1 available=1`; after replacement the same
synthetic account logged in with Secure cookies and created/read a second Diary.
