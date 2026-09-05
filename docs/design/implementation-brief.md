# diary-v3 視覺與互動實作簡報

狀態：實作前設計決定，未經畫面驗收；不能用本文件將 ticket 03 標示完成。
日期：2026-09-05。使用者授權在離開期間自主設計及並行實作。本方向是代理的設計判斷，不代表使用者逐項選過色彩或布局。

PRODUCT.md、PLAN.md 及 `.scratch/diary-v3-rebuild/PRD.md` 是功能與產品事實來源。此文件不新增業務規則。DESIGN.md 留待完成後根據實際 UI 記錄，避免將意圖寫成已交付事實。

## 選定方向：決策議程

主要工作區模式為 **Operate**；日記詳情及公開文章為 **Read**。產品的獨有機制，是讓當時的投資判斷、之後得到的證據與最後的複盤可以互相核對。第一個 viewport 應讓人知道今天有甚麼待處理，以及從哪裏記下一個判斷。

使用者面對的是盤中簡短記錄、盤後較長閱讀和週期性的回看。取材自投資委員會的議程與決議記錄：清楚的日期、排列好的待處理事項、可以展開的內容，以及永遠看得出「當時」和「現在」的時間脈絡。這是資訊結構，不模擬紙張、印章或會議室。

視覺以冷白、深墨綠文字、低飽和灰綠側欄和深綠主要動作建立秩序。用實心的小型狀態標記和欄位標題建立層次，不靠一排巨大 KPI 卡片。介面採單一系統無襯線字體；數字使用 tabular numerals。主區域由列表、標題、分隔和留白構成；不將每一段包成帶陰影的圓角卡片。

相較舊 `design-tokens.css` 的藍色主操作、Fraunces display、12–24px 圓角與多層陰影，本次替換為功能明確的字級、4–8px 圓角與主要平面。舊版顏色和容器不是新介面的約束。保留 skip link、44px 觸控目標、Quick Diary 全域入口和權限／空狀態等有效能力。

### 抽選與判斷記錄

七個取材方向依場景共鳴排列為：研究檔案索引、證券研究表格、日期日誌、**投資委員會決策議程**、公司事件時間軸、資料校驗工作表、圖書館研究目錄。這些分別來自索引、數據表格、時間記錄和議事流程；候選 4 以行動排序和前後判斷最適合完整工作區。類別慣例的 KPI 卡片儀表板及其反面的空白極簡日記均不作候選。

Impeccable direction seed 為 `4587f8b7`，指定候選 4。第一次因無網路降級；經明確只 GET roll API 的升權重試後成功取得 catalog `c3b204a1eed6` 的六個 challengers。不是降級抽選，沒有更換 seed。

| Challenger 融合方式 | 使用者認同／產品清晰度判斷 | 結論與保留的系統紀律 |
| --- | --- | --- |
| 參數化 identity：每次記錄改變標記和配色 | 動態身份與穩定分析環境不相符；變色無助辨別資料 | declined；保留同一組語意 tokens 同步控制所有互動狀態 |
| Racing league：股票如隊伍、數據沿橫軸排列 | 競速意涵偏離反思；選取色覆蓋漲跌語意 | declined；提高表格數字對齊與選取狀態的一致性 |
| Tensegrity：論點與反證形成受力圖 | 有助表達對立證據，但讓日常寫作增加圖形閱讀成本 | competitive（清晰度僅在論點探索成立）；保留原始論點與反證並列的可追溯性，不建立新圖形工具 |
| Deep dive：研究由摘要逐層下潛 | 分層閱讀可用，海洋象徵不是投資日記的熟悉語言 | declined；保留內容進深時公司和日期上下文的位置一致性 |
| Depot blind：待處理事項如目的地列表 | 排列清楚，但半行故障和斜裁文字降低錯誤可讀性 | declined；保留每個狀態都有明確文字與資料時間，絕不以低透明度暗示 stale |
| Drum machine：日期作步進列、點亮已記錄日 | 日期模式有共鳴，但十六步與產品日曆不相符 | declined；保留日曆選取與有記錄日期的非色彩標記及鍵盤可操作性 |

採代理授權下的 code-led 方向準備，不建立生成圖 comp，也不存在使用者已批准 comp。這個 Operate UI 的主要風險是資訊密度、焦點與長文字；需要真內容及可互動 React 畫面驗證。沒有裝飾影像需求。抽選記錄及此簡報不是品質驗收。

## 全域布局

- **桌面 ≥ 1100px：** 216px 固定側欄；內容區左右 32px，上方 24px；標準工作區最大 1440px，閱讀正文最大 72ch。頁首包含所在頁標題、當地日期和主要動作，不放 marketing 標語。不要同時設置第二個大型品牌 header。
- **平板 760–1099px：** 側欄收進有文字標籤的「選單」按鈕；保留單列頁首。兩欄內容只有在兩邊仍有至少 280px 時並列。
- **手機 < 760px：** 16px 邊距、單欄。底部導航為總覽、日記、複盤、更多；「記錄」是獨立全域動作，避免將開啟 editor 和 navigation 混為同一選取 tab。底部加 safe-area 與內容 padding。選單列出其餘完整入口。
- 側欄第一組：總覽、日記（內有 Timeline／Calendar／搜尋）、持倉、研究、複盤。第二組：交易計劃、提醒、紀律、伙伴。底部設定、API keys；管理員看到管理入口。精確 route 對應由實作沿用已有入口，不因重組導航改 API。
- 新功能完成才接上有效導航；ticket 03 的 Company／Review／Overview 樣板只出現在標明「合成資料・設計預覽」的開發預覽入口，不在正式導航放假操作。
- 所有 route 有可見 H1；麵包屑只用在公司研究、文章管理等真正有層級的頁面。當前頁 `aria-current="page"`。窄視窗導航和 dialog 使用原生或 portal，避免被 scroll container 裁切。

## 代表流程

### Overview：從待處理事情開始

標題列為「總覽」＋使用者時區日期＋「記下一筆」。主欄約 2/3 寬，先列到期／即將到期複盤及需處理事項，再呈現按日期分組的近期決策。右欄約 1/3 放持倉摘要和正在追蹤的公司。摘要最多一行三項數據，資料不完整時在數據旁直寫「部分報價」，顯示來源時間；不以總數字掩蓋缺報價。每列說明事項類型、來源標題、日期與可執行下一步。手機先待處理、再近期記錄、再持倉。

空帳戶直接顯示「先記下今天的一個判斷」及新增日記動作；不要虛構市值或塞入示範交易。若沒有待處理事項，寫「目前沒有待處理複盤」並保留近期記錄。不存在的行情與真實 0 必須外觀可區分。

### Quick Diary／完整 editor：先寫，再補結構

Quick Diary 保留既有快捷鍵，visible label 說明。桌面使用約 680px 原生 dialog，手機全高 sheet；固定頂部「快速記錄」＋關閉，固定底部儲存狀態＋明確主要動作。第一焦點是文字內容，日期清楚可見，模板透過具標籤的 select 或按鈕選單，不做無名稱的圖示列。自由寫作可以立即完成；日期衝突按現有行為提供開啟當日日記／追加，而非默默覆蓋。

完整 editor 將日期、標題、Markdown 主文字放主欄；原始 thesis／risk／execution、tags、transaction 和 reminders 以有標題的分組逐步展開。桌面 editor 與預覽可切換或並列；手機維持「編輯／預覽」同一區域，保留未儲存內容。交易輸入顯示欄位名稱、單位及精度，不在前端以浮點計算替代 API。底部顯示「尚未儲存／儲存中／已儲存」，失敗保留內容及重試；關閉未儲存 editor 使用可理解的放棄確認。

### Company：目前觀點與歷史證據分開

頁首為公司名稱與 symbol；行情緊接其後，包括幣別、as-of、資料品質。行情可以 guest 讀取；個人持倉、Note 和 Thesis 依權限顯示。下方穩定 tabs 為摘要、研究、時間線。摘要顯示個人持倉（如有權）、目前 Stock Note 及活躍論點；研究承載論點 lifecycle、證據及複盤入口；時間線保留事件時間、來源和原始內容。

Stock Note 標明「目前觀點・可編輯」，immutable record 標明「記錄於…」且沒有編輯 affordance。Thesis review 與原始論點並列，review outcome 不是通用漲跌 pill。手機按原始論點→證據→當前評估閱讀，不能為壓縮而隱藏來源或評估日期。外部供應商錯誤只影響行情區，已取得的私人研究內容仍可讀。

### Review：先核對當時，再作結論

桌面左邊約 300px 是按到期時間排列的 queue，右邊選中事項。詳情先呈現原始決策與日期，再是已知結果、reflection 和下一步。寫作區明確標示「事後複盤」，不與原始 thesis 共用一個 textarea。Diary review 和 Thesis review 保持種類與所屬 link。完成按鈕直到必要欄位有效才可提交，API 決定狀態與 reviewedAt；UI 顯示伺服器結果。

手機 queue 與詳情是前後頁，提供「返回複盤清單」且恢復 scroll／filter。列表視圖不外洩私人的完整 reflection；partner view 只渲染 API allowlist。重複提交防止雙擊，失敗保留輸入，完成後顯示可辨認的下一項入口。

## 實作候選 tokens

以下數值是起點，必須在實際前景／背景組合驗證對比；未宣稱已通過 WCAG。

| 語意 token | Light | Dark |
| --- | --- | --- |
| canvas | `#F5F7F6` | `#101916` |
| surface | `#FFFFFF` | `#17231E` |
| surface-muted／sidebar | `#EAF0EC` | `#1E2E26` |
| text | `#182B23` | `#EAF1ED` |
| text-muted | `#4E6258` | `#ADBCB3` |
| border | `#CAD5CE` | `#405249` |
| control-border | `#73867A` | `#7C9486` |
| action | `#215C43` | `#8BD2AF` |
| on-action | `#FFFFFF` | `#102C1E` |
| selected | `#DCECE2` | `#284C39` |
| negative | `#A32938` | `#FF9EA8` |
| positive | `#196946` | `#85D7AA` |
| warning | `#805B0B` | `#E6C371` |
| focus | `#285DC2` | `#A3BFFF` |

System font stack: `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang TC", "Microsoft JhengHei", sans-serif`。中文與拉丁混排不套 letter spacing。字級 12px（metadata，限少量）、14px（緊湊標籤）、16px（正文／input）、18px（section）、24px（頁標題）、32px（只供主數據）；使用 rem，200% 縮放仍可操作。正文 line-height 1.65，UI 1.4，tabular-nums 用在數字與日期而非全頁 monospace。

Spacing 4／8／12／16／24／32／48px；input、button 最小高度 44px。Radius 4px（buttons/inputs）、8px（dialog）、2px（小 badge）。固定 1px 分隔，聚焦外框 2px＋2px offset；default surface 不設陰影，僅 popover/dialog 使用中等 elevation。Button 統一 primary／secondary／quiet／danger，狀態不各自發明形狀。

## 共用互動與可達性

- Route loading 保留 shell，以對應行高 skeleton 顯示內容；請求錯誤在所屬 section 提供重試和可複製 requestId。不要整頁 spinner 抹走上下文。儲存成功使用安靜的 `role=status`；阻止操作的錯誤才用 alert。
- 每個 input 有 visible label、需要時有 description，error 透過 `aria-describedby` 對應；提交錯誤摘要可聚焦並連到欄位。不要只靠 placeholder 說明。
- 登入狀態判定中不得閃現私人資料或登入錯誤頁；到期重登入保留安全的返回 route，不能在公開 HTML 放私人內容。不同 session 狀態不藉主題顏色表示。
- 焦點可見；dialog trap focus、Esc 可關閉、關閉返回觸發控制；全域 shortcut 不攔截輸入法組字或欄位輸入，不改原有快捷鍵語意。
- 危險操作以對象名稱與後果清楚確認；有關聯不可刪除時顯示 API 原因，不把按鈕藏起來令使用者猜測。資料表每列選單必須有包含對象的 accessible name。
- Table 首列清楚單位，金額右對齊；排序按鈕和 `aria-sort` 同步。窄表格可轉保留完整欄位的摘要／展開；真正寬矩陣放具名稱的橫向 scroll 區，提示尚有欄位，頁面本身不得橫向溢出。
- 三語使用完整 translation keys 與 interpolation，不串接句子；zh-TW／zh-CN／en 都測長標題、長股票名稱、負數及大型 numeric string。數字／日期顯示由 locale 與設定時區決定，API civil date 不當作 UTC instant 格式化。
- status 使用文字＋形狀或符號，不靠紅綠。theme 初始以設定或系統決定並避免 SSR 閃色；所有狀態均有兩組 tokens，不以 CSS invert 翻轉頁面。
- 動效只有 160ms 的展開／淡入狀態回饋，沒有 page entrance 或數字跳動。prefers-reduced-motion 下取消非必要 transition；focus、error、成功回饋仍清楚。

## 代表性合成資料及驗證

ticket 03 預覽以「合成資料・不代表真實帳戶或市場」持續可見標記：2026-09-04 日記「價格回落後，我仍在等待甚麼？」；範例公司用明確 fictional `DEMO` 與「示例公司」；文字為「原先假設需求會回升；本週觀察尚不足以確認，先保留現金」。Review 原始判斷與後見反思分開。行情標示 synthetic、固定時間；不得把 fictional symbol 送到真 provider。零資料畫面獨立測試，不用 sample 掩蓋。

實作後的最小畫面矩陣：1440×1000 desktop、390×844 mobile，另以 320px／200% zoom 檢查 reflow；light＋dark、三語最長情境、keyboard 全流程、empty／loading／error／partial quote／forbidden／long Markdown／wide table。第一批截圖一起檢查並一次修正，第二批確認。截圖需開啟核實內容正確；功能與 DB 測試另行證明。

完成後按 Impeccable detector 與獨立 finish review，將 paths、上述方向、全部 required viewports、狀態與 detector 結果交給 reviewer；修正後再由實際樣式記錄 DESIGN.md。若 harness 沒有 shipped reviewer role，需向 root 說明並採 fresh independent reviewer，不能自稱執行了不存在的角色。此簡報交付不包含這些完成證據。
