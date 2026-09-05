# [40] 讓 Agent 發佈冪等股票研究並經 Partner 閱讀

Status: done
Type: AFK
User stories covered: US-049, US-050, US-072, US-073, US-074

## Parent

[完整重構 PRD](../PRD.md)

## What to build

讓外部 Agent 讀取獲授權 Watchlist、更新 Stock Note 及批次寫入 Stock Timeline Record，並按分享設定在 Web 回看。

## Acceptance criteria

- [x] 既有批次上限、source vocabulary、key owner、scope 與 idempotency key 範圍全部驗證。
- [x] 重試不重複、部分無效資料依既有原子性／錯誤契約處理，不改寫不可變證據。
- [x] 由真外部 client 寫入至本人 Company／Partner 允許入口可示範，關閉分享後不可讀。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [25 evidence-timeline](25-evidence-timeline.md)
- [38 pair-view](38-pair-view.md)
- [39 api-keys](39-api-keys.md)

## Agent notes/watchlist checkpoint

Read frozen Agent stock routes and query modules. Added AGENT_WRITE-only GET /api/agent/stocks/watchlist and POST /api/agent/stocks/:symbol/notes. Watchlist preserves flat {watchlist:[id,symbol,name,sortOrder,status]} response, active-only ordering and 100 cap. Notes preserve the source create-only POST behavior, canonical symbol normalization, owner auto-watch, AGENT/source label and precise dates. Ordinary Web note edits remain forbidden for Agent notes. Both operations have runtime/OpenAPI/fetch contracts and canonical AUTH_API_KEY_SCOPE_DENIED 403.

API-key HTTP suite passed 4/4 (3.46s): diary-only scope rejected on both routes, other owner watchlist excluded, Agent source label/date retained, Web edit denied, Partner requires accepted+owner flag and loses access after revocation. Contract generation/typecheck/lint passed.

Next: batch records. Frozen source sequential upsert overwrites existing evidence, conflicting with this ticket’s explicit immutable-evidence requirement; preserve idempotency scope (owner, stock, key) but prevent retry mutation, recording this as an intentional correction. Need inspect full batch contract limits/vocabulary and add atomicity/retry/browser verification. Independent review and full prerequisites remain pending; this checkpoint does not mark ticket done.

## Immutable Agent batch checkpoint

Added POST /api/agent/stocks/records, runtime schemas and generated fetch/OpenAPI. Preserves frozen 1–100 batch bound, six Agent source types, optional source metadata, target-owner active watchlist membership and source-Diary ownership skips. Entire payload validates before transaction. Owner watchlist advisory lock stabilizes membership against archive/reorder; owned source Diary key-share locks avoid deletion between validation and FK insert. Database uniqueness scopes idempotency to owner/stock/key; ON CONFLICT DO NOTHING preserves existing evidence. Replays use skipped ALREADY_EXISTS and updated remains empty.

Intentional correction from frozen sequential upsert: immutable evidence never changes on retry; unexpected write failure rolls back the accepted batch rather than leaving partial inserts. Semantic ineligible rows still skip independently as before.

HTTP/PostgreSQL suite passed 5/5 (3.23s): simultaneous retries create one row, changed replay cannot overwrite, same key on another stock/owner succeeds, missing-watchlist and foreign-source skips, rejected extended source vocabulary/empty/101-item batches, whole-payload validation before writes and injected second-insert failure rolls back the first. Contract generation/typecheck/lint passed. Remaining: exact 100 and full source vocabulary boundaries, Web/Partner batch demonstration, scope/revocation matrix, independent review.

## Batch boundaries and Company readback checkpoint

Agent source schema now reuses existing agentAllowedSourceTypeSchema rather than duplicating its vocabulary. Exact 100-item batch across all six permitted source types succeeds with 100 distinct IDs; replay yields 100 skips and unchanged count. All four extended domain-only source types reject, as does DIARY_CREATE on the batch route. HTTP suite passed 6/6 (3.54s).

Expanded desktop/mobile external-client browser cases passed 2/2 (9.0s): UI-issued AGENT_WRITE key creates Diary, publishes attributed company note, inserts evidence, retries changed content, and Web Company displays one unchanged evidence item plus read-only Agent note. Key revocation still rejects external Diary writes. Corrected a test-only scope selector to its observed accessible combobox role after initial timeout. Typecheck/lint and contracts:check passed. Remaining: external Agent-to-Partner browser journey, broader auth/revocation interleavings and independent review.

## Agent-to-Partner and broad regression checkpoint

Expanded dual-account Partner browser case creates an AGENT_WRITE credential owned by the publishing partner, uses a separate cookieless HTTP context to publish both note and evidence, and reads only the note through the recipient’s sharing selector. Agent source label appears; recipient evidence collection remains empty and private evidence text is absent. Existing stop-sharing flow removes the Agent note. Partner browser suite passed 2/2 (9.7s).

After recent auth/partner/Agent changes, full Vitest regression passed 72 files / 476 tests (22.57s), and production Web client/SSR/API build passed. These prove current tested behavior, not completion of all tickets or independent review. Remaining ticket acceptance includes authorization/revocation interleavings and independent review; wider project work proceeds with ETF Catalog ticket 41 next.

## Revocation cutoff evidence

The shared API-key authentication boundary uses the frozen authentication-time cutoff for Agent stock capabilities as well: owner revocation rejects later key authentication, but does not cancel a request that authenticated before revocation. The controlled real HTTP/PostgreSQL interleaving fixture is recorded in ticket 39 and the ADR; existing Agent scope, owner, immutable-retry and Partner browser evidence remains unchanged. No two-account browser smoke or in-flight cancellation claim is added; root acceptance remains pending.

Final focused verification: `npx vitest run tests/integration/api-key-http.test.ts` passed 7/7; `npm run typecheck`, `npm run lint`, and `npm run contracts:check` passed. Root accepted the independent review and the completed prerequisite gates 25, 38 and 39 on 2026-09-06. No two-account browser smoke claim is added; owner isolation is proven by the real HTTP/PostgreSQL fixtures and the external Agent-to-Partner browser flow. Ticket 40 is complete.

## Final acceptance evidence

Root accepted all three criteria on 2026-09-06. Evidence includes the 7/7 API-key/Agent HTTP suite, exact batch/source/idempotency/atomicity coverage, existing external-client Company and Partner browser flows, revocation-cutoff proof, and the final green global typecheck/lint/contracts gate. Ticket 40 is complete.
