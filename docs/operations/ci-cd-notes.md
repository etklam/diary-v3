# CI/CD Notes — Known Traps and Operating Rules

Operational knowledge accumulated from debugging the Forgejo Actions deploy
pipeline. Each item records a real incident, the root cause, and the rule that
prevents a repeat. Update this file whenever a new CI failure mode is
diagnosed.

## Pre-merge gate

`.forgejo/workflows/ci.yml` runs on `pull_request` against `main` and is the
only tier that can block a change before it lands. Two jobs:

| Job | Runs | Why this tier |
| --- | --- | --- |
| `source-gates` | tracked-secret scan, `lint`, `typecheck`, `test:unit`, `contracts:check`, `design:check`, `manifests:check` | Seconds to a couple of minutes, no services, deterministic. |
| `integration` | `test:integration` against a disposable PostgreSQL | A few minutes, and the higher-value half of the slow tiers. |

**Tier policy — the deliberate choice.** Integration gates the merge; the
browser suites do not. Full Chromium and WebKit critical take 20–36 minutes and
stay nightly in `regression.yml`, because paying that per pull request is not a
trade this project wants and because a suite with unowned flakiness
(`.scratch/diary-v3-rebuild/issues/126-own-the-e2e-flakiness.md`) blocking every
merge converts a flake into a work stoppage. The consequence is accepted
explicitly: a change that breaks only a browser flow can merge and will be
caught by the next nightly run, not before.

**Branch protection is required and is not in this repository.** A failing
workflow does not by itself prevent a merge or a direct push. The authoritative
Forgejo repository must protect `main` with:

- Required status checks: `ci / source-gates` and `ci / integration`.
- Block direct pushes to `main`; no bypass for administrators.

Those are repository settings on the Forgejo server, so no file here can
establish them. Record the applied configuration alongside this note once set;
until then the pre-merge gate reports but does not enforce.

`design:check` also runs in `deploy.yml`, so a direct push to `main` is still
checked even though it opens no pull request.

## Pipeline overview

The production workflow is `.forgejo/workflows/deploy.yml`. A push to `main`
starts job `verify-build-deploy` on the `hk` runner; tags do not start this
workflow. Pull requests start `ci.yml` instead, not this one. The separate `.forgejo/workflows/staging.yml` is a
manual `workflow_dispatch` workflow that consumes a successful production
source SHA, immutable API/Web image digests, and an isolated staging hostname.

The production critical path runs the tracked-secret scan, dependency install,
lint, one explicit typecheck, unit tests, contracts, design and source-manifest
checks, then builds and smoke-tests the exact Docker API/Web images before
pushing.
Image IDs are checked again before publication; rendered production manifests
must use registry digests. Migrations, system seed, production rollout, public
and API smoke checks, and mutation-aware rollback remain blocking. The
disposable PostgreSQL used by the three-test artifact smoke is cleaned up even
when a gate fails.

The separate `.forgejo/workflows/regression.yml` runs nightly at 02:00 Taiwan
time and supports `workflow_dispatch`. It runs the full API integration suite,
the PostgreSQL backup/restore smoke, full Chromium and WebKit critical suites,
and the extended release-artifact flows against Docker-built images. These
checks remain blocking in that workflow; they no longer delay or silently
permit a production deployment from the same run.

The browser suites retry once in CI and publish a flake count per run
(`playwright-report/flaky-<suite>.json`) so a retried pass is recorded as
*flaky* rather than hidden inside green. Quarantined cases run in a separate
non-blocking step, which is the only sanctioned way for a case to stop gating —
see [end-to-end flakiness](e2e-flakiness.md) for the rule. The release smoke
keeps zero retries by design.

Production concurrency stays on `cancel-in-progress: false`. Forgejo applies
the concurrency group to the whole workflow, so cancellation could stop a run
after it has begun changing production. The current single-job workflow has no
safe phase-aware cancellation point. Forgejo also describes grouped execution
as best-effort rather than a strict FIFO queue, so inspect the deployed source
SHA after multiple pushes close together.

The source checks and staging workflow use Node `22.23.4`. The Dockerfile pins
Node `24.22.1` and the production API bundle targets `node24`; account for this recorded runtime split when diagnosing build-only differences.

The safety intent is covered by `tests/unit/deploy-workflow.test.ts`. Run
`npx vitest run tests/unit/deploy-workflow.test.ts` after any workflow edit.

## Trap 1 — Disposable PostgreSQL must share the job's network namespace

The runner executes jobs inside a container (DooD). `docker run -p 127.0.0.1:…`
publishes the port on the **host** loopback, which the job's network namespace
cannot reach — every test then dies with `ECONNREFUSED 127.0.0.1:<port>`.
`pg_isready` via `docker exec` is a false positive: it bypasses the network.

**Rule**: start disposable services with
`--network "container:$(cat /etc/hostname)"` and point `DATABASE_URL` at
`127.0.0.1:5432` (no published port). Probe with `-h 127.0.0.1`. Fixed in
`dbf35b4` (2026-09-12) after runs 208–214 all failed — those DB gates had
never actually passed on this runner before.

**Rule**: re-enabling any previously disabled CI step must be treated as
untested; expect first-run breakage and verify with the real log.

## Trap 2 — DATABASE_URL must be exported at job level

Per-step `env:` does not reliably reach the test process through npm scripts;
`tests/support/database.ts` silently falls back to the local-dev port (55433)
when the variable is missing, producing misleading connection errors.

**Rule**: after the disposable PostgreSQL becomes ready, write
`echo 'DATABASE_URL=…' >> "$GITHUB_ENV"` once at job level. Never commit
redacted or placeholder credentials into the workflow — literal `***` in a
committed URL caused a long chain of auth failures (fixed in `3e789ed`).
Validate any new URL with `psql` against the pinned image before pushing.

## Trap 3 — CI runner is slow: budget generous test timeouts

Runner hardware is slower than a dev laptop — roughly 3× on
subprocess-heavy work. Observed: `tests/unit/native-package-scripts.test.ts`
passes in ~6.2s locally but brushed the 20s vitest limit on the runner
(run 35, 2026-09-13: timed out with 671/672 unit tests passing; unit is a
blocking gate, so the whole deploy failed). Fixed by raising both tests to
120s in `f1a157f`.

**Rule**: any test that spawns npm/git subprocesses or builds fixtures must
declare an explicit timeout with CI headroom (≥ 4× local duration, minimum
120s). A test that merely asserts logic can keep the default 20s.

## Trap 4 — Forgejo Actions API: run id ≠ UI run number

`GET /repos/{owner}/{repo}/actions/runs/<id>/jobs` expects the internal DB
id, not the run number. Passing the wrong id does **not** 404 — it silently
returns another run's job and log (observed offset: run number + 7, after
historic run deletions). This misdirected diagnosis twice.

**Rule**: after fetching any job log, verify identity by grepping the
checkout SHA and comparing with the run's `head_sha` from
`/actions/tasks?limit=N` before drawing conclusions. If it doesn't match,
probe adjacent ids. The tasks API `status` field has also contradicted the
actual log — treat log + g2 kubectl state as the only ground truth.

## Trap 5 — Job log noise after a failed run is not a second failure

When a run fails mid-way, the `if: always()` cleanup steps and post steps
emit confusing lines like
`Error response from daemon: No such container: diary-v3-ci-postgres`
(because the container was never started, or already removed). This is
expected noise, not an additional error.

**Rule**: locate the real failure via the last `⚙️ [runner]: exitcode '1'`
marker and the test summary directly above it; ignore post-failure cleanup
output.

## Trap 6 — Dockerfile `RUN --mount` needs BuildKit; the static CLI has no buildx

Commit `3e5535c` (2026-10-09) introduced
`RUN --mount=type=cache,target=/root/.npm npm ci …` in the root Dockerfile.
The runner's `Install Docker CLI` step installs only the static docker
binary, so `docker build` fell back to the legacy builder and every build
died at that step with `the --mount option requires BuildKit`. Ten
consecutive runs failed (62–71, including nightly regression runs) and
production stayed seven days on `2388f55` — nothing visibly broke because
pods keep running the previous release; only the tasks API comparison
against the remote HEAD reveals it.

**Rule**: when introducing BuildKit-only Dockerfile syntax, first confirm
the runner's build toolchain supports it. Fixed in `16bfa13` (2026-10-16):
both `deploy.yml` and `regression.yml` install a pinned buildx CLI plugin
(`/usr/local/lib/docker/cli-plugins/docker-buildx`, v0.28.0) in the
`Install Docker CLI` step and set `DOCKER_BUILDKIT: '1'` on the image-build
steps. `tests/unit/deploy-workflow.test.ts` checks the general workflow gates;
it does not currently assert the buildx installation or BuildKit environment.
A passing unit run alone does not prove the runner can build these images.

Related: job-log id drift can be much larger than the historic +7 — for run
71 (tasks-API job id 281) the real log lived at job id 288. Always verify a
fetched log by grepping the checkout `head_sha`, and probe adjacent ids
when it does not match.

## Verification path (do not trust the Forgejo UI)

1. Confirm the release-authorized push reached the configured `main` remote and
   record the full source SHA. The deploy workflow does not run for tags or
   pull requests.
2. `/actions/tasks?limit=N` shows the run for that `head_sha`; use the workflow
   log's checkout SHA as the identity check.
3. Ground truth for a production rollout is the operator's approved cluster
   inspection: API/Web and mail-worker pods should have the new digest, the
   migrate/system-seed Jobs should be Completed, and the market CronJob should
   reference the same API digest. The repository does not provide a production
   access token or a safe read-only check from this document.
4. For a route-level canary, use a route added in the release (200 proves the
   new code serves). For auth-protected routes, inspect the deployed bundle or
   use a synthetic authorized fixture; a 401 proves only that authentication
   ran before route matching.
5. The workflow smoke checks the public home and article index plus API
   `/healthz` and `/readyz`. The standalone staging checklist is
   [`staging-smoke.md`](staging-smoke.md) and starts with
   `bash scripts/staging-smoke.sh https://<staging-hostname>`.

## Known historical regression failures

- Full Chromium regression: i18n text assertions (e.g. expected
  `"Partner management"`, page rendered `伙伴管理`) — run 34. The suite now
  runs in the nightly/manual regression workflow; diagnose failures there
  without extending the production critical path.

## Incident log

| Date | Run | Cause | Fix |
|---|---|---|---|
| 2026-09-12 | 208–214 | Disposable PG unreachable from job netns (port published on host loopback) | `dbf35b4` shared netns + port 5432 |
| 2026-09-12 | 216→ | e2e authoring: linked-diary options fetched once at mount, test order wrong | `d467ef8` reordered test |
| 2026-09-13 | 28–34 | Heavy tiers (integration/e2e) unstable, blocking every deploy | `3e789ed` advisory tiering + job-level `DATABASE_URL` (also removed committed `***` password) |
| 2026-09-13 | 35 | `native-package-scripts` unit test timed out at 20s on slow runner | `f1a157f` raised to 120s |
| 2026-10-09 → 10-16 | 62–71 | Dockerfile `RUN --mount=type=cache` on a static CLI without buildx: legacy builder rejected it, ten consecutive failures, production stuck on `2388f55` for a week | `16bfa13` pinned buildx plugin + `DOCKER_BUILDKIT=1` on build steps (Trap 6) |
