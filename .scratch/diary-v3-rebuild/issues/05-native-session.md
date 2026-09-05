# [05] 以原生 JSON session 讀寫同一篇 Diary

Status: done
Type: AFK
User stories covered: US-003, US-009, US-104, US-105, US-106, US-107, US-108

## Parent

[完整重構 PRD](../PRD.md)

## What to build

由無 DOM client 登入，透過 Bearer 讀寫現有 Diary API，並完成 rotating refresh 與原生 logout。

## Acceptance criteria

- [x] JSON login 不設 auth cookies；refresh 在真 DB 原子 rotation、single winner、family replay，失去 response 的重試遵循 fail-closed。
- [x] 並發 401 只觸發一次 refresh、重試原請求一次；bootstrap 不遞迴續期，第二次失敗清 session。
- [x] 驗證 invalid Bearer 不 fallback cookie、跨 family 隔離、冪等 logout 及既有最多一小時 access-token 有效期；client 無 DOM／server 依賴。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [02 first-diary](02-first-diary.md)

## Verification

- `npm test`: 28 passed, no unhandled errors. Native portion includes 9 real HTTP/PostgreSQL cases and 10 standard-fetch/storage unit cases.
- Real DB tests cover digest-only storage, parent/replacement links, one winner, replay containment, independent families, lost response, idempotent logout, Web credential separation, expired ancestor replay and active expiry. A test-only insert gate forces descendant rotation to overlap replay; family locking prevents a surviving child.
- Generated client composes with native storage/fetch to create/read a real Diary. A corrected real expired-access probe passes: two protected calls with an actually expired signed access JWT succeed after exactly one persisted refresh. The discarded storage-mutation probe was not accepted as evidence.
- `npm run typecheck`, `npm run contracts:check`, production Web/API build passed. No extra migration was needed: existing initial schema already includes native lineage and revocation columns.
- Design/decision: docs/adr/0002-native-session-family-serialization.md. No React Native app, push, or offline write queue was introduced.
- Native logout-one deliberately does not claim immediate access JWT revocation; logout-all belongs to ticket 06.
