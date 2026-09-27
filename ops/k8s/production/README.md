# Production K3s manifests (g2, v3.trade-basic.com)

The CI pipeline (.forgejo/workflows/deploy.yml) renders the `placeholder` image
tags in these files to digest-pinned `git.913555.xyz/etklam/diary-v3-api` /
`diary-v3-web` images before applying them. Never apply these files unrendered.

Release path:

1. A push to `main` starts `.forgejo/workflows/deploy.yml` on the `hk` runner.
   Blocking checks include tracked-secret scanning, lint, typecheck, unit tests,
   contracts, source-manifest validation, PostgreSQL backup/restore smoke, and
   the production build. API integration, full Chromium, WebKit critical path,
   and release artifact acceptance are currently advisory
   (`continue-on-error: true`); their failures remain visible but do not stop
   the later deploy steps.
2. CI builds the API and Web images, verifies the tested image IDs are unchanged,
   pushes them, resolves immutable digests, and validates rendered manifests
   before any remote mutation.
3. The one-off `ops/k3s/deploy-production-secrets.sh` script provisions
   `diary-v3-db` and `diary-v3-app` when those Secrets do not exist. CI does not
   run this script or rotate secrets; it assumes the required Secrets already
   exist. The script requires `DB_PASSWORD`, a 32-byte-or-longer `JWT_SECRET`,
   and `SEC_USER_AGENT`, and retains complete existing Secrets.
4. CI reconciles `00-namespace.yaml` and `01-postgres.yaml`, then runs the
   standalone migrate Job (`node dist/api/migrate.js`) and idempotent system
   seed Job (`node dist/api/seed-system.js`). Migrations must remain
   backward-compatible with the running application; destructive migrations
   require an explicit release safety review.
5. CI records the current API, Web, market CronJob, and mail-worker images and
   replica counts. It applies the new API digest, waits for rollout, applies the
   same API digest to the one-replica mail worker, then applies Web, Ingress, and
   market CronJob. The smoke path checks API `/healthz`, `/readyz`, the TLS
   certificate, and public `/` and `/articles`.
6. If a post-mutation step fails, CI restores only workloads that it changed to
   their recorded images and replica counts, waits for rollout, and repeats the
   smoke checks. Optional AI, Research Studio, and article-translation workers
   are not part of this automatic deploy or rollback set.

The package declares Node `>=22.22.0`; Forgejo uses Node `22.22.0` for source
checks, while the Dockerfile builds and runs the release images on Node 24 and
bundles the API for `node24`. The checked-in image tags are placeholders and
must never be applied directly; use the renderer's digest output.

Pre-deploy verification, build, push, migration, or seed failures do not roll
back application workloads. Once an application workload has been changed, a
later failure restores only changed workloads to their recorded images and
replica counts, waits for rollout, and repeats the smoke checks. Rollback errors
remain visible as a failed workflow.

Application rollback never reverses database migrations. If migration safety is
uncertain, stop the release, inspect the migration ledger and schema, and choose
a compatible application image manually. Database restoration is a separate,
explicit operation documented in `docs/operations/restore-60-smoke.md`.

## Staging workflow

`.forgejo/workflows/staging.yml` is a manual workflow. It requires the full
source SHA from the successful production build, the matching immutable API and
Web digests, and a non-production HTTPS hostname. It validates the existing
staging namespace and Secrets, renders the production-shaped manifests into the
`diary-v3-staging` namespace, pauses the market CronJob, and runs
`scripts/staging-smoke.sh`. It does not accept the production hostname and does
not use the production SSH credentials.

Layout notes:

- The API deployment is a single `Recreate` replica: it owns the one
  process-local Socket.IO and foreground scheduler instance.
- The API requests 100m CPU, 256Mi memory, and 256Mi ephemeral storage; limits
  are 1000m CPU, 768Mi memory, and 2Gi ephemeral storage. SEC guest package
  downloads admit two heavy requests, each bounded to one 550Mi ZIP plus one
  250Mi staged document; the ephemeral limit leaves room for process and
  filesystem overhead.
- The Web deployment requests 50m CPU and 128Mi memory and limits memory at
  512Mi. The always-on mail worker requests 50m CPU/128Mi memory and limits
  memory at 384Mi; it has a 120-second termination grace period.
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
it. The production renderer includes this file for digest validation, but the
production deploy workflow does not copy or apply it. An authorized operator
must use a reviewed rendered manifest after migrations and the AI beta gates,
then explicitly choose one replica. When enabled, include its prior image and
replica count in release/rollback records alongside API and Web. Do not leave
an old worker running against a new incompatible API/schema.

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
and that its DNS labels match before enabling; the normal release workflow
leaves this manual worker unapplied.

## Manual Research Studio and article translation workers

`09-research-worker.yaml` and `10-article-translation-worker.yaml` also have no
Service or public port and both start at zero replicas. They require the AI
keyring, PostgreSQL access, DNS, and the same restricted public HTTPS egress as
the AI worker. The Research worker is configured for a 5-second poll interval;
the article translation worker uses the same interval. Enable either only after
its migration, provider, consent, and synthetic smoke gates are recorded.

The source-manifest validator checks both files, but the current release
renderer emits `09-research-worker.yaml` and omits
`10-article-translation-worker.yaml`; the automatic production workflow applies
neither file. Treat article-translation rollout as an unresolved operational
gap requiring an explicit reviewed render/deploy step before enabling it. Track
the image digest and replica count for every manually enabled worker so a
rollback cannot leave an older worker running against a newer schema.

## Account email worker

`11-mail-worker.yaml` is part of the normal release bundle and runs one replica;
it does not expose a Service or public port. It is rolled out after the API so
its code matches the migrated schema. Its egress policy allows PostgreSQL,
cluster DNS, and public TCP 465, 587, and 2525 while excluding private and
special-use ranges. The API separately applies SMTP host validation and DNS
pinning. A private relay needs both an exact `SMTP_ALLOWED_HOSTS` entry and an
operator-reviewed network-policy/firewall rule.

Before an Admin enables SMTP, add matching `SMTP_ENCRYPTION_KEYS` and
`SMTP_ENCRYPTION_ACTIVE_KEY` values to the `diary-v3-app` Secret and restart both
the API and mail-worker Deployment. These secret references are optional so an
installation with SMTP disabled does not need mail keys. See the [account
email runbook](../../../docs/runbooks/account-email.md) for key rotation,
retention, network, and recovery steps. CI updates the worker image alongside
the API and restores or removes the worker if a release rollout fails.

## Optional Redis rate limiting

Redis is not created by the normal release manifests. The separate
[`ops/k8s/optional/redis.yaml`](../optional/redis.yaml) manifest runs one
authenticated, ClusterIP-only Redis Pod and permits ingress only from API Pods.
The API Deployment enables the `auto` backend via the `RATE_LIMIT_BACKEND`
env var and an authenticated `REDIS_URL` key in the `diary-v3-app` Secret;
the operator-provisioned `diary-v3-redis` Secret holds `REDIS_PASSWORD`.

For a deliberate enablement, provision that Secret through the environment's
approved secret manager, review and apply the optional Redis manifest, then
add an authenticated `REDIS_URL` key and `RATE_LIMIT_BACKEND=auto` to the API
Deployment through the normal reviewed release process. The Redis URL belongs
in the existing `diary-v3-app` Secret and must URL-encode special password
characters. Choose `redis` only when Redis should be a readiness requirement.
The standard production manifests, secret script and CI release workflow do
not enable or provision Redis. See the [rate-limiting runbook](../../../docs/runbooks/rate-limiting.md)
for behavior, local testing, limits and recovery semantics. This is
application-layer abuse protection and does not replace edge or ingress DDoS
controls.
