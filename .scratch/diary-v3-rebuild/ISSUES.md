# diary-v3 實作 tickets

61 張票覆蓋 PRD 全部 114 條 user stories。依使用者授權自主實作；僅當 blockers 已完成才領取票。ready-for-agent 表示規格就緒，並不表示工作已完成或依賴已解除。各票內的狀態與驗收證據為準。

| Ticket | Type | Blocked by | 發佈狀態 |
| --- | --- | --- | --- |
| [01 固定功能基準並重現舊版 Diary 完整流程](issues/01-baseline.md) | AFK | — | ready-for-agent |
| [02 由空資料庫註冊登入並寫下首篇 Diary](issues/02-first-diary.md) | AFK | 01 | ready-for-agent |
| [03 確認投資研究桌的代表性設計與 App shell](issues/03-design-shell.md) | AFK | 02 | ready-for-agent |
| [04 保持 Web session 並正確登出目前瀏覽器](issues/04-web-session.md) | AFK | 03 | ready-for-agent |
| [05 以原生 JSON session 讀寫同一篇 Diary](issues/05-native-session.md) | AFK | 02 | ready-for-agent |
| [06 修改密碼及登出所有裝置](issues/06-account-security.md) | AFK | 04, 05 | ready-for-agent |
| [07 儲存語言、時區與投資偏好](issues/07-preferences.md) | AFK | 04 | ready-for-agent |
| [08 編輯及整理完整無交易 Diary](issues/08-diary-editor.md) | AFK | 04 | ready-for-agent |
| [09 以 Quick Diary 模板捕捉並併發追加](issues/09-quick-diary.md) | AFK | 08 | ready-for-agent |
| [10 搜尋與分頁管理 Diary 資料庫](issues/10-diary-search.md) | AFK | 08 | ready-for-agent |
| [11 按日期閱讀 Diary Timeline](issues/11-timeline.md) | AFK | 07, 08 | ready-for-agent |
| [12 由 Calendar 定位及開啟 Diary](issues/12-calendar.md) | AFK | 07, 08 | ready-for-agent |
| [13 完成及修改 Diary Review](issues/13-diary-review.md) | AFK | 07, 08 | ready-for-agent |
| [14 建立及追蹤 Trade Plan 至日記關聯](issues/14-trade-plans.md) | AFK | 07, 08 | ready-for-agent |
| [15 記錄買入 Transaction 並查看成本持倉](issues/15-buy-ledger.md) | AFK | 08 | ready-for-agent |
| [16 記錄賣出並計算損益與剩餘持倉](issues/16-sell-ledger.md) | AFK | 15 | ready-for-agent |
| [17 修改歷史交易或刪除 Diary 後保持帳本有效](issues/17-ledger-corrections.md) | AFK | 16 | ready-for-agent |
| [18 在 Company 查看報價與歷史價格](issues/18-market-provider.md) | AFK | 04 | ready-for-agent |
| [19 為 Portfolio 估值並呈現缺報價狀態](issues/19-portfolio-valuation.md) | AFK | 16, 18 | ready-for-agent |
| [20 查看 Portfolio 曝險、集中度與風險摘要](issues/20-portfolio-risk.md) | AFK | 19 | ready-for-agent |
| [21 回顧策略績效與近期交易](issues/21-strategy-performance.md) | AFK | 16 | ready-for-agent |
| [22 匯出個人交易資料](issues/22-transaction-export.md) | AFK | 16 | ready-for-agent |
| [23 管理股票 Watchlist](issues/23-watchlist.md) | AFK | 18 | ready-for-agent |
| [24 維護 Company 的目前 Stock Note](issues/24-stock-notes.md) | AFK | 23 | ready-for-agent |
| [25 捕捉 Evidence 並回看不可變股票時間線](issues/25-evidence-timeline.md) | AFK | 08, 23 | ready-for-agent |
| [26 建立及更新 Investment Thesis](issues/26-investment-thesis.md) | AFK | 23 | ready-for-agent |
| [27 完成 Thesis Review 並記錄 Portfolio Decision](issues/27-thesis-review.md) | AFK | 07, 26 | ready-for-agent |
| [28 集中處理 Diary 與 Thesis Review Queue](issues/28-review-queue.md) | AFK | 13, 27 | ready-for-agent |
| [29 在 Company Hub 串連持倉、觀點與記憶](issues/29-company-hub.md) | AFK | 19, 24, 25, 27 | ready-for-agent |
| [30 由 Overview 找到下一個投資跟進動作](issues/30-overview.md) | AFK | 11, 14, 20, 28, 29 | ready-for-agent |
| [31 設定並取消單次 Diary 回頭提醒](issues/31-diary-alerts.md) | AFK | 07, 08 | ready-for-agent |
| [32 建立 WEEK／MONTH 提醒並取消整個系列](issues/32-recurring-alerts.md) | AFK | 31 | ready-for-agent |
| [33 以前景 Socket.IO 接收提醒並在撤銷後斷線](issues/33-realtime.md) | AFK | 06, 32 | ready-for-agent |
| [34 管理 Price Alert 並在價格條件符合時提示](issues/34-price-alerts.md) | AFK | 18, 33 | ready-for-agent |
| [35 整理並隨機閱讀 Discipline](issues/35-disciplines.md) | AFK | 04 | ready-for-agent |
| [36 匯入、匯出及分享 Discipline](issues/36-discipline-sharing.md) | AFK | 35 | ready-for-agent |
| [37 建立 Partner 關係並管理雙方分享設定](issues/37-partners.md) | AFK | 04 | ready-for-agent |
| [38 在 Pair View 比較 Diary 並遵守分享隱私](issues/38-pair-view.md) | AFK | 11, 13, 24, 37 | ready-for-agent |
| [39 管理 scoped API key 並由 Agent 建立 Diary](issues/39-api-keys.md) | AFK | 05, 08 | ready-for-agent |
| [40 讓 Agent 發佈冪等股票研究並經 Partner 閱讀](issues/40-agent-research.md) | AFK | 25, 38, 39 | ready-for-agent |
| [41 管理 ETF Catalog 與歷史資料初始化](issues/41-etf-catalog.md) | AFK | 18 | ready-for-agent |
| [42 使用 ETF Watchlist 閱讀研究摘要](issues/42-etf-research.md) | AFK | 41 | ready-for-agent |
| [43 更新持久化市場價格並查看最新輪動排名](issues/43-rotation-snapshot.md) | AFK | 18 | ready-for-agent |
| [44 閱讀 Market State、Sector Breadth 與市場摘要](issues/44-market-state.md) | AFK | 43 | ready-for-agent |
| [45 比較兩週市場輪動並按 scope 篩選排序](issues/45-rotation-history.md) | AFK | 44 | ready-for-agent |
| [46 匯出 Market Rotation 的目前視圖](issues/46-rotation-export.md) | AFK | 45 | ready-for-agent |
| [47 計算 Position Sizing 並交接至 Diary／Trade Plan](issues/47-position-sizing.md) | AFK | 09, 14 | ready-for-agent |
| [48 使用 Financial Freedom／FIRE 計算工具](issues/48-fire.md) | AFK | 03 | ready-for-agent |
| [49 比較 Relative Value 並捕捉研究](issues/49-relative-value.md) | AFK | 09, 25 | ready-for-agent |
| [50 閱讀 Seasonality 並保存本地化研究摘要](issues/50-seasonality.md) | AFK | 07, 09, 25 | ready-for-agent |
| [51 搜尋 SEC 公司並瀏覽申報文件清單](issues/51-sec-search.md) | AFK | 04 | ready-for-agent |
| [52 安全閱讀、下載及打包 SEC 文件](issues/52-sec-download.md) | AFK | 51 | ready-for-agent |
| [53 發布公開首頁、About 與使用說明](issues/53-public-pages.md) | AFK | 03 | ready-for-agent |
| [54 建立及預覽管理員 Post 草稿](issues/54-article-drafts.md) | AFK | 04 | ready-for-agent |
| [55 發布、封存及批次管理 Post](issues/55-article-management.md) | AFK | 54 | ready-for-agent |
| [56 搜尋公開文章並以 SSR 閱讀正文](issues/56-public-articles.md) | AFK | 55 | ready-for-agent |
| [57 由 Admin 管理使用者並撤銷被刪帳戶存取](issues/57-admin-users.md) | AFK | 33 | ready-for-agent |
| [58 安裝及更新 PWA 並隔離私人 API 資料](issues/58-pwa.md) | AFK | 07, 08 | ready-for-agent |
| [59 在隔離 K3s 部署並更新完整運行路徑](issues/59-deployment.md) | AFK | 33, 43 | ready-for-agent |
| [60 備份還原 PostgreSQL 並驗證產品流程](issues/60-backup-restore.md) | AFK | 59 | ready-for-agent |
| [61 完成全功能對等與跨裝置發布驗收](issues/61-final-verification.md) | AFK | 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60 | ready-for-agent |
