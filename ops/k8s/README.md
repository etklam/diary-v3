# Isolated K3s deployment

The manifests assume the local K3s default Traefik ingress and images loaded as
`diary-v3/api:local` and `diary-v3/web:local`. `02-api.yaml` is intentionally a
single `Recreate` deployment: the API owns the one process-local Socket.IO and
foreground scheduler instance. Market work runs in `05-market-cron.yaml` as a
bounded, non-overlapping CronJob and calls the same rotation/state batch modules
as the admin/manual paths.

Create the `diary-v3-db` and `diary-v3-app` Secrets with
`ops/k3s/deploy-local.sh`; no credential is committed here. On a local
disposable cluster, `ops/k3s/create-tls-secret.sh` creates a short-lived
`diary.local` certificate without committing a key. Existing complete Secrets
are retained by `deploy-local.sh`; it does not silently rotate credentials on an
update. The deployment path is:

```sh
kubectl apply -f ops/k8s/00-namespace.yaml
./ops/k3s/deploy-local.sh
docker build --target api -t diary-v3/api:local .
docker build --target web -t diary-v3/web:local .
./ops/k3s/load-images.sh
kubectl apply -f ops/k8s/01-postgres.yaml
./ops/k3s/create-tls-secret.sh
kubectl apply -f ops/k8s/02-api.yaml -f ops/k8s/03-web.yaml -f ops/k8s/04-ingress.yaml
kubectl apply -f ops/k8s/06-seed-job.yaml -f ops/k8s/05-market-cron.yaml
```

The first migration runs in the API init container. The static system seed is
an explicit Job and is idempotent. For an isolated provider exercise, set
`MARKET_PROVIDER=fixture` only on a one-off market Job; the normal CronJob does
not set it and therefore uses the configured Yahoo provider. The fixture is
deterministic and is never selected implicitly.
