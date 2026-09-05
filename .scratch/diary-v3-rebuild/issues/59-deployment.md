# [59] 在隔離 K3s 部署並更新完整運行路徑

Status: done
Type: AFK
User stories covered: US-109, US-110, US-111, US-113

## Parent

[完整重構 PRD](../PRD.md)

## What to build

從 Docker images 與空 PostgreSQL 部署同 origin Web／API 及市場 CronJob，驗證登入寫日記、前景提醒與批次結果。

## Acceptance criteria

- [x] 版本化 migrations／必要 seed、安全設定、health／readiness 及 requestId／jobId logs 可觀察。
- [x] API 只有一個啟用的 scheduler／realtime instance，更新策略避免重疊；CronJob 與手動觸發共用用例。
- [x] 在隔離環境部署與更新後三條完整流程可重現；發布門檻失敗阻止交付，不要求直接操作使用者正式環境。

## Implementation evidence (Luna, pending Astra/root acceptance)

- Production API/Web multi-stage images use named runtime entrypoints
  `server.js`, `rotation.js`, `market-state.js`, `migrate.js`, and
  `seed-system.js`; the CronJob calls the matching names and keeps the frozen
  `30 21 * * 0-5` UTC schedule with `Forbid` overlap policy.
- Isolated Compose smoke evidence is recorded in
  [`docs/operations/deployment-59-smoke.md`](../../../docs/operations/deployment-59-smoke.md).
  It covers the dedicated Postgres volume, migration/seed, health/readiness,
  request ID, synthetic login/Diary write/read, fixture batch persistence,
  final image update, and retained-secret login/write proof.
- The local K3s path is guarded by an explicit context and creates credentials
  only on first setup. Existing complete DB/JWT Secrets are retained; partial
  Secrets fail closed. `ops/k3s/create-tls-secret.sh` creates only a short-lived
  disposable local TLS Secret.
- A required production-image CI job is gated on the existing first-diary gate;
  a failed prerequisite prevents the image job from running.
- Actual isolated K3s evidence now supplements the Compose smoke: production
  TLS Ingress health/readiness/SSR, Secure-cookie login/Diary write/read,
  WebSocket `alert:triggered`, transport-loss REST recovery, polling reconnect,
  controlled-fixture batch persistence, and API `Recreate` update with one
  available pod are recorded in the linked evidence document. The temporary
  K3s kubeconfig was kept outside the normal user context.

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [33 realtime](33-realtime.md)
- [43 rotation-snapshot](43-rotation-snapshot.md)

## Astra acceptance — 2026-09-06

Accepted the isolated production-mode K3s/TLS proof recorded in deployment-59-smoke.md: Secure sessions and persisted Diary operations, WebSocket delivery and REST reconnect recovery, fixture batch results, and single-instance Recreate update. Earlier source review resolved runtime entrypoint and retained-secret defects. Final full-schema deployment/restore integration remains ticket61; no production cutover was performed.
