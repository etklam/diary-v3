# [58] 安裝及更新 PWA 並隔離私人 API 資料

Status: done
Type: AFK
User stories covered: US-101

## Parent

[完整重構 PRD](../PRD.md)

## What to build

讓使用者安裝 PWA、更新版本並繼續使用 Diary，service worker 只按既有策略快取允許資源。

## Acceptance criteria

- [x] manifest、install／update 流程及靜態資源策略可重現。
- [x] 個人 API 維持 NetworkOnly，登出或切換帳戶後不能讀到前一帳戶快取。
- [x] 瀏覽器實測安裝／更新、斷網讀取限制與重新連線；不加入離線寫入或背景同步。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [07 preferences](07-preferences.md)
- [08 diary-editor](08-diary-editor.md)

## Installed/mobile shell direction

Complete the module-scaled navigation using [Astra's complete-navigation brief](../../../docs/design/complete-navigation-brief.md). The initial shell's mobile list now occupies the first screen; the completed shell must keep all routes reachable in an accessible Menu dialog and preserve Quick Diary, preferences, role checks and logout. This is UI completion alongside PWA installation, not a change to caching or offline-write scope. Browser navigation helpers must accommodate the dialog while preserving existing behavioral assertions.

## Current evidence (pending root acceptance)

- `tests/unit/pwa.test.ts`: 2/2 passed.
- `tests/e2e/pwa.spec.ts`: 3/3 focused cases passed in installed Chrome, including Chrome manifest/installability inspection, guest public routes, static offline recovery, private API NetworkOnly behavior, authenticated mobile Menu route navigation, Escape focus return, translated menu, page-overflow check, and a controlled v1 → waiting v2 → user Apply → active worker update that preserved an unsaved diary title.
- Screenshots: `docs/design/evidence/pwa/1440.png`, `docs/design/evidence/pwa/390.png`.
- The update lifecycle uses `apps/web/public/sw-update-v2.js` as a synthetic browser fixture; it does not add offline writes or background sync.
- No offline writes or background sync were added. Root still owns final status/checks after reviewing the evidence.

## Astra acceptance — 2026-09-06

Accepted Chrome manifest/installability, private NetworkOnly/static-cache checks and compact-navigation evidence (2/2, 9.6s), plus the isolated update lifecycle case (1/1, 8.0s) activating waiting v2 through the real Apply button while retaining the unsaved Diary title. Astra inspected desktop/mobile captures and reviewed the bounded static-cache and explicit-update corrections. No repeated cosmetic checks.
