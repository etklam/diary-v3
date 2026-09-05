---
name: diary-v3
description: 已實作的投資決策日記 Web 初始視覺系統
colors:
  canvas: "#f5f7f6"
  surface: "#fff"
  muted-surface: "#eaf0ec"
  text: "#182b23"
  muted: "#4e6258"
  border: "#cad5ce"
  control: "#73867a"
  action: "#215c43"
  on-action: "#fff"
  selected: "#dcece2"
  negative: "#a32938"
  focus: "#285dc2"
  dark-canvas: "#101916"
  dark-surface: "#17231e"
  dark-muted-surface: "#1e2e26"
  dark-text: "#eaf1ed"
  dark-muted: "#adbcb3"
  dark-border: "#405249"
  dark-control: "#7c9486"
  dark-action: "#8bd2af"
  dark-on-action: "#102c1e"
  dark-selected: "#284c39"
  dark-negative: "#ff9ea8"
  dark-focus: "#a3bfff"
typography:
  headline:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang TC\", \"Microsoft JhengHei\", sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.35
  title:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang TC\", \"Microsoft JhengHei\", sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.4
  body:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang TC\", \"Microsoft JhengHei\", sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang TC\", \"Microsoft JhengHei\", sans-serif"
    fontSize: ".875rem"
    fontWeight: 600
    lineHeight: 1.65
  reading:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang TC\", \"Microsoft JhengHei\", sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.85
rounded:
  control: "4px"
  container: "8px"
spacing:
  step-4: "4px"
  step-8: "8px"
  step-12: "12px"
  step-16: "16px"
  step-20: "20px"
  step-24: "24px"
  step-32: "32px"
  step-40: "40px"
  step-48: "48px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.on-action}"
    rounded: "{rounded.control}"
    padding: "9px 18px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "9px 18px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
---
# Design System: diary-v3

## Overview

**Creative North Star: "決策議程"**

以冷白、灰綠面與深墨色文字組織日期、判斷和後續反思。主要工作區靠標題、分隔線及留白建立順序；日記閱讀區降低密度，讓原文保持可回看。這是代理在使用者自主設計授權下採用的方向名稱，並非已確認的對外品牌承諾。

本記錄以 `apps/web/app/styles.css` 與現有 React 元件為依據，範圍是 Web 初始流程及設計預覽。註冊、登入、新增與閱讀日記、預覽中的 API 連接快速記錄已實作；Overview／Company／Review 仍為有明確標記的合成代表畫面。未宣稱完整業務模組或 React Native App 完成。

**Key Characteristics:**

- 平面工作區，以分隔和灰綠背景分組。
- 深綠主動作，文字說明狀態與資料缺口。
- 工作與閱讀密度分開，長文字自然換行。
- 同一語意色彩角色支援明亮、深色與系統主題。

## Colors

### Primary

`action` 是主按鈕、連結和簡短狀態文字的深綠；`on-action` 保持按鈕文字清楚。`selected` 提供當前導航、選取與成功訊息的底色。深色主題以對應 `dark-*` 色值替換相同 CSS 角色；這些是替代主題，並非額外品牌色。

### Neutral

`canvas` 是頁面底色，`surface` 是表單及 dialog，`muted-surface` 是側欄與研究背景區。`text` 與 `muted` 分別承載主文與輔助文；`border` 作一般分隔，`control` 作可互動欄位邊框。

`negative` 對應錯誤文字及無效欄位邊框；`focus` 對應鍵盤焦點。尚未實作獨立 positive／warning 色彩角色。

**The Semantic Theme Rule.** 深淺主題替換語意角色；元件不使用整頁反色。

## Typography

全站沿用 frontmatter 所列系統無襯線字體堆疊；沒有獨立裝飾 display 字體。這裡記錄既有工作介面字體，不將首頁較大系統字標題推廣為品牌 display 規則。

頁 H1、區段 H2、正文及欄位標籤分別使用 headline、title、body、label。H3 使用正文大小與粗體。標題不加中英文字距，長標題可在必要位置換行。日期的 `time` 元素使用表格數字與較小輔助字級；品牌副文字及手機偏好標籤使用少量 .75rem 小字。

閱讀正文使用 reading 行高、保留換行與空白，段落及閱讀區最大 72ch。textarea 行高 1.7，可垂直調整大小。欄位繼承其 label 字體，標題欄位另外提高至 1.125rem；不要把簡報中「全部 input 16px」誤記為目前實作。

## Layout

桌面 shell 為 216px 側欄與可收縮主內容；側欄 sticky、全視窗高，內距 32px 20px。主內容最大 1440px，內距 48px 40px。1099px 以下側欄為 180px，主內容內距 32px 24px；雙欄預覽轉為單欄。

759px 以下側欄成為頂部導航：品牌與兩個實際導航入口同列，語言及主題選單在下一列。主內容內距 32px 16px 48px。這是目前兩入口 shell 的範圍適配；簡報中的收合平板選單、手機底部導航和完整模組清單尚未建置。

工作預覽採 2:1 欄位與 40px 間距，次欄最小 240px；agenda 分組用頂部分隔及 24px 上內距。編輯區最大 880px，登入／註冊表單最大 440px；表單 gap 20px。前端未建立抽象 spacing token API；frontmatter 的間距是現有重複數值的記錄。

寬表格最小 800px，放在具名稱、可鍵盤聚焦的獨立水平捲動區。手機保留欄位，頁面本身不因表格擴寬。

## Elevation & Depth

目前沒有 box-shadow。表單以 surface、細邊框與圓角區分；背景資訊區以 muted-surface 區分。原生 modal 使用 `rgb(10 25 17 / .5)` 遮罩隔離背景，並不套用簡報中的未實作陰影。

**The Flat Surface Rule.** 用背景與分隔建立工作層次，維持目前元件的無陰影表現。

未設過場動畫或一般 transition；reduced-motion 規則取消 transition、animation 及平滑捲動。不要把簡報的 160ms 動效記成已實作 token。

## Shapes

控制項與導航使用 control 圓角；editor 外框與桌面 dialog 使用 container 圓角。一般分隔及控制項邊框為 1px。研究背景區保持直角；手機全視窗 dialog 無邊框、無圓角。沒有已實作的 chip／badge 元件庫。

## Components

### Buttons

主按鈕實心 action，次按鈕 surface 配 control 邊框；都最小高 44px、字重 600、行高 1.4。hover 亮度為 .94，disabled 透明度 .6 並使用等待游標。鍵盤焦點為 2px focus 外框與 3px offset。現有元件沒有 quiet／danger variant。

### Inputs / Fields

欄位有可见 label、control 邊框及 surface 背景，最小高 44px。placeholder 用 muted，caret 用 action。錯誤以 negative 邊框及 `aria-invalid` 呈現，說明和錯誤摘要透過 `aria-describedby` 連結。表單失敗保留內容；錯誤摘要可聚焦，顯示翻譯訊息與可選取的 requestId。進行中顯示文字狀態、停用提交，成功使用 `role=status`。登入確認及讀取流程使用文字 loading／retry，目前沒有 skeleton 系統。

### Navigation

僅「開始」與「寫日記」兩個主要入口；符合 route 的項目具 `aria-current=page`、selected 背景與 650 字重。日記詳情沒有額外虛構的當前列表頁。skip link 在聚焦時顯示；pathname 變更將焦點移至 main，main 鍵盤外框向內 4px。預覽的三個切換按鈕使用 `aria-pressed`，並非完整業務導航。

### Containers and reading

editor 為單一有邊框表單容器，桌面 28px 內距、手機 20px 16px；footer 以分隔線分開儲存狀態和操作。讀取頁日期在標題前，header/footer 使用細線，正文保持 72ch 與原始換行。正文現以安全 Markdown／GFM 呈現，禁止 raw HTML，移除不安全 URL。編輯器提供預覽、獨立標籤欄位與原始 thesis／risk／execution，失敗提交保留輸入。

### Quick Diary

原生 dialog 桌面寬 `min(680px, calc(100% - 32px))`，最高 `calc(100dvh - 48px)`，24px 內距；手機為全視窗高度及 16px 內距。footer 黏於 dialog 下緣，手機加 safe-area。開啟後焦點移至文字區，Escape 關閉並回到觸發控制。它重用實際建立日記表單；此代表入口位於設計預覽，並非已完成全域快捷鍵、模板、追加或未儲存確認。

### First representatives and preferences

Overview 先待處理與近期判斷，再研究背景；Company 分開目前觀點與後續證據；Review 分開原始判斷與事後反思，窄版按原始→事後閱讀。三者保留合成資料標記及明確的缺報價文字，空狀態可在預覽切換；未將缺報價顯示為 0。

語言選單支援 zh-TW／zh-CN／en，主題選單支援 light／dark／system。登入後語言由帳戶設定恢復及儲存，載入期間停用選單以免覆蓋已存值；訪客語言與主題留在本地，主題在 head 提早讀取以避免已存主題晚套用；locale 更新 html.lang。主要介面文字使用完整翻譯 keys，預覽固定示例日期保持可見；route boundary 目前是中英雙語 fallback，表格 Symbol 標頭是固定文字，不將它們誤記為全面三語覆蓋。

## Do's and Don'ts

### Implemented account security and FIRE surfaces

帳戶安全使用兩段細線分隔的表單／裝置操作區，桌面保持閱讀寬度，手機控制全寬；錯誤保留欄位，成功撤銷後提供重新登入入口。FIRE 使用假設／結果雙欄，850px 以下改單欄；數字以表列呈現，projection 保持獨立可聚焦橫向捲動區，複製失敗可直接選取文字。两者沿用既有 tokens，未新增色彩角色。

手機導航已獨佔一列並可換行，避免新增入口擠壓品牌與文字。實際驗收及畫面見 `docs/design/security-fire-finish-review.md`；完整設定與日記 Markdown 編輯的後續驗收已分別記錄於 tickets 07、08。

### Do:

- **Do** 延用語意主題角色與可見的焦點外框。
- **Do** 以文字標示缺報價、錯誤及合成內容。
- **Do** 保留原始判斷、日期和事後反思的閱讀順序。
- **Do** 在窄畫面讓文字換行，將寬表格限制於獨立捲動區。

### Don't:

- **Don't** 把預覽樣板或簡報中的未實作互動宣稱為完成的產品功能。
- **Don't** 將背景資訊區全部改成帶陰影卡片，破壞現有平面層次。
- **Don't** 以色彩單獨取代狀態文字。
- **Don't** 以缺報價替代值 0 或未標示的示例帳戶資料填滿畫面。

### Account preferences

設定頁以 fieldset／legend 分開個人偏好與投資目標，金額保留字串輸入。時區提供文字輸入、常用選項和明確的裝置時區動作，按儲存才提交。錯誤保留表單；登入後載入語言有獨立重試，登出會忽略遲到的儲存回應。已驗證三語、深淺主題及桌面／手機，證據見 `docs/design/evidence/settings/`。

## Company market view

`/stocks/:symbol` 提供訪客可用的股票／指數查價：最新報價使用桌面三欄、手機兩欄的定義列表；歷史價格使用可鍵盤操作、每頁最多 50 筆的語意表格。行情與歷史各自呈現載入／失敗／重試，缺少 metadata 保留未知，stale fallback 明示狀態及原有取得時間。查詢範圍用原生 select，延續現有色彩與間距，未新增 token。桌面／手機獨立 review 見 `docs/design/market-finish-review.md`。

## Diary library

`/diaries` 延續既有日記閱讀系統：篩選列、日期、標題連結、純文字摘要與標籤形成平面列表。URL 保存篩選／分頁，套用条件重設頁數，換頁後將焦點移到結果標題。手機篩選及記錄改為單欄，沿用現有 semantic tokens。驗收及獨立 review 見 `docs/design/diary-list-finish-review.md`。

## BUY entries and cost holdings

日記新增表單以可增刪的交易群組記錄買入，數量及價格保留十進位字串，決策備註可展開。交易時間清楚標示裝置 IANA 時區；重複的 DST 時間需要明確選擇 UTC instant，不存在的本地時間會被拒絕。`/stocks` 使用四欄成本持倉表，手機一般數值全部同屏，極長數字才在容器內捲動。此切片沿用既有 tokens；獨立修正驗收見 `docs/design/buy-finish-review.md`。

## Timeline and Calendar

Timeline 用月份分組、日期、原始標題與短摘要建立閱讀順序，原生 disclosure 展開安全 Markdown。Calendar 用 civil-date 月份網格、活動標記與假日紋理；371 天熱圖初始定位最近日期，鍵盤可逐日移動。假日資料失敗時覆蓋率顯示未計算。兩頁沿用既有 tokens，手機單欄，獨立驗收見 `docs/design/timeline-finish-review.md` 及 `docs/design/calendar-finish-review.md`。桌面 sidebar 可垂直捲動，確保增加入口後偏好控制仍可達。
