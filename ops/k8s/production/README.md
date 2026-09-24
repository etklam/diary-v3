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

## Article-access release boundary

The article-access migration is additive, but the previous API binary does not
understand `MEMBER` authorization. Schema compatibility alone does not make an
application rollback safe. Before this first access-aware release, back up the
database and freeze all article mutations for the migration and API/Web rollout
window. Use the existing operational maintenance/edge controls; this repository
has no article maintenance switch. If that freeze cannot be enforced, keep
article routes unavailable for the window. Reading existing Public articles
does not otherwise need to stop.

After migration, verify that this query returns zero while the freeze holds:

```sql
SELECT count(*) FROM posts
WHERE access = 'MEMBER' AND status = 'PUBLISHED' AND published_at IS NOT NULL;
```

Migration `0025_even_nightcrawler.sql` reports classification counts through a
PostgreSQL notice. During the same frozen window, save this metadata-only review
list in the operator's controlled release record; do not dump article bodies:

```sql
SELECT id, slug, status, published_at
FROM posts WHERE access = 'MEMBER' ORDER BY id;
```

These pre-existing Draft/Archived or otherwise unproven rows stay Member; review
them in the Admin editor before deliberately changing access. All old excerpt
provenance is unproven, so it is not a public Member teaser until intentionally
authored. The migration retains content, identifiers, slugs, and publication
state and does not publish any row.

The first rollout's automatic rollback to the previous API is safe only while
that invariant holds and article mutations remain frozen. If it fails, verify
the invariant before restoring traffic; if any published Member row exists,
keep article routes restricted until an access-aware build is restored. Verify
guest/member/Admin behavior on both new runtimes, record their tested image
digests as the minimum rollback baseline, and only then lift the mutation
freeze. After Member publication begins, never restore a pre-access API image;
subsequent releases must retain a tested access-aware rollback image. The
existing automatic image rollback does not itself enforce this boundary.

The checked-in Nginx and Ingress configurations do not configure an article
response cache or a cache purge service. Article API and preview responses must
retain `no-store`, and reader HTML/data uses `private, no-store`; the sitemap must not retain
stale publication state. At any separately managed CDN/reverse proxy, bypass
caching for `/api/blog*`, `/articles*` (including Router `.data` requests), and
admin previews. Before reopening traffic, use that provider's existing purge
operation to remove any previously cached article HTML/data/API variants and
`/sitemap.xml`, including query-string variants. Do the same when tightening
visibility if an external cache rule was previously active. Verify anonymously
at the public edge after a member request: Member bodies must not appear, and
unpublished URLs must return not found. There is no configured purge credential
or provider API in this repository; this is a required operator action where
external caching exists, not an automated or executed purge claim.

Previously public reader copies cannot be recalled. Cover and Markdown image
URLs remain independently hosted assets; article authorization does not protect
public or external asset URLs. Do not put confidential assets at public URLs.

## Manual AI report worker

`08-ai-worker.yaml` uses the same digest-pinned API image and has no Service or
public port. It starts at zero replicas; rendering/validation does not enable
it. The existing deployment workflow does not automatically apply or scale this
new optional workload. An authorized operator must apply its rendered manifest
after migrations and the AI beta gates, then explicitly choose one replica.
When enabled, include its prior image and replica count in release/rollback
records alongside API and Web. Do not leave an old worker running against a new
incompatible API/schema.

Supply `AI_ENCRYPTION_KEYS` and `AI_ENCRYPTION_ACTIVE_KEY` in the existing app
Secret for both API and worker. They are optional on the API so the existing
product can run with AI unconfigured, and required on the worker. Keep the
`AI_ALLOWED_BASE_URLS` deployment allowlist identical on both workloads. Review
network egress restrictions before enabling a non-default recipient.

Generation stays disabled in the database until an Admin publishes tested
settings and grants selected users access. There is no AI report CronJob.
See [the AI runbook](../../../docs/runbooks/ai-reports.md) for keys, consent,
unknown outcomes, retention and restore precautions.

The worker manifest also includes an egress NetworkPolicy: same-namespace
PostgreSQL, cluster DNS, and public HTTPS only, excluding internal/metadata and
special-use ranges. The application still enforces the exact recipient host
allowlist and DNS pinning. Verify that the cluster CNI enforces NetworkPolicy
and that its DNS labels match before enabling; these manifests have not been
applied to the production cluster by this task.
