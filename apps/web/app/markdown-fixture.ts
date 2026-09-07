/**
 * Synthetic Markdown fixture exercising every rendered element: the full
 * heading scale, mixed-script paragraphs, lists, task lists, quotes, code,
 * tables, images and hostile raw HTML that must stay inert. Used by the
 * /design-preview Markdown surface and the markdown-typography E2E spec.
 */
export const markdownFixture = `# 投資論點

## Thesis

### Evidence

本季 AI 基建需求仍由大型雲端業者的資本開支推動，**訂單能見度**已延伸至明年上半年，但板塊估值回到五年均值之上，*安全邊際*有限。詳見 [供應鏈研究筆記](https://research.example.com/notes/2026/ai-infrastructure-supply-chain-very-long-url-path?utm_source=diary-fixture)。

關鍵指標 \`rotation_score\` 與 \`momentum_spread\` 需要連續兩週同步確認，訊號才算成立。NVDA 與台積電的 CoWoS 產能利用率大於 95%，mixed-script line with English tail.

#### H4 加碼紀律

##### H5 倉位上限

###### H6 資料截至 2026-09-05，僅供內部研究使用

> 價格變化本身並不證明投資論點成立。
>
> 應先確認需求、盈利能力與估值假設，再決定是否調整倉位。

---

## Checklist

- [x] 確認雲端業者資本開支指引
- [ ] 追蹤 CoWoS 月產能數據
- [ ] 重估 2027 EPS 假設

## 觀察清單

- 第一層：AI 基建
- 第二項：邊緣裝置
  - Nested item
  - Nested item with long content that should wrap back to the text position instead of aligning under the marker, even when the sentence mixes 中文與 English in the same wrapped line
- 第三項：傳統雲端

1. 第一點：確認需求
2. 第二點：檢查盈利能力
   1. Nested ordered：毛利率
   2. Nested ordered：自由現金流
3. 第三點：估值假設

## 程式碼片段

\`\`\`ts
const rotationScore = calculateScore(input)
console.log(rotationScore)
// long line: spread_momentum_above_threshold && breadth_confirming && volume_expansion && earnings_revision_positive && valuation_below_five_year_median
\`\`\`

## 比較表

| Symbol | Thesis | Status | Note |
| --- | --- | --- | --- |
| NVDA | AI infrastructure | Watching | 長文字備註欄位：連續中文內容應在儲存格內換行，而不是把版面撐破 |
| MSFT | Cloud / AI | Holding | Long text note that should wrap inside the cell rather than widening the whole page beyond the viewport |

## 進出場計畫（寬表格）

| # | Symbol | Name | Thesis | Status | Weight | Entry | Stop | Target | R:R | Note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | NVDA | NVIDIA | AI infrastructure | Watching | 5.0% | 180.00 | 165.00 | 220.00 | 2.7 | 突破前高後回測確認 |
| 2 | MSFT | Microsoft | Cloud / AI | Holding | 6.5% | 420.00 | 395.00 | 480.00 | 2.4 | Copilot 企業滲透率 |
| 3 | TSM | TSMC | Foundry capacity | Holding | 4.0% | 190.00 | 172.00 | 230.00 | 2.3 | CoWoS 擴產節奏 |
| 4 | ASML | ASML | Lithography monopoly | Watching | 3.0% | 850.00 | 780.00 | 980.00 | 1.9 | High-NA 訂單能見度 |
| 5 | AVGO | Broadcom | Custom ASIC | Watching | 2.5% | 1700.00 | 1550.00 | 2000.00 | 2.0 | 客製晶片設計訂單 |
| 6 | GOOGL | Alphabet | Search + Gemini | Holding | 4.5% | 175.00 | 160.00 | 205.00 | 2.0 | 搜尋市占變化 |
| 7 | AMZN | Amazon | AWS reacceleration | Watching | 3.5% | 185.00 | 168.00 | 220.00 | 2.1 | 企業工作負載遷移 |
| 8 | META | Meta Platforms | Ad recovery + Llama | Holding | 3.0% | 520.00 | 480.00 | 600.00 | 2.0 | 廣告單價趨勢 |
| 9 | AMD | AMD | MI accelerator ramp | Watching | 2.0% | 160.00 | 145.00 | 190.00 | 2.2 | 軟體生態成熟度 |
| 10 | ORCL | Oracle | OCI growth | Watching | 2.0% | 145.00 | 132.00 | 170.00 | 1.9 | 資本開支紀律 |
| 11 | AAPL | Apple | On-device AI | Holding | 5.5% | 225.00 | 205.00 | 260.00 | 1.8 | 換機週期拉長風險 |
| 12 | TSM | TSMC (ADR) | 重複列以測試長表 | Reference | 0.0% | 0.00 | 0.00 | 0.00 | 0.0 | 檢查 zebra stripe 與長表捲動 |

## 圖表

![Research sketch](/favicon.svg)

另有[極長連結](https://example.com/a/very/long/path/segment/that/keeps/going/and-going?query=abcdefghijklmnopqrstuvwxyz0123456789&utm_campaign=markdown_fixture)用於測試換行行為。



<script>window.__fixtureInjected = true;</script><img src=x onerror="window.__fixtureInjected = true">
`;
