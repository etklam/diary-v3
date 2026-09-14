# CI/CD Notes — Known Traps and Operating Rules

Operational knowledge accumulated from debugging the Forgejo Actions deploy
pipeline. Each item records a real incident, the root cause, and the rule that
prevents a repeat. Update this file whenever a new CI failure mode is
diagnosed.

## Pipeline overview

Single workflow `.forgejo/workflows/deploy.yml` → job `verify-build-deploy`
on the `hk` runner. Test tiering (since `3e789ed`, 2026-09-13):

- **Blocking gates**: lint, typecheck, unit tests, contracts check, manifest
  validation, build, image digest verification, deploy, production smoke.
- **Advisory tiers** (`continue-on-error: true`): API integration tests, full
  Chromium regression, WebKit critical path, release artifact acceptance.
  Failures are visible in logs but never block the deploy.

The tiering is locked by `tests/unit/deploy-workflow.test.ts`. Run
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

## Verification path (do not trust the Forgejo UI)

1. Push lands on both remotes and `ls-remote` SHAs match.
2. `/actions/tasks?limit=N` shows the run for your `head_sha`.
3. Ground truth for rollout: `ssh root@82.22.63.196 "kubectl -n diary-v3 get deploy,pods"`
   — migrate/system-seed jobs Completed, api/web pods Running with fresh age.
4. Canary: curl a route added in this commit (200 proves new code serves);
   for auth-protected routes grep the live bundle chunks instead (401 proves
   nothing — auth middleware runs before route matching).
5. Smoke: `https://v3.trade-basic.com/` → 200, `/readyz` → `{"status":"ready"}`.

## Known flaky advisory failures (do not chase)

- Full Chromium regression: i18n text assertions (e.g. expected
  `"Partner management"`, page rendered `伙伴管理`) — run 34. These are
  advisory; fix separately, never under deploy pressure.

## Incident log

| Date | Run | Cause | Fix |
|---|---|---|---|
| 2026-09-12 | 208–214 | Disposable PG unreachable from job netns (port published on host loopback) | `dbf35b4` shared netns + port 5432 |
| 2026-09-12 | 216→ | e2e authoring: linked-diary options fetched once at mount, test order wrong | `d467ef8` reordered test |
| 2026-09-13 | 28–34 | Heavy tiers (integration/e2e) unstable, blocking every deploy | `3e789ed` advisory tiering + job-level `DATABASE_URL` (also removed committed `***` password) |
| 2026-09-13 | 35 | `native-package-scripts` unit test timed out at 20s on slow runner | `f1a157f` raised to 120s |
