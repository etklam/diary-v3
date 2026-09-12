# RC2 stabilization acceptance

Date: 2026-09-13. Scope: release stabilization and staging readiness; no
product feature work or production cutover.

## Source and environment

| Item | Result |
| --- | --- |
| Source HEAD before and after verification | `d467ef842158bc891af8178f6e00642698247627` |
| RC2 commit | Not available; stabilization changes remain uncommitted in the worktree |
| Runtime | macOS, Node 26.4.0, npm 11.17.0 |
| Database | Local disposable PostgreSQL; integration/E2E suites create and remove a unique database per run |
| Production changes | None; production deployment is out of scope |

## Quality gates

| Gate | Evidence |
| --- | --- |
| Lint | PASS — `npm run lint` |
| Typecheck | PASS — `npm run typecheck` |
| Unit | PASS — 73 files, 655 tests |
| Integration | PASS — 62 files, 233 tests against disposable PostgreSQL |
| Contracts | PASS — `npm run contracts:check`, no generated drift |
| Deployment manifests | PASS — `npm run manifests:check`, 8 manifests |
| Backup/restore | PASS — isolated schema N→N+1 and invalid-restore smoke, recorded in [restore-60-smoke.md](../operations/restore-60-smoke.md) |
| Production build | PASS — both Docker targets built locally; the Web target ran `npm run build` |
| Docker Web route | PASS — local production Web container returned HTTP 200 for `/articles` with the Articles page rendered using a synthetic API |

## Browser acceptance

| Browser suite | Result |
| --- | --- |
| Chromium full E2E | PASS — 198 passed, 0 failed, 0 skipped, 0 retries |
| WebKit critical E2E | PASS — 8 passed, 0 failed, 0 skipped, 0 retries |
| Production-artifact E2E | PASS — 9 passed, including `/articles`, article publishing, auth, diary, and anonymous tools |
| PWA Chromium E2E | PASS — 3 passed with Service Workers enabled |
| Mobile Chromium | PASS — full suite includes 360px and 390px workflows |
| Mobile WebKit | PASS — 390px navigation, Quick Diary, and partner comparison paths in the critical suite |

WebKit critical coverage blocks Service Workers so Playwright request
interception remains deterministic. Normal PWA behavior is separately tested
with Service Workers enabled. These browser runs are not real-device tests.

## CI and release infrastructure

The Forgejo workflow orders lint, typecheck, unit, contracts, manifest
validation, restore smoke, PostgreSQL integration, production build, Chromium,
WebKit critical, and production-artifact E2E before image build and push. It
uses immutable image digests for release manifests. Production and rollback
smoke now require both `/` and `/articles` to return HTTP 200.

**Forgejo status: NOT VERIFIED** — no hosted workflow run was executed in this
acceptance session. Local green checks do not establish runner, registry, SSH,
or remote Kubernetes success.

The manual staging workflow renders the production manifests for the fixed
`diary-v3-staging` namespace and takes the already-built API/Web digests. It
checks staging secret contracts, applies the same migration and seed jobs,
pauses the market CronJob, and runs the staging HTTP/Socket.IO smoke script.
The environment variable contract is documented in
[environment-contract.md](../operations/environment-contract.md), and the
application-flow checklist is [staging-smoke.md](../operations/staging-smoke.md).

**Staging repository path: IMPLEMENTED; static validation: PASS.** The
workflow, external staging host, secrets, registry pulls, TLS, actual rollout,
and application-flow smoke are **NOT VERIFIED** because the staging
environment was not available in this session. The manual staging workflow is
not a promotion dependency of the existing push-to-main production workflow.

## Production `/articles` incident

The provided production URL displayed “Page not found” after reload in the
existing Chrome tab. Its HTML contained the registered `routes/articles`
module, while loader hydration reported “Articles unavailable” with HTTP 404.
The public `/api/blog` endpoint returned HTTP 200 with a valid list. The
article loader fetches `/api/blog` during server rendering and uses
`API_ORIGIN` when configured. The production Web manifest at the starting
revision had no `API_ORIGIN`, so server rendering could resolve that request
back through the incoming Web origin instead of the in-cluster API service.

**Likely source-level cause; live pod cause not proven.** The production Web
manifest and Compose service now set `API_ORIGIN` to their internal API
service. A regression assertion requires the production Kubernetes Web
Deployment to retain this setting. A locally built production Docker Web
container returned HTTP 200 and rendered the Articles title when pointed at a
synthetic API. The deployed Pod environment and logs were not inspected, so
the missing setting remains a high-confidence explanation, not direct proof
of the live request path. No production deployment was performed. The public
URL remains a release blocker until a separately authorized rollout and
public smoke confirm the route works.

The production and rollback workflows now probe `/articles`, requiring HTTP
200 so a route regression blocks rollout or recovery.

## Mobile and real devices

| Target | Result |
| --- | --- |
| iPhone Safari | NOT VERIFIED — WebKit automation only; no physical iPhone was available |
| Android Chrome | NOT VERIFIED — Chromium automation only; no physical Android device was available |

## Remaining risks

- **P0:** The production `/articles` URL still shows the not-found page. Local source and image evidence do not change the live deployment.
- **P1:** Forgejo and staging have not been exercised remotely. Staging is manual and is not yet a required promotion gate before the automatic main-to-production workflow.
- **P2:** Local commands emit Node `DEP0205` and Vite config-loader warnings; current checks still pass.
- No new skipped/fixme tests, retries, or timeout increases were added to hide failures.

## Release decision

**NOT READY.** Repository-controlled release checks pass locally, and both
Docker targets build. Do not call RC2 production-accepted while the live
`/articles` route is broken and remote staging/Forgejo evidence is absent.
