# 已建置設計系統記錄

日期：2026-09-05。產物：[DESIGN.md](../../DESIGN.md) 與 [design.json sidecar](../../.impeccable/design.json)。

Shipped documenter role 在此 harness 不可用；以獨立 documenter subagent 讀取 Impeccable `reference/document.md` 及 `reference/degraded/documenter.md` 執行替代記錄。沒有重新執行 context script、detector 或第三輪 UI 修改。

記錄依據為 `apps/web/app/styles.css`、`root.tsx`、`ui.tsx`、`routes/preview.tsx`、`routes/new.tsx`、`routes/diary.tsx` 的已建置樣式與元件，以及 [獨立 finish review](finish-review.md) 的最後裁決。保留 [實作簡報](implementation-brief.md) 為設計意圖；DESIGN.md 不將其未實作規格提升成既有系統。

## 證據與界限

- [第一輪畫面](evidence/round-1/)：真實 Diary 與 Overview 代表畫面，桌面／手機。
- [第二輪畫面](evidence/round-2/)：Overview、Company、Review、Quick Diary、真實 Diary 與 editor error，桌面／手機。12 張畫面由 finish reviewer 開啟檢閱；本記錄採用該獨立視覺判斷及現有 source，未另啟瀏覽器巡查。
- [Finish review](finish-review.md) 的最終 verdict 為 ship ticket-03 representative design scope。三項修正包括 route 選取／焦點、API 錯誤與欄位關聯、已存主題提早套用。
- reviewer 記錄 root 回報 `first-diary.spec.ts` 桌面／手機及 `design.spec.ts` 通過。後者覆蓋三語、1440／390／320px、鍵盤樣板切換、當前語言、document 無橫向溢出、主題 reload、route main focus；Quick Diary 有真實建立→閱讀、Escape 及焦點返回證據。這是引用驗證結果，documenter 沒有重新執行測試。
- [detector.json](detector.json) 為 `[]`，來源是單次静態 TSX／CSS 掃描。不得解讀為 runtime contrast、完整 WCAG 或輔助科技認證。
- 手機 Quick Diary 全頁截圖底部延伸是超出 modal viewport 的 capture artifact；不據此建立可互動背景設計規則。viewport-only 重擷取若由 root 補充，不構成第三輪產品修改。

## 已記錄的範圍調整

目前桌面 216px、平板 180px 側欄；手機頂部保留兩個真實導航入口及偏好選單。沒有底部 navigation、收合 tablet menu 或未完成模組的假入口。初始產品包含真實登入／註冊／建立及讀取 Diary；Quick Diary 重用 API 表單，但預覽入口不是完整全域快速記錄產品。Overview／Company／Review 是合成代表，Markdown、完整 queue／research／模板／追加留待各自 ticket。

正文字體、顏色、間距、欄位、dialog、閱讀及兩種主題均從 built code 擷取。CSS 沒有一般動效與 box-shadow，故 sidecar 不創造這些 tokens。為 panel 顯示而合成的 OKLCH tonal ramps 明確標示為 metadata，不能作為新增 UI 色階的權威。Sidecar 只附加 metadata、breakpoints、六個可獨立渲染的元件片段及同文 narrative；核心 tokens 由 DESIGN.md frontmatter 管理。

未將首頁較大的系統字標題提升成品牌 display 規則；也未把固定 Symbol／中英錯誤 boundary 等局部翻譯缺口記成未來應繼承的規範。未發明 comp 批准、使用者 build-path 偏好、對外品牌承諾或 native 完成聲明。
