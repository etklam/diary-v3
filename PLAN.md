# diary-v3 完整重構計劃

狀態：原始規劃記錄；模組分工與測試範圍已確認，現已依本地 tickets 開始實作。進度以各票驗收證據為準。
盤點日期：2026-09-05。

後續規格：[完整重構 PRD](/Users/klam/Desktop/project/diary-v3/.scratch/diary-v3-rebuild/PRD.md)。使用者已確認沿用本計劃的模組分工及測試範圍；具體驗收以 PRD 為準。

## 1. 目標與已確認範圍

1. 與 diary-vue 所有目前有效功能及業務行為對等。
2. Web 全面改用 React。
3. 資料庫改用 PostgreSQL，schema／查詢採 Drizzle。
4. 現階段不做 React Native App；先提供它可直接使用的 API、原生認證、共用契約及可共用業務邏輯。
5. UI／UX 依 Impeccable 重新設計，舊版視覺不構成限制。
6. 不搬遷舊系統資料；新資料庫由空庫建立。
7. 使用者已確認沿用 Docker／K3s；推播與離線寫入留待 App 階段。

「功能對等」涵蓋使用者操作、權限、資料結果、API、排程、匯入匯出、公開內容及錯誤情境。頁面布局和實作方式可以改；不可在重構中默默刪除功能或改變交易公式。

## 2. 目前基準與限制

- diary-v3 盤點時為空資料夾。
- diary-vue 目前有 43 個 page 檔案、124 個 API handler 檔案；這是盤點入口，不等於 43 項獨立功能或完整驗收結果。
- 來源 HEAD：`72b5bf7bb5cd841eff2fca9795a5fa977bff0196`。
- 來源有未提交的 auth、schema、market jobs、Socket.IO 與其他修正。Phase 0 必須凍結包含這些變更的 worktree 快照，不能只取 HEAD。
- 舊 OpenAPI 主要覆蓋 mobile/core API，並未涵蓋全部 handlers；需另建完整功能矩陣。
- 此次是程式與文件盤點，未執行舊系統整套測試，也未聲稱已完成 runtime 功能對等驗證。

主要證據：

- [現有產品範圍](/Users/klam/Desktop/project/diary-vue/PRODUCT.md)
- [領域語言與規則](/Users/klam/Desktop/project/diary-vue/CONTEXT.md)
- [功能流程](/Users/klam/Desktop/project/diary-vue/docs/WORKFLOWS.md)
- [React Native readiness](/Users/klam/Desktop/project/diary-vue/docs/backend-readiness.md)
- [資料模型](/Users/klam/Desktop/project/diary-vue/prisma/schema.prisma)
- [舊資料庫 migrations](/Users/klam/Desktop/project/diary-vue/prisma/migrations)

## 3. 建議技術架構

TypeScript monorepo，採 npm workspaces 與單一 lockfile。

| 層級 | 建議 | 責任 |
| --- | --- | --- |
| Web | React + React Router framework mode + Vite | 路由、React UI、公開內容 SSR、互動頁面 |
| API | Hono on Node.js | REST、認證授權、業務用例、Socket.IO、排程啟動 |
| Database | PostgreSQL + Drizzle + node-postgres | schema、SQL migrations、查詢、交易與資料約束 |
| Contracts | Zod + OpenAPI | request／response／error 的執行期驗證與對外協議 |
| Client | openapi-typescript + openapi-fetch | 共用 typed fetch client、native refresh 協調 |
| 驗證 | Vitest + Playwright + disposable PostgreSQL | 純邏輯、API／DB 整合、瀏覽器流程 |

React Router framework mode 支援 SSR、client rendering 與 prerender，可用同一個 React Web 保留公開文章的首次 HTML 正文及互動工作區。[官方 rendering 文件](https://reactrouter.com/start/framework/rendering)

Hono 有 Node.js adapter，適合承載獨立的 HTTP API runtime；此次選擇依據是清晰的 API 邊界與自架需求。[官方 Node 文件](https://hono.dev/docs/getting-started/nodejs)

Drizzle 提供 PostgreSQL 欄位與版本化 migrations 工作流；需明確設定日期與 numeric 型別，而非依賴自動序列化。[欄位文件](https://orm.drizzle.team/docs/column-types)、[migrations 文件](https://orm.drizzle.team/docs/migrations)

實作開始時鎖定經相容性檢查的穩定版本；本計劃不預先寫死未驗證的版本組合。

```text
diary-v3/
  apps/
    web/                  React UI、routes、styles、i18n、PWA
    api/
      modules/            按 diary、portfolio、research 等功能組織
      jobs/               排程與 CronJob CLI 入口
  packages/
    contracts/            Zod schemas、API errors、OpenAPI registry
    api-client/           標準 fetch client、single-flight refresh
    domain/               純計算、驗證與狀態規則
    db/                   Drizzle schema、migrations、DB functions
  tests/
    parity/               新舊行為 fixtures 與功能映射
    e2e/                  完整使用者流程
  docs/
    adr/                  需要長期保留的架構決定
```

依賴邊界：Web 和未來 Native 可以引用 contracts、api-client 及適用的純 domain 函式。DB、伺服器憑證、Node-only 模組只供 API／jobs 使用。授權及權威業務驗證仍在 API，不能因共用前端驗證而移走。

Web 的公開 SSR loader 負責取資料與呈現，透過 API 讀取；不建立第二套業務或 session 系統。互動頁面由共用 API client 進入同一套 API。前端共用 state/cache 抽象只在有實際重複需求時提取。

K3s 拓撲：

```text
同一 origin 的 Ingress
  ├─ /api/**、/socket.io/** → API runtime → PostgreSQL
  └─ 其餘網址              → Web SSR runtime → API

Market Rotation CronJob → 同一 API image 的 jobs CLI → 業務函式／PostgreSQL
未來 React Native      → 相同 REST API
```

API 維持模組化單體。一個啟用中的 scheduler／realtime instance；初期部署要避免 rollout 時兩個 scheduler 同時運行。Web 可以獨立部署，API 擴展方式留待有實際需求再決定。

## 4. 初步功能對等範圍

| 功能群 | 必須保留的能力 |
| --- | --- |
| 帳戶與設定 | 註冊、Web 登入登出／續期、原生 session、logout-all、改密碼、角色、語言、時區、既有偏好 |
| 日記 | Markdown、標籤、CRUD、搜尋／篩選／分頁、每日唯一、交易及提醒關聯 |
| Quick Diary | 全域入口、快捷鍵、自由書寫、模板、儲存與追加至當日的既有流程 |
| Overview／Timeline／Calendar | 投資概況、近期活動、日期導覽、日記閱讀、待關注事項、雙人比較入口 |
| Review／Trade Plans | 日記結構化複盤、review queue、thesis review、交易計劃及狀態轉換、日記關聯 |
| Portfolio／績效 | 交易記錄、持倉、估值、成本及損益、曝險／集中度、注意事項、策略績效、交易匯出 |
| Company／Watchlist | 關注清單、Company Hub、Stock Notes、不可變時間線、Investment Thesis、證據收集 |
| Alerts／Discipline | 日記回頭提醒、WEEK／MONTH 重複規則、價格警示、前景即時提示、紀律 CRUD／排序／隨機／分享／匯入匯出 |
| Partner／Agent | 邀請接受與解除、雙向分享設定、Pair View、API key 範圍、外部 agent 寫入及冪等 |
| 市場及工具 | ETF 關注／研究、市場狀態、Market Rotation／歷史快照、部位計算、FIRE、相對價值、季節性、SEC filings 瀏覽／下載／打包 |
| 公開內容與管理 | 首頁、About、使用說明、Articles／Blog、SSR／SEO／sitemap／OG、文章草稿／發布／封存／批次操作、使用者及 ETF 管理、批次觸發 |
| 跨頁體驗與運維 | zh-TW／zh-CN／en、明暗主題、responsive、PWA、權限／錯誤／空狀態、health、logs、CI、備份還原 |

Phase 0 將每一項展開成「舊入口、操作、角色、API、資料規則、新位置、測試、完成狀態」。所有目前有效功能都需要新位置及驗收；只有確認已退役的舊內部實作可不帶入，例如歷史資料修補工具。文件與程式不一致時，先查實際行為；已知 bug 另列，不能當作重寫期間隨意改規格的理由。

## 5. App ready 的具體定義

今期完成：

- REST + JSON 可由普通 fetch 使用，不依賴 React Router loaders/actions、瀏覽器 cookie jar 或 DOM。
- Web 使用 HttpOnly cookie 與 CSRF；Native 使用 JSON token pair、Bearer access 與 rotating refresh token。
- 保留 refresh family／replay detection／single-flight refresh／登出撤銷等行為。
- 明確 Bearer 無效時直接拒絕，不退回有效 cookie；權限由伺服器驗證。
- 共用 client 可注入 base URL、fetch、access-token provider；future native 儲存 token 的平台 adapter 與 API 分離。
- ID 與 persisted Decimal 使用字串；Calendar Date 為 `YYYY-MM-DD`，Instant 為 UTC `Z`。
- 穩定 error code、requestId、分頁及 ownership contract。
- 沿用 `/api/**` 的既有兼容範圍；未來 App 發版落後 backend 時，既有 contract 不原地破壞。
- Socket.IO 用於前景更新提示；重新連線／回到前景後用 REST 重新取得權威資料。
- lint／dependency gate 阻止 shared client/domain 引用 Vue、React DOM、Hono、Drizzle 或 Node-only server 模組。
- 真 API + PostgreSQL 的無 DOM native-client 測試：登入、讀寫日記、並發 401 共用一次 refresh、retry、登出與撤銷。

React Native 階段才做畫面、navigation、Keychain／Keystore 整合、deep-link handlers、APNs／FCM／Expo Push、offline writes 與衝突處理。

共用重點是 contracts、client 和純邏輯。Web HTML／CSS 元件留在 Web；日後原生 UI 依平台實作。語系文字與可攜的 semantic token 值可沿用，無需今期建立空的 mobile app。

## 6. PostgreSQL／Drizzle 設計重點

不搬舊資料讓初始化簡單，但仍要完整重建資料的最終約束。

| 風險 | 計劃 |
| --- | --- |
| Prisma schema 不能反映所有 SQL 約束 | 同時讀 migrations 中的 check、composite FK、trigger；將有效規則寫入新的 Drizzle／custom SQL migrations |
| 金額、價格、數量精度 | PostgreSQL numeric、明確精度與 API string；以既有 fixture 驗證計算及 rounding，不任意轉成 JS Number |
| 日期／時區 | 日記及市場 civil date 採 date；事件時間採 timestamptz；測 DST、跨日及使用者時區 |
| 每日唯一與併發追加 | `(user_id, date)` 唯一約束 + transaction／必要 row lock；測同時建立、追加及交易修改 |
| 交易帳本完整性 | 保留按時間驗證完整帳本與不可超賣等現有規則；日記、交易、提醒關聯修改保持原子性 |
| 使用者隔離 | ownership、同一使用者複合外鍵、伙伴分享 whitelist；交易／持倉／私人 review 不外洩 |
| Refresh token 並發 | 保留原子 claim、single winner、family revoke，改寫 PostgreSQL 錯誤映射 |
| 搜尋及大小寫 | 明確 email／symbol normalization，重做 MariaDB collation／FULLTEXT 等價行為；中文、英文、混合文字搜尋獨立驗收 |
| enums 與缺值 | 對照 wire contract 的大小寫與 lifecycle；unknown／null／缺報價不可被 0 取代 |
| 排程與效能 | 重建索引與分頁查詢，保留觸發順序、冪等鍵、排程單實例與 job 失敗紀錄 |

中文全文搜尋不預設以 PostgreSQL 英文分詞取代舊能力；Phase 0 的搜尋 fixtures 決定最小可行實作及所需索引。

全新初始化只包含系統需要的市場 universe、ETF 定義及安全的管理員建立流程。測試／展示資料使用合成內容。新的 schema migrations 與 PostgreSQL 備份還原仍屬交付範圍。

## 7. UI／UX 計劃

以下是建議的設計起點，並非已實作或已鎖定的視覺規格。Impeccable 的產品事實記錄見 [PRODUCT.md](/Users/klam/Desktop/project/diary-v3/PRODUCT.md)。

**方向：一張清楚、沉著的投資研究桌。** 以文字、日期、投資判斷及資料層次建立辨識度。暖白閱讀面、墨色正文、克制的深綠操作色是候選；漲跌和風險保持獨立語意。數字對齊、表格密度及長時間閱讀優先於裝飾。

| Surface | 模式與設計任務 |
| --- | --- |
| Overview／Timeline | Operate／Read：先看到需要處理的事，再按日期閱讀自己的決策脈絡 |
| Diary composer／Review | Operate：主要編輯區清楚，thesis、risk、execution、事後反思層次分明 |
| Portfolio／Company | Operate：持倉資料密度合理；可由公司進入論點、證據及複盤 |
| Research tools | Operate：先理解輸入及資料時間，再比較結果與限制 |
| Articles | Read：正文、標題、目錄和閱讀寬度為主 |
| 公開首頁 | Persuade：準確呈現產品做得到的工作，使用真實功能或清楚標示的示例 |

初步資訊架構：桌面固定導航，分成總覽、日記、持倉、研究、複盤；伙伴、提醒、紀律、設定及管理仍有清晰入口。Quick Diary 保持全域操作。

桌面可使用「列表／主要內容／上下文」視需要組合；手機改為單欄任務流程、適合觸控的底部導航與記錄入口。寬表格在手機採摘要、展開或可辨識的橫向捲動，保留所有資料與操作。

正式大量建頁前，先完成 Overview、Quick Diary、Company／Review 三條代表流程的設計提案與可互動樣板；同時覆蓋桌面／手機、長內容、零資料、缺報價、載入、錯誤、權限拒絕及長翻譯。視覺工法的選擇在該階段處理。

建立 semantic tokens、表單、表格、導航、dialog、狀態訊息、Markdown 與 chart 容器等實際需要的基礎元件。採 WCAG AA、keyboard／focus、reduced motion 與三語為品質基準。每次完整 UI 交付使用 Impeccable 的有界桌面／手機檢查與獨立 finish review，再記錄實際設計系統。

## 8. 分階段交付

每個功能階段都同時完成 DB、API、React UI 和測試；中途的登入日記骨架只是第一條驗證流程，最終仍須全部功能對等。

| 階段 | 交付 | 通過條件 |
| --- | --- | --- |
| 0：固定基準 | 含未提交變更的來源快照、完整 route／API／排程／資料規則矩陣、可重現 fixtures、已知問題表 | 每個有效功能都有歸屬；來源中的新變更有追蹤方式 |
| 1：端到端基礎 | monorepo、PostgreSQL、migration、API／Web runtime、contracts、雙模式 auth、CI、登入→新增→讀取日記最小流程 | 真 DB + Web + 無 DOM client 都能完成；auth／ownership gate 通過 |
| 2：設計與日記主線 | 代表流程樣板、App shell、Quick Diary、完整 diary authoring、Timeline、搜尋、Calendar、diary review、Trade Plans | 快速記錄到複盤全程可用；併發追加與帳本關聯正確；desktop/mobile 驗收 |
| 3：投資工作流 | Watchlist、Company Hub、Notes／Evidence／Thesis、thesis review、交易、Portfolio、績效、匯出 | 固定 fixtures 的持倉／損益／曝險／績效符合舊語意；缺資料狀態一致 |
| 4：提醒與協作 | Diary alerts、Price Alerts、Discipline、Socket.IO、Partner／Pair View、API keys／Agent ingestion | scheduler 與觸發行為、分享隔離、replay／冪等、斷線回復驗收 |
| 5：研究與公開內容 | Yahoo／ETF／Market State／Rotation、SEC、全部計算工具、Articles／Blog、管理後台 | batch 可重跑、provider 故障／限流／partial data 可處理；公開文章首次 HTML 可讀 |
| 6：完整驗收與交付 | 補齊三語／主題／PWA、全功能 parity、效能與 a11y、K3s manifests、PostgreSQL 備份還原、運維文件 | 全矩陣通過、所有 release gates 綠燈、乾淨環境部署及還原演練成功 |

部署設定與驗證在 Phase 1 就開始，Phase 6 完成正式交付檢查。PWA／三語／主題採每個階段持續支援，不能到最後才補救整個 UI。

## 9. 最終驗收

- 功能矩陣每列有實際證據；不能用「頁面已存在」判斷完成。
- 從舊程式抽取可重現的業務 fixtures／behavior tests，使用固定時鐘及固定行情，在新系統比對。ID 與時間等非決定性欄位只做明確的映射，不忽略有意義差異。
- 真 PostgreSQL 測試：empty migration、約束、transactions、並發、刪除關聯、查詢與 native refresh。
- API 測試：角色、ownership、partner 隱私、Web CSRF、invalid Bearer fail-closed、refresh replay、登出／改密碼撤銷 sockets、pagination、ID／Decimal／日期格式。
- Native-ready 測試直接連新 backend，不只 mock fetch；不要求建立或交付 React Native App。
- Playwright 驗證核心完整流程，並與 API parity 補足所有剩餘功能。
- 公開文章初始 HTML 有正文、title、canonical／meta；關閉 JavaScript 仍可閱讀。
- Yahoo／SEC 使用可控的 upstream fixtures 驗證限流、快取、stale data、下載限制與失敗；CI 不依賴即時市場網路結果。
- PWA 保留安裝及更新能力；個人 API 資料維持 NetworkOnly，不因加入 service worker 導致跨帳號快取或暗中提供離線寫入。
- CI 包含 lint、typecheck、build、contracts／client drift、domain tests、PostgreSQL integration、核心 E2E；發布由這些結果把關。
- 以代表性大型日記、長時間序列、分頁及市場資料測量效能；Phase 0 建立基線及門檻，避免現在捏造時間保證。
- 自架環境提供 health／readiness、結構化 requestId／jobId logs、migration Job、單實例 scheduler、備份還原與發布回復流程。

## 10. 本輪決策狀態

已確認：React、PostgreSQL／Drizzle、完整功能對等、UI／UX 可重設計、不搬舊資料、Docker／K3s、推播及離線寫入延後。

本計劃建議：React Router framework Web + Hono API 的 TypeScript monorepo；按完整功能流程逐階段交付；正式 coding 從 Phase 0／1 開始。

尚待實作階段落實：相容套件版本、視覺樣板、完整逐項 parity 清單、效能基線與公開品牌名稱。這些不影響本輪計劃的範圍，不能視為已完成。
