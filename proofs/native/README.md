# Native integration proof

This isolated Expo-managed React Native app exercises the current API, native session, shared contracts, and domain packages. Its dependencies and lockfile stay under `proofs/native`; the repository Web/API workspace and production images do not install Expo or React Native.

The proof targets Expo SDK 57. Expo's current [SDK reference](https://docs.expo.dev/versions/latest/) lists React Native 0.86 and React 19.2.3 for SDK 57. Secure token pairs use [Expo SecureStore](https://docs.expo.dev/versions/v57.0.0/sdk/securestore/) `~57.0.4`, which stores values through iOS Keychain and Android Keystore-backed storage.

## Run

Install dependencies from this directory:

```sh
cd proofs/native
npm ci --workspaces=false
```

Set an absolute API origin in `EXPO_PUBLIC_API_BASE_URL`. The API server defaults to port `3101`; for an iOS Simulator talking to a local API, use `http://127.0.0.1:3101`, and for an Android Emulator use `http://10.0.2.2:3101`. A gateway running on port `8080` is separate from the API server. Staging must use its HTTPS origin. A non-development Expo build rejects non-HTTPS API origins.

```sh
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:3101 npm run start -- --clear
npm run typecheck
```

From the repository root, `npm run native:proof:test` runs the shared native-session and package-boundary tests, `npm run native:proof:typecheck` checks the app, and `npm run native:proof:compile` exports iOS and Android native bundles through Expo/Metro. These checks are separate from the production Web/API build. `npm run native:api:test` runs the focused disposable-PostgreSQL API acceptance test.

Use the Expo CLI's `i` or `a` key to launch an installed iOS Simulator or Android Emulator, or run `npm run ios` / `npm run android` with the API origin set in the environment. The app must run in the native simulator; Expo Web is not evidence for this proof.

## Flows

Login uses the API's native token pair and persists the pair as one SecureStore value. Startup restores through authenticated `GET /api/auth/me`; reads may use the shared single-flight refresh behavior. Logout clears local credentials, and explicit account switching also clears the in-memory Quick Diary draft.

Quick Diary, Review Queue, structured Diary Review, Timeline, and read-only NVDA Company context use the typed shared API client and runtime contracts. An empty Quick Diary starts with the authenticated account's timezone date. Private view state and the draft track their account owner, so restore binds them to the session owner and switching accounts clears the previous user's records. The small UI uses the semantic graphite/blue roles, 16px phone gutter, and 48px touch targets from the project design direction. The diary body is Markdown source displayed as plain React Native text. It is data, not HTML; this proof does not embed a WebView or port the Web renderer.

Quick Diary and Review writes carry the shared no-automatic-session-retry marker; neither is automatically replayed. If a Quick Diary POST loses its response, the outcome is unconfirmed and the API may already have committed the Diary. Check Timeline before deciding whether to press Save again. This proof has no idempotency key and cannot claim a manual retry is duplicate-safe. A marked 401 logs out the session while retaining the draft, then returns to login. After signing in, check Timeline before deciding whether to save again.

The only accepted deep link is `diary-v3://diaries/<positive-id>`. The destination remains pending while the user signs in, then opens through the owner-scoped Diary API. Other schemes, hosts, paths, query strings, and fragments are ignored.

Quick Diary draft and private view state each track their account owner. Restore and first login bind the state to the authenticated user; a different account clears the previous user's draft, Timeline, selected Diary, Review state, and Company context. A same-account re-login after 401 keeps its draft. Drafts are memory-only and are not claimed to survive app termination.
