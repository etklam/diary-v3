# [39] 管理 scoped API key 並由 Agent 建立 Diary

Status: done
Type: AFK
User stories covered: US-070, US-071, US-074

## Parent

[完整重構 PRD](../PRD.md)

## What to build

由設定建立／查看／撤銷 API key，外部 client 依 key 所屬 User 建立帶來源標示的 Diary，Web 可立即閱讀。

## Acceptance criteria

- [x] key 只顯示原文一次並以 digest 儲存；既有 scope、過期／撤銷及錯誤契約正確。
- [x] Agent 建立依普通 User 權限，禁止 append-to-today，與 cookie／Bearer 混合時符合顯式身份規則。
- [x] 標準 HTTP client 寫入後在 Web 讀到正確作者／來源；invalid key、錯誤 scope 及越權均拒絕。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [05 native-session](05-native-session.md)
- [08 diary-editor](08-diary-editor.md)

## Credential foundation checkpoint

Read frozen api-key.ts, api-key-queries.ts and management handlers. Source has DIARY_CREATE/AGENT_WRITE, random 24-byte hex secret with dva_ prefix, visible first 12 characters, SHA-256 digest, last-used/revoked timestamps and no expiration field. Preserve that observed expiry behavior rather than inventing a TTL.

Added api_key_credentials Drizzle table and migration 0015 with digest uniqueness/format, valid visible prefix, nonblank label, enum scope and owner cascade. Shared strict contracts cover creation, summaries and one-time raw-key response; summaries reject digest/raw-key fields. No authentication path accepts keys yet: this is the storage/contract foundation only.

Disposable PostgreSQL migration test and contract test passed 2/2 (1.37s), covering concurrent duplicate digest insertion, invalid scope/hash/prefix/label, timestamps and owner deletion cascade. Typecheck/lint passed. Remaining: management endpoints/UI, bounded creation rate, explicit credential ambiguity/CSRF rules, key scope and owner enforcement, external Diary writes, no append, revocation and review.

## Management API checkpoint

Added GET/POST /api/api-keys and DELETE /api/api-keys/:id, generated OpenAPI/fetch client and private-response session classification. Creation uses 24 cryptographic random bytes (dva_ hex), stores SHA-256 only, returns raw secret exactly in creation response, and limits creation to 60/user/minute with existing bounded limiter. List SQL explicitly selects summary columns. Atomic owner+active conditional UPDATE gives one successful concurrent revoke and 404 for absent/revoked/foreign IDs. All management responses are no-store and existing cookie CSRF applies.

Real HTTP/PostgreSQL tests passed 2/2 (2.21s), proving digest vs original storage, list secret exclusion, other-owner isolation, concurrent 200/404 revoke, CSRF rejection, unknown privilege field rejection, guest denial, rate limit and recovery after window. Contract generation/typecheck/lint passed. API-key transport is still rejected by current middleware; before enabling it, management routes must remain session-only and generic user routes must not become accessible merely through a key. Key authentication/scopes/Agent routes/UI/review remain outstanding.

## Explicit identity and Agent Diary checkpoint

Authentication now accepts X-API-Key or Bearer dva_ credentials, rejects both headers together, and resolves explicit credentials before cookies. Valid keys populate only apiKey context, never generic user context; existing session-only handlers remain inaccessible. Active digest lookup plus last-used update is one conditional SQL mutation, so revoked credentials cannot be accepted by a stale in-memory lookup. Invalid/revoked explicit keys remain AUTH_TOKEN_INVALID 401 as frozen global auth middleware dictates; database errors are not reclassified as bad credentials. Verified API-key mutations bypass cookie CSRF and do not refresh/change ambient cookies.

Added POST /api/agent/diaries with key-owner attribution and API_KEY/source-label fields using existing transactional Diary writer, same date/ledger validation, duplicate-day conflict and explicit appendToToday rejection. Generated both header and bearer API-key OpenAPI security schemes and fetch operation. Current two scope enum values both authorize Diary creation; stock-only operations in ticket 40 must restrict AGENT_WRITE explicitly.

API-key HTTP suite 3/3 passed, then Web/native/key regression suites 17/17 passed (3.00s). Tests prove mixed-cookie ownership, no fallback on invalid key, ambiguity rejection, header/bearer writes, owner-only read, key cannot access keys/settings/diaries/partners, append rejection, session-only Agent denial, revocation and intact browser session. Typecheck/lint and contract generation passed. Remaining: key management UI and external-to-Web browser demonstration, more scope/credential failure coverage and independent review.

## Management UI and external-to-Web checkpoint

Added /settings/api-keys and Preferences entry with three locales, scope explanations, create/list/revoke, last-used display, one-time in-memory secret, manual-copy fallback, dismiss acknowledgement and unsaved-secret navigation/unload guard. Secret is not persisted to browser storage or returned in subsequent lists. Read/write failures have recovery controls; uncertain create failure instructs list refresh/revocation before retry. Lost revoke response can converge via subsequent 404.

External Playwright HTTP client with no browser cookies created a Diary using a UI-issued key; authenticated Web rendered its content plus newly added API-key source and key label. Both 1440/light and 390/dark browser cases passed (7.1s), proving copied-key fallback, dismissal, no secret after revisit, last-used update, revoke and external write denial. Root inspected both management screenshots in docs/design/evidence/api-keys; no horizontal overflow. Typecheck/lint passed after final source display correction. Initial ambiguous test locator and a JSX closure typo were fixed and full cases rerun.

Remaining: complete error/locale/navigation tests, key scope failure matrix with ticket 40 operations, concurrent authorization/revocation and independent security/design review. Ticket remains in-progress.

## Revocation cutoff evidence

The authentication boundary follows the frozen source semantics: revocation rejects subsequent authentication, while a request whose API key already authenticated may finish. The middleware's conditional credential update closes the lookup/update race; it is not a commit barrier. A real chunked HTTP request paused after authentication, observed through `last_used_at` in disposable PostgreSQL, was revoked through the owner's session, then completed exactly once; the same key's later request returned `AUTH_TOKEN_INVALID` 401 and created no extra Diary. This records the scoped behavior without claiming in-flight cancellation; root acceptance remains pending.

Final focused verification: `npx vitest run tests/integration/api-key-http.test.ts` passed 7/7; `npm run typecheck`, `npm run lint`, and `npm run contracts:check` passed. No new browser matrix or production auth change was introduced.

## Final acceptance evidence

2026-09-06 root acceptance confirmed all three criteria after inspecting the streamed authentication gate, owner revocation, in-flight write, later 401, and zero-extra-row assertions. Disposable PostgreSQL/HTTP evidence covers one-time digest storage, scope and owner isolation, CSRF and explicit-credential rules, Agent attribution, append rejection, external Web readback, concurrent revocation, and the authentication-time revocation cutoff. Root's independent security review found no remaining defect. Ticket 39 is complete; ticket 40 retains its separate prerequisite gate.
