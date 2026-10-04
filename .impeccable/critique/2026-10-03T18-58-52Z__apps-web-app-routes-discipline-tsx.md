---
target: discipline 頁面 UI
total_score: 21
p0_count: 1
p1_count: 3
timestamp: 2026-10-03T18-58-52Z
slug: apps-web-app-routes-discipline-tsx
---
## Design Health Score

| # | 啟發式原則 | 分數 | 主要問題 |
|---|-----------|-----|---------|
| 1 | Visibility of System Status | 2 | 新增／刪除／排序全部只回「紀律已更新。」，而且訊息永不消失；清單沒有條數 |
| 2 | Match System / Real World | 3 | 文案得體；但「分享 JSON」「選擇 JSON 檔案」是開發者語言 |
| 3 | User Control and Freedom | 2 | 刪除一下即永久生效，無確認、無復原；離開守衛用原生 `window.confirm` |
| 4 | Consistency and Standards | 2 | 置中大標＋投影卡片＋襯線粗體，與工作區其他頁面不同；完全沒用 `.panel`/`.card`/`.empty-state`/`.quiet-button`/`.danger-button` |
| 5 | Error Prevention | 2 | 刪除無確認；255 字上限無計數；取代式匯入只靠原生 confirm |
| 6 | Recognition Rather Than Recall | 3 | 標籤齊全，但編輯時整頁列控制同時變灰且無任何說明 |
| 7 | Flexibility and Efficiency | 1 | 排序只有上移／下移，第 10 條移到第 1 要按 9 次；無拖曳、無搜尋、無批次 |
| 8 | Aesthetic and Minimalist Design | 2 | 匯入／分享區塊佔全頁近一半；每列 4 顆同重量按鈕；抽出的紀律與第 01 條重複 |
| 9 | Error Recovery | 3 | `FailureNotice`、不確定狀態對帳、重試都做得很紮實 |
| 10 | Help and Documentation | 1 | 只有一行導語；空狀態沒有範例，沒說明什麼算一條好紀律 |
| **Total** | | **21/40** | **Acceptable — 資料層很用心，介面層沒被設計過** |

## Anti-Patterns Verdict

**LLM assessment**：這頁不是 AI slop。沒有漸層文字、沒有 all-caps eyebrow、沒有相同卡片網格、沒有裝飾性圖示。問題是相反方向——它是**未經設計的表單傾倒**：標題置中像行銷頁、清單像後台 CRUD、底部掛著一整塊開發者用的 JSON 工具，三種語氣疊在一頁。

**Deterministic scan**：`detect.mjs` 掃 `discipline.tsx`、`discipline-transfer.tsx`、`discipline-share.tsx` → `[]`，0 筆。偵測器乾淨，但它抓不到的是「違反本專案自己的 DESIGN.md」，而那裡有實打實的違規（見 P1）。

**Visual overlays**：本次 session 無瀏覽器自動化，改以 `docs/design/evidence/discipline/1440.png`、`390.png` 的既有截圖做視覺證據。無 overlay。

## Overall Impression

資料層的品質遠高於介面層。`reconcileCreate`、`AbortController`、`useBlocker`、不確定狀態對帳——這是會認真處理失敗的人寫的。但使用者看到的是：一個置中的行銷式標題、一張帶投影的卡片重複念出清單第一條、每條紀律配四顆一樣重的按鈕、然後是佔了整頁 45% 的 JSON 匯入匯出表單。

**最大機會**：這頁的核心價值是「下決策前讀一條自己的紀律」，但那個動作現在只是一顆浮在空中的次要按鈕；而「管理 JSON」這個一年用一次的功能卻佔了最多像素。把版面權重按使用頻率重排，這頁立刻就對了。

## What's Working

1. **編號 + 襯線句子的清單樣式**。`counter(principle, decimal-leading-zero)` 的 01/02 配上襯線正文，真的像一本守則，比用卡片堆好得多。這個方向對，問題只在它被周圍的雜訊淹沒。
2. **失敗處理的誠實度**。建立／匯入在連線不確定時會重新拉清單對帳，再告訴使用者「結果尚未確定，請保留草稿」——大多數產品這裡會直接騙人說成功。
3. **排序後焦點回到被移動的那一條**（`document.getElementById('principle-' + movedId)?.focus()`）。鍵盤使用者可以連按不會迷路，這是少見的細節。

## Priority Issues

### [P0] 刪除紀律沒有任何確認，一下即永久消失

`discipline.tsx:58` 的 `remove()` 直接發 DELETE，沒有確認對話框、沒有復原、沒有 undo toast。按鈕用 `className="secondary"`，和「上移」「下移」「編輯」長得一模一樣、並排在一起。

**Why it matters**：手機上四顆按鈕換行排列，誤觸就沒了。這同時直接違反 DESIGN.md 寫明的規則：「每個破壞性動作都用 danger button，附後果說明與確認對話框」。

**Fix**：改用 `.danger-button` + 既有的 `.delete-dialog` 模式（取消為 autoFocus，確認鍵說出後果：「刪除「<前 20 字>…」？此動作無法復原。」）。更好的做法是先軟刪除 + 8 秒 undo。

**Suggested command**：`$impeccable harden`

### [P1] 匯入／分享區塊吞掉半頁，而且把兩個相反方向塞進同一個 fieldset

`discipline-transfer.tsx:55` 把「選擇 JSON 檔案 → 分享 JSON → 預覽匯入 → 分享標題 → 分享說明 → 包含個人名稱 → 準備匯出」放進**同一個** `<fieldset>`，永遠展開，`style={{ display: 'grid', gap: 20 }}` 內聯。使用者看到的是一條七欄的流程，實際上那是兩個反向操作（別人的檔案進來 / 我的紀律出去）。

**Why it matters**：工作記憶上限是 4 項，這裡一次給 7 個控制項而且方向相反；1440 截圖裡它佔了頁面近一半高度，而它是一年用一次的功能。新使用者第一次進來看到的是一塊 JSON 表單，不是自己的紀律。

**Fix**：收進預設收合的 disclosure（`<details>` 或既有 panel 的 disclosure 樣式），標題「匯入與分享（進階）」。展開後拆成兩個 `.panel`：「匯入他人紀律」與「匯出／分享我的紀律」，各自一條 rule 分隔。分享連結改用 readonly `<input>` + 複製按鈕，不要用 `rows={3}` 的 textarea 裝一條網址。

**Suggested command**：`$impeccable distill`

### [P1] 每列 4 顆同等重量的次要按鈕，把內容壓成配角

每條紀律帶「上移 / 下移 / 編輯 / 刪除紀律」四顆 44px 次要按鈕。1440 下它們的視覺重量超過紀律本身；390 下換行成兩排，兩條紀律之間被 6 顆按鈕隔開。DESIGN.md 明寫列層級控制應該用 `.quiet-button`（透明、action 文字），「不能與內容競爭」。

**Why it matters**：這頁是用來**讀**的，不是用來管理的。現在每次掃過清單，眼睛先看到的是按鈕矩陣。

**Fix**：
- 上移／下移改成 icon-only `.quiet-button`（保留 `aria-label`），或直接改成拖曳排序 + 鍵盤 Ctrl+↑/↓。
- 編輯／刪除收進列尾的 overflow（`⋯`）或只在 hover/focus 顯示——但鍵盤與觸控要永遠可達，所以手機維持常駐、桌面 hover 顯示。
- 「建立時間」預設不顯示（移到編輯態或 `title`）。那個時間戳目前是整列最亮的非內容元素，但沒有人靠它做決定。

**Suggested command**：`$impeccable layout`

### [P1] 編輯要跳到頁尾的表單，清單裡的那一條還留著舊內容

點「編輯」只是把內容灌進頁面最底的 `.plan-form`（`discipline.tsx:83`），`useEffect` 把焦點拉到頁尾 textarea。清單上那一條完全沒有「正在編輯」的標示，legend 只寫「編輯」，沒說是編輯哪一條。同時所有其他列的按鈕全部變灰，沒有任何解釋。

**Why it matters**：10 條紀律時，你在頁尾改一段字，看不到原文、不知道改的是哪一條、也不知道為什麼上面全灰了。這是典型的 Memory Bridge + Context Switch。

**Fix**：就地編輯——點編輯時該列變成 textarea + 儲存／取消，底部表單只負責「新增」。若要保留單一表單，至少把 legend 改成「編輯第 02 條」、把被編輯的列加 `aria-busy`／選取底色，並在變灰的控制旁放一行「完成編輯後可再調整其他紀律」。

**Suggested command**：`$impeccable shape`

### [P2] 抽出的紀律用了 dialog 專用的投影，而且常常重複清單第一條

`trade-plan.css:536` 的 `.discipline-draw` 用 `box-shadow: var(--shadow-2)`，而 `--shadow-2` 就是 `--shadow-pop`（`tokens.css:174`）。DESIGN.md 原則 1 寫死：`--shadow-1` 是 `none`，陰影只給**真的浮在頁面上**的介面（對話框、popover、skip link）。這張卡片是頁內內容，不該浮起來。加上截圖裡抽到的正好是第 01 條，上下兩份同樣的文字只差字級，看起來像 bug。

**Why it matters**：這是全站唯一一個違反自家結構階層規則的面板；它讓這頁看起來不屬於這個產品。

**Fix**：拿掉 `box-shadow`，改用 `surface-sunken` 背景或單純上下 `rule-strong` 包夾（符合「用線與空間分組」）。卡片內加「再抽一條」，並在抽到的內容旁標「第 01 條」讓重複變成有意義的指向，而不是看起來像複製貼上。順帶一提：`--font-serif` 在 DESIGN.md 裡寫的是「僅供 trade-plan note 介面使用」，這頁用了它——要嘛更新文件把紀律頁納入，要嘛換掉；現在是文件與程式碼不一致。

**Suggested command**：`$impeccable polish`

### [P2] 置中的標題／導語／h2 與整個工作區不一致

`trade-plan.css:475-491` 把 h1、`.lede`、h2 全部置中，再配 `letter-spacing: 0.02em` 和 `font-size: 1.75rem` 的一次性字級，容器寬度又是獨有的 720px（閱讀頁 880px/72ch、資料頁 1280px）。

**Why it matters**：工作區其他頁面一律左對齊、共用型階。這頁一打開像是從官網掉進來的，而不是工具的一部分。置中標題在只有 2 條紀律時看起來像海報，有 20 條時完全不成立。

**Fix**：改左對齊、用共用型階，標題旁放條數（「你的紀律 · 6 條」），主要動作「新增紀律」提到標題列右側。寬度收斂到既有的閱讀寬（72ch / 880px）。

**Suggested command**：`$impeccable typeset`

## Persona Red Flags

**Alex（重度使用者）**
- 要把第 10 條移到第 1 條：按 9 次「上移」，每次都是一次 PATCH round-trip。沒有拖曳、沒有鍵盤快捷鍵。
- 新增紀律沒有 Cmd/Ctrl+Enter 送出——同專案的 Quick Diary 已經有這個（commit 56e1f8c），這裡沒有，不一致。
- 想一次貼 10 條紀律進來？只能一條一條存，或者去底部拼 JSON。沒有多行批次新增。
- 開始打字新增後，整個清單的控制項全部變灰，無法一邊看一邊整理。

**Jordan（第一次使用）**
- 空狀態只有一行純文字「尚未有紀律。加入一條你希望持續實踐的原則。」，不是 `.empty-state` 樣式、沒有範例紀律、沒有「什麼算一條好紀律」的提示。
- 第一眼看到頁面最下方一大塊「Share JSON / Choose JSON file」，完全不知道那是什麼、要不要填。
- 刪錯一條之後沒有任何挽回路徑，也沒有訊息說「已刪除」——只有一句「紀律已更新。」。
- `<select>` 的 `aria-label` 是「匯入與分享」（`discipline-transfer.tsx:55`），所以螢幕閱讀器在追加／取代這個關鍵選擇上念出的是區塊標題，不是這個選擇的用途。這是確實的 a11y 缺陷。

**Casey（手機單手）**
- 390 寬度下每列 4 顆按鈕換行成兩排，紀律與紀律之間被按鈕撐開，一屏只看得到 1.5 條。
- 主要動作「新增紀律」在長清單之下、匯入區塊之上，拇指區完全搆不到，要一路捲。
- 刪除按鈕與上移／下移同寬同色並排換行，誤觸成本是永久刪除。

## Minor Observations

- `saved` 狀態一旦為 true 就永遠留在畫面上（只在下一次操作才重設），而且「紀律已更新。」同時代表新增、刪除、排序三件事。至少分成三句，並在幾秒後淡出。
- 送出按鈕文字與 `<legend>` 都是「新增紀律」，同一個框裡講兩次。
- 255 字上限只靠 `maxLength`，打滿後靜默停住，沒有字數提示。
- `<label>{c.content}<textarea aria-label={c.content}/>` 的 `aria-label` 和包住它的 label 重複，可以拿掉。
- 內聯樣式散落（`marginTop: 20`、`gap: 20`、`overflowWrap`、checkbox 的 20px 一次性尺寸）——20px 不在 `space-1`–`space-12` 的尺標上。
- 離開頁面的草稿守衛用 `window.confirm`（`discipline.tsx:17`）、取代式匯入也用 `window.confirm`；專案已有 `.delete-dialog` 對話框模式，原生對話框在這裡是視覺斷點。
- 分享連結用 `readOnly` 的 `<textarea rows={3}>` 裝，應該是 input + 複製按鈕。

## Questions to Consider

- 如果這頁預設只顯示「今天這一條」，其他全部收在「全部紀律」之後，會不會更接近它真正的用途？
- 排序真的需要手動嗎？還是「最少被讀到的優先抽出」更有價值？
- 匯入／分享是不是根本該搬到設定頁或獨立路由，讓 `/discipline` 只做讀與寫？
- 一條紀律如果能連到「我上次違反它的那篇日記」，這頁會不會從清單變成真正的複盤工具？
