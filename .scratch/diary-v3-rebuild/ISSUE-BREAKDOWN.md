# diary-v3 Issue 拆分草稿

狀態：已依使用者授權發佈 61 張本地 implementation issues；見 [工作索引](ISSUES.md)。原始拆分提案保留如下，03 的同步設計確認已依自主實作授權調整。

Parent：[完整重構 PRD](/Users/klam/Desktop/project/diary-v3/.scratch/diary-v3-rebuild/PRD.md)

PRD SHA-256：ac6e9efa4bafb1ece28d03bd1df27c03a8d86421dd54b28bb42607ced8068395

共 61 張：60 張 AFK、1 張 HITL。編號是草稿識別碼，批准後才按依賴順序建立正式本地 tickets。

AFK 表示規格足夠由 agent 實作與驗收；只可在 Blocked by 全部完成後領取。HITL 表示需要使用者參與，此草稿只有 03 的整體設計確認。建議發佈時 AFK 使用 ready-for-agent，HITL 使用 ready-for-human。

## 所有切片共同遵循

- 每票交付一項可示範或可重現的完整行為，包含實際涉及的資料約束、API、client／UI 及測試。純計算工具不硬加 DB／API；原生／Agent 功能由標準 client 驗證，不建立原生 App。
- 01 是跨層基準驗證，03 是設計決策，59–61 是整個產品的運行／恢復／交付驗證；它們都有可驗證成果，不是獨立的「先做所有 DB／API／UI」水平工作。
- 02 建立最小 CI／migration／contracts 基礎。其後每個有 DB 變更的票都從空庫與當前 schema 驗證，所有新增 API 同時更新 runtime schemas、OpenAPI、typed client 與兼容測試，不留待 61 補做。
- 每個 UI 票都須完成三語、明暗主題、手機／桌面、keyboard／focus、長內容及空／載入／錯誤狀態，沿用 03 確認的設計並依 Impeccable 驗收。98–103 等跨頁 stories 由這些票持續覆蓋，再由 61 全面核對。
- 驗證外部行為，DB 約束／交易／併發用真 PostgreSQL，provider 用受控 fixtures，關鍵操作用真 HTTP／瀏覽器。共享的 Calendar Date、recurrence、Portfolio、market ranking 與授權規則只有一個擁有者。
- 後續新增關聯的票負責擴展既有刪除、撤銷、分享及備份回歸案例，不能等待最後階段才處理資料完整性。
- 每個新功能票亦負責接上當時已存在的導航、工具箱或公開首頁入口，交付時必須可找到、可操作；尚未交付的目的地不得留下死連結。各入口最終完整性由 61 按來源基準核對。
- 已生效的資料保護與 contract 不得因分階段實作而暫時繞過；尚未交付的能力不得在 UI 或 release report 聲稱可用。
- 依後續使用者授權拆分並實作工作項目；不修改 Parent PRD、不執行正式環境切換。

## 需要確認的四點

1. 粒度是否合適，哪些票需要合併或再拆細？
2. Blocked by 是否反映真正依賴，有沒有多餘或缺少？
3. 只有 03 標 HITL，其餘 AFK 是否符合預期？
4. 同意後按此稿發佈 61 張本地 tickets；已規格完整但仍有依賴的 AFK 票保留 blockers。

## 逐項切片

1. **[01] 固定功能基準並重現舊版 Diary 完整流程**

    Type: AFK  
    Blocked by: None  
    User stories covered: US-114

    **What to build:** 在隔離環境固定含未提交變更的來源快照，重現登入、建立、閱讀與刪除無交易 Diary，並把所有有效入口映射至本次工作項目。

    **Acceptance criteria:**

    - [ ] 記錄 commit、diff、未追蹤來源檔與內容雜湊；排除 secrets、真實使用者資料、依賴與生成產物。
    - [ ] 盤點所有有效頁面、API、角色、排程、匯出與 SQL 最終約束，映射全部 114 條 stories；歷史文件矛盾與搜尋語意有可重現 fixtures。
    - [ ] 提供隔離環境的完整 Diary 流程證據、已知問題表及效能基線；來源後續變更有追蹤規則。

2. **[02] 由空資料庫註冊登入並寫下首篇 Diary**

    Type: AFK  
    Blocked by: 01  
    User stories covered: US-001, US-010, US-011, US-012, US-014, US-106, US-109, US-113

    **What to build:** 建立最小可運行 React Web、API、PostgreSQL 與共用 client，讓使用者註冊登入後建立並閱讀自己的無交易 Diary。

    **Acceptance criteria:**

    - [ ] 從空 PostgreSQL migration／必要 seed 到啟動 Web／API 可重現；採 PRD 的模組與 server-only 依賴邊界。
    - [ ] React 表單經真 HTTP 寫入再讀取；每日唯一、owner 隔離、基本 cookie／CSRF、canonical ID／日期／錯誤已生效。
    - [ ] 此流程有真 DB 整合及瀏覽器測試；lint、typecheck、build、contracts／client drift 與測試納入最小 CI。

3. **[03] 確認投資研究桌的代表性設計與 App shell**

    Type: HITL  
    Blocked by: 02  
    User stories covered: US-015, US-023, US-047, US-098, US-099, US-100, US-102, US-103

    **What to build:** 以現有可用的 Diary 流程呈現全新 Web 視覺，提供 Overview、Quick Diary、Company／Review 的桌面與手機代表樣板，確認可延伸的導航與設計語言。

    **Acceptance criteria:**

    - [ ] 至少一條樣板操作連接真 Diary API；尚未實作的 Company／Review 僅用明確標示的合成內容展示，不聲稱功能完成。
    - [ ] 使用者確認整體方向及主要互動；包含長內容、缺資料、空／載入／錯誤、三語、主題、keyboard／focus 與手機操作。
    - [ ] 按 Impeccable 完成有界檢查、finish review 與實際設計記錄；後續 AFK UI 依已確認方向自行實作，只有實質偏離才重開設計決策。

4. **[04] 保持 Web session 並正確登出目前瀏覽器**

    Type: AFK  
    Blocked by: 03  
    User stories covered: US-002, US-003, US-009, US-010

    **What to build:** 讓 Web 在重新載入、access 到期及多分頁操作後保持可恢復的 session，並能從既有介面可靠登出。

    **Acceptance criteria:**

    - [ ] 穩定 Web refresh、HttpOnly cookie、透明恢復與 CSRF 遵循基準；多分頁不互相撤銷。
    - [ ] cookie／anonymous logout 清除本機 cookies，DB cleanup 失敗仍完成登出；顯式 credential 不得借用或清除另一個 browser session。
    - [ ] 用真 HTTP 及瀏覽器驗證過期、malformed credential、登入失敗、logout 和資料隔離。

5. **[05] 以原生 JSON session 讀寫同一篇 Diary**

    Type: AFK  
    Blocked by: 02  
    User stories covered: US-003, US-009, US-104, US-105, US-106, US-107, US-108

    **What to build:** 由無 DOM client 登入，透過 Bearer 讀寫現有 Diary API，並完成 rotating refresh 與原生 logout。

    **Acceptance criteria:**

    - [ ] JSON login 不設 auth cookies；refresh 在真 DB 原子 rotation、single winner、family replay，失去 response 的重試遵循 fail-closed。
    - [ ] 並發 401 只觸發一次 refresh、重試原請求一次；bootstrap 不遞迴續期，第二次失敗清 session。
    - [ ] 驗證 invalid Bearer 不 fallback cookie、跨 family 隔離、冪等 logout 及既有最多一小時 access-token 有效期；client 無 DOM／server 依賴。

6. **[06] 修改密碼及登出所有裝置**

    Type: AFK  
    Blocked by: 04, 05  
    User stories covered: US-004, US-005, US-009, US-010

    **What to build:** 由帳戶設定修改密碼或登出所有裝置，讓 Web、Native 及其他已登入 client 的舊 session 依既有規則失效。

    **Acceptance criteria:**

    - [ ] 經本人授權的 UI／API 完成操作；cookie 呼叫需要 CSRF，validation 與錯誤格式一致。
    - [ ] tokenVersion、所有 refresh families 與舊 access JWT 的後續請求正確失效，其他使用者不受影響。
    - [ ] 真 HTTP 測試覆蓋 Web／Native／多裝置；Socket.IO 的即時撤銷在 33 整合本用例。

7. **[07] 儲存語言、時區與投資偏好**

    Type: AFK  
    Blocked by: 04  
    User stories covered: US-006, US-007, US-008

    **What to build:** 讓使用者在設定頁儲存三語、時區及現有投資偏好，重新登入後仍得到相同設定與日期／數字呈現。

    **Acceptance criteria:**

    - [ ] 既有設定欄位經驗證、持久化及 API 往返，未知或非法值依契約處理。
    - [ ] 三語及設定保存流程可操作；Calendar Date 與真實時間的格式責任清楚，時區不被瀏覽器默默覆蓋。
    - [ ] 驗證 owner、重新登入、多時區／DST 及數值字串；後續消費設定的功能延伸相同共用規則。

8. **[08] 編輯及整理完整無交易 Diary**

    Type: AFK  
    Blocked by: 04  
    User stories covered: US-011, US-012, US-013, US-014, US-018, US-019, US-028

    **What to build:** 提供完整 Diary 編輯、標籤、日期、原始 thesis／risk／execution 與 Markdown 閱讀，並安全刪除無交易 Diary。

    **Acceptance criteria:**

    - [ ] 建立、修改、讀取及刪除經真 DB／API／React 完成；原始判斷與正文層次清楚。
    - [ ] 每日唯一、canonical request／response、Markdown 安全、owner、長文及提交失敗都有行為測試。
    - [ ] 此票只交付無 Transaction 的刪除；有交易的歷史修改／刪除由 17 承擔，不能預先繞過帳本約束。

9. **[09] 以 Quick Diary 模板捕捉並併發追加**

    Type: AFK  
    Blocked by: 08  
    User stories covered: US-015, US-016, US-017

    **What to build:** 由全域快捷入口開啟 Quick Diary，切換自由書寫與現有模板，建立新 Diary 或追加至當日。

    **Acceptance criteria:**

    - [ ] 所有既有模板、快捷鍵及開關／提交流程可用，表單回饋與手機操作符合設計。
    - [ ] 同時建立或追加在真 PostgreSQL 不產生重複日記或覆寫有效內容；失敗保持清楚的可恢復狀態。
    - [ ] 驗證新建預設行為、append、模板切換及競爭衝突；Web／Native 共用同一 Diary 用例。

10. **[10] 搜尋與分頁管理 Diary 資料庫**

    Type: AFK  
    Blocked by: 08  
    User stories covered: US-013, US-022

    **What to build:** 由 Diary 列表按現有日期、標籤及查詢條件搜尋、排序、分頁並進入記錄。

    **Acceptance criteria:**

    - [ ] title／content case-insensitive contains 與所有既有條件保持一致，不套用 Blog 全文搜尋。
    - [ ] page／limit／最大值、ID tie-breaker、空結果、未知參數及 owner 隔離符合 canonical contract。
    - [ ] 真 DB fixtures 包含中文、英文、混合內容及同排序值；手機／鍵盤可完成篩選與導航。

11. **[11] 按日期閱讀 Diary Timeline**

    Type: AFK  
    Blocked by: 07, 08  
    User stories covered: US-024, US-026

    **What to build:** 提供連續 Diary Timeline、日期篩選及記錄入口，讓使用者按時間回看原始判斷。

    **Acceptance criteria:**

    - [ ] 以有界 API 取得並按既有日期與排序規則呈現，閱讀可進入正確 Diary。
    - [ ] 保留原始內容和必要摘要；私人 Review 文字不加入公共或精簡 Timeline 投影。
    - [ ] 驗證長文、多日期、空範圍、部分讀取失敗及桌面／手機閱讀。

12. **[12] 由 Calendar 定位及開啟 Diary**

    Type: AFK  
    Blocked by: 07, 08  
    User stories covered: US-007, US-025

    **What to build:** 由月份日曆查看活動並進入指定日期的 Diary，維持該頁既有時區與日期窗口。

    **Acceptance criteria:**

    - [ ] 月份切換、日期標記、選日及目標 Diary 均由真資料驗證。
    - [ ] civil date 與 instant 不混用；跨月、DST、正負 UTC 時區依來源窗口呈現。
    - [ ] 空月份、長內容入口、手機與鍵盤導航可完成。

13. **[13] 完成及修改 Diary Review**

    Type: AFK  
    Blocked by: 07, 08  
    User stories covered: US-029, US-031, US-032, US-033

    **What to build:** 讓使用者安排 Diary Review、閱讀原始判斷、填寫結構化反思並完成或修改複盤。

    **Acceptance criteria:**

    - [ ] outcome 與至少一項有效反思的驗證、none／pending／reviewed lifecycle 及伺服器時間符合契約。
    - [ ] generic Diary 更新不能繞過完成規則；原始判斷仍可分辨，Review 文字只供 owner。
    - [ ] 真 DB／API／UI 覆蓋安排、完成、修改、無效反思、跨時區與越權。

14. **[14] 建立及追蹤 Trade Plan 至日記關聯**

    Type: AFK  
    Blocked by: 07, 08  
    User stories covered: US-034, US-035, US-036, US-037

    **What to build:** 完成 Trade Plan 的建立、風險欄位編輯、狀態更新、搜尋／分頁及本人 Diary 關聯。

    **Acceptance criteria:**

    - [ ] 進場區間、停損、目標、部位限制、失效條件及 numeric wire 正確往返。
    - [ ] 既有 lifecycle、篩選／分頁及 optional Diary 關聯依 owner 約束處理，跨帳戶連結被拒絕。
    - [ ] 用 UI 建立至狀態更新並回看 Diary；測無效狀態、錯誤、刪除與未關聯情境。

15. **[15] 記錄買入 Transaction 並查看成本持倉**

    Type: AFK  
    Blocked by: 08  
    User stories covered: US-020, US-038

    **What to build:** 在 Diary 記錄 BUY Transaction，重新開啟後從持倉畫面看到數量與成本。

    **Acceptance criteria:**

    - [ ] Transaction 與 Diary 同 owner 的複合約束、numeric 精度及原子寫入從第一筆交易生效。
    - [ ] 單筆、多筆買入的成本與持倉結果符合 fixtures，無交易 Diary 仍正常。
    - [ ] UI → HTTP → PostgreSQL → 持倉的完整測試通過；此票不聲稱 SELL 或行情估值已完成。

16. **[16] 記錄賣出並計算損益與剩餘持倉**

    Type: AFK  
    Blocked by: 15  
    User stories covered: US-020, US-038, US-040

    **What to build:** 在 Diary 記錄 SELL Transaction，顯示部分或全部賣出後的成本、已實現結果及剩餘持倉。

    **Acceptance criteria:**

    - [ ] 賣出、清倉、同日排序、相關交易欄位與 rounding 使用來源公式。
    - [ ] 驗證完整時間帳本；超賣、跨帳戶及非法數量被拒絕且不留下部分寫入。
    - [ ] 以 UI／API／真 DB 固定帳本驗證成本與已實現結果，非決定性欄位只做明確映射。

17. **[17] 修改歷史交易或刪除 Diary 後保持帳本有效**

    Type: AFK  
    Blocked by: 16  
    User stories covered: US-018, US-019, US-020, US-038, US-040

    **What to build:** 允許使用者編輯／刪除歷史 Transaction 或整篇 Diary，並重新取得一致的完整帳本結果。

    **Acceptance criteria:**

    - [ ] 先驗證 projected chronological ledger；會破壞後續交易的改動被拒絕。
    - [ ] Diary、Transaction 與當時已有關聯在 transaction 中一致更新或 rollback，無跨使用者關聯漂移。
    - [ ] 用歷史插入、修改、刪除、併發寫入與中途失敗 fixtures 驗證，再由 UI 回看結果；後續新增關聯的票延伸刪除驗收。

18. **[18] 在 Company 查看報價與歷史價格**

    Type: AFK  
    Blocked by: 04  
    User stories covered: US-047, US-089

    **What to build:** 開啟股票 Company 的最小行情視圖，經公開／受保護的既有行情入口取得最新與歷史資料。

    **Acceptance criteria:**

    - [ ] quote／historical 維持 guest 可用；Company 的個人持倉、Watchlist、研究捕捉仍需 User。公開 request 若帶無效顯式 credential 仍 fail closed，symbol normalization、canonical wire／資料時間／缺值正確。
    - [ ] Yahoo queue、concurrency、timeout、TTL／stale-on-error 與既有批次上限由一個 provider 邊界擁有。
    - [ ] 受控 upstream 驗證正常、429、timeout、partial、alias／unknown symbol，CI 不依賴即時行情。

19. **[19] 為 Portfolio 估值並呈現缺報價狀態**

    Type: AFK  
    Blocked by: 16, 18  
    User stories covered: US-039, US-040, US-082

    **What to build:** 從持倉進入 Portfolio，取得行情後顯示市值、未實現損益與完整／部分估值狀態。

    **Acceptance criteria:**

    - [ ] 估值使用同一帳本與規範化行情，數值和 rounding 對等。
    - [ ] 缺報價、stale、部分失敗、unpriced cost 及 as-of 明確呈現，不以零代替未知。
    - [ ] 真 DB＋固定 upstream＋UI 驗證完整、部分、完全無報價及空持倉。

20. **[20] 查看 Portfolio 曝險、集中度與風險摘要**

    Type: AFK  
    Blocked by: 19  
    User stories covered: US-041, US-042

    **What to build:** 在 Portfolio 查看現有曝險、集中度與風險摘要，並由提示進入相關持倉。

    **Acceptance criteria:**

    - [ ] 所有既有 exposure buckets、最大／前三持倉集中度與風險規則符合固定 fixtures。
    - [ ] 未知 beta／報價、空帳本及 partial data 的分母與文案依契約處理。
    - [ ] API／UI 投影一致、owner 隔離、數字可讀；為 Overview 提供有界結果。

21. **[21] 回顧策略績效與近期交易**

    Type: AFK  
    Blocked by: 16  
    User stories covered: US-040, US-043

    **What to build:** 提供 Strategy Performance 及近期交易入口，以相同帳本呈現現有策略分析與結果。

    **Acceptance criteria:**

    - [ ] 策略分組、日期窗口、交易排序及所有既有統計／rounding 均對應來源 fixtures。
    - [ ] 不同策略、無交易、部分紀錄及合法邊界輸入可重現，不能自行更換公式。
    - [ ] 由 UI 篩選／閱讀到 API／真 DB 結果完整，使用者隔離及長數字驗收通過。

22. **[22] 匯出個人交易資料**

    Type: AFK  
    Blocked by: 16  
    User stories covered: US-044

    **What to build:** 由交易或績效入口下載既有格式的本人交易資料。

    **Acceptance criteria:**

    - [ ] 欄位、順序、日期、numeric 表達、篩選範圍與來源匯出一致。
    - [ ] 未登入／非 owner 無法下載；中文、特殊字元、空結果與較大帳本有驗證。
    - [ ] 瀏覽器下載檔可解析，內容與同一真 DB 帳本一致。

23. **[23] 管理股票 Watchlist**

    Type: AFK  
    Blocked by: 18  
    User stories covered: US-045, US-046

    **What to build:** 由 Watchlist 新增、更新追蹤狀態、排序／閱讀並移除股票，開啟對應 Company。

    **Acceptance criteria:**

    - [ ] canonical Stock 與本人 Watchlist 的建立及唯一性正確，不產生重複主檔。
    - [ ] 既有狀態、分頁／排序、symbol 驗證、duplicate 及越權行為對等。
    - [ ] UI CRUD、重新載入後持久化及無報價情境可驗收。

24. **[24] 維護 Company 的目前 Stock Note**

    Type: AFK  
    Blocked by: 23  
    User stories covered: US-048, US-054

    **What to build:** 由 Company 建立、更新及刪除目前有效的 Stock Note，並保留作者與來源。

    **Acceptance criteria:**

    - [ ] Note 是可變觀點，更新同一內容不偽裝成不可變歷史。
    - [ ] 所有既有欄位、排序／分頁、owner 與來源標示對等。
    - [ ] UI／API／DB 覆蓋建立、修改、刪除、長內容及權限拒絕。

25. **[25] 捕捉 Evidence 並回看不可變股票時間線**

    Type: AFK  
    Blocked by: 08, 23  
    User stories covered: US-026, US-049, US-050, US-054

    **What to build:** 從已可用的 Company／Diary 研究入口捕捉 Evidence，於 Stock Timeline 閱讀不可變記錄並回到來源。

    **Acceptance criteria:**

    - [ ] 事件來源、時間、關聯與 idempotency key 範圍遵循基準；不提供改寫不可變證據的捷徑。
    - [ ] 同一捕捉重試不重複，非法來源／跨 owner 連結被拒絕，Diary 變更後關聯語意正確。
    - [ ] 真 UI 捕捉後在時間線可見；後續工具票把各自現有捕捉入口接入同一用例。

26. **[26] 建立及更新 Investment Thesis**

    Type: AFK  
    Blocked by: 23  
    User stories covered: US-051, US-052

    **What to build:** 在 Company 編寫 Investment Thesis、更新其內容及既有生命周期，保持可回看的目前論點。

    **Acceptance criteria:**

    - [ ] Thesis 欄位、status、日期與 owner 約束按契約保存，不混同 Stock Note 或 Diary Review。
    - [ ] 可建立、重新讀取、修改及執行既有狀態轉換，非法轉換有明確錯誤。
    - [ ] 使用真 DB／API／React 驗證完整 lifecycle、長內容與日期邊界。

27. **[27] 完成 Thesis Review 並記錄 Portfolio Decision**

    Type: AFK  
    Blocked by: 07, 26  
    User stories covered: US-053, US-054

    **What to build:** 由 Thesis 進入複盤，記錄 outcome、反思與 Portfolio Decision，再回看論點及複盤歷史。

    **Acceptance criteria:**

    - [ ] Thesis Review 使用自己的 lifecycle 和欄位約束，不借用 Diary Review 完成捷徑。
    - [ ] 有效與無效 outcome／decision、owner、日期及重複操作遵循來源。
    - [ ] 完整 UI／API／DB 測試證明原始 Thesis、Review 與 decision 脈絡可分辨。

28. **[28] 集中處理 Diary 與 Thesis Review Queue**

    Type: AFK  
    Blocked by: 13, 27  
    User stories covered: US-027, US-030

    **What to build:** 在獨立 Review Queue 同時閱讀 Diary 與 Thesis 的逾期、近期及未排程項目，直接開啟相應複盤。

    **Acceptance criteria:**

    - [ ] 有界 API 合併兩類結果並保持 target type、排序／分頁及使用者時區窗口。
    - [ ] 各分類的日期邊界、DST、已完成移出隊列及 owner 隔離有 fixtures。
    - [ ] UI 可跨兩類目標導航，不洩露私人 Review 文字至不相干摘要。

29. **[29] 在 Company Hub 串連持倉、觀點與記憶**

    Type: AFK  
    Blocked by: 19, 24, 25, 27  
    User stories covered: US-026, US-047, US-054

    **What to build:** 將 Company 的行情、本人持倉、Stock Note、Thesis、Evidence、Timeline 與 Review 組成有界的閱讀入口。

    **Acceptance criteria:**

    - [ ] 同一 Company 的所有入口指向正確目標，按目前觀點／原始記憶／事後複盤區分。
    - [ ] 聚合有界、各來源可部分失敗，owner 及 private fields 採白名單。
    - [ ] 由持倉進入公司、查看證據、開啟複盤的完整桌面／手機流程可示範。

30. **[30] 由 Overview 找到下一個投資跟進動作**

    Type: AFK  
    Blocked by: 11, 14, 20, 28, 29  
    User stories covered: US-023, US-026, US-027, US-042

    **What to build:** 完成已登入首頁的 Portfolio 概況、待關注事項、近期活動與待 Review 摘要，連回 Timeline、Company、Trade Plan 和 Review。

    **Acceptance criteria:**

    - [ ] 各摘要消費既有模組的有界投影，不建立第二套帳本、計算或授權。
    - [ ] 近期／逾期／即將到期、partial data、空資料與導航目標均對等。
    - [ ] 用含 Diary、Thesis、Trade Plan、持倉及風險事項的合成帳戶示範下一步操作。

31. **[31] 設定並取消單次 Diary 回頭提醒**

    Type: AFK  
    Blocked by: 07, 08  
    User stories covered: US-021, US-055

    **What to build:** 在 Diary 設定單次 Alert，由提醒清單閱讀、開啟日記及取消該次提醒。

    **Acceptance criteria:**

    - [ ] 提醒以正確 instant 儲存並依使用者時區顯示；Diary 編輯的清單 replace 語意對等。
    - [ ] canonical request、仍有效 aliases、owner、上限／trigger time／ID 排序及 Diary 刪除關聯正確。
    - [ ] UI／API／真 DB 覆蓋建立、重新讀取、取消、過期、跨時區及 rollback。

32. **[32] 建立 WEEK／MONTH 提醒並取消整個系列**

    Type: AFK  
    Blocked by: 31  
    User stories covered: US-056, US-057

    **What to build:** 由 Diary 建立當地 weekday 09:00 的 recurring Alert，並區分 root 全系列取消與 child 單次取消。

    **Acceptance criteria:**

    - [ ] self-parent root、instanceNumber、同 Diary 關聯及建立時 materialize 遵循基準。
    - [ ] WEEK 的平日／週末起點、MONTH 月底、DST 及使用者時區有固定時鐘驗證。
    - [ ] root 取消在 transaction 內影響全組，child 只取消自身；列表與後續 scheduler 不重新暴露已取消 parent 的 children。

33. **[33] 以前景 Socket.IO 接收提醒並在撤銷後斷線**

    Type: AFK  
    Blocked by: 06, 32  
    User stories covered: US-004, US-005, US-060, US-111

    **What to build:** 啟用單實例提醒排程與真 Socket.IO，前景顯示到期提示、斷線後以 REST 回復，登出全部／改密碼即撤銷相應 sockets。

    **Acceptance criteria:**

    - [ ] cookie／Bearer handshake、origin、身份與 malformed input 正確處理，未授權不能訂閱其他使用者。
    - [ ] 日記 pusher 不以推送代表已送達；REST 是真實狀態，重連不遺漏既有可讀提醒。
    - [ ] 真 listener 測試涵蓋到期提示、撤銷、重連、parent dismissal guard；scheduler 只有一個且 logs 帶關聯資料。

34. **[34] 管理 Price Alert 並在價格條件符合時提示**

    Type: AFK  
    Blocked by: 18, 33  
    User stories covered: US-058, US-059, US-060

    **What to build:** 由股票介面建立、編輯、刪除既有各類 Price Alert，排程檢查後在前景提示並可從 REST 回看。

    **Acceptance criteria:**

    - [ ] 突破／跌破／漲跌幅／均線條件及既有檢查節奏使用固定行情驗證。
    - [ ] 先持久化 trigger state 再通知；Socket.IO 失敗不 rollback，重試與再觸發語意對等。
    - [ ] owner、缺行情、失敗、取消與多 alert 的端到端流程可示範，無重複 scheduler。

35. **[35] 整理並隨機閱讀 Discipline**

    Type: AFK  
    Blocked by: 04  
    User stories covered: US-061, US-062, US-063

    **What to build:** 完成 Discipline 建立、修改、刪除、排序及隨機抽取，讓使用者持續整理交易原則。

    **Acceptance criteria:**

    - [ ] 所有既有欄位、owner、排序與 random 行為正確往返。
    - [ ] 空清單、單筆、較多資料及無效排序輸入有驗證。
    - [ ] UI 由建立至重排、抽取、刪除完整可用，鍵盤與手機可操作。

36. **[36] 匯入、匯出及分享 Discipline**

    Type: AFK  
    Blocked by: 35  
    User stories covered: US-064, US-065

    **What to build:** 從紀律清單匯入／匯出既有格式，並開啟既有公開分享與 OG 呈現。

    **Acceptance criteria:**

    - [ ] 合法與非法檔案、重複／部分錯誤及來源匯入策略有固定 fixtures。
    - [ ] 匯出可重新解析且資料一致；公開分享只呈現允許內容，不洩露私人帳戶資料。
    - [ ] 瀏覽器匯入下載與公開分享完整可示範；格式、特殊字元、theme／mobile 及 OG 正確。

37. **[37] 建立 Partner 關係並管理雙方分享設定**

    Type: AFK  
    Blocked by: 04  
    User stories covered: US-066, US-067, US-074

    **What to build:** 完成邀請、接受、解除 Partner，以及雙方獨立的 Diary／Stock Note 分享旗標設定。

    **Acceptance criteria:**

    - [ ] pending／accepted 關係、重複邀請、雙方 owner 與解除規則符合基準。
    - [ ] 任一方只可變更自己的分享設定，重新登入仍保存。
    - [ ] 真人與普通 Agent User 使用相同路徑；真 UI／API／DB 覆蓋雙帳戶操作。

38. **[38] 在 Pair View 比較 Diary 並遵守分享隱私**

    Type: AFK  
    Blocked by: 11, 13, 24, 37  
    User stories covered: US-067, US-068, US-069, US-074

    **What to build:** 按既有日期對齊規則比較雙方 Diary，並在現有入口閱讀允許分享的 Stock Note。

    **Acceptance criteria:**

    - [ ] 分享旗標、accepted 關係及來源白名單共同決定可見性；Transaction、Portfolio、Alert、私人 Review 及 email 不外洩。
    - [ ] 日期對齊、時區、單方缺日記、分頁／上限與解除／關閉分享後結果對等。
    - [ ] 雙帳戶 UI 及 API 負向測試證明不能透過改 ID、直接 URL 或 stale client 繞過權限。

39. **[39] 管理 scoped API key 並由 Agent 建立 Diary**

    Type: AFK  
    Blocked by: 05, 08  
    User stories covered: US-070, US-071, US-074

    **What to build:** 由設定建立／查看／撤銷 API key，外部 client 依 key 所屬 User 建立帶來源標示的 Diary，Web 可立即閱讀。

    **Acceptance criteria:**

    - [ ] key 只顯示原文一次並以 digest 儲存；既有 scope、過期／撤銷及錯誤契約正確。
    - [ ] Agent 建立依普通 User 權限，禁止 append-to-today，與 cookie／Bearer 混合時符合顯式身份規則。
    - [ ] 標準 HTTP client 寫入後在 Web 讀到正確作者／來源；invalid key、錯誤 scope 及越權均拒絕。

40. **[40] 讓 Agent 發佈冪等股票研究並經 Partner 閱讀**

    Type: AFK  
    Blocked by: 25, 38, 39  
    User stories covered: US-049, US-050, US-072, US-073, US-074

    **What to build:** 讓外部 Agent 讀取獲授權 Watchlist、更新 Stock Note 及批次寫入 Stock Timeline Record，並按分享設定在 Web 回看。

    **Acceptance criteria:**

    - [ ] 既有批次上限、source vocabulary、key owner、scope 與 idempotency key 範圍全部驗證。
    - [ ] 重試不重複、部分無效資料依既有原子性／錯誤契約處理，不改寫不可變證據。
    - [ ] 由真外部 client 寫入至本人 Company／Partner 允許入口可示範，關閉分享後不可讀。

41. **[41] 管理 ETF Catalog 與歷史資料初始化**

    Type: AFK  
    Blocked by: 18  
    User stories covered: US-076, US-097

    **What to build:** 管理員新增或初始化既有 ETF Catalog、取得並持久化研究所需歷史資料、查看結果及刪除 ETF。

    **Acceptance criteria:**

    - [ ] 依來源的 symbol 驗證、歷史頻率／範圍、唯一性、必要 seed 與刪除關聯處理。
    - [ ] API 與管理畫面有明確成功／失敗／資料筆數，只有 Admin 可操作。
    - [ ] 真 DB＋受控 provider 驗證初始化、重跑、刪除及資料失敗；ETF 不寫入個人股票帳本。

42. **[42] 使用 ETF Watchlist 閱讀研究摘要**

    Type: AFK  
    Blocked by: 41  
    User stories covered: US-075, US-076, US-089

    **What to build:** 使用者從既有 Catalog 加入／移除 ETF Watchlist，查看行情、風險、相對強弱及其他既有研究欄位。

    **Acceptance criteria:**

    - [ ] 未知 ETF、duplicate、排序／分頁與 owner 契約對等，不私自建立另一份 ETF master。
    - [ ] profile 由既有 provider／歷史資料計算，partial／stale／unknown 有清楚狀態。
    - [ ] UI 從新增到閱讀及刪除完整可用，證明與股票持倉無資料混用。

43. **[43] 更新持久化市場價格並查看最新輪動排名**

    Type: AFK  
    Blocked by: 18  
    User stories covered: US-078, US-079, US-082, US-097

    **What to build:** 由管理員觸發或 CLI 更新 canonical universe 的每日價格，生成 snapshots，並在公開 monitor 查看最新有界排名。

    **Acceptance criteria:**

    - [ ] 先持久化價格再計算，canonical seeds、unique keys、scope-local 分數／rank／signal 及 null 行為遵循基準。
    - [ ] 批次與管理員入口共用用例，重跑冪等；真 DB／受控 upstream 測部分失敗、unknown 和無快照 404。
    - [ ] 訪客可經 API／React 讀取最新 rows，不在每次開頁現抓 Yahoo；完整兩週比較與 scope controls 由 45 擴展。

44. **[44] 閱讀 Market State、Sector Breadth 與市場摘要**

    Type: AFK  
    Blocked by: 43  
    User stories covered: US-077, US-082

    **What to build:** 在公開市場視圖讀取 Market State、Sector Breadth、confirmation、歷史狀態及 deterministic summary。

    **Acceptance criteria:**

    - [ ] Market State vocabulary、supporting breadth 與 summary 使用既有計算，breadth 始終來自 sectors。
    - [ ] coverage／stale 門檻及未知狀態不被 neutral 或零掩蓋；不把原始內部狀態直接當主標籤。
    - [ ] UI／API／真 DB 與固定價格驗證正常、部分、unknown 及歷史日期，維持 guest 可讀。

45. **[45] 比較兩週市場輪動並按 scope 篩選排序**

    Type: AFK  
    Blocked by: 44  
    User stories covered: US-078, US-079, US-080, US-082

    **What to build:** 完成 monitor 的 sectors／indexes 選擇、訊號篩選／排序、共同起點 sparkline 與兩週排名變化。

    **Acceptance criteria:**

    - [ ] 合格日期只計同 scope 的 canonical universe，至少 90% coverage；比較日是往前第十個合格快照日。
    - [ ] trend 以共同比較日為 100，缺值不插補；排名、tie-breaker、unknown、非 canonical extra rows 有固定 fixtures。
    - [ ] core 維持 API-only；桌面／手機比較流程及公開認證邊界完整，畫面由同一 dashboard payload 呈現。

46. **[46] 匯出 Market Rotation 的目前視圖**

    Type: AFK  
    Blocked by: 45  
    User stories covered: US-081

    **What to build:** 把 monitor 當前 scope、filter、sort 結果匯出 CSV、精簡 Copy Table 及 PNG。

    **Acceptance criteria:**

    - [ ] 三種輸出只使用目前顯示 payload，不混入未篩選 rows 或重新取得不同時間資料。
    - [ ] CSV／PNG 保留既有 metadata 與欄位，Copy Table 保留 tab-separated 格式。
    - [ ] 從瀏覽器設定篩選排序後下載／複製並驗證內容、特殊字元、空結果及圖像可讀性。

47. **[47] 計算 Position Sizing 並交接至 Diary／Trade Plan**

    Type: AFK  
    Blocked by: 09, 14  
    User stories covered: US-036, US-050, US-083

    **What to build:** 提供所有既有部位計算策略、reserve cash 與 rounding，並複製 Markdown、建立／追加 Diary 或預填 Trade Plan。

    **Acceptance criteria:**

    - [ ] 固定輸入得出既有結果，零／非法輸入與策略切換不產生無效數字。
    - [ ] 使用真 Diary／Trade Plan API 完成既有交接，內容及風險欄位保持一致。
    - [ ] 純計算留在 domain／client，不新增無需要的 API 或 table；驗證本地化及手機操作。

48. **[48] 使用 Financial Freedom／FIRE 計算工具**

    Type: AFK  
    Blocked by: 03  
    User stories covered: US-084

    **What to build:** 提供既有財務假設輸入、目標／年數／projection 結果及複製能力。

    **Acceptance criteria:**

    - [ ] 以固定 fixtures 驗證所有既有公式、邊界、十年 projection 與 rounding。
    - [ ] 輸入調整到結果／複製的 UI 流程完整，無非法無限值，三語、主題與手機可用。
    - [ ] 保持純計算功能，不新增專用持久層或 API。

49. **[49] 比較 Relative Value 並捕捉研究**

    Type: AFK  
    Blocked by: 09, 25  
    User stories covered: US-050, US-085, US-089

    **What to build:** 比較兩個 symbols 的即時價格、target scenarios 及對齊日期的歷史 ratio chart，並完成既有複製／研究捕捉。

    **Acceptance criteria:**

    - [ ] 公式、alias suggestion、日期對齊、缺值／零分母與單邊行情失敗依基準。
    - [ ] quote／historical 消費共用 provider 邊界，不建立第二套 queue／cache。
    - [ ] 由輸入到圖表、失敗提示及真 Diary／Evidence 捕捉完整驗證，保留 guest／登入動作邊界。

50. **[50] 閱讀 Seasonality 並保存本地化研究摘要**

    Type: AFK  
    Blocked by: 07, 09, 25  
    User stories covered: US-050, US-086

    **What to build:** 依既有季節性資料呈現當月、下月、強弱月份及分析，並複製／捕捉本地化研究。

    **Acceptance criteria:**

    - [ ] 既有固定資料與計算、使用者時區月份及本地化 Markdown 對等，不虛構新的行情分析來源。
    - [ ] 跨年、時區、強弱月份排序與缺內容有 deterministic tests。
    - [ ] 由 UI 閱讀至真正 Diary／Evidence 捕捉可示範；純分析不新增無需要的 DB／API。

51. **[51] 搜尋 SEC 公司並瀏覽申報文件清單**

    Type: AFK  
    Blocked by: 04  
    User stories covered: US-087, US-089

    **What to build:** 完成公司搜尋、filings 分頁、單次申報 document index 與既有批次查閱入口。

    **Acceptance criteria:**

    - [ ] SEC 搜尋、filings、document index 與既有批次查閱維持 guest 可用；無效顯式 credential 仍 fail closed。cursor、CIK／accession 驗證及 canonical contract 保留。
    - [ ] SEC contact User-Agent、queue／cache、timeout、等待上限與 provider 錯誤由共同邊界處理。
    - [ ] 受控 upstream 與瀏覽器測試覆蓋搜尋、分頁、開啟申報及失敗／空資料。

52. **[52] 安全閱讀、下載及打包 SEC 文件**

    Type: AFK  
    Blocked by: 51  
    User stories covered: US-088, US-089

    **What to build:** 從申報清單開啟文件、下載指定 basename，並按既有模式打包 ZIP。

    **Acceptance criteria:**

    - [ ] SEC 文件閱讀、下載及 package 維持 guest 可用；無效顯式 credential 仍 fail closed。rendering、headers／內容、打包模式與來源邊界對等。
    - [ ] path traversal、檔案數、單檔／總容量、串流及暫存清理限制有負向驗證。
    - [ ] 從真 UI 觸發讀取與下載，檔案／ZIP 可解析；provider 中途失敗有正確回饋與清理。

53. **[53] 發布公開首頁、About 與使用說明**

    Type: AFK  
    Blocked by: 03  
    User stories covered: US-090

    **What to build:** 依已確認設計語言建立三個公開入口，準確介紹產品用途並完成註冊及說明頁導覽；文章／工具入口隨對應功能交付接入。

    **Acceptance criteria:**

    - [ ] 使用已確認產品事實及標示清楚的示例，不增加無依據宣稱。
    - [ ] SSR metadata、公開路由、三語、主題、keyboard 及桌面／手機驗收通過。
    - [ ] 本票的公開資訊、註冊及說明導覽可獨立示範；不展示尚未實作功能的死連結，文章／工具票交付時負責補上其對應入口。

54. **[54] 建立及預覽管理員 Post 草稿**

    Type: AFK  
    Blocked by: 04  
    User stories covered: US-093

    **What to build:** 管理員建立、編輯、保存及私下預覽 Markdown Post 草稿。

    **Acceptance criteria:**

    - [ ] Post schema、管理員授權、欄位驗證、作者投影及 draft lifecycle 真正持久化。
    - [ ] 重新開啟可繼續編輯；Markdown 安全呈現，草稿不經公開入口洩露。
    - [ ] 真 DB／API／React 覆蓋建立、更新、預覽、長內容與非 Admin 拒絕。

55. **[55] 發布、封存及批次管理 Post**

    Type: AFK  
    Blocked by: 54  
    User stories covered: US-094, US-095

    **What to build:** 讓管理員發布、封存、刪除 Post，使用既有搜尋／分頁及 bulk publish／delete 管理內容。

    **Acceptance criteria:**

    - [ ] 合法 lifecycle、重新發布保留首次發布時間、批次錯誤／原子性依基準。
    - [ ] Admin title／作者姓名／email substring 搜尋與公開搜尋分開；作者 email 不混入 public persona。
    - [ ] UI／API／真 DB 驗證所有單筆／批次操作、權限及搜尋；發布資料供 56 真正閱讀。

56. **[56] 搜尋公開文章並以 SSR 閱讀正文**

    Type: AFK  
    Blocked by: 55  
    User stories covered: US-091, US-092

    **What to build:** 讀者從公開 Article index 依分類及全文搜尋找到已發布文章，直接開啟 URL 閱讀安全 Markdown 正文。

    **Acceptance criteria:**

    - [ ] 只公開已發布且有發布時間的 Post；title／excerpt full-text、content 不參與、三語／stop-word／短字語意由 fixtures 驗證。
    - [ ] 首次 HTML 含正文、title、canonical、OG，sitemap 與既有 URL 導向正確；關閉 JavaScript 仍可讀。
    - [ ] draft／archive／作者 email 不外洩；從 55 發布到搜尋閱讀完整測試，未知相容差異不得默默降級成 substring。

57. **[57] 由 Admin 管理使用者並撤銷被刪帳戶存取**

    Type: AFK  
    Blocked by: 33  
    User stories covered: US-096

    **What to build:** 管理員查看既有統計、搜尋／分頁 users、更新角色及刪除帳戶，並驗證其登入及即時連線影響。

    **Acceptance criteria:**

    - [ ] 所有既有 admin 能力、角色／刪除限制、使用者投影與關聯清理依基準。
    - [ ] 被刪除帳戶的 session 與 Socket.IO 存取失效，其他帳戶不受影響。
    - [ ] 雙帳戶／多 client 真 HTTP 與 UI 驗證搜尋、角色、刪除、越權及資料隔離。

58. **[58] 安裝及更新 PWA 並隔離私人 API 資料**

    Type: AFK  
    Blocked by: 07, 08  
    User stories covered: US-101

    **What to build:** 讓使用者安裝 PWA、更新版本並繼續使用 Diary，service worker 只按既有策略快取允許資源。

    **Acceptance criteria:**

    - [ ] manifest、install／update 流程及靜態資源策略可重現。
    - [ ] 個人 API 維持 NetworkOnly，登出或切換帳戶後不能讀到前一帳戶快取。
    - [ ] 瀏覽器實測安裝／更新、斷網讀取限制與重新連線；不加入離線寫入或背景同步。

59. **[59] 在隔離 K3s 部署並更新完整運行路徑**

    Type: AFK  
    Blocked by: 33, 43  
    User stories covered: US-109, US-110, US-111, US-113

    **What to build:** 從 Docker images 與空 PostgreSQL 部署同 origin Web／API 及市場 CronJob，驗證登入寫日記、前景提醒與批次結果。

    **Acceptance criteria:**

    - [ ] 版本化 migrations／必要 seed、安全設定、health／readiness 及 requestId／jobId logs 可觀察。
    - [ ] API 只有一個啟用的 scheduler／realtime instance，更新策略避免重疊；CronJob 與手動觸發共用用例。
    - [ ] 在隔離環境部署與更新後三條完整流程可重現；發布門檻失敗阻止交付，不要求直接操作使用者正式環境。

60. **[60] 備份還原 PostgreSQL 並驗證產品流程**

    Type: AFK  
    Blocked by: 59  
    User stories covered: US-112

    **What to build:** 使用合成產品資料完成 PostgreSQL 備份、還原及發布回復演練，重開 Web 驗證原有資料與權限。

    **Acceptance criteria:**

    - [ ] 備份、還原、schema 版本及必要系統資料有可執行操作說明。
    - [ ] 還原後 Diary／Transaction、研究、提醒、分享與 session 規則依當時已交付功能驗證；後續 schema 變更持續更新演練。
    - [ ] 隔離演練覆蓋完整恢復與失敗情境，沒有使用或搬遷舊真實使用者資料。
    - [ ] 在真實 schema 版本 N 備份合成資料，於空環境還原後套用 N→N+1 migration，驗證 constraints／seed／代表資料；restore smoke 成為後續每次 migration 的持續 gate。

61. **[61] 完成全功能對等與跨裝置發布驗收**

    Type: AFK  
    Blocked by: 01–60（全部前置切片）  
    User stories covered: US-006, US-098, US-099, US-100, US-101, US-102, US-103, US-106, US-107, US-108, US-109, US-110, US-111, US-112, US-113, US-114

    **What to build:** 針對所有已交付切片完成全產品 parity、三語／主題／a11y、效能、Native contract 及部署還原的最終交付報告。

    **Acceptance criteria:**

    - [ ] 逐項關閉基準矩陣，114 stories 與有效 routes／API／排程均有證據；未實作或未解釋差異為零。
    - [ ] 通過真 PostgreSQL／HTTP／Socket.IO／Native-client／核心 E2E、contracts drift、desktop／mobile 與預先訂立的效能門檻。
    - [ ] 以當前完整 schema 重跑空環境部署及備份還原；本票只整合驗收及修正回歸，不能把前面遺漏的功能藏成大型補作。

### Integrated checkpoint after Diary list and market mounting

2026-09-05: root ran `npm test`; 17 files / 138 tests passed. This checkpoint includes the new Diary list HTTP/PostgreSQL cases, Quick Diary append/row-lock cases, shared template generation, market provider and market HTTP cases alongside prior auth/settings/client regressions. Contracts/client drift and Drizzle migration metadata checks passed. New SPX-session, capture-reminder/voice and ledger work started after this checkpoint and require their own subsequent verification; it is not a final release gate.
