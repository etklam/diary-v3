# Native App Readiness Audit

Audit date: 2026-09-13

Repository HEAD at audit start: `61a6216e657088366015d4bc2327613bfd6c79ae` (the tested implementation and reports were uncommitted changes based on this baseline).

Scope: API, shared contracts/client/domain packages, native proof integration, backward compatibility, and RC2 release constraints. This audit does not approve a production cutover.

## Verdict

The existing API supports the proof's core native flows without a backend or JWT rewrite. The proof uses JSON native-session endpoints, bearer authentication, an injected standard-fetch transport, shared runtime contracts and domain helpers, owner-scoped API routes, and explicit calendar-date/decimal semantics. The Expo project typechecks and produces iOS and Android Hermes bundles; a disposable-PostgreSQL acceptance test passes login/restore, Diary write/read, Timeline, Review, Company context, logout/expiry, and account isolation.

**NOT APP-READY.** Expo/Metro compilation and API acceptance pass, but no iOS Simulator, Android Emulator, or physical device was available. Actual React Native networking, SecureStore persistence, deep-link dispatch, and UI lifecycle remain unverified. The technical-proof bar in this phase requires a native simulator/device run before calling the integration proven.

**RC2 production release remains NOT READY** under [`docs/acceptance/rc2.md`](../acceptance/rc2.md): the live `/articles` route still needs an authorized rollout and public smoke, hosted Forgejo and staging are unverified, and physical-device coverage is absent. These are separate from the native API design verdict.

The recorded RC2 P0/P1 blockers also remain open; this audit does not approve a production cutover.

Status labels used below:

- **Verified**: supported by current working-tree source, contract, test, or an explicitly recorded passing command.
- **Implemented / unverified**: present in the proof source; API tests and Expo bundles are reported separately, and operating-system runtime behavior has not been exercised.
- **Inference**: a reasoned compatibility expectation that still needs runtime evidence.
- **Gap**: no native feature or release evidence is present for the stated scope.

The working tree was shared with parallel implementation/proof work. Findings and commands below apply to that working tree, not the baseline commit recorded above. No production service or deployment was changed.

## Architecture verdicts

| Area | Verdict | Evidence and implications |
| --- | --- | --- |
| API transport | **READY WITH ADAPTER.** `createApiClient` accepts an absolute `baseUrl` and injected `fetch`; `createNativeSession` attaches a bearer token only to the configured origin, uses `credentials: 'omit'`, and removes caller-provided `Authorization`, `Cookie`, and CSRF headers. | `packages/api-client/src/index.ts`, `packages/api-client/src/native-session.ts`; the no-DOM shared boundary test and Expo/Metro iOS/Android bundle pass. HTTPS remains a production configuration requirement. Actual React Native `Request`/`Headers`/`URL`/`fetch` behavior remains **unverified** without a native run. |
| Authentication and refresh | **READY WITH ADAPTER.** Native JSON login, refresh, and logout are separate from Web cookie auth. Access tokens are bearer JWTs; refresh values are stored server-side as SHA-256 digests, rotated within per-device families, and serialized with PostgreSQL advisory locks. No JWT or backend rewrite is indicated by the evidence. | `apps/api/src/app.ts`, `apps/api/src/auth-session.ts`, `docs/adr/0002-native-session-family-serialization.md`, and passing `tests/integration/native-api-acceptance.test.ts`. Refresh families remain independent; the adapter coalesces concurrent 401 refreshes and does not retry an uncertain refresh rotation. |
| Logout and account switching | **READY WITH ADAPTER.** The client clears injected storage before asking the API to revoke the refresh family; account switching also clears owner-bound draft and private view state. | `packages/api-client/src/native-session.ts`, `proofs/native/App.tsx`, and passing native API acceptance. Offline logout cannot confirm server revocation. A copied access JWT stays valid until its maximum one-hour expiry; acceptance verifies immediate validity and 401 after 61 minutes. |
| CSRF and CORS | **NATIVE READY.** Web cookie mutations retain double-submit CSRF; bearer requests are exempt. CORS remains restricted to the Web origin and is not used as a native-client gate. Native calls stay cookie-free and use bearer auth. | `apps/api/src/app.ts`, `tests/integration/first-diary.test.ts`, `tests/integration/quick-diary-http.test.ts`; native API acceptance passes without wildcard CORS or a Web security exception. |
| Rate limiting | **NATIVE READY WITH TOPOLOGY LIMIT.** Login and refresh use IP plus account/token dimensions; rejections use `429 AUTH_RATE_LIMITED`. The in-memory limiter is per process and capped at 10,000 buckets, so horizontal API scaling needs a shared limiter or a policy change. | `apps/api/src/app.ts`, `ops/k8s/production/02-api.yaml` (one replica), and integration coverage. Proxy trust must match the deployed ingress; clients must not supply trusted forwarding identity. |
| Contracts and shared packages | **NATIVE READY AT THE SHARED-SOURCE BOUNDARY.** Contracts, API client, and domain logic are JSON-oriented and contain no server/UI runtime imports. | `packages/contracts/src/`, `packages/api-client/src/`, `packages/domain/src/`, passing `tests/unit/native-shared-boundary.test.ts`, proof typecheck, and both Metro bundles. This does not replace operating-system runtime evidence. |
| IDs, decimals, and dates | **NATIVE READY.** IDs are positive 64-bit decimal strings. Ledger quantities/prices are decimal strings; native code should send strings to avoid JavaScript precision loss. `YYYY-MM-DD` is a civil date; UTC instants require `Z`. Diary creation should send the account-local date explicitly. | Contracts, `packages/domain/src/calendar-date.ts`, `packages/domain/src/zoned-time.ts`, API source, and passing acceptance with a civil date preserved through create/read. Do not parse civil dates as UTC instants. |
| Errors | **READY WITH ADAPTER.** API errors use `{statusCode,statusMessage,data:{code,details,requestId}}`. Native callers branch on stable `data.code`; bootstrap errors map to `NativeSessionError(status, code, safe details)` and omit arbitrary `details[].value`. | `packages/api-client/src/native-session.ts`; invalid-login, expired-refresh, safe-details, network-error, and marked-write unit coverage passes as part of `npm run native:proof:test`. |
| Uncertain writes | **READY WITH ADAPTER, WITHOUT IDEMPOTENCY.** The `NO_AUTOMATIC_SESSION_RETRY_HEADER` marker prevents refresh/replay for a marked request. A lost response can still follow a committed write; callers must preserve the draft, show the uncertain result, and ask the user to check Timeline. No manual retry is claimed duplicate-safe. | `packages/api-client/src/request-headers.ts`, `packages/api-client/src/native-session.ts`, `proofs/native/App.tsx`, and passing tests that cover a pre-send network error, a committed write with response loss, and an expired-session 401. |
| API compatibility policy | **Policy exists; compatibility is not automatically enforced.** This is the first native-compatible baseline, with no previously released native client. The accepted policy preserves `/api` meanings for IDs, decimal strings, civil dates, pagination, and error envelopes; breaking changes require a separately versioned endpoint and deprecation window. `contracts:check` catches generated OpenAPI drift, not breaking changes against an old app. | `docs/adr/0011-native-contract-compatibility.md`, `scripts/generate-openapi.ts`, `packages/api-client/src/generated.ts`. Before shipping clients, retain a previous-client fixture and review schema diffs against the released baseline. |
| Markdown and Web-only rendering | **WEB-COUPLED RENDERING; DATA IS PORTABLE.** Diary/article bodies are Markdown strings. The proof displays source as selectable native text without a WebView. Rich Markdown parity, HTML handling, and safe link rendering need a native renderer decision before product release. | `proofs/native/App.tsx`, `apps/web/app/markdown.tsx`, `apps/api/src/posts.ts`. Never treat API Markdown as trusted HTML. |

### Session-specific integration requirements

- Persist the complete native token pair as one value in platform secure storage. The shared adapter deliberately injects only `get`, `set`, and `clear`; it contains no platform storage implementation. The proof uses one JSON value under Expo SecureStore (`proofs/native/App.tsx`). Do not move refresh tokens into AsyncStorage or ordinary preferences.
- Logout clears that secure value before the network request. When the request reaches the API, the server revokes that refresh family. On offline failure, the app remains signed out locally but cannot claim the family was revoked. A copied access JWT can still authorize requests until its `exp` (at most one hour); refresh-family revocation is not immediate access-token revocation.
- The adapter requires a same-origin absolute API URL but accepts HTTP at the shared-library boundary. The proof rejects non-HTTPS origins outside development. Production configuration must use HTTPS and must not send credentials to a different origin.
- A 401 during an uncertain write must leave the draft intact, end/refresh the local auth flow as designed, and wait for an explicit user action before issuing a new write. Automatic 401 refresh remains available to unmarked requests for ordinary session recovery.

## Native compatibility matrix

“API ready” describes the API and contract evidence, not a complete native screen. Statuses below classify portability for the proof scope; operating-system runtime evidence is listed separately.

| Area | Status | Evidence and proof scope | Required work or limit |
| --- | --- | --- | --- |
| Authentication | **READY WITH ADAPTER** | Native JSON login/refresh/logout and bearer auth; acceptance logs in a synthetic user. | Run the UI on a simulator/device and verify secure storage and auth transitions there. |
| Session restore | **READY WITH ADAPTER** | `GET /api/auth/me`; newly created adapter restores through the same test storage. | SecureStore cold-start restoration is not runtime-verified. |
| Logout | **READY WITH ADAPTER** | Acceptance verifies local pair clearing, refresh-family revocation, copied access token expiry, and explicit account change behavior at the API boundary. | Verify SecureStore clear and app lifecycle on a device; offline server revocation remains unconfirmed by design. |
| CSRF | **NATIVE READY** | Bearer requests bypass cookie CSRF while Web cookie mutations retain the double-submit check. | Keep native requests cookie-free; no Web security exception is needed. |
| API transport | **READY WITH ADAPTER** | Absolute base URL and injected fetch; shared boundary and iOS/Android Metro bundle pass. | Native `Request`/`Headers`/`URL`/fetch, TLS, and redirects need a simulator/device run. |
| Contracts | **NATIVE READY** | Shared schemas and generated API types pass boundary checks, proof typecheck, and both platform bundles. | Continue additive API changes and keep package imports inside the boundary. |
| Error model | **READY WITH ADAPTER** | Stable error codes; safe `NativeSessionError` projection and network failure behavior have unit coverage. | Product localization and complete status-state UX are outside this proof. |
| Quick Diary | **READY WITH ADAPTER** | Acceptance writes/reads civil date, Markdown, tag, and symbol; tests pre-send failure and commit-with-response-loss. | No append-to-date, durable draft, or idempotency guarantee. User must check Timeline before deciding whether to resubmit an uncertain write. |
| Full Diary | **NOT REQUIRED FOR THIS PROOF** | The proof reads a full Diary but does not implement the full editor. | Full authoring, structured ledger/plan/alert editing, delete, and rich Markdown rendering belong to product scope. |
| Timeline | **READY WITH ADAPTER** | Acceptance reads summary and owner-scoped detail; Expo source presents the bounded list. | Pagination, search/filter/sort UI, and native screen execution remain outside this proof. |
| Search | **NOT REQUIRED FOR THIS PROOF** | Bounded API search/filter contracts exist. | Add native search only if product scope requires it. |
| Review Queue | **READY WITH ADAPTER** | Acceptance reads queue before and after persisted Diary Review. | The proof covers Diary-target items, not company-thesis review items. |
| Diary Review | **READY WITH ADAPTER** | Structured review PATCH, read-back, and completed queue state pass against PostgreSQL. | Broader reflection/outcome and native lifecycle coverage belongs to product acceptance. |
| Company context | **READY WITH ADAPTER** | Authenticated Company context passes with a controlled quote fixture and account isolation. | Read-only and basic; no live provider or native network-state run. |
| Holdings | **NOT REQUIRED FOR THIS PROOF** | API uses owner-scoped decimal-string quantities/costs. | No dedicated native holdings screen. |
| Watchlist | **NOT REQUIRED FOR THIS PROOF** | Owner-scoped stock/ETF APIs exist. | No native watchlist screen. |
| Partner comparison | **NOT REQUIRED FOR THIS PROOF** | API sharing policy and existing tests are separate from the native proof. | No native partner-management or comparison screen. |
| Public Tools | **NOT REQUIRED FOR THIS PROOF** | Pure calculators and selected JSON APIs exist. | No native tools shell; assess each tool independently. |
| Public Articles | **NOT REQUIRED FOR THIS PROOF** | `/api/blog` exposes structured JSON separately from Web SSR. | No native article list/detail or Markdown renderer. |
| Admin | **NOT REQUIRED FOR MOBILE** | Authorization remains server-side; acceptance confirms ordinary `USER` gets `403 AUTH_FORBIDDEN` for `POST /api/blog`. | No native admin UI. |
| Web rendering and SSR | **WEB-COUPLED** | React Router, DOM and Web Markdown rendering remain Web-only; the proof consumes JSON and plain Markdown text. | Do not import Web UI, SSR loaders, or browser state into native code. |
| Native runtime evidence | **BLOCKER FOR “TECHNICALLY PROVEN”** | iOS and Android Hermes bundles compile, but no simulator/device toolchain is available. | Run login → Quick Diary → Timeline → Review → logout on at least one native simulator/device. |

## Core proof matrix

| Flow | Source/API evidence | Current status | Remaining acceptance |
| --- | --- | --- | --- |
| Login and restore | `proofs/native/App.tsx`; native login; `GET /api/auth/me`; native unit and PostgreSQL acceptance tests. | **PASS — API acceptance, proof typecheck, iOS/Android bundle.** Restore uses an adapter recreated over in-memory test storage. | Run the UI and cold-start SecureStore restore on a native runtime. |
| Logout and account switch | `switchAccount()` logs out before switching; owner-bound draft/private state clears on identity change; API logout revokes refresh family. | **PASS — API acceptance and source/bundle.** Copied access-token expiry is verified with a controlled clock. | Verify SecureStore clearing, offline logout copy, and view reset on a device. |
| Quick Diary save | Civil date/body validation; marked `POST /api/diaries`; PostgreSQL create/read. | **PASS — API acceptance.** Date, body, tag, and symbol persist. | No append-to-today or durable draft; run the screen on a device. |
| Timeline and detail | `/api/diaries/summary` and `/api/diaries/{id}`. | **PASS — API acceptance.** New Diary appears in Timeline and detail is owner-scoped. | Native list/navigation runtime remains unverified. |
| Review queue and Diary Review | `/api/reviews`, owner-scoped GET/PATCH review, read-back, refreshed queue. | **PASS — API acceptance.** Persisted review moves to completed. | Run the native flow on a device. |
| Company context | `/api/stocks/{symbol}/hub`, shared response schema, controlled market quote fixture. | **PASS — API acceptance with fixture.** Account B sees no private related Diary. | Live market-provider and native runtime behavior are unverified. |
| Network failure | Source surfaces read failures and preserves the memory-only draft; acceptance injects a Timeline read failure, a pre-send write failure, and a committed write with a dropped response. | **PASS — API boundary.** Session remains intact on failed read/write, each failed write is attempted once, and a committed write is visible in Timeline. Manual retries are not claimed safe. | User checks Timeline before any explicit resubmission; verify screen messaging on device. |
| Deep link | Allowlisted `diary-v3://diaries/<positive-id>` and owner-scoped API detail. | **PASS — source/typecheck/bundle; OS routing NOT VERIFIED.** | Verify scheme dispatch, malformed links, signed-out return, and foreign-owner 404 on iOS/Android. |

### Evidence layers

Keep these results separate when promoting the proof:

| Layer | Evidence at audit time | Conclusion |
| --- | --- | --- |
| API/server and shared adapter | `npm run native:proof:test` passes 2 files / 16 tests; `npm run native:api:test` passes 1 PostgreSQL acceptance test; the full `npm run test:integration` passes 63 files / 234 tests. | Native JSON auth, Diary read/write, Timeline, Review, Company fixture, logout/expiry, account isolation, admin denial, and uncertain-write outcomes pass at the API boundary. This does not execute React Native UI. |
| Expo package resolution, typecheck, and bundle | Isolated `npm ci` passes. `npm run native:proof:typecheck` passes. `npm run native:proof:compile` exports an iOS bundle (706 modules) and Android bundle (704 modules) through Metro/Hermes. | Expo/Metro source resolution and platform JS bundling are **verified**. This is not an Xcode/Gradle app build or operating-system runtime test. |
| Simulator and physical device | `xcodebuild -version` reports only Command Line Tools, `xcrun simctl list devices available` cannot find `simctl`, and `adb version` reports command not found. | No iOS/Android native runtime or real-device acceptance is established. The proof cannot be called technically proven until a simulator/device run completes. |

The current proof package under `proofs/native` is deliberately outside root `apps/*` workspaces. Its own `package.json` and lockfile reference the shared packages via local `file:` dependencies. `metro.config.cjs` watches the three shared package trees and resolves their `.js` specifiers to TypeScript source. This keeps Expo/React Native out of the root workspace install, root `tsconfig` app include, and API/Web Docker build context. That is the right repository strategy for an integration proof while shared packages remain unpublished source packages.

If this proof becomes the product app, keep it in this monorepo while API contracts and domain code are source-coupled, but add a dedicated native CI lane and release workflow. Before moving it under `apps/native`, explicitly prevent Expo dependencies/builds from entering production API/Web images and make the boundary between native and server workspaces intentional. A separate repository would currently add package publication/versioning work without removing the need to coordinate this API contract.

## RC2 blockers and release decision

The recorded RC2 decision in [`docs/acceptance/rc2.md`](../acceptance/rc2.md) remains **NOT READY** because of its existing P0/P1 release blockers:

- **P0 — Production `/articles`:** the live route was broken at the audited deployment. A source-level configuration fix and local production-artifact check exist, but the live Pod cause is unproven. Only an authorized rollout followed by public smoke can close this blocker.
- **P1 — Hosted Forgejo and staging:** neither hosted CI nor the staging runtime was exercised. Staging remains manual and is not a production-promotion dependency.
- **P1 — Image provenance:** the full-source-SHA registry tag/digest check is not a signed provenance attestation.

This phase also has a **native evidence gate**: both Expo/Metro platform bundles and API acceptance pass, but no iOS/Android simulator or physical-device flow was run. SecureStore persistence, native networking, and OS deep-link dispatch remain unverified. The host only has Command Line Tools; `xcodebuild -version` requires full Xcode, `simctl` is unavailable, and `adb` is absent.

**Final verdict: NOT APP-READY.** The API/shared architecture is a **conditional GO for a future native product phase without backend/JWT rewrite**, based on API acceptance and successful platform bundling. This phase cannot claim “React Native integration has been technically proven” until at least one native simulator/device completes the principal flow. Global RC2 remains **NOT READY**; this audit does not authorize a production cutover.

## Evidence and reproducible checks

Commands run or directly checked for this audit:

| Command / record | Result |
| --- | --- |
| `git rev-parse HEAD` | Baseline `61a6216e657088366015d4bc2327613bfd6c79ae`; tests below ran on the shared worktree based on it. |
| `npm run native:proof:test` | PASS: 2 files, 16 tests covering native-session behavior and the shared source boundary. |
| `npm run native:proof:typecheck` | PASS: Expo proof TypeScript project. |
| `npm run native:proof:compile` | PASS: iOS Hermes bundle (706 modules) and Android Hermes bundle (704 modules), each about 2.3 MB. This is not a native binary or simulator run. |
| `npm run native:api:test` | PASS: 1 PostgreSQL acceptance test against a disposable local database; synthetic users and provider fixture. |
| `npm run test:unit` | PASS: 74 files, 666 tests. |
| `npm run test:integration` | PASS: 63 files, 234 tests against disposable PostgreSQL databases. |
| `npm run lint` / `npm run typecheck` | PASS. |
| `npm run contracts:check` / `npm run manifests:check` | PASS; 8 release manifests validated. |
| `npm run build` | PASS: Web production build, API build, and root typecheck. |
| `npm run test:e2e:release` | PASS: 9 tests against locally built artifacts using synthetic fixtures and a disposable database. The separate historical RC2 report records 9 additional Docker-image release E2E passes. |
| `cd proofs/native && npm ci --workspaces=false --no-audit --no-fund` | PASS: isolated proof dependencies installed from its lockfile. |
| `git diff --check` | PASS. |
| `xcodebuild -version` / `xcrun simctl list devices available` / `adb version` | NOT AVAILABLE: full Xcode and `simctl` are absent; Android `adb` is absent. |
| [`docs/acceptance/rc2.md`](../acceptance/rc2.md) | Historical release gates record lint, typecheck/build, 73 unit files / 661 tests, 62 integration files / 233 tests, contract generation, manifests, restore, Docker API/Web, and Docker-image browser acceptance. Hosted Forgejo, staging, and device evidence remain unverified there. |

Primary evidence paths:

- API auth, CSRF/CORS, error/request IDs, route mounting: `apps/api/src/app.ts`, `apps/api/src/auth-session.ts`.
- Shared transport and request marker: `packages/api-client/src/index.ts`, `packages/api-client/src/native-session.ts`, `packages/api-client/src/request-headers.ts`.
- Contract/OpenAPI definitions: `packages/contracts/src/common.ts`, `ledger.ts`, `diary-list.ts`, `review.ts`, `review-queue.ts`, `company-hub.ts`, `partners.ts`, `post.ts`, `openapi.ts`.
- Date logic: `packages/domain/src/calendar-date.ts`, `packages/domain/src/zoned-time.ts`, `apps/api/src/review-queue.ts`.
- Current native proof: `proofs/native/App.tsx`, `proofs/native/package.json`, `proofs/native/README.md`, `proofs/native/metro.config.cjs`.
- Native results: [`docs/native/native-proof.md`](native-proof.md).
- API regression coverage: `tests/integration/native-session.test.ts`, `native-api-acceptance.test.ts`, `quick-diary-http.test.ts`, `diary-summary.test.ts`, `review-queue.test.ts`, `diary-review.test.ts`, `company-hub.test.ts`, `watchlist.test.ts`, `etf-watchlist-http.test.ts`, `partner-http.test.ts`, `posts.test.ts`, `admin-users-http.test.ts`.
- Architecture policy and release record: `docs/adr/0002-native-session-family-serialization.md`, `docs/adr/0011-native-contract-compatibility.md`, `docs/acceptance/rc2.md`.
- Workspace and production build constraints: root `package.json`, `tsconfig.json`, `Dockerfile`, `.forgejo/workflows/deploy.yml`, `ops/k8s/production/02-api.yaml`.
