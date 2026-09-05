# PRD：diary-v3 完整重構與 React Native readiness

Status: ready-for-agent

日期：2026-09-05

工作項目類型：完整產品重構

追蹤方式：Local Markdown（使用者已確認）

決策狀態：使用者已確認沿用重構 Plan 的模組分工，以及業務模組、API、PostgreSQL、原生 client 和主要 UI 流程的測試範圍。本 PRD 可供後續拆分實作工作項目；狀態不表示產品已完成或已通過驗收。

## Problem Statement

使用者希望完整重構現有 diary-vue 投資日記產品，將 Web 改為 React、資料庫改為 PostgreSQL 與 Drizzle，並在現階段為未來 React Native App 準備可直接使用的 API 和共用業務能力。

產品已超過單純日記 CRUD 的範圍：使用者會記錄市場觀察、保存交易前判斷、追蹤 Transaction 與 Portfolio、研究 Company、管理 Investment Thesis、安排 Review、接收 Alert，以及與真人或 AI Agent Partner 交流。若只翻寫畫面，可能遺失交易計算、分享權限、排程、API、搜尋、匯出及原生認證等重要行為。

現有 Nuxt／Vue 與 MariaDB／Prisma 的實作方式不符合本次指定技術方向。使用者亦希望全面重設計 UI／UX，提升桌面密集資料操作、手機快速記錄及長時間閱讀的體驗，同時保留目前有效功能。此次不需要搬遷舊使用者資料。

## Solution

建立以 React 為 Web 介面、PostgreSQL／Drizzle 為持久層的投資決策工作台。所有平台經同一套業務 API 完成操作，純計算與資料契約可共用，UI 按 Web 與未來 Native 的平台需要分別實作。

- 完整保留來源基準中的有效功能、資料結果、權限與外部協議；以功能矩陣和可重現測試證明對等。
- 維持 Diary 為核心的寫入模型，支援「快速記錄 → 原始判斷與交易 → 回看證據 → Review → Portfolio Decision」的流程。
- 依 Impeccable 重設計整體資訊架構、操作及閱讀體驗，持續支援桌面、手機、三語、明暗主題及 PWA。
- 提供 Web cookie session、Native Bearer session、typed fetch client 和穩定 API contract，今期不建立 React Native App。
- 沿用 Docker／K3s 自架環境，從空 PostgreSQL 初始化，具備可重複部署、schema migrations、備份還原及發布驗收。

## User Stories

### 帳戶、認證與設定

1. 作為投資日記使用者，我希望註冊帳戶並以電子郵件和密碼登入，以便管理自己的 Diary 與投資資料。
2. 作為 Web 使用者，我希望有效 session 能在重新載入與 access token 到期後按既有規則恢復，以便持續操作。
3. 作為使用者，我希望登出目前使用中的 client，以便結束本機存取並依既有 session 規則撤銷續期能力。
4. 作為使用者，我希望登出所有裝置，以便撤銷所有 session 和既有 access token 的後續使用。
5. 作為使用者，我希望修改密碼並撤銷舊登入狀態，以便保護帳戶。
6. 作為使用者，我希望切換繁體中文、簡體中文及英文，以便使用熟悉的語言完成所有流程。
7. 作為跨時區使用者，我希望設定自己的時區，以便 Calendar、Timeline、Review 和提醒按各自既有日期規則呈現。
8. 作為使用者，我希望保留現有個人偏好及投資相關設定，以便新系統提供相同的個人化行為。
9. 作為使用者，我希望登入錯誤、過期及權限不足有清楚提示，以便知道應重試、重新登入或停止操作。
10. 作為一般使用者，我希望其他帳戶及管理員專用能力有正確的權限邊界，以便我的資料與操作身份受到保護。

### Diary 與 Quick Diary

11. 作為使用者，我希望即使當天沒有 Transaction 也能建立 Diary，以便持續記錄市場觀察與心態。
12. 作為使用者，我希望以 Markdown 撰寫標題及內容並正確閱讀格式，以便保存完整的判斷與證據。
13. 作為使用者，我希望新增及整理 Diary 標籤，以便日後分類與查找。
14. 作為使用者，我希望為指定日期記錄 Diary，並維持每人每天一篇的規則，以便當日記憶不被分散。
15. 作為盤中使用者，我希望由全域入口或既有快捷鍵開啟 Quick Diary，以便快速捕捉想法。
16. 作為使用者，我希望在自由書寫與現有 Quick Diary 模板之間切換，以便按當下情境開始記錄。
17. 作為使用者，我希望將新內容追加至當日 Diary，並在同時提交時保留所有有效內容，以便不因併發操作失去記錄。
18. 作為使用者，我希望修改 Diary 內容、標籤和相關資料，以便整理已有記錄。
19. 作為使用者，我希望按既有確認流程刪除 Diary，並在破壞交易帳本時收到拒絕原因，以便安全管理資料。
20. 作為使用者，我希望在 Diary 內新增、修改和刪除 BUY／SELL Transaction，以便把實際交易與當時判斷放在一起。
21. 作為使用者，我希望把 Alert 關聯至 Diary，以便在適當時間回頭閱讀。
22. 作為使用者，我希望搜尋、篩選及分頁瀏覽完整 Diary 資料庫，以便找回指定內容。

### Overview、Timeline 與 Calendar

23. 作為已登入使用者，我希望 Overview 顯示 Portfolio、待關注事項及待 Review 項目，以便迅速決定下一步。
24. 作為使用者，我希望按日期連續閱讀 Timeline，以便回看投資決策如何發展。
25. 作為使用者，我希望使用 Calendar 查看及進入指定日期的 Diary，以便按時間定位記憶。
26. 作為使用者，我希望在近期活動中進入相關 Diary、Company、Thesis 或 Review，以便保留操作脈絡。
27. 作為使用者，我希望清楚分辨近期變化、逾期事項及即將到期的 Review，以便安排跟進次序。

### Review 與 Trade Plan

28. 作為使用者，我希望保存交易前的 thesis、risk 和 execution，以便日後能辨認原始判斷。
29. 作為使用者，我希望為需要跟進的 Diary 設定 Review 日期，以便系統將它放進適當的複盤隊列。
30. 作為使用者，我希望 Review Queue 同時提供 Diary 與 Investment Thesis 的複盤入口，以便集中處理待辦。
31. 作為使用者，我希望用 outcome、summary、learning 和 adjustment 完成結構化 Diary Review，以便從決策中取得可行的反思。
32. 作為使用者，我希望修改既有 Diary Review，而原始交易判斷仍清楚可辨，以便補充反思而不混淆前後觀點。
33. 作為使用者，我希望私人 Review 文字只由本人讀取，以便放心記錄完整反思。
34. 作為使用者，我希望建立含進場區間、停損、目標、部位限制及失效條件的 Trade Plan，以便在執行前清楚定義風險。
35. 作為使用者，我希望按既有生命周期更新 Trade Plan 狀態，以便分辨構思、執行及後續結果。
36. 作為使用者，我希望將 Trade Plan 關聯到自己的 Diary，以便從計劃回看實際記錄。
37. 作為使用者，我希望搜尋或按既有條件篩選及分頁瀏覽 Trade Plans，以便管理多個計劃。

### Portfolio、Company 與股票研究

38. 作為使用者，我希望由 Diary 內的 Transaction 得到正確持倉及成本，以便理解自己持有甚麼。
39. 作為使用者，我希望以可用行情估算 Portfolio 市值，並看到資料時間與未估值部分，以便判斷數字完整程度。
40. 作為使用者，我希望查看既有已實現及未實現損益指標，以便評估交易與持倉結果。
41. 作為使用者，我希望查看曝險、集中度及相關風險摘要，以便理解 Portfolio 結構。
42. 作為使用者，我希望系統指出 Portfolio 需要關注的狀況，以便進入對應資料作跟進。
43. 作為使用者，我希望查看 Strategy Performance 與近期 Transaction，以便回顧不同策略的表現。
44. 作為使用者，我希望匯出既有交易資料，以便自行分析及保存紀錄。
45. 作為使用者，我希望新增股票至 Watchlist，以便集中追蹤研究標的。
46. 作為使用者，我希望更新 Watchlist 的既有追蹤狀態或移除標的，以便維持清單有效性。
47. 作為使用者，我希望在 Company Hub 集中閱讀行情、持倉、研究及活動，以便理解單一公司的投資脈絡。
48. 作為使用者，我希望建立、更新及刪除 Stock Note，以便維護目前有效的觀點。
49. 作為使用者，我希望按時間閱讀不可變的 Stock Timeline Record 及其來源，以便區分歷史證據與目前觀點。
50. 作為使用者，我希望由既有研究入口捕捉證據並連到相關 Company 或 Diary，以便保存分析依據。
51. 作為使用者，我希望建立及更新 Investment Thesis，以便明確保存公司投資論點。
52. 作為使用者，我希望依既有生命周期追蹤 Investment Thesis，以便知道哪些論點仍有效或需要重新評估。
53. 作為使用者，我希望完成 Thesis Review 並記錄 Portfolio Decision，以便將反思連回持倉判斷。
54. 作為使用者，我希望在 Company 中分辨目前觀點、原始記憶及事後 Review，以便避免將後見之明當成原始判斷。

### Alert、Price Alert 與 Discipline

55. 作為使用者，我希望設定 Diary 的回頭提醒時間，以便在指定時間重訪記錄。
56. 作為使用者，我希望使用 WEEK／MONTH 重複提醒並遵循現有週末及截止規則，以便按既有節奏跟進。
57. 作為使用者，我希望取消 recurring root 時取消整組提醒，而取消單一 child 時只影響該次，以便準確控制後續提醒。
58. 作為使用者，我希望設定既有價格突破、跌破、漲跌幅或均線條件的 Price Alert，以便在條件符合時獲得提示。
59. 作為使用者，我希望查看、修改或刪除既有 Price Alert，以便調整追蹤條件。
60. 作為前景使用者，我希望收到即時更新提示，並在重連後重新取得 REST 資料，以便不依賴 Socket.IO 訊息是否完整送達。
61. 作為使用者，我希望建立、修改及刪除 Discipline，以便保存從交易經驗得到的原則。
62. 作為使用者，我希望調整 Discipline 排序，以便把重要原則放在容易閱讀的位置。
63. 作為使用者，我希望隨機抽取一條 Discipline，以便不定期提醒自己。
64. 作為使用者，我希望匯入及匯出 Discipline，以便保存及整理原則清單。
65. 作為使用者，我希望使用既有 Discipline 分享能力，以便向他人展示選定的原則。

### Partner 與 Agent API

66. 作為使用者，我希望邀請、接受及解除 Partner 關係，以便管理交流對象。
67. 作為 Partner，我希望雙方各自控制 Diary 與 Stock Note 分享設定，以便自主決定分享範圍。
68. 作為使用者，我希望在 Pair View 按既有日期對齊規則比較雙方 Diary，以便理解彼此同一時段的觀點。
69. 作為使用者，我希望分享資料排除 Transaction、Portfolio、私人提醒及 Review 文字，以便保留自己的隱私。
70. 作為使用者，我希望建立及撤銷有範圍限制的 API key，以便授權外部系統使用指定能力。
71. 作為外部 Agent，我希望依 API key 所屬 User 建立 Diary 並標示來源，以便正確歸屬內容。
72. 作為外部 Agent，我希望批次提交 Stock Timeline Record、更新 Stock Note 及讀取獲授權的 Watchlist，以便透過既有 API 完成研究協作。
73. 作為外部 Agent，我希望使用既有 idempotency key 行為重試提交，以便不產生重複的時間線證據。
74. 作為使用者，我希望 AI Agent Partner 使用普通 User 與 Partner 機制，以便不同作者的觀點與權限保持可追溯。

### 市場資料、ETF 與研究工具

75. 作為研究者，我希望管理獨立的 ETF Watchlist，以便研究市場而不改動個人股票交易帳本。
76. 作為研究者，我希望閱讀 ETF 的行情、風險、相對強弱及既有分析資料，以便理解研究標的。
77. 作為研究者，我希望同時閱讀 Market State、Sector Breadth 與 supporting confirmation，以便了解市場狀態及參與度。
78. 作為研究者，我希望在 Market Rotation Monitor 依既有 scope、訊號及條件篩選排名，以便比較相同性質的標的。
79. 作為研究者，我希望以持久化快照及同 scope 的 Qualified Snapshot Date 比較兩週變化，以便得到一致可重現的結果。
80. 作為研究者，我希望看到共同比較日起點為 100 的兩週走勢及排名變化，以便比較相對表現。
81. 作為研究者，我希望將 Market Rotation 的目前結果匯出 CSV、複製表格或匯出 PNG，以便保留與分享分析。
82. 作為研究者，我希望清楚看見 stale、partial、unknown 及缺值，以便不把資料不足理解成中性訊號或零變化。
83. 作為使用者，我希望使用 Position Sizing 計算工具，以便根據既有輸入及公式估計部位。
84. 作為使用者，我希望使用 Financial Freedom／FIRE 計算工具，以便探索既有財務假設的結果。
85. 作為研究者，我希望使用 Relative Value 工具，以便按既有指標比較標的。
86. 作為研究者，我希望使用 Seasonality 工具，以便觀察指定標的歷史季節性。
87. 作為研究者，我希望搜尋公司並瀏覽 SEC filings 及文件清單，以便找到所需申報材料。
88. 作為研究者，我希望閱讀、下載及打包既有 SEC 文件，以便保存原始研究資料。
89. 作為使用者，我希望行情或 SEC 供應商失敗時得到可理解的狀態及既有降級結果，以便判斷是否稍後重試。

### 公開內容與管理

90. 作為訪客，我希望閱讀首頁、About 及使用說明，以便理解產品用途及操作方式。
91. 作為讀者，我希望按既有分類及搜尋語意查找已發布 Post，以便找到相關文章。
92. 作為讀者，我希望直接開啟文章網址即可讀到正確 Markdown 正文及分享資訊，以便可靠地閱讀與分享內容。
93. 作為管理員，我希望建立及編輯 Post 草稿，以便準備公開內容。
94. 作為管理員，我希望發布、封存及刪除 Post，以便管理內容生命周期。
95. 作為管理員，我希望使用既有文章批次操作，以便有效管理多篇內容。
96. 作為管理員，我希望保留現有使用者管理能力，以便管理產品帳戶。
97. 作為管理員，我希望管理 ETF 系統資料及觸發既有市場批次工作，以便維持研究資料可用性。

### 跨平台體驗與 App readiness

98. 作為手機 Web 使用者，我希望所有現有功能都能以適合觸控的流程操作，以便離開桌面後繼續使用。
99. 作為使用者，我希望切換明暗主題且所有資料保持清晰，以便在不同環境長時間閱讀。
100. 作為鍵盤或輔助科技使用者，我希望導航、表單、對話框及資料有正確語意和 focus 行為，以便獨立完成主要操作。
101. 作為 PWA 使用者，我希望安裝及更新 Web 應用，且私人 API 資料不被 service worker 不當快取，以便方便而安全地使用。
102. 作為使用者，我希望空資料、載入、儲存成功、失敗及重試都有一致回饋，以便知道目前狀態及可採取的動作。
103. 作為使用者，我希望長標題、長 Markdown、寬表格、大數字及三語內容仍可閱讀操作，以便完整使用真實資料。
104. 作為未來 React Native 開發者，我希望透過普通 fetch 使用業務 API，以便不用依賴 Web runtime 或 cookie jar。
105. 作為未來 React Native 開發者，我希望取得 JSON access／refresh token pair 及單次續期協調能力，以便實作原生登入生命周期。
106. 作為 client 開發者，我希望共用型別化 API contract、ID／金額／日期格式、分頁及錯誤碼，以便正確處理資料與失敗。
107. 作為未來 App 使用者，我希望 App 發版落後 backend 時既有 API contract 仍兼容，以便繼續使用已安裝版本。
108. 作為未來 React Native 開發者，我希望可共用的純業務邏輯沒有 DOM、資料庫或 server runtime 依賴，以便在 Native 使用相同規則。

### 運維與完整交付

109. 作為維護者，我希望由空 PostgreSQL 建立 schema 及必要系統資料，以便部署新產品而不搬遷舊使用者資料。
110. 作為維護者，我希望在 Docker／K3s 部署 Web、API 及市場批次工作，並維持單一啟用的 scheduler，以便重現預期運行方式。
111. 作為維護者，我希望使用 health／readiness 及帶 requestId／jobId 的結構化 logs，以便定位請求與背景工作失敗。
112. 作為維護者，我希望驗證 PostgreSQL 備份、還原及發布回復流程，以便處理資料或部署事故。
113. 作為維護者，我希望 CI 在 contract、資料完整性或主要流程失敗時阻止發布，以便降低回歸風險。
114. 作為產品擁有者，我希望所有有效功能都有對應實作與驗收證據，以便確認重構完整完成。

## Implementation Decisions

### 已確認要求與實作基線

1. 使用者指定 React Web、PostgreSQL 與 Drizzle，並授權依 Impeccable 重設計 UI／UX。
2. 使用者確認沿用 Docker／K3s；今期 App ready 包括共用 API、純業務邏輯與原生認證，推播和離線寫入延後。
3. 採用 Plan 的 TypeScript monorepo 分工，Web 使用 React Router framework mode 與 Vite，API 使用 Hono on Node.js；API 保持模組化單體。
4. Web 與 API 由同 origin ingress 分流，保留 Web cookie／CSRF 語意。公開內容由 Web SSR 取得 API 資料；業務授權及寫入僅由 API 執行。
5. 共用層包含 runtime contracts、typed fetch client、純 domain 函式與 server-only persistence。Zod 為契約驗證基線，OpenAPI 及 client 由同一契約來源產生。
6. 套件採相容穩定版本並鎖版；Web 狀態管理與共用抽象按實際重複需求建立。
7. 來源中已驗證的純 TypeScript 邏輯和行為測試可在檢查依賴後沿用。Vue／Nuxt UI 和 Nitro／Prisma adapter 由新平台實作取代。

### 功能基準與決策延續

- 正式實作先固定包含未提交變更的 diary-vue worktree 快照，記錄 commit、diff、未追蹤來源檔及內容雜湊；快照排除 secrets、真實使用者資料、依賴與生成產物。
- 盤點範圍包含頁面、HTTP 方法／API、角色、背景工作、外部整合、匯入匯出及 SQL 的最終資料約束。每個有效功能需映射至本 PRD story、模組、實作工作項目和驗收證據。
- 來源 OpenAPI 未覆蓋全部有效 handlers，因此不能單靠 generated client 清單判斷功能完整。仍在使用的兼容輸入亦屬基準，例如 standalone Alert 目前接受的 snake_case aliases；不能因新 client 只產生 camelCase 就刪除。
- Diary 是核心聚合根；Transaction 必須附屬於同一使用者的 Diary。Overview 的 Portfolio 入口不改變這條寫入規則。
- Stock 的個人交易／持倉與 ETF 的純研究責任維持分開。Company、Thesis 與研究入口可以整合閱讀，不能默默合併交易模型。
- Stock Note 是可變的目前觀點，Stock Timeline Record 是不可變證據；Diary Review 與 Thesis Review 維持獨立生命周期。
- API key 代表其所屬 User；AI Agent Partner 以普通 User 及 Partner 機制分享內容，沒有跨使用者特權通道。
- 若歷史 ADR、文件、程式和測試有矛盾，須以可重現行為查明並記錄決定；功能刪減、公式調整或對外契約變更不得默默混入重構。

### 模組與可獨立測試的介面

以下是能力邊界，不要求每列建立新 package、service 或 repository interface。介面聚合完整用例，將相關驗證、交易、權限和映射留在單一負責模組。

每條規則只有一個擁有者：Diary 讀寫／append、recurrence、Calendar Date／使用者時區、文章讀者與管理員投影、Portfolio 計算、Rotation qualified dates／訊號／summary、Yahoo queue／cache 及 SEC 限制都不得在 HTTP handler、Web loader 和 CronJob 各寫一份。Transport 層只處理協議、身份、輸入驗證及回應映射，業務用例集中組合規則。

| 模組 | 對外能力與回傳 | 封裝的規則 |
| --- | --- | --- |
| Identity／Session | 註冊、登入、驗證身份、續期、撤銷、改密碼，回傳已驗證身份或 canonical auth 錯誤 | credential 選擇、限流、cookie／CSRF、native rotation／replay、tokenVersion |
| Diary／Ledger | 建立、追加、修改、刪除、讀取、搜尋 Diary，回傳 canonical Diary 或交易完整性錯誤 | 每日唯一、append 併發、Transaction owner、完整時間帳本、Alert 關聯原子寫入 |
| Review／Trade Plan | 複盤隊列、Diary Review 完成／修改、Trade Plan CRUD 及狀態變更 | lifecycle、有效反思驗證、Review 私隱、計劃與本人 Diary 的關聯 |
| Portfolio Analytics | 接收規範化帳本與報價，輸出持倉、損益、曝險、集中度、績效及資料品質 | 計算及 rounding、排序、缺報價、partial valuation；與行情取得分離 |
| Company Research | Watchlist、Stock Note、Stock Timeline Record、Thesis、Evidence、Thesis Review 及 Company 讀取投影 | 可變觀點／不可變事件、來源、冪等、thesis lifecycle、授權及 bounded aggregation |
| Alert／Discipline | 建立／取消提醒、檢查價格條件、列出狀態、紀律管理與分享／匯入匯出 | recurrence 日期、root／child 語意、trigger 順序、單實例排程、owner |
| Partner／Agent | 關係管理、分享策略、Pair View 投影、scoped ingestion | 雙方分享旗標、日期對齊、公開欄位白名單、User 歸屬、批次上限與冪等 |
| Market Data／Rotation | 取得規範化行情、歷史價格、生成／讀取 snapshots 與 summary | queue、TTL／stale、persist-before-calculate、scope-local ranking、qualified dates、缺值 |
| Research Tools／SEC | 純工具計算；公司／申報／文件讀取與有界下載、打包 | 固定公式、輸入驗證、SEC 限流／快取／安全限制；provider I/O 與純計算分開 |
| Publishing／Admin | 公開文章讀取／搜尋、管理員內容 lifecycle 及既有管理能力 | 發布可見性、全文搜尋、Markdown 安全呈現、SSR／SEO、admin 權限 |
| Web Experience | 全域導航、Quick Diary、各操作／閱讀 surface、i18n、主題、PWA | UI state、focus、responsive、使用者回饋；不承擔第二套權威業務規則 |
| Contracts／Persistence／Operations | canonical wire mapping、typed client、DB transactions／migrations、jobs、health 與 logs | server-only 邊界、完整性約束、錯誤映射、部署單實例、可觀測性 |

### PostgreSQL 與資料完整性

- 從空資料庫建立最終 schema，不帶入舊資料修補或重複 Diary 調解流程；舊 migrations 表達的有效 unique、check、composite foreign key 及必要 trigger 規則仍須重建。
- Drizzle schema 配合受版本控制的 SQL migrations；無法充分以 schema 宣告的約束使用必要 custom SQL，部署前驗證從空庫執行。
- 日記及市場 civil date 使用 PostgreSQL date；真實事件時間使用 timestamptz。資料庫內部表達可改，API 日期語意及各查詢時區窗口必須對等。
- ID 維持 decimal-string wire contract；金額、價格、數量使用合適 numeric 精度，持久化 Decimal 對外仍是字串。純計算的數值精度與 rounding 以既有 fixtures 鎖定。
- 每人每日日記唯一；同時建立與 append 必須以 DB 約束和必要 transaction／row lock 防止重複或覆寫，並穩定映射衝突錯誤。
- 改動 Transaction 的 Diary 更新與刪除，先驗證變更後的完整時間帳本；不可超賣等既有規則維持。成功結果必須包含一致的 Diary、Transaction、Alert 與相關連結。
- Transaction 與 Diary owner 一致、Trade Plan 的可選 Diary 仍須屬本人、recurring Alert 的 parent 與 child 仍屬同一 Diary，均須在 DB 與 API 層驗證。
- enums、狀態轉換、nullability 及大小寫依 canonical contracts 映射，unknown／null／缺報價不轉成零或 neutral。
- email、symbol normalization 與大小寫搜尋依現有語意處理；不能依賴 PostgreSQL 預設 collation 猜測 MariaDB 行為。
- 公開 Post 搜尋只涵蓋已發布且有發布時間的文章，以 title／excerpt 做全文搜尋，content 不參與，保留既有短字及 stop-word 能力邊界。管理員文章搜尋依既有 title 與作者姓名／email substring 規則；Diary 搜尋則是 title／content 的 case-insensitive contains。三種搜尋不可統一成同一 matching policy，公開作者投影不得洩露 email。
- 以中文、英文、混合語料 fixtures 決定 PostgreSQL 的搜尋及索引方案；公開全文搜尋不能直接用 substring search 取代。尚未證明對等的 matching fields、分詞、大小寫、可見性及空結果差異須列入驗收阻擋項。

### API、認證與原生 client

- 保持現行有效的 API 能力及兼容契約，包括 HTTP 方法、認證、狀態碼、request／response、分頁、排序 tie-breaker 與錯誤。API URL 屬協議而非 UI 元件結構，不隨畫面重組任意改名。
- 每個 route 分別記錄 guest、User、Admin、Bearer 與 API key 的存取權限；Market Rotation 等原本公開的頁面／API 維持公開，不因收納進新研究工作區就要求登入。Public request 帶無效顯式 credential 時仍遵循來源的 fail-closed 規則。
- Web 使用 HttpOnly cookies、現有 stable refresh 行為和 cookie mutation 的 CSRF 驗證；不強迫多分頁 Web 採 native rotation。
- Web logout 依 cookie／anonymous transport 清除 browser cookies，並 best-effort 刪除對應 refresh 資料；DB 清理失敗仍完成 client 登出。Bearer／API key 呼叫不得順便清除同請求附帶的 browser session。
- Native login 回傳 JSON access／refresh pair 且不設 auth cookies；refresh token 只存 digest，使用獨立 family 與 lineage，在一次 DB transaction 完成單 winner rotation。
- Native 舊 refresh token replay 撤銷該 family，其餘裝置 family 保持有效，沒有 grace window。若 rotation 已成功但 response 遺失，重新使用舊 token 按 replay 處理並要求重新登入。
- Native logout-one 清除 client 本機 session 並冪等撤銷該 refresh family；現有 access JWT 沒有 session claim，已發出的 access token 最多可存活至一小時有效期。不能宣稱單裝置登出已即時撤銷全部 access JWT。
- Logout-all 與改密碼依既有 tokenVersion／refresh 撤銷語意失效所有舊 session，並撤銷受影響使用者的現有 Socket.IO 存取。
- 顯式 Bearer／API key 驗證失敗直接拒絕，不能 fallback 到有效 cookie；多個顯式 credential 拒絕 ambiguity。只有已驗證的 Bearer／API key mutation 才豁免 browser CSRF。
- 保留 machine-readable code、details 和 requestId 的既有錯誤 envelope；validation 使用 400，ownership secrecy 使用 404，capability／state denial 依既有 403 契約。錯誤不得洩露 secrets。
- ID／persisted Decimal 是字串，Calendar Date 是 YYYY-MM-DD，Instant 是 UTC RFC 3339 Z。API 和 realtime 都須使用明確 mapper，不依賴 ORM 通用 JSON 序列化。
- typed client 支援注入 base URL、fetch 及 access-token provider。Native 受保護請求遇 401 時協調單次 refresh，成功後重試一次；refresh 或重試仍失敗則結束 client session。Login／refresh／logout bootstrap 不套用遞迴 refresh。
- client 與純 domain 不依賴 Vue、React DOM、瀏覽器 storage、Hono、Drizzle 或 Node-only 模組；未來原生 secure storage 由平台 adapter 接入。
- Agent Diary 建立繼續按 key scope 及所屬 User 執行，保留來源標示及不接受 append-to-today 的現有限制。Stock Timeline 批次寫入保留既有筆數上限和 idempotency key 範圍。
- REST 是權威資料來源；Socket.IO 只提示前景更新。重連與未來 App 回到前景後以 REST 重新取得資料。
- 未來 App 版本可能落後 backend；不得原地破壞既有 native contract，breaking changes 需明確版本或棄用安排。

### UI／UX 與內容

- 視覺方向由 Impeccable 重建，保留產品事實與功能。Plan 的「投資研究桌」是設計起點；字體、palette 和最終布局不冒充已確認設計。
- Quick Diary 是全域捕捉動作；Overview 協助決定下一步；Diary 資料庫負責搜尋管理；Review 保持獨立可達。主要導航可重組，所有既有功能仍須有清楚入口。
- 先完成 Overview、Quick Diary、Company／Review 的代表性樣板，再建立實際需要的 semantic tokens 及共用元件；設計不能先擴展成沒有功能的元件庫。
- 操作頁優先 scanability、資料密度及完整 state；文章頁優先閱讀層次與正文寬度；公開首頁準確展示現有產品能力。
- 桌面與手機依任務重新排列內容。手機保留全部資料與操作，長表格可使用摘要／展開或明確的橫向捲動；模態、輸入、導航及工具結果需適合觸控和鍵盤。
- 三語、明暗主題、日期／數字格式、keyboard／focus、screen reader、WCAG AA 及 reduced motion 從每個功能階段落實。
- 公開 Post 首次 HTML 必須有正文、title、canonical 及相關 metadata；sitemap、OG、公開 URL 與既有導向行為需對等。草稿和封存內容不得透過公開入口洩漏。
- PWA 保留安裝及更新；私人 API 維持 NetworkOnly，避免跨帳號快取。離線畫面或靜態資源快取不代表支援離線寫入。
- Web 元件與 Native 元件分開實作；共用以語意 token 值、文字、contracts、client 和純邏輯為主。

### 背景工作、資料供應商與運維

- 日記重複提醒在建立時按使用者時區產生當地 09:00 的 weekday 序列；WEEK 至該週星期五，週末開始則延至下一個星期五，MONTH 至月底。第一筆是指向自己的 root，之後 children 指向 root。Diary 更新時 Alert 清單依既有整批 replace 語意處理。
- 取消 root 在 transaction 內取消整個系列；取消 child／standalone 只取消自身。讀取與 scheduler 均尊重 parent 狀態。提醒列表保留最多 100 筆、trigger time 與 ID 排序的契約；日記前景 pusher 不以一次推送代表已送達，離線後仍可從 REST 取得提醒。
- Price Alert 保留價格條件計算、檢查節奏、先持久化觸發再提示的順序；前景提示失敗不改變持久化結果。
- API 的 scheduler／realtime instance 初期只有一個；K3s replica 和更新策略必須避免 rollout 重疊啟動兩個 scheduler。市場資料 cache 與 broadcaster 可維持 process-local。
- Market Rotation 的 CLI job 與管理員手動觸發共用同一批次用例；CronJob 使用同一產品 API image，直接執行業務函式及持久層。
- Yahoo 呼叫保留 concurrency queue、timeout、TTL、stale-on-error 及既有批次上限；外部 I/O 與計算分開，資料不可用時不得捏造行情。
- Rotation 只持久化 canonical universe，先儲存價格再計算快照；sectors／indexes／core 分開排名。每 scope 至少 90% active canonical symbols 的快照成功才是合格日，兩週比較採同 scope 往前第十個合格快照日。
- Rotation 的現有 UI scope 選擇維持 sectors／indexes，core 保留為既有 API 能力；不擴展成新 UI 功能。Summary breadth 維持來自 sectors；stale 或 coverage 不足時按既有規則呈現 unknown。沒有 snapshot 的既有 404 契約需保留。
- Market State、Sector Breadth、分數、訊號、排序及 tie-breaker 保留既有語意；Current Market Summary 維持 deterministic template。頁面 API 從持久化快照讀取，不為每次開頁重算或即時呼叫 Yahoo。
- CSV／Copy Table／PNG 由同一 dashboard payload 的目前 scope、filter 和 sort 產生，不能匯出未篩選的全部資料。CSV／PNG 保留 summary、market state、breadth condition／confirmation、as-of／comparison date、rank scope 與既有欄位；Copy Table 保留既有精簡 tab-separated 格式。
- SEC 整合保留 contact User-Agent、限流、等待／response／download／ZIP 容量限制及既有安全邊界。
- 啟動時驗證 runtime configuration；health／readiness、requestId／jobId、結構化 error logs 與背景工作失敗狀態納入運維交付。
- 新系統提供 schema migration job、必要市場種子與安全的管理員建立方式；備份、還原和發布回復需演練。測試與展示使用合成資料。

### 實作交付順序

| 階段 | 完整交付流程 | 通過條件 |
| --- | --- | --- |
| 0 | 凍結來源、建立功能／contract／資料規則矩陣及基準 fixtures | 每項有效功能均有歸屬，未知差異可追蹤 |
| 1 | 建立 runtime、DB、contracts、雙模式 auth、登入至建立／讀取 Diary 最小流程與 CI | Web 及無 DOM client 對真 PostgreSQL 完成相同業務流程 |
| 2 | UI 樣板、App shell、完整 Diary、Quick Diary、Timeline、Calendar、Diary Review、Trade Plan | 記錄至複盤全程可用，關聯與併發驗收通過 |
| 3 | Portfolio、Company、Watchlist、Notes、Evidence、Thesis、績效與匯出 | 計算與研究 lifecycle 符合基準 |
| 4 | Alert、Price Alert、Discipline、Socket.IO、Partner、Agent API | 提醒、分享、權限、重試和冪等驗收通過 |
| 5 | ETF、市場狀態／輪動、工具、SEC、公開內容與管理後台 | 全部研究與公開內容流程可用，SSR 及批次工作正確 |
| 6 | 全功能對等驗收、UX／效能、PWA、K3s、備份還原及文件 | 所有發布門檻通過，從空環境部署及還原成功 |

每階段同時落地 DB、API、React consumer 和測試。Phase 1 的最小流程不是縮減版產品的交付終點；部署、三語、主題與跨裝置品質從前期持續驗證。

## Testing Decisions

### 已確認範圍與好測試的標準

使用者已確認為全部含業務規則的模組、API／PostgreSQL／原生 client，以及主要 UI 流程安排測試。

- 測試可觀察輸入、輸出、權限、資料結果及副作用，不綁定私有函式、元件內部 state、ORM 呼叫次數或資料夾布局。
- 純業務邏輯以 deterministic tests 驗證；DB integrity、transactions、鎖與併發使用真 PostgreSQL；平台流程經真正 HTTP 或瀏覽器入口執行。
- 使用固定時鐘、合成使用者、固定行情及隔離資料庫。Provider 測試控制外部回應，不讓 CI 依賴即時 Yahoo／SEC 可用性。
- 以來源 behavior fixtures 和現有測試作 prior art，保留行為斷言，重寫 Nuxt／Prisma／MariaDB-specific harness。不能只將 adapter 名稱做字串替換。
- 新舊非決定性 ID、requestId 及時間只允許明確映射；不得用大量忽略欄位掩蓋功能差異。

### 模組測試與 prior art

| 範圍 | 必須驗證的外部行為 | 來源 prior art |
| --- | --- | --- |
| Identity／Session | cookie 恢復、CSRF、顯式 credential fail-closed、rotation 單 winner、family replay、Web logout cleanup 失敗及混合身份、native logout-one 限制、logout-all／改密碼撤銷 | auth flow、HTTP auth contract、credential resolution、native session tests |
| Diary／Ledger | 無交易 Diary、唯一日期、同時建立／追加、交易修改及刪除、超賣拒絕、跨使用者關聯、部分失敗 rollback | Diary workflow、transaction update、真 DB Diary integrity 及 HTTP core contracts |
| Review／Trade Plan | 有效 outcome／反思、完成／修改、隊列與時區、狀態轉換、owner-only Review、本人 Diary 關聯 | review API、Diary Review、Trade Plan contract tests |
| Portfolio Analytics | 成本、損益、持倉、曝險、集中度、績效、rounding、缺報價與 partial valuation | stock analytics、trade analytics、portfolio API tests |
| Company Research | Watchlist CRUD、可變 Note、不可變事件、Thesis lifecycle、Evidence 歸屬、idempotency | stock tracking、notes、agent stock timeline、research capture tests |
| Alert／Discipline | 當地 09:00／DST／週末／月底、self-parent root、整批 replace、root 全系列取消、child 單筆取消、排序／上限、兼容輸入、trigger 順序、匯入匯出／分享 | recurring-alerts、alert query、scheduler、price-alert、Discipline tests |
| Partner／Agent | 分享旗標、雙人日期對齊、私人欄位白名單、API key scope、key owner、批次上限／重試、Agent 禁止 append | partner compare、agent diary、API key、agent timeline tests |
| Market Data／Rotation | queue／TTL／stale、先持久化再算、scope ranking、canonical 90% qualified gate／額外非 canonical rows、第十個合格日、缺值／tie-breaker、無快照 404、API-only core、匯出目前 filter／sort 與 metadata | market-data cache／queue、真 DB market rotation、market-state calculation tests |
| Tools／SEC | 所有工具既有公式和邊界、申報查找、文件讀取／下載／ZIP、安全及容量限制、provider 失敗 | relative-value、seasonality、position-sizing、SEC integration 與 E2E |
| Publishing／Admin | public／admin／Diary 三種搜尋的欄位及 matching policy、三語語料、公開作者資料、lifecycle／批次操作、權限、Markdown 安全、SSR／SEO | article Markdown SSR、blog API、真 HTTP search contract、blog card deletion E2E |
| Contracts／Native client | generated artifacts 不漂移、公開／需登入 route matrix、既有 aliases、ID／Decimal／Date／Instant、錯誤與分頁、並發 401 單次 refresh、一次 retry、登出、無 DOM 依賴 | OpenAPI generation／breaking、API client、native-client smoke tests |
| Web Experience | 完整使用者流程、desktop／mobile、keyboard／focus、三語／主題、長內容、空／載入／錯誤、PWA 隔離 | Diary CRUD、Quick Diary、auth、decision thread、responsive navigation／tools E2E |
| Operations／Realtime | 真 Socket.IO handshake、權限撤銷／重連、malformed input、不重複 scheduler、CronJob、空庫 migration／備份還原 | Socket.IO contract、HTTP websocket revocation、malformed-cookie process tests、部署及備份流程 |

### 發布與功能對等門檻

1. 所有有效來源功能及本 PRD user stories 均有驗收案例、實作狀態及證據；發布時未完成或未驗證項目為零。
2. PostgreSQL 從空庫執行全部 migrations、constraints、seed 與核心用例通過；新舊公式／API fixture 的未解釋差異為零。
3. 使用兩個以上並發 client 驗證 Diary append、同日建立及 refresh rotation，結果符合既有成功／衝突／replay 語意且無資料遺失。
4. 無 DOM native client 連真正 API／PostgreSQL，完成登入、受保護讀寫、並發續期、重試及撤銷；不只 mock fetch。
5. 公開文章關閉 JavaScript 仍可從首次 HTML 讀取正文，公開 metadata 與未發布內容隔離正確。
6. 主要 Playwright 流程包括登入、Quick Diary、Diary／Transaction CRUD、Review、Trade Plan、Watchlist／Company、Partner、Alert、工具、SEC 及文章管理；其餘功能由適當 UI／API 案例補足。
7. 每個完整 UI 交付按 Impeccable 完成桌面／手機檢查、批次修正與獨立 finish review，並記錄實際交付的設計系統。介面截圖不能代替資料與行為驗收。
8. CI 執行 lint、typecheck、production build、contracts／client drift、domain tests、PostgreSQL integration 及核心 E2E；任一必要門檻失敗不得發布。
9. 使用代表性長 Diary、寬表格、較大帳本、分頁與市場歷史資料測量效能；Phase 0 記錄舊版基線並訂立門檻。本 PRD 不捏造尚未量測的 latency 或容量承諾。
10. 在隔離環境成功執行 Docker／K3s 部署、單實例 scheduler 更新、migration、health／logs、備份及還原演練。

## Out of Scope

- 從 diary-vue 搬遷使用者、Diary、Transaction、文章、session 或其他既有產品資料；亦不搬遷舊歷史資料修補工具。
- 今期建立或發布 React Native App、原生 UI／navigation、App Store／Play Store 流程、裝置 secure storage 及 deep-link handlers。
- 原生 APNs／FCM／Expo Push、背景通知保證、離線寫入、同步及衝突合併。
- 任何來源基準沒有的券商下單、支付／訂閱、社交網絡、AI 自動投資建議或其他新產品功能。
- 為未實際存在的擴展需求建立微服務、Redis、BullMQ、event bus、分散式 scheduler、額外行情 provider 或多租戶組織系統。
- 強制 Web 與 Native 共用 HTML／CSS 元件，或今期建立空 mobile app 骨架。
- 要求複製舊版 layout、配色、字體或 component 結構。
- 在功能對等名義下復活已退役功能，或默默修正已知 bug、修改交易公式、改變分享權限或破壞現有 API；此類變更需單獨記錄及決策。

不搬舊資料不代表免除新系統 schema migrations、資料約束、seed、匯入匯出功能或 PostgreSQL 備份還原責任。

## Further Notes

- 本 PRD 綜合本次對話、已建立的重構 Plan／Product、來源產品及領域文件、現有程式與測試，以及來源 ADR-0001 至 ADR-0010。
- 2026-09-05 初步盤點有 43 個 Vue page 檔案與 124 個 API handler；這是盤點起點，不是已驗證的完整功能清單。
- 當時來源 HEAD 為 72b5bf7bb5cd841eff2fca9795a5fa977bff0196，但 worktree 有包含 auth、schema、jobs、Socket.IO 等未提交變更。正式基準必須以 Phase 0 的內容快照為準。
- 來源 ADR 中的 Diary-first、Stock／ETF 邊界、普通 User／Partner、錯誤契約、原生 session 及單實例 runtime 原則延續；Nuxt／Prisma／MariaDB-specific 實作由本次明確技術要求取代。
- 歷史 scratch plan 曾將 native endpoints 與 Bearer Socket.IO 列為未來工作；目前 accepted native ADR、handlers 與整合測試已實作這些能力，故本 PRD 將它們列為必須保留的基準。
- 歷史領域筆記對 Rotation qualification 是否篩選 canonical symbols 的描述與目前 accepted ADR／程式不同。重構採 canonical universe 計算合格日，並以測試確認額外非 canonical rows 不影響 qualification、coverage 或輸出；核實結果納入 Phase 0 記錄。
- 對外品牌名稱、相容套件版本、視覺樣板及效能門檻在其對應階段落實。中文全文搜尋、日期窗口及來源文件矛盾須在功能基準階段用 fixtures 查明，不能拖至發布後才決定。
- 此次交付為 PRD 文件與本地 tracker 發布，尚未開始產品實作、建立實作 tickets、執行產品測試或部署。
