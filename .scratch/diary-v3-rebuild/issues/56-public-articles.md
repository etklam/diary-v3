# [56] 搜尋公開文章並以 SSR 閱讀正文

Status: done
Type: AFK
User stories covered: US-091, US-092

## Parent

[完整重構 PRD](../PRD.md)

## What to build

讀者從公開 Article index 依分類及全文搜尋找到已發布文章，直接開啟 URL 閱讀安全 Markdown 正文。

## Acceptance criteria

- [x] 只公開已發布且有發布時間的 Post；title／excerpt full-text、content 不參與、三語／stop-word／短字語意由 fixtures 驗證。
- [x] 首次 HTML 含正文、title、canonical、OG，sitemap 與既有 URL 導向正確；關閉 JavaScript 仍可讀。
- [x] draft／archive／作者 email 不外洩；從 55 發布到搜尋閱讀完整測試，未知相容差異不得默默降級成 substring。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [55 article-management](55-article-management.md)

## Implementation checkpoint — 2026-09-06

Added the public article index/detail SSR modules, `/blog` compatibility redirects and a published-only sitemap. The API fixture compares every current frozen MariaDB Boolean probe and verifies content-only terms do not participate. The focused Chrome flow passes 1/1 with real PostgreSQL and verifies article body/title/canonical/OG in a JavaScript-disabled context, archive hiding, republish and mobile overflow; root visual review remains pending.

## Astra acceptance — 2026-09-06

Accepted against the 7/7 disposable PostgreSQL suite and 1/1 Chrome principal flow (9.1s), runtime-measured search fixtures, and direct source review of draft retention on failed writes. Astra inspected the desktop/light and mobile/dark article captures. Shared mobile navigation is assigned to ticket58; no repeated cosmetic checks are required.
