# Isolated K3s deployment

The local manifests target a disposable K3s cluster with the default Traefik
Ingress and the images `diary-v3/api:local` and `diary-v3/web:local`. The API is
deliberately a single `Recreate` replica because it owns the process-local
Socket.IO listener and foreground scheduler. Market work runs separately in
`05-market-cron.yaml` with `concurrencyPolicy: Forbid`.

## Create the cluster and secrets

`ops/k3s/create-local-cluster.sh` creates a `rancher/k3s:v1.31.5-k3s1`
container, writes a restricted kubeconfig (by default
`$HOME/.kube/diary-v3-local.yaml`), and selects context `diary-v3-local`.
Point `KUBECONFIG` at that file before using the other scripts:

```sh
./ops/k3s/create-local-cluster.sh
export KUBECONFIG="$HOME/.kube/diary-v3-local.yaml"
kubectl config use-context diary-v3-local
```

`ops/k3s/deploy-local.sh` applies the namespace and creates the
`diary-v3-db`/`diary-v3-app` Secrets on first use. Set `DB_PASSWORD` and
`JWT_SECRET` only for that first invocation; `WEB_ORIGIN` defaults to
`https://diary.local`. The script refuses a partial Secret pair and retains a
complete pair on later runs, so it does not silently rotate credentials.

## Build, load, and apply

Run from the repository root. Wait for PostgreSQL before applying the API so its
init container can run the migration:

```sh
DB_PASSWORD='disposable-local-password' \
JWT_SECRET='disposable-local-jwt-secret-at-least-32-bytes' \
./ops/k3s/deploy-local.sh

docker build --target api -t diary-v3/api:local .
docker build --target web -t diary-v3/web:local .
./ops/k3s/load-images.sh

kubectl apply -f ops/k8s/01-postgres.yaml
kubectl -n diary-v3 rollout status deployment/diary-v3-postgres --timeout=180s
./ops/k3s/create-tls-secret.sh
kubectl apply -f ops/k8s/02-api.yaml -f ops/k8s/03-web.yaml -f ops/k8s/04-ingress.yaml
kubectl -n diary-v3 rollout status deployment/diary-v3-api --timeout=180s
kubectl -n diary-v3 rollout status deployment/diary-v3-web --timeout=180s

kubectl -n diary-v3 delete job diary-v3-system-seed --ignore-not-found
kubectl apply -f ops/k8s/06-seed-job.yaml
kubectl -n diary-v3 wait --for=condition=complete job/diary-v3-system-seed --timeout=300s
kubectl apply -f ops/k8s/05-market-cron.yaml
```

The API init container runs `node dist/api/migrate.js` with
`MIGRATIONS_FOLDER=/app/packages/db/migrations`. The seed Job runs
`node dist/api/seed-system.js` and is idempotent; delete and recreate the Job
when repeating it. API readiness is `/readyz`, liveness is `/healthz`, and the
Web probes `/`. The local API requests 256Mi memory and 256Mi ephemeral storage,
with limits of 768Mi memory and 2Gi ephemeral storage; the Web requests 128Mi
memory and limits memory at 512Mi.

The TLS helper creates a disposable `diary-v3-tls` Secret for `diary.local`
(default seven-day validity). It never writes the key to the repository. The
Ingress sends `/api`, `/socket.io`, `/healthz`, and `/readyz` to the API and the
remaining paths to Web. A typical local probe is
`curl --resolve diary.local:8443:127.0.0.1 -k https://diary.local:8443/readyz`
when the K3s HTTPS port is the script default.

For an isolated provider exercise, set `MARKET_PROVIDER=fixture` only on a
one-off market Job. The checked-in CronJob leaves it unset and therefore uses the
configured Yahoo provider. The fixture is deterministic and is never selected
implicitly.

The production-shaped worker manifests under
[`ops/k8s/production`](production/README.md) are not applied by this local
sequence. The local bundle has no mail, AI, Research Studio, or article
translation worker deployment. Use each feature runbook for local worker
processes, or configure the separate production/staging worker deployment.
