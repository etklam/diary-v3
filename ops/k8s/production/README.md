# Production K3s manifests (g2, v3.trade-basic.com)

The CI pipeline (.forgejo/workflows/deploy.yml) renders the `placeholder` image
tags in these files to digest-pinned `git.913555.xyz/etklam/diary-v3-api` /
`diary-v3-web` images before applying them. Never apply these files unrendered.

Applied path:

1. `00-namespace.yaml` (parent dir) and `01-postgres.yaml` are applied once.
2. `ops/k3s/deploy-production-secrets.sh` creates the `diary-v3-db` and
   `diary-v3-app` Secrets (never committed). Existing Secrets are retained.
3. CI runs the migrate Job (via the API image init container in 02-api.yaml and
   the standalone `07-migrate-job.yaml`), the seed Job, then scales the API and
   Web deployments up with the new digest and waits for rollout.

Layout notes:

- The API deployment is a single `Recreate` replica: it owns the one
  process-local Socket.IO and foreground scheduler instance.
- The Ingress routes `/api` and `/socket.io` to the API service and everything
  else to the React Router SSR service; `/healthz` and `/readyz` are exposed on
  the same host via the higher-priority `diary-v3-system` Ingress.
- TLS uses cert-manager `letsencrypt-cloudflare` (DNS-01) like every other
  stack on this host; ExternalDNS creates the Cloudflare record.
