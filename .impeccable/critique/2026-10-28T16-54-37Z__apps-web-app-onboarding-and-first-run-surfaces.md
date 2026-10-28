---
target: diary-v3 onboarding & usability (apps/web/app)
total_score: 27
p0_count: 1
p1_count: 3
timestamp: 2026-10-28T16-54-37Z
slug: apps-web-app-onboarding-and-first-run-surfaces
---
# UI/UX 批判：Trade basic 的首次上手與日常易用性

目標：讓新用戶更容易上手、更容易持續使用。範圍聚焦 `apps/web/app` 的首次使用路徑（公開首頁 → 註冊 → 工作區 Overview → 快速記錄 → 複盤）與工作區導航。

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Overview 先渲染六區段載入骨架，才塌縮成首次使用畫面；新用戶的第一印象是一個正在載入的儀表板 |
| 2 | Match System / Real World | 3 | 「繼續前往 / Continue elsewhere」「持倉背景」是介面語言；快速記錄的「種類」下拉命名的是機制而非意圖 |
| 3 | User Control and Freedom | 3 | 草稿存活、還原/捨棄、Esc、確認對話框焦點返還都在位；刪除後無 undo |
| 4 | Consistency and Standards | 3 | 由 CI 腳本強制，水準罕見；但 `registration-complete.tsx` 用原生 `<button>{pending ? '…' : …}` 換掉標籤，違反系統自己的「送出中保留標籤」規則 |
| 5 | Error Prevention | 3 | 建立/追加衝突、唯讀回讀不確定狀態、密碼 72 bytes 提示都做得好；但帳戶時區靜默預設 `Asia/Taipei` |
| 6 | Recognition Rather Than Recall | 2 | 「寫完整日記」藏在無標籤 chevron 後；注意力嚴重度用 1/2/3px 灰線編碼且無圖例；工作區內沒有任何說明入口 |
| 7 | Flexibility and Efficiency | 3 | ⌘J、⌘Enter、命令面板、範本、片語、saved views、URL 保留篩選——專家路徑紮實 |
| 8 | Aesthetic and Minimalist | 3 | 「The Ledger」是真正有主張的系統；但只有一篇日記的帳戶仍看到六個區段 |
| 9 | Error Recovery | 3 | 分區重試、requestId、表單保留內容、boundary 三個出口；`c.open` 未定義造成一個無名連結 |
| 10 | Help and Documentation | 1 | `/guide` 只存在於公開殼層，靜態五條，工作區完全連不到；無任何情境說明或術語解釋 |
| **Total** | | **27/40** | **Acceptable — 工藝在前段班，首次上手是唯一拖後腿的軸線** |

## Anti-Patterns Verdict

**LLM assessment: 不像 AI 生成。** 這是我少見的情況——`DESIGN.md` 不只是規則清單，它記錄了每條規則被哪次實測推翻，而且規則真的落在程式碼裡。`--shadow-1: none`、ledger row 的等寬數字、三個 register（capture/ledger/reading）、用 hairline 而非 tile 分組、工具索引是「ruled list 而非 tile grid」——每一條都是對 AI 預設風格的明確拒絕，而且被 `check-register-assignment.mjs`、`check-native-edges.mjs`、`check-design-contrast.mjs` 守住。沒有 cream/sand 底色、沒有 gradient text、沒有 eyebrow、沒有 hover lift、沒有 glassmorphism。

**Deterministic scan:** `detect.mjs` 掃描 `apps/web/app`，3 筆：

- `markdown.tsx:49` broken-image — **誤報**。這是 Markdown 的 `<img>` 透傳，src 來自作者內容。
- `market-rotation.tsx:921` 未登記色 `#cbd0d7` — **真實漂移**，一個硬編碼色繞過了 token 層。
- `styles.css:530` side-tab accent border — **已知且有正當理由的偏離**。它是 `--rule-strong` 的中性灰，不是彩色 accent，`DESIGN.md` 明文說嚴重度由「列首規則線的粗細」承載。但見下方 P2：這個編碼對人眼幾乎不可見。

**Visual overlays:** 無。詳見 Run Notes。

## Overall Impression

這個產品的工藝水準遠高於它的上手難度所暗示的。設計系統、無障礙、錯誤復原、鍵盤路徑都做到了多數商業產品達不到的程度——`scripts/check-design-contrast.mjs` 在明暗兩個主題各驗 74 組配對全數通過，`check-native-edges.mjs` 掃 204 個檔案確認每個 disclosure 和每個確認框都是系統自己的。

問題不在任何單一畫面做得差，而在**沒有人負責把新用戶從零帶到第一次完整的「記錄 → 複盤」循環**。產品的三步承諾寫在首頁、寫在註冊頁側欄、寫在 `/guide`——然後在工作區裡消失。最大的單一機會：**讓快速記錄能排複盤**。目前它不能，而它正是產品從每個入口推給用戶的那條路。

## What's Working

1. **錯誤與不確定狀態的誠實度。** `quick-composer.tsx` 的 `uncertain` 狀態——儲存後回讀失敗時，它不假裝成功也不假裝失敗，而是保留草稿、說明狀態、提供「檢視該日記 / 重試回讀 / 捨棄」三個出口。多數產品在這裡選擇說謊。

2. **導航回答的是點擊，不是 loader。** `data-nav-pending` 讓目的地立刻取得選取填色，而 `aria-current="page"` 仍只在路由真的到達後才移動，到達由 `root.tsx` 的單一 polite live region 播報。這個區分——視覺即時、輔助技術誠實——極少有人做對。

3. **命令面板有可見觸發點。** `command-palette.tsx` 的註解寫著「A discoverable entry point; the shortcut alone would never be found.」側欄和手機頂欄都有按鈕。這是對的，而且是上手友善的正確直覺——下面的問題正是同一個直覺沒有被套用到其他地方。

## Priority Issues

### [P0] 快速記錄無法排複盤，產品的循環從預設路徑永遠閉不起來

**Why it matters:** 產品對外的承諾是三步：記錄 → 連結證據 → 複盤。但 `reviewDueAt` 只存在於完整編輯器（`diary-editor.tsx:111`），`quick-composer.tsx` 完全沒有這個欄位。而快速記錄是手機底欄的 Capture、⌘J、Overview 首次使用的「開始記錄」、側欄主按鈕——四個入口全部指向它。儲存後 `QuickSavedState`（`quick-composer.tsx:298`）給出「開啟 / 編輯細節 / 再記一篇 / 返回公司」四個動作，沒有一個是「安排複盤」。

結果：只用快速記錄的用戶，複盤隊列永遠是空的，Overview 永遠顯示「目前沒有需要處理的事項」，產品看起來就是一個筆記本。第三步從未發生，而第三步才是這個產品與 Apple Notes 的差別。

**Fix:** 在 `QuickSavedState` 的動作列加入一個排複盤的 quiet action——三個預設值（下週 / 下月 / 下季）直接寫入 `reviewDueAt`，第四個「自訂」才跳編輯器。這是儲存後的時刻，用戶剛寫完、還記得這個判斷需要多久才驗證得出來，是全流程中詢問成本最低的一點。注意不要放在送出前：那會讓捕捉變重，而低摩擦捕捉是這個產品的第一原則。

**Suggested command:** `$impeccable onboard`

### [P1] 首次使用判定是全有全無，新用戶的第一眼是載入中的儀表板

**Why it matters:** `overview.tsx:943` 的 `allResourcesReady` 要求七個請求全部成功——`/api/portfolio/overview`、`/api/reviews`、`/api/diaries/summary`、`/api/trade-plans`、`/api/stocks/watchlist`、`/api/auth/me`，加上 `root.tsx:190` 重複發的另一次 `/api/auth/me`。只要其中任何一個還在飛或失敗，`firstUse` 就是 `false`，於是渲染的是完整儀表板分支：六個區段、每個都是「載入中…」或空狀態，然後才整個塌縮成歡迎畫面。

新用戶註冊後看到的第一個畫面，是一個正在載入的、全空的儀表板，接著版面跳動一次。如果有任何一個端點失敗（這在新帳戶上並不罕見——行情覆蓋、持倉估值在零資料時最容易走到邊界），歡迎畫面**永遠不出現**，用戶看到的是六個區段的錯誤和重試按鈕。

**Fix:** 兩件事。(a) 首次使用應由單一廉價事實決定，而非七個請求的交集——日記總數為零就足以渲染歡迎畫面，其餘區段再漸進填入。(b) 移除重複的 `/api/auth/me`：`root.tsx` 的 `Shell` 已經取得 viewer，用 outlet context 傳下去，`overview.tsx:921` 的第二次呼叫可以刪掉。

**Suggested command:** `$impeccable onboard`

### [P1] 每個新帳戶靜默預設 `Asia/Taipei`，而快速記錄的日期會在作者眼前改掉

**Why it matters:** `packages/db/src/schema/account.ts:47` 把 `timezone` 預設為 `Asia/Taipei`，註冊流程從不詢問、從不確認。對一個**以日期為主鍵的記錄產品**，這不是偏好設定，是資料正確性。

更糟的是 `quick-composer.tsx:190` 先用裝置日期填入日期欄，然後 `:672` 的 effect 在帳戶載入後把它覆寫成帳戶時區的日期。紐約時間晚上九點的用戶，會看到日期欄在打字途中從 29 號跳成 30 號，沒有任何說明。而完整編輯器的時區註記（`diary-editor.tsx:1286`）說的是**裝置**時區，描述的是交易時間欄位，不是這篇日記被歸檔的日期——兩個不同的時區在同一個表單裡，只有一個被說出來。

**Fix:** 註冊完成後（`registration-complete.tsx` 的成功狀態，或 Overview 首次使用區塊）用一行確認裝置時區：「你的記錄將歸檔在 Asia/Taipei。改用裝置時區 America/New_York？」`/settings` 已經有「使用裝置時區」的動作，這裡只是把它搬到它真正該出現的時刻。另外在快速記錄的日期行加一句常駐的帳戶時區標註，覆寫就不再是無聲的。

**Suggested command:** `$impeccable clarify`

### [P1] 兩個最核心的空狀態是死路，而設計好的第二步提示是一個無名連結

**Why it matters:** `DESIGN.md` 的 Patterns 明文規定「成功但為空的資料集要給一個起點」。24 個檔案遵守了。兩個沒有——而它們正是新用戶最先點的兩個側欄項目：

- `/diaries`（日記庫）：`routes/diary-list.tsx:824` 空狀態只有一句 `diary-list-copy.ts:28` 的「Your diary library is empty.」沒有任何按鈕。新用戶點側欄第一個項目，得到一句話和一個死胡同。
- `/stocks`（持倉）：`routes/holdings.tsx:204` 是裸 `<p>{l.empty}</p>`，文案說「Record a purchase in a diary to begin.」——用散文描述了下一步卻不提供連結。

同時，系統設計來承接「剛寫完第一篇」的那個提示壞了：`overview.tsx:814` 的 `{c.open}` 在三個語系的 copy 物件裡都不存在。它渲染成空字串，所以 total===1 的用戶看到的是「讓這筆記錄日後更容易回看。 · 安排稍後複盤」——前面那個連結有 href、有焦點、在螢幕閱讀器裡被宣告為連結，但沒有可存取名稱。這是整個產品裡唯一用來推進第一步到第二步的機制，而它是壞的。

**Fix:** 補 `open` 這個 key（三語）。把 `/diaries` 和 `/stocks` 的空狀態改成系統自己的 `.empty-state` well 加一個具名動作（「寫第一篇日記」/「記錄一筆買入」），與其他 24 個檔案一致。

**Suggested command:** `$impeccable polish`

### [P2] 工作區裡沒有任何說明入口，而「寫完整日記」藏在一個無標籤的 chevron 後

**Why it matters:** `/guide` 存在，但 `PublicNavLinks` 只渲染在公開殼層。登入之後，說明就從產品裡消失了——`nav.tsx` 的四個群組、`AccountLinks`、`MobileMenu` 裡都沒有它。這對一個術語密集的產品是硬傷：「論點 / 複盤 / 持倉集中度 / 大師持倉」對新投資人不是自明的，而介面沒有任何地方解釋它們。

同時 `quick-entry.tsx:62` 寫的是 `<DisclosureSummary aria-label={c.more}></DisclosureSummary>`——一個空的、只有 chevron 的 summary。它後面唯一的內容是「寫完整日記」，也就是通往 `/diaries/new`（思路、風險、執行、交易、複盤排程都在那裡）的唯一側欄入口。產品兩條捕捉路徑中較完整的那一條，藏在一個圖示後面。螢幕閱讀器有 `aria-label`，但視覺用戶只看到一個三角形。

**Fix:** 把 `/guide` 加進 `AccountLinks`（釘在側欄底部那塊，Settings 旁邊），並讓它針對已登入狀態換成任務導向的內容。把 quick-capture 的 chevron 改成有文字的 split-button，或乾脆把「寫完整日記」升級成並列的次要按鈕——它只有一個選項，disclosure 在這裡沒有省下任何東西。

**Suggested command:** `$impeccable onboard`

## Persona Red Flags

**Jordan（第一次使用這類產品）**
- 註冊成功後**沒有被登入**。`auth-form.tsx:174` 在直接註冊模式下設 `directDone` 並顯示「Your account is ready. Sign in to start recording.」加一個登入連結——剛設定完密碼的人要立刻再打一次 email 和密碼。這是活化漏斗上最便宜可以補的一個洞。
- 進到工作區，看到一個載入中的六區段儀表板（見 P1）。
- 點「開始記錄」，看到一個標題為「內容」的空白 textarea，**沒有 placeholder、沒有提示**。上面是一個叫「種類」的下拉，選項是「空白 / 交易 / 反思 / 觀察」——範本（真正的鷹架）在這裡，但預設是「空白」，而下拉的命名不會讓 Jordan 知道選它會發生什麼。
- 寫完存檔，四個動作沒有一個告訴他接下來該做什麼（見 P0）。
- 點側欄第一項「日記庫」，看到一句「日記資料庫還未有記錄。」沒有按鈕。
- 全程找不到任何說明連結。

**Casey（手機、單手、會被打斷）**
- 底欄五格把整個日記循環放在拇指區，這部分做得對。
- 但主要寫作動作在快速記錄對話框裡；`DESIGN.md` 說手機上送出按鈕會黏在底欄上方——這點有照顧到。
- 草稿存在 localStorage 並有 24 小時過期與還原/捨棄（`quick-composer.tsx:86`），被打斷後回來內容還在。這是這個 persona 最關鍵的一項，而且做對了。
- 風險：`CaptureReminder`（`quick-capture-tools.tsx:103`）只在 app 開著的前景輪詢（30 秒一次 `setInterval`）。它叫「記錄提醒」，但手機用戶關掉分頁後它永遠不會響。這個功能的名字承諾了它無法兌現的東西。

**Alex（熟手，討厭被牽著走）**
- 幾乎沒有紅旗。⌘J、⌘Enter、命令面板、範本、片語、saved views、URL 保留篩選、沒有強制導覽。
- 唯一一項：注意力列的嚴重度是 1px / 2px / 3px 的灰色列首線（`styles.css:530`），沒有圖例。Alex 掃五列的時候，這個編碼他看不見，所以他只會用順序來判斷優先度——而順序在 `overview-logic.ts:32` 裡確實是對的。那條線實質上沒有傳遞任何資訊。螢幕閱讀器反而拿到明確的 `sr-only` 詞。考慮把它換成列首的一個具名文字標記，或承認順序已經足夠並移除它。

## Minor Observations

- `registration-complete.tsx` 的送出按鈕用 `{pending ? '…' : c.create}` 換標籤，違反 `DESIGN.md` 的「送出中保留標籤」規則（該規則的理由正是換標籤會讓控制項寬度在送出瞬間改變）。改用 `ActionButton`。
- `DESIGN.md` 的 Layout 段說手機底欄是「四欄」，實際 `diary-navigation.tsx` 是五欄（capture / library / timeline / calendar / reviews）。文件漂移。
- `market-rotation.tsx:921` 硬編碼 `#cbd0d7`，繞過 token 層。
- 訪客載入首頁時 console 噴兩個 401（session 探測）。無害但吵。
- Overview 的「繼續前往 / Continue elsewhere」是介面語言，不是用戶語言。它底下的三個項目是交易計劃、研究、工具——直接叫它們「還沒用到的地方」或乾脆用三個具名區塊，比一個抽象標題好。

## Questions to Consider

- 如果「複盤到期」是這個產品唯一會主動找上用戶的事件，為什麼它只能在較少人走的那條路上被設定？
- 一個只寫了一篇日記的帳戶，和一個寫了三百篇的帳戶，應該看到同一個 Overview 嗎？目前除了一個會消失的首次使用區塊之外，它們看到的是同一個版面。
- `/guide` 的五條說明是對的內容，放錯了地方。如果它們以情境提示的形式出現在對應的頁面上（日記庫空狀態、複盤隊列空狀態、持倉空狀態），還需要一個 guide 頁嗎？
