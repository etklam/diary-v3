# Native Integration Proof

Date: 2026-09-13

Baseline repository HEAD: `61a6216e657088366015d4bc2327613bfd6c79ae`. Results below were produced from the shared working tree based on that HEAD; the changes and this report were uncommitted when tested.

## Runtime and environment

The proof is an isolated Expo-managed React Native project in `proofs/native` with Expo SDK `~57.0.0`, React Native `0.86.0`, React `19.2.3`, and Expo SecureStore `~57.0.4`. The proof has direct local-file dependencies on `@diary/contracts`, `@diary/api-client`, and `@diary/domain`. It is outside the root npm workspaces.

Metro exported iOS and Android Hermes JavaScript bundles. This verifies source resolution and platform bundling; it is not an Xcode/Gradle native binary build or device run. The host has Command Line Tools but no selected full Xcode installation (`xcodebuild -version` fails), no `simctl`, and no `adb`. iOS Simulator, Android Emulator, and physical-device execution are **NOT VERIFIED**.

API acceptance tests run against a Hono server bound to loopback and a uniquely provisioned disposable PostgreSQL database. The test uses two synthetic accounts, a controlled NVDA quote fixture, and no production API or external market provider. The standalone Expo app accepts `EXPO_PUBLIC_API_BASE_URL`; local iOS Simulator uses `http://127.0.0.1:3101`, Android Emulator uses `http://10.0.2.2:3101`, and non-development builds reject non-HTTPS origins.

The app source stores the complete native access/refresh pair as one JSON value in Expo SecureStore. No authentication secret is stored in AsyncStorage. The API acceptance test exercises the shared adapter with in-memory storage, and the Metro bundles include the SecureStore integration, but actual Keychain/Keystore persistence and cold-start restoration are **NOT VERIFIED** without a native runtime.

## Flow results

| Flow | Result | Evidence and limit |
| --- | --- | --- |
| Login | **PASS — API acceptance** | Synthetic account A logs in through the native JSON session endpoint and receives a bearer access/refresh pair. The Expo UI is typechecked and bundled but not launched. |
| Session restore | **PASS — adapter/API acceptance; native storage NOT VERIFIED** | A newly created session adapter reads the persisted test pair and successfully calls `GET /api/auth/me`. The test uses memory storage; SecureStore cold start remains unverified. |
| Quick Diary save and read | **PASS — API acceptance** | A validated `YYYY-MM-DD` date, Markdown body, tag, and symbol round-trip through `POST /api/diaries` and detail read. The Diary appears in Timeline. |
| Network failure on read | **PASS — API acceptance; native UI NOT VERIFIED** | A synthetic Timeline transport failure surfaces as a network error and leaves the session pair unchanged. The Expo source places the error in its visible alert state; the screen was not run. |
| Network failure before request | **PASS — API acceptance** | A synthetic transport failure causes one POST attempt, retains the exact request draft and session, and leaves Timeline empty. No automatic retry occurs. |
| Server commit with response loss | **PASS — API acceptance; manual retry is not duplicate-safe** | The transport commits a Diary and drops its response. Exactly one POST is issued; the row exists in PostgreSQL and appears in Timeline. The draft remains available and the proof tells the user to check Timeline before acting. There is no idempotency key, so the proof does not claim a manual retry is duplicate-safe. |
| Expired session while writing | **PASS — API acceptance; UI response is source/bundle only** | The adapter/API test shows one opted-in POST receives `401 AUTH_TOKEN_INVALID` without replay and keeps its test pair until logout is explicitly called. In the Expo source, the app handles that 401 by clearing SecureStore, returning to login, and retaining the same account's in-memory draft for an explicit later action. The screen flow was not run. |
| Timeline and detail | **PASS — API acceptance** | The saved Diary is returned in the summary list and the owner-scoped detail endpoint returns the same ID, civil date, body, and symbol. |
| Review Queue and Diary Review | **PASS — API acceptance** | The Diary enters the queue, a structured review is written and read back from the API, and the queue moves it into completed. |
| Company context | **PASS — controlled fixture** | Authenticated NVDA context returns the fixture quote (`140 USD`) and related Diary. Account B receives no related private Diary data. No live provider is used. |
| Logout and token expiry | **PASS — API acceptance** | Logout clears the local pair and revokes its refresh family. A separately copied access token remains valid immediately after logout, then returns `401 AUTH_TOKEN_INVALID` after the test clock advances 61 minutes. |
| Account isolation and authorization | **PASS — API acceptance** | Account B sees an empty Diary list and review queue, receives `404` for A's Diary, and sees no related Diary in Company context. A normal `USER` receives `403 AUTH_FORBIDDEN` for `POST /api/blog`. |
| Account-owned app state | **PASS — source/typecheck/bundle; runtime NOT VERIFIED** | The proof binds private views and drafts to the authenticated owner, clears them on account change, and preserves the same owner's draft after a marked 401 while clearing local session credentials. No native UI session was run. |
| Deep link | **PASS — source/typecheck/bundle; OS routing NOT VERIFIED** | The proof accepts only `diary-v3://diaries/<positive-id>` and resolves through the owner-scoped API. iOS/Android scheme dispatch has not been run. |
| SecureStore | **PASS — source/bundle; platform behavior NOT VERIFIED** | The token pair is wired to Expo SecureStore as one value. Keychain/Keystore persistence, reinstall behavior, and cold launch require simulator/device evidence. |

## Commands and results

All commands ran from the repository root unless stated otherwise.

| Command | Result |
| --- | --- |
| `cd proofs/native && npm ci --workspaces=false --no-audit --no-fund` | PASS; installed the isolated lockfile, including direct `openapi-fetch` dependency. |
| `npm run native:proof:test` | PASS; 2 files, 16 tests (native-session and shared-package boundary). |
| `npm run native:proof:typecheck` | PASS. |
| `npm run native:proof:compile` | PASS; iOS bundle (706 modules, 2.3 MB) and Android bundle (704 modules, 2.3 MB), exported under `/tmp/diary-native-proof-export/`. |
| `npm run native:api:test` | PASS; 1 file, 1 API acceptance test against disposable local PostgreSQL. |
| `npm run test:unit` | PASS; 74 files, 666 tests. |
| `npm run test:integration` | PASS; 63 files, 234 tests. |
| `npm run lint` | PASS. |
| `npm run typecheck` | PASS. |
| `npm run contracts:check` | PASS. |
| `npm run manifests:check` | PASS; 8 release manifests. |
| `npm run build` | PASS; Web production build and API build. |
| `npm run test:e2e:release` | PASS; 9 tests against locally built artifacts with synthetic accounts and a disposable database. |
| `xcodebuild -version` | NOT AVAILABLE; active developer directory is Command Line Tools, not full Xcode. |
| `xcrun simctl list devices available` | NOT AVAILABLE; `simctl` is absent. |
| `adb version` | NOT AVAILABLE; `adb` is absent. |

## Architecture conclusion

The tested API and shared packages support the core native boundary without a backend rewrite or a JWT rewrite. Native JSON login/refresh/logout, injected bearer transport, shared runtime contracts, owner-scoped Diary/Review/Company routes, and explicit civil-date semantics worked in the disposable API acceptance test. Web cookie/CSRF behavior was not weakened, and the proof does not use CORS or client-supplied identity headers as authorization.

This is API acceptance plus Expo/Metro compile evidence, not proof that React Native's runtime networking, SecureStore, deep-link dispatch, or native UI lifecycle works on an operating system. The project requirement reserves “React Native integration has been technically proven” for a simulator/device run; that claim is **NOT VERIFIED**.

The proof stays under `proofs/native` because root workspaces are `apps/*` and `packages/*`, while the API/Web Docker build inputs and root TypeScript project exclude `proofs`. This permits direct source imports from shared packages without adding Expo/RN to the production app workspaces or build. If a product app starts, keep this monorepo structure while shared packages remain source-coupled and add a separate native CI/release lane; reconsider a separate repository only if native release lifecycle or package publication becomes independent.

No API route, backend authentication protocol, production manifest, or deployment target changed in this proof phase. The shared client gained an explicit no-automatic-session-retry marker for uncertain writes and safe bootstrap error mapping; Web session behavior continues to use the same adapter contract. No production cutover was performed.
