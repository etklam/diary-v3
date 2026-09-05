# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

使用者已指定 React Web、PostgreSQL、Drizzle，並確認沿用 Docker／K3s 部署。
未來 App 預計採用 React Native；現階段不建立 App。
已開始建立 React Router Web、Hono API 及共用 contracts／client 的 TypeScript monorepo。

## Users

沿用 diary-vue 現有產品服務的投資日記使用者。
依現有程式與產品文件，主要情境為盤中快速記錄、追蹤投資判斷、整理交易與持倉、盤後及定期複盤。
使用者年資與對外品牌名稱尚未重新定義；不沿用舊文件互相不一致的年資描述。

## Product Purpose

完整重構 diary-vue，保留所有目前有效的產品功能與業務行為。
日記、交易、投資論點、研究證據、提醒和複盤共同構成可回看的投資決策脈絡。
功能範圍以來源程式、API contracts 與驗收案例為依據，不以頁面數或歷史計劃文件代替。

## Operating Context

- Web 需支援桌面與行動瀏覽器。
- 既有能力包括日記、Timeline、Calendar、Reviews、Trade Plans、Portfolio、Company Hub、Watchlists、研究工具、伙伴分享、Agent API、公開文章及管理後台。
- 保留現有三語（zh-TW／zh-CN／en）、明暗主題、時區設定、PWA 與公開內容 SEO 能力。
- 以上能力由 diary-vue 現有程式與產品文件盤點；完整逐項驗收矩陣在計劃 Phase 0 建立。

## Capabilities and Constraints

- 功能與 diary-vue 完全對等，UI／UX 由 Impeccable 重新設計。
- 不需要從舊系統搬遷使用者資料；新系統從空 PostgreSQL 資料庫初始化。
- 新系統仍需版本化 schema migrations、必要系統種子資料與備份還原能力。
- App ready 今期涵蓋共用 API、可共用的業務邏輯、原生登入與續期。
- 使用者已確認：推播及離線寫入留待 React Native 階段。
- 使用者已授權依本地 tickets 並行實作，並明確要求順手修正舊 bug 及技術債；保留功能意圖，不重現錯誤。

## Brand Commitments

使用者明確允許替換既有 UI／UX，未指定需要沿用的配色、字體或視覺系統。
diary-v3 是目前專案名稱；對外產品名稱仍待定。

## Evidence on Hand

- 來源：`/Users/klam/Desktop/project/diary-vue`。
- 產品及領域文件：來源專案的 PRODUCT.md、CONTEXT.md、docs/WORKFLOWS.md。
- 實作：pages、server/api、lib、prisma/schema.prisma、tests。
- App contract：docs/backend-readiness.md、lib/contracts、lib/api-client、openapi/openapi.json。
- 現有 UI 證據：layouts/default.vue、pages/timeline/index.vue、assets/css/design-tokens.css。
- 2026-09-05 盤點時來源 worktree 有未提交變更，不能單以 HEAD 代表功能基準。

## Product Principles

1. 功能對等須由行為與測試證明。
2. 快速記錄維持低摩擦，閱讀、管理與複盤各有清晰入口。
3. 交易結果、時區及分享權限保持一致。
4. API 是 Web 與未來 App 的共同業務入口。
5. 可共用邏輯保持獨立於 Vue、React DOM 和 native 平台。

## Accessibility & Inclusion

既有產品文件以 WCAG AA、鍵盤操作、螢幕閱讀器及 reduced motion 為基準。
重設計計劃保留這些能力，並驗收三語、長內容與行動操作。
