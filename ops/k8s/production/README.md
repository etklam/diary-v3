# Production K3s manifests (g2, v3.trade-basic.com)

The CI pipeline (.forgejo/workflows/deploy.yml) renders the `placeholder` image
tags in these files to digest-pinned `git.913555.xyz/etklam/diary-v3-api` /
`diary-v3-web` images before applying them. Never apply these files unrendered.

Release path:

1. Forgejo must pass lint, typecheck, unit, contract, PostgreSQL integration,
   manifest, production build, and built-artifact browser acceptance gates.
2. Images are pushed and resolved to immutable digests. CI validates the final
   rendered manifests before any remote mutation.
3. `00-namespace.yaml` (parent dir) and `01-postgres.yaml` are reconciled.
4. `ops/k3s/deploy-production-secrets.sh` creates the `diary-v3-db` and
   `diary-v3-app` Secrets (never committed). Existing Secrets are retained.
5. CI runs the standalone migrate Job, then the idempotent system seed Job.
   Migrations must remain backward-compatible with the running application;
   destructive migrations require an explicit release safety review.
6. CI records the current API, Web, and market CronJob images, applies each new
   digest, waits for API/Web rollout, then checks `/healthz`, `/readyz`, and the
   public home page.

Pre-deploy verification, build, push, migration, or seed failures do not roll
back application workloads. Once an application workload has been changed, a
later failure restores only changed workloads to their recorded images and
replica counts, waits for rollout, and repeats the smoke checks. Rollback errors
remain visible as a failed workflow.

Application rollback never reverses database migrations. If migration safety is
uncertain, stop the release, inspect the migration ledger and schema, and choose
a compatible application image manually. Database restoration is a separate,
explicit operation documented in `docs/operations/restore-60-smoke.md`.

Layout notes:

- The API deployment is a single `Recreate` replica: it owns the one
  process-local Socket.IO and foreground scheduler instance.
- The Ingress routes `/api` and `/socket.io` to the API service and everything
  else to the React Router SSR service; `/healthz` and `/readyz` are exposed on
  the same host via the higher-priority `diary-v3-system` Ingress.
- TLS uses cert-manager `letsencrypt-cloudflare` (DNS-01) like every other
  stack on this host; ExternalDNS creates the Cloudflare record.

The Web deployment's `API_ORIGIN` points to the in-cluster API Service so SSR
article and sitemap reads do not depend on external DNS or ingress hairpinning.
See [the environment contract](../../../docs/operations/environment-contract.md)
for required, optional, secret, and environment-specific values.
