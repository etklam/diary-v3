# RC2 stabilization acceptance

Date: 2026-09-13. Scope: release stabilization and staging readiness; no
product feature work or production cutover.

## Source and environment

| Item | Result |
| --- | --- |
| RC2 implementation commit | `2d2127ce250a037e5ad2fd7128b0b3f2006b5b71` |
| Verification source | RC2 implementation commit on `main`; this record is committed separately |
| Runtime | macOS, Node 26.4.0, npm 11.17.0 |
| Database | Local disposable PostgreSQL; integration/E2E suites use synthetic data |
| Production changes | None; production deployment is out of scope |

## Quality gates

| Gate | Evidence |
| --- | --- |
| Lint | PASS — `npm run lint` |
| Typecheck | PASS — included in `npm run build` (`tsc --noEmit`) |
| Unit | PASS — 73 files, 661 tests |
| Integration | PASS — 62 files, 233 tests against disposable PostgreSQL |
| Contracts | PASS — `npm run contracts:check`, no generated drift |
| Deployment manifests | PASS — `npm run manifests:check`, 8 manifests |
| Backup/restore | PASS — migration 0020 (`posts`) schema N→N+1, full restore and invalid-restore checks; details in [restore-60-smoke.md](../operations/restore-60-smoke.md) |
| Production application build | PASS — `npm run build` |
| Docker API/Web targets | PASS — both `linux/amd64` targets built locally from the release Dockerfile; no registry push |

## Browser acceptance

| Browser suite | Result |
| --- | --- |
| Chromium full E2E | PASS — 199 passed, 0 failed, 0 skipped, 0 retries |
| WebKit critical E2E | PASS — 8 passed, 0 failed, 0 skipped, 0 retries |
| Production-artifact E2E | PASS — 9 passed against the actual locally built API/Web Docker images, including `/articles`, publishing, auth, Diary, Timeline/Partner, and anonymous Tools |
| PWA Chromium E2E | PASS — 3 passed with Service Workers enabled and controller readiness checked |
| Mobile Chromium | PASS — full suite includes 360px and 390px flows |
| Mobile WebKit | PASS — 390px menu, scroll lock, focus return, Quick Diary, and Partner comparison paths |

WebKit critical coverage blocks Service Workers so Playwright request
interception remains deterministic. Normal PWA behavior is tested separately
with Service Workers enabled. Local Docker E2E ran the `linux/amd64` images
under ARM64 emulation. Browser automation is not real-device testing.

## CI, images, and staging

The Forgejo production workflow orders lint, typecheck, unit, contracts,
manifest validation, restore smoke, PostgreSQL integration, build, Chromium,
and WebKit critical before it builds full-source-SHA-tagged API/Web images.
Release E2E starts those exact images, checks their image IDs remain unchanged,
and only then pushes the same references. Workflow-order tests, YAML parsing,
and local Docker-image E2E passed. Its quality steps fail closed; no hosted run
was executed in this acceptance session.

**Forgejo hosted status: NOT VERIFIED** — local results do not establish
runner, registry, SSH, or Kubernetes success.

The manual staging workflow uses the production Docker artifact model and
immutable API/Web image digests. Before deployment it pulls each image's
full-source-SHA tag and verifies that the registry digest matches the supplied
digest. This prevents accidental cross-release pairing but is not a signed
provenance attestation. The workflow then applies migration/seed jobs and runs
HTTP/Socket.IO smoke checks. Application flows are covered by the manual
[staging smoke checklist](../operations/staging-smoke.md). Staging remains a
manual dispatch and is not a promotion dependency of the main-to-production
workflow.

**Staging runtime: NOT VERIFIED** — external staging host, secrets, registry
pulls, TLS, rollout, and application-flow smoke were unavailable. Static
workflow and manifest checks passed locally.

## Production `/articles` incident

The supplied production URL returned the not-found page after reload. Its
route manifest contained `routes/articles`, while loader hydration reported an
HTTP 404; the public `/api/blog` endpoint returned HTTP 200. The production Web
manifest at the audited source revision lacked `API_ORIGIN`, allowing
server-rendered article requests to resolve through the incoming Web origin
instead of the in-cluster API service.

**Likely source-level cause; live Pod cause not proven.** The Web production
manifest and Compose service now set `API_ORIGIN` to the internal API service,
and release checks cover `/articles`. A local production-artifact test renders
the route with a synthetic API. The deployed Pod environment and logs were not
inspected, and no production deployment was performed. The public URL remains
a release blocker until an authorized rollout and public smoke confirm it
works.

## Real-device acceptance and remaining risks

| Target | Result |
| --- | --- |
| iPhone Safari | NOT VERIFIED — no physical iPhone was available |
| Android Chrome | NOT VERIFIED — no physical Android device was available |

- **P0:** The live `/articles` route remains broken until a separately
  authorized rollout and public smoke verify the fix.
- **P1:** Hosted Forgejo and staging have not been exercised. Staging remains
  a manual workflow rather than a required production-promotion gate, and the
  full-SHA registry tag check is not a signed provenance attestation.
- **P2:** Local commands emit Node `DEP0205` and Vite config-loader warnings;
  current checks pass.
- No skips, retries, or timeout increases were added to mask instability.

## Release decision

**NOT READY.** Repository-controlled checks are green locally. Production
acceptance remains blocked by the live `/articles` incident; hosted Forgejo,
staging, and physical-device evidence is not available.
