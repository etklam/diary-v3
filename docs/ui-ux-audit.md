# diary-v3 UI/UX Audit

## Audit Scope

Primary device:

- iPhone 17 base
- CSS viewport 402 × 874
- DPR 3
- mobile Chromium emulation (isMobile, hasTouch), portrait

Secondary:

- 1440 × 900 desktop sanity checks (~20% of effort)

Audit mode:

- screenshot-backed, rendered UI is the source of truth
- no implementation changes (doc + screenshots only)

Environment:

- Local synthetic browser harness: API `http://127.0.0.1:3201` (`scripts/e2e-server.ts`, disposable `diary_v3_e2e` DB with synthetic market/SEC/AI fixtures), Web `http://127.0.0.1:3200` (dev server, `API_ORIGIN=http://127.0.0.1:3201`)
- Audit account: `audit-u1@example.test` (fresh USER account, registered through the API)
- Admin checks (later): `etf-admin@example.test` / `synthetic-etf-admin-password`
- App default locale renders zh-TW; audit notes reference both zh labels and English meaning

## Audit Progress

Core end-user pages:

- [x] `/` Dashboard (authenticated Overview / 今日工作區)
- [x] `/timeline`
- [x] `/diaries` Journal list
- [x] `/diaries/new` New entry editor
- [x] `/diaries/quick` Quick capture
- [x] `/diaries/:id` Entry detail/reader
- [x] `/diaries/:id/edit` Entry editor
- [x] `/diaries/:id/review` Entry review
- [x] `/reviews` Reviews
- [x] `/reviews/ai-reports` AI reports
- [x] `/calendar`
- [x] `/alerts`
- [x] `/discipline`
- [x] `/achievements`
- [x] `/trade-plans`
- [x] `/trade-plans/new`
- [x] `/trade-plans/:id`
- [x] `/strategy-performance`
- [x] `/stocks` Holdings
- [x] `/stocks/watchlist`
- [x] `/stocks/alerts` Price alerts
- [x] `/stocks/:symbol` Company/market
- [x] `/stocks/:symbol/thesis`
- [x] `/tools` Tools index
- [x] `/tools/market-rotation` Breadth / market rotation
- [x] `/tools/etf` ETF research
- [x] `/tools/relative-value`
- [x] `/tools/seasonality`
- [x] `/tools/sec-filings`
- [x] `/tools/financial-freedom`
- [x] `/tools/position-sizing`
- [x] `/partners`
- [x] `/partners/compare`
- [x] `/articles` Articles index
- [x] `/articles/:slug` Article reader
- [x] `/settings` (+ `/settings/security`, `/settings/api-keys`)
- [x] Public: `/` guest landing, `/login`, `/register`, `/guide`, `/about`

Admin / research:

- [x] `/admin/users`
- [x] `/admin/ai`
- [x] `/admin/email-settings`
- [x] `/admin/etf`
- [x] `/admin/article-translations`
- [x] `/admin/blog`
- [x] `/admin/research` (+ new / settings / detail)

Navigation & shell:

- [x] Mobile menu / drawer (global)
- [x] Guest landing page shell

## Global Findings

### UI-004 — P1 ACCESSIBILITY — Touch targets far below minimum across the app

Pages (confirmed manifestations): `/login`, `/register`, `/settings`, `/settings/api-keys`, `/settings/security` (devices section), `/partners/compare`, `/trade-plans/new`, `/strategy-performance`, `/stocks`, `/stocks/SPY`, `/stocks/SPY/thesis`, `/alerts`, `/diaries/1/review`, `/diaries/quick`, `/tools/etf`, `/admin/ai`, `/admin/email-settings`, `/admin/research`, `/admin/article-translations`, `/admin/users`, `/calendar`, `/discipline`

Evidence:
- probes: `A 80x18 忘記密碼？`, `A 97x18 管理 API 金鑰`, `A 64x18 記錄交易`, `A 64x18 策略績效`, `A 96x18 全部交易計劃`, `A 370x26 返回文章編輯器`, `SUMMARY 370x26` (×5 pages), `INPUT 13x13` (×6 on `/admin/ai`), `INPUT 20x20` (discipline, admin-email)
- screenshots: `artifacts/ui-ux-audit/{login,settings,admin-ai,calendar,...}/mobile-*.png`

Observed:
Three recurring patterns: (1) bare inline `<a>` links render ~18px tall (no padding); (2) `<a class="secondary">` / `<summary>` controls render 26px tall; (3) native checkboxes/radios render 13–20px. All sit well under a ~44px comfort / ~34px minimum for finger targets.

User impact:
Primary next-steps (forgot password, manage API keys, record a trade) and admin authorization checkboxes are mis-tap-prone; the admin/ai checkbox row is effectively unusable.

Recommendation:
Global CSS pass in `apps/web/app/styles.css`: pad `main summary` to ≥44px block size; give `a.secondary` button-like min-height (44px) + inline-flex; add a coarse-pointer hit-area expansion (`position:relative` + `::after` inset) for bare inline links inside text; set `input[type=checkbox],input[type=radio]` to ≥18px with `accent-color`. Then spot-verify admin/ai, login, settings.

Likely code area:
`apps/web/app/styles.css` (global), plus per-page markup only where links need re-classing

Confidence: High

Implementation complexity: M
Risk: Medium (pseudo-element hit areas can overlap adjacent links — verify tight rows)
Suggested dependency: Solve globally first

### UI-005 — P2 UX — Untitled quick entries get a title that embeds truncated content, an ellipsis, the date, and “日記”

Pages: `/` (dashboard, = UI-002), `/timeline`, `/diaries`, `/diaries/:id` (H1), `/diaries/:id/review` (subtitle), `/diaries/quick` (append notice)

Evidence:
- `artifacts/ui-ux-audit/{timeline,journal-list,journal-detail,journal-review}/mobile-initial.png`
- API: stored `title = "Audit smoke entry: … Uncer… — 2026/10/01 日記"` for an untitled entry

Observed:
`deriveQuickTitle` (`packages/domain/src/quick-composer.ts:2`) builds `"{first line truncated at 69}… — {date} 日記"`. Every surface then shows this baked-in ellipsis; on list surfaces it duplicates the excerpt; on the detail H1 it reads as corrupted data.

User impact:
Every default-flow quick entry looks broken at the top of every surface it appears on.

Recommendation:
Make `deriveQuickTitle` return the fallback label only (e.g. `2026/10/01 日記`), never the content prefix. Forward-fix; existing stored titles keep the old format (synthetic audit data only).

Likely code area: `packages/domain/src/quick-composer.ts:2`

Confidence: High

Implementation complexity: XS
Risk: Low
Suggested dependency: None

### UI-006 — P3 CONSISTENCY — Empty states are bare muted text on some pages, dashed panels on others

Pages: `/partners` (目前沒有夥伴), `/settings/api-keys`, `/admin/etf`, `/admin/blog`, `/articles` (no-results), vs. dashed panels on `/admin/email-settings`, `/admin/research`, `/achievements`

Evidence: `artifacts/ui-ux-audit/{partners,settings-api-keys,admin-etf,admin-blog,articles}/mobile-initial.png`

Observed: Bare `<p>` empty lines with no panel, icon, or recovery action; sibling pages use a dashed empty-state panel.

User impact: Pages feel unfinished; no-results states give no way out (e.g. articles offers no 清除篩選）.

Recommendation: Apply the existing dashed empty-state panel component/class to the bare-text pages; add a recovery action (clear filters / primary CTA) where missing.

Confidence: High

Implementation complexity: S
Risk: Low
Suggested dependency: None

### UI-007 — P3 POLISH — Pagination controls rendered for empty or single-page lists

Pages: `/diaries` (第 1 / 1 + 上一頁/下一頁）， `/trade-plans` (1/1 pager above an empty list)

Evidence: `artifacts/ui-ux-audit/{journal-list,trade-plans}/mobile-bottom.png`

Observed: Two ~44px buttons + counter (~180px) that can never do anything.

User impact: Dead controls invite taps; on /trade-plans the pager + "no filter match" copy sit where an empty-state CTA should be.

Recommendation: Hide the pager when totalPages ≤ 1; on /trade-plans distinguish zero-data from no-filter-match (see UI-025).

Confidence: High

Implementation complexity: XS
Risk: Low
Suggested dependency: None

### UI-008 — P3 TYPOGRAPHY — Header brand subtitle renders at 11.2px on mobile

Pages: all authenticated pages (`.brand-sub` in the mobile shell header)

Evidence: probes on every page (`SPAN.brand-sub fs=11.2 投資決策日記`); `styles.css` sets 0.7rem under the mobile media query.

Observed: Smallest text in the app, below the 12px readability floor, in the always-visible header.

Recommendation: Raise the mobile `.brand-sub` to 0.75rem (12px).

Confidence: High

Implementation complexity: XS
Risk: Low
Suggested dependency: None

## Page: Dashboard (authenticated Overview)

Route: `/`

Audit status: Complete

Tested:

- 402 × 874, DPR 3, touch emulation
- first-use account (fresh registration) and populated state (1 quick entry)
- menu drawer opened and scrolled
- desktop sanity check 1440 × 900

Screenshots:

- `artifacts/ui-ux-audit/dashboard/mobile-first-use.png` — first-use state
- `artifacts/ui-ux-audit/dashboard/mobile-initial.png` — populated, top of page
- `artifacts/ui-ux-audit/dashboard/mobile-bottom.png` — populated, scrolled to end
- `artifacts/ui-ux-audit/dashboard/mobile-menu.png` — mobile menu drawer
- `artifacts/ui-ux-audit/dashboard/mobile-menu-bottom.png` — drawer scrolled to bottom (language/theme/logout)
- `artifacts/ui-ux-audit/dashboard/desktop.png` — desktop sanity

### What works well

- No body-level horizontal overflow at 402px; `overflowReport` found zero elements wider than the viewport (populated page `scrollWidth = 402`).
- Fixed bottom tab bar (日記庫 / 時間軸 / 日曆 / 寫日記) gives one-tap access to the four core diary actions; tiles ≈ 90 × 67 CSS px — comfortable touch targets.
- `main` carries `padding-bottom: 108px` vs the 76px tab bar, so content is never obscured by the tab bar (verified: last content bottom 766 < tab top 798 at max scroll).
- Safe areas are handled globally: `viewport-fit=cover` in `root.tsx` plus `env(safe-area-inset-*)` usages in `styles.css:1380-1563`.
- Menu drawer (`.mobile-menu-dialog`, 364 × 850) has large tap rows, scrolls internally (`.mobile-menu-panel`), keeps 語言 / 顯示模式 pickers and 登出 reachable at the bottom.
- Primary CTA (快速記錄) is a full-width 56px+ button directly under the page heading — clear visual priority.
- Quick capture after save shows an explicit success state with next actions (開啟日記 / 編輯詳細資料 / 新增日記).

### Findings

#### UI-001 — P2 UX — First-use dashboard is mostly empty and offers no paths into the product

Evidence:
`artifacts/ui-ux-audit/dashboard/mobile-first-use.png`

Observed:
For a brand-new account, the dashboard renders only the static date, H1 今日工作區， lede, and a single first-use card (heading + one sentence + 2 buttons), which ends at ≈ y440 of the 874px viewport. The remaining ≈ 360px above the tab bar is blank background. The 繼續前往 (destinations) nav and all workspace sections are suppressed in this state (`overview.tsx:212` renders `<FirstUseSection/>` exclusively when `firstUse` is true).

User impact:
A new user's first screen is half empty and communicates only "write a diary". The tools hub, review queue, and portfolio — the app's other entry points — are invisible without opening the menu. On desktop the same state leaves ~65% of the main column blank.

Recommendation:
Keep the first-use card as the hero, but render the destinations nav (交易計劃 / 研究 / 工具) below it, and optionally the guest-oriented tool cards that the public landing page already has. The content exists; it is only gated off.

Likely code area:
`apps/web/app/overview.tsx` (`FirstUseSection`, main render at line 212)

Confidence:
High

Implementation complexity: S

Risk: Low

Suggested dependency: None

#### UI-002 — P2 UX — Untitled quick entries display their content twice in “近期判斷”

Evidence:
`artifacts/ui-ux-audit/dashboard/mobile-initial.png`, `artifacts/ui-ux-audit/dashboard/mobile-bottom.png`

Observed:
A quick entry saved without an explicit title stores `title = "{first line of content, truncated at 72 chars}… — 2026/10/01 日記"` (`deriveQuickTitle`, `packages/domain/src/quick-composer.ts:2`). The dashboard recent item then renders that auto-title as a 3-line underlined H3 link, followed by the full excerpt — the identical sentence appears twice in one ≈ 380px-tall list row, plus a separate `time` line and a bare “日記” status link. The title text also embeds UI vocabulary (“日記”) and the date, which is already shown 2 lines above.

User impact:
The dominant element of the only content section on the dashboard is duplicated text; scanning recent decisions is harder and the noise scales with every untitled quick entry (the intended default flow — the quick form hides the title field behind 其他記錄方式）。

Recommendation:
Either (a) render untitled entries with excerpt-only (no H3) in the recent list, or (b) stop prepending content to the derived title — derive from template/date only (e.g. “日記 — 2026/10/01”). Keep the date in the `<time>` element, not in the link text.

Likely code area:
`packages/domain/src/quick-composer.ts:2` (`deriveQuickTitle`) + `apps/web/app/overview.tsx:153` (recent item rendering)

Confidence:
High

Implementation complexity: S

Risk: Low

Suggested dependency: None (but re-verify after auditing `/diaries/quick`, where the same fallback originates)

#### UI-003 — P3 UX — Empty attention status is a floating sentence with no context

Evidence:
`artifacts/ui-ux-audit/dashboard/mobile-initial.png`

Observed:
With no attention items, the dashboard shows a bare muted paragraph 「目前沒有需要處理的事項。」 between two `<hr>`s, with no section heading (the 需要留意 H2 only renders when there are rows). Nothing tells the user what kind of “事項” would appear there.

User impact:
Low — but the muted sentence reads as a stray fragment rather than a section, and new users won't know this slot is for review-due / risk reminders.

Recommendation:
Either always render the 需要留意 section header (with the empty sentence beneath), or fold the empty state into the 近期判斷 section intro to remove one divider-separated band.

Likely code area:
`apps/web/app/overview.tsx` (`WorkspaceAttentionSection`, lines ~141-147)

Confidence:
High

Implementation complexity: XS

Risk: Low

Suggested dependency: None

### Page summary

Must address later:
- UI-002

Should address later:
- UI-001

Optional:
- UI-003

---

## Page Audits — batch capture (402×874, DPR 3, touch)

All routes below were captured with the same harness (screenshots in `artifacts/ui-ux-audit/<dir>/`, numeric probes aggregated from `/tmp/audit/probes.json` during capture: horizontal overflow, sub-34px targets, sub-12.5px fonts, internal scroll containers). Global issues (UI-004…UI-008) are not repeated per page; only page-specific manifestations and findings are listed. Screenshots referenced as `mobile-initial/-middle/-bottom.png` within each page directory.

### /timeline — Complete

Works well: month-grouped entries, count line, clean hierarchy.

Findings:
- UI-005 (title artifact ×2 lines per entry)
- UI-059 — P3 UX — 夥伴對照 tab shown for accounts with no partners; taps lead to an empty comparison. Recommendation: hide until partners exist. Confidence Medium. Complexity S. Deferred (product decision).

### /diaries — Complete

Works well: filter card with 套用/清除， result count, legible rows.

Findings:
- UI-060 — P2 UX — Saved-view controls (empty dropdown + full-width 儲存目前篩選 + hint, ~350px) push search and results below the fold (results H2 at y≈968 of 1508). Recommendation: collapse saved-view management when no views exist; lead with search. Confidence High. Complexity S.
- UI-007 (pager for 1 page)

### /diaries/new — Complete

Works well: clear section labels, inline help, sticky save bar always visible.

Findings:
- UI-061 — P2 RESPONSIVE — 內容 textarea starts ≈y653 and is cut at y713 by the sticky editor footer (top=713, h=85) + 76px tab bar: only ~60px of the primary writing surface visible on load (page 2754px). Recommendation: tighten header spacing so 內容 starts ≤500; add scroll-padding for footer+tabs. Confidence High. Complexity M. Deferred.
- UI-062 — P3 CONSISTENCY — 預覽 Markdown button right-aligned alone here, left-aligned beside voice input on /diaries/quick. Recommendation: unify placement. Complexity XS. Deferred.
- UI-063 — P3 POLISH — Disabled 儲存日記 is pale blue; reads as a style, not a state. Recommendation: add helper text (請填寫內容）. Complexity XS. Deferred.

### /diaries/quick — Complete

Works well: compact one-screen form, sticky append bar with clear disabled state, draft autosave.

Findings:
- UI-004 (three 26px summaries: 其他設定 / 已存片段 / 記錄提醒）
- UI-005 (append notice bakes the artifact title into 4 lines)
- UI-064 — P3 UX — Append-ready notice wraps 4 lines with mixed sizes (~y190–280), delaying the content field. Recommendation: compress to one line. Complexity S. Deferred.

### /diaries/:id — Complete

Works well: clean reading view, 當時的判斷 / 複盤日記 sections, 安排複盤 CTA.

Findings:
- UI-005 (H1 shows the literal "… — date 日記" artifact)
- UI-065 — P3 UX — No back control at top; only the bottom tab bar offers upward navigation. Recommendation: add a 返回 link as /diaries/:id/review does. Complexity XS. Deferred.

### /diaries/:id/edit — Complete

Works well: sticky footer keeps 取消/儲存 reachable on a 2869px form; fields pre-filled.

Findings:
- UI-066 — P3 UX — Footer stacks two half-width buttons into a 141px band; with the tab bar, 217px of the viewport is chrome. Recommendation: single row, side-by-side. Confidence High. Complexity XS. **Implemented** (fix phase).

### /diaries/:id/review — Complete

Works well: large radio cards for 判斷結果， guided prompts, sticky submit.

Findings:
- UI-004 (返回日記 64×18, 修改複盤安排 96×18, 18×18 checkbox)
- UI-005 (subtitle artifact)
- UI-067 — P3 UX — Two adjacent paths to the same reschedule action (▸ 在此改期 + 修改複盤安排 link). Recommendation: keep one. Complexity XS. Deferred.

### /reviews — Complete

Works well: focused empty state with filter pills and 寫日記/日記庫 CTAs.

Findings:
- UI-068 — P3 UX — Empty copy (目前沒有待複盤的項目） ignores the account's existing unreviewed diary. Recommendation: surface the unscheduled entry with its 安排複盤 flow. Confidence High. Complexity M. Deferred (product logic).

### /reviews/ai-reports — Complete

No page-specific findings (empty state consistent with shell).

### /calendar — Complete

Works well: month grid fits 402px with today highlighted; coverage stats + legend.

Findings:
- UI-069 — P2 RESPONSIVE — Year heatmap (1508px in a 370px window, ~4 screens of panning) has no scroll affordance or edge fade; cells clip mid-glyph at the right edge. Recommendation: add an 左右滑動 hint (and optionally an edge fade). Confidence High. Complexity XS. **Implemented** (hint).
- UI-070 — P2 ACCESSIBILITY — Heatmap day buttons are 24×24. Recommendation: raise cells to ≥28px on touch; accept the dense-viz trade-off (GitHub-style pattern, horizontally scrollable). Confidence High. Complexity XS. **Implemented** (28px).
- UI-071 — P2 UX — Three meta paragraphs (intro, 帳戶時區， 記錄天數/覆蓋率， market-exclusion note) push the grid to ≈y640; only ~1.5 rows above the fold. Recommendation: move notes into a disclosure; keep title + controls + grid within ~550px. Complexity S. Deferred.
- UI-072 — P3 CONSISTENCY — Month input renders "October 2026" (native control) inside a zh-TW page. Recommendation: custom stepper ‹ 2026年10月 ›. Complexity M. Deferred (native-control trade-off).

### /alerts — Complete

Works well: concise empty state, timezone disclosure, one screen.

Findings:
- UI-004 (only CTA is 寫日記 48×18)
- UI-073 — P3 UX — No path to create a reminder from /alerts (creation lives in the diary editor); page shows only 寫日記. Recommendation: explain where reminders are created. Complexity XS. Deferred.
- UI-074 — P3 POLISH — Internal-limit copy (顯示最早的 100 筆…) shown in an empty state. Recommendation: drop or tooltip. Complexity XS. Deferred.

### /discipline — Complete

Works well: inline add form + 隨機讀一條紀律 hook above the fold.

Findings:
- UI-004 (20×20 checkbox)
- UI-075 — P3 CONSISTENCY — Page center-aligns headings/content while all sibling pages left-align. Complexity XS. **Implemented**.
- UI-076 — P3 CONSISTENCY — Native English file input (Choose File) inside a zh-TW form. Recommendation: styled label + hidden input. Complexity S. Deferred.

### /achievements — Complete

Works well: dashed empty panel with prominent 新增成就 primary.

Findings:
- UI-077 — P3 POLISH — Content ends ≈y300 leaving ~520px blank. Recommendation: 2–3 milestone examples as tappable starters. Complexity S. Deferred.

### /trade-plans — Complete

Works well: clear hierarchy, prominent 新增 CTA, comfortable filter sizing.

Findings:
- UI-078 — P2 UX — Zero-data state shows 沒有符合篩選條件的交易計劃 (blames filters) plus the 1/1 pager; no create CTA. Recommendation: distinguish zero-data from no-match; empty state with 新增第一個交易計劃； hide pager (UI-007). Confidence High. Complexity S. **Implemented** (pager hidden; zero-data copy + CTA).
- UI-079 — P3 UX — Filter form dominates the fold before any content (empty results start ≈y590). Recommendation: collapse filters behind a disclosure when no plans exist. Complexity S. Deferred.

### /trade-plans/new — Complete

Works well: sticky footer save always reachable; clear sectioning.

Findings:
- UI-004 (back link 96×18)
- UI-080 — P3 UX — 13 stacked full-width fields (2354px) with no progressive disclosure; ~74px stray gap under the intro. Recommendation: collapse optional fields (失效條件/備註/關聯日記）. Complexity M. Deferred.

### /strategy-performance — Complete

Works well: compact summary row, clear empty message with 記錄交易 action.

Findings:
- UI-004 (記錄交易 64×18)
- UI-081 — P3 POLISH — ~60% of viewport blank below the empty state. Recommendation: explainer or vertical centering. Complexity XS. Deferred.

### /stocks (Holdings) — Complete

Works well: single clear empty message with 記錄買入 primary; collapsed risk section keeps the page short.

Findings:
- UI-082 — P2 UX — 重試 button rendered in a normal empty state (implies a load error), and the same empty text repeats as 持倉估值/沒有未平倉部位 further down. Recommendation: drop 重試 unless the fetch failed; merge duplicate copy. Confidence High. Complexity S. **Implemented**.
- UI-004 (策略績效 64×18)

### /stocks/watchlist — Complete

Works well: stat card + prominent quick-add with placeholder examples in the fold.

Findings:
- UI-083 — P2 UX — Search/filter/refresh controls render for an empty list and push the empty-state message below the fold. Recommendation: hide list-management controls when list is empty. Complexity S. Deferred.
- UI-084 — P3 POLISH — 0/0/0 stat card has equal visual weight on first run. Recommendation: hide stats until ≥1 company. Complexity XS. Deferred.

### /stocks/alerts — Complete

Works well: form-first, full-width labelled fields, currency helper.

Findings:
- UI-085 — P2 UX — No alert-list region or empty state anywhere; the promised 最近 100 筆 list has no anchor. Recommendation: explicit list section with empty state above the form. Complexity S. Deferred.
- UI-086 — P3 UX — Form splits across the fold (textarea cut by tab bar at ≈y800, submit below fold). Recommendation: sticky save bar or tighter intro. Complexity S. Deferred.

### /stocks/:symbol (company-market) — Complete

Works well: action pairing at top (記錄想法/寫完整日記）, quote lookup, diary-linked sections.

Findings:
- UI-087 — P2 UX — 歷史收市價 is ~3000px of one-row-per-day entries (H2@1809 → next section@4866 of a 6492px page); unscannable on a phone. Recommendation: collapse behind a disclosure (or chart + limited rows). Confidence High. Complexity S. **Implemented** (details collapse).
- UI-004 (three 18px links: 價格提醒 / 投資論點 / 開啟論點與複盤）
- UI-088 — P3 POLISH — ~100px dead gap between 來源網址 input and 捕捉證據 button. Complexity XS. Deferred.

### /stocks/:symbol/thesis — Complete

Works well: focused form, labelled textareas, native datetime input.

Findings:
- UI-004 (返回公司 64×18)
- UI-089 — P3 UX — 目前論點 section renders as an ~85px blank block with no guidance. Recommendation: hint copy or example placeholder. Complexity XS. Deferred.
- UI-090 — P3 POLISH — 儲存論點 button bottom sits ~8px above the next H2; sections visually merge. Recommendation: 24–32px separation. Complexity XS. **Implemented**.

### /tools — Complete

Works well: grouped catalogue, consistent icon+title+description cards.

Findings:
- UI-091 — P3 UX — Cards ≈355px tall (~2 per viewport, 2136px total); only tap target is the 使用工具 text link (~100×26). Recommendation: tighter rows; make the whole card tappable. Complexity S. Deferred.

### /tools/market-rotation — Complete

No page-specific findings at 402×874 (single-viewport page; shell consistent).

### /tools/etf — Complete

Works well: sensible research flow; 2-column metric grids fit 402px.

Findings:
- UI-004 (26px disclosures)
- UI-092 — P3 UX — Five unavailable fund metrics render as a wall of "—" placeholders (~800px) after 部分資料暫時無法取得. Recommendation: one line (基金資料暫無資料）. Complexity S. Deferred.
- UI-093 — P3 UX — Default 比較基準 equals the queried ETF (SPY vs SPY → meaningless 0.00 relative return). Recommendation: default to a market index or disable 相對回報 when symbols match. Complexity S. Deferred (product decision).

### /tools/relative-value — Complete

Works well: two-symbol input card with per-symbol quotes; ratio result tiles readable.

Findings:
- UI-038 — P1 RESPONSIVE — **Body overflows the viewport**: `bodyScrollWidth=660`; `.market-research-section` renders 644px wide (11 children at 594px). Grid items in `.market-research-relative-grid` lack `min-width:0`, so the `.market-history-chart svg` (min-width:560px) propagates intrinsic width; the 情境價格 table and 價格步幅 input clip off-screen and the whole body pans sideways. Recommendation: `min-width:0` on the grid items; the scenario table then scrolls inside its own `overflow-x:auto` container. Verified in-browser: 660px → 402px. Confidence High. Complexity XS. **Implemented**.
- UI-094 — P3 POLISH — 取得報價 CTA label wraps to two lines inside its button. Recommendation: full-width or nowrap. Complexity XS. **Implemented** (nowrap).

### /tools/seasonality — Complete

Works well: strong above-the-fold storytelling (目前月份 stat row + one-line interpretation).

Findings:
- UI-039 — P1 RESPONSIVE — 月度參考 table crushes to one glyph per line (rows ~500px tall; last column clipped; 12 rows push the page to 6262px). The 370px table has `white-space` normal + no min-width, so cells wrap per character inside the 320px scroll window. Recommendation: `min-width` on the table so it pans as a proper table (or stacked month cards on mobile). Confidence High. Complexity XS. **Implemented** (min-width 560px).
- UI-040 — P2 RESPONSIVE — Chart is a 640px-min SVG in a 320px window (~2 screens of panning, no affordance); axis/value labels 12px. Recommendation: keep contained scroll but bump labels ≥13px and add a pan hint. **Implemented** (label size).
- UI-095 — P3 UX — 解讀 conclusions sit ≈5300px below the fold (after chart + 12 table rows). Recommendation: surface 最強/最弱 months near the top stat row. Complexity S. Deferred.

### /tools/sec-filings — Complete

Works well: single-purpose page, one labelled field, honest empty prompt.

Findings:
- UI-096 — P2 CONSISTENCY — Search input + button are ~197px wide (~half the content column), unlike every other tool form. Recommendation: full-width. Confidence High. Complexity XS. **Implemented**.
- UI-097 — P3 POLISH — ~70% of viewport blank below the empty prompt. Recommendation: example query chips. Complexity XS. Deferred.

### /tools/financial-freedom — Complete

Works well: full-width assumption inputs with units; tidy results list; withdrawal strip.

Findings:
- UI-098 — P2 RESPONSIVE — 年度資產推算 table is 760px in a 368px window; 年度投入 column clips mid-value (hint 可橫向撳動 exists). Recommendation: mobile card restack or reduced columns. Complexity M. Deferred (contained scroll acceptable short-term).
- UI-099 — P3 UX — 中段回報假設（>4–10%） helper floats alone between fields. Recommendation: attach to its field. Complexity XS. Deferred.

### /tools/position-sizing — Complete

Works well: guided input card, inline strategy hint, separate results card.

Findings:
- UI-100 — P3 POLISH — Same disclaimer sentence rendered twice in one view (input card + entire results card). Recommendation: single disclaimer; placeholder in results card. Complexity XS. **Implemented**.
- UI-101 — P3 ACCESSIBILITY — Helper `small` at 11.67px. Recommendation: ≥12.5px. Complexity XS. **Implemented** (global small bump).
- UI-046 — P3 UX — No visible compute control (live updates not communicated). Recommendation: 即時更新 note. Complexity XS. Deferred.

### /partners — Complete

Works well: single-column invite form, full-width field.

Findings:
- UI-006 (bare 目前沒有夥伴）
- UI-102 — P3 UX — 重新整理夥伴 secondary competes with the primary invite action. Recommendation: demote to text link near the list. Complexity XS. Deferred.

### /partners/compare — Complete

Works well: segmented tabs, concise prerequisite empty state.

Findings:
- UI-004 (管理夥伴 64×26)

### /articles — Complete

Works well: full-width search + category + apply, stable public sticky header.

Findings:
- UI-103 — P2 UX — 3-line search-syntax manual (~130px) sits between the input and results; on an empty catalogue it is the dominant content. Recommendation: collapse behind a 搜尋語法 disclosure. Complexity S. Deferred.
- UI-006 (no-results is bare text with no 清除篩選 escape)

### /settings — Complete

Works well: well-structured sections, labelled full-width controls, inline explanations.

Findings:
- UI-004 (管理 API 金鑰 97×18, 管理密碼與裝置 112×18)
- UI-104 — P3 UX — 1684px form with a single save at the bottom and no section anchors. Recommendation: sticky save bar or anchor list. Complexity M. Deferred.

### /settings/security — Complete

Works well: labelled password fields with requirements up front; full-width submit.

Findings:
- UI-105 — P3 UX — 已登入的裝置 section starts below the fold (H2@726). Recommendation: anchor link from the password section. Complexity XS. Deferred.

### /settings/api-keys — Complete

Works well: clear scope select with per-scope explanation; create-form-then-list order.

Findings:
- UI-004 (偏好設定 64×26)
- UI-006 (目前沒有 API 金鑰）

### /guide — Complete

Works well: scannable task sections with consistent rhythm.

Findings:
- UI-106 — P3 UX — Two consecutive sections use the identical CTA label 開啟日記編輯器. Recommendation: differentiate labels. Complexity XS. Deferred.

### /about — Complete

Works well: strong typographic hierarchy, scannable sections.

Findings:
- UI-107 — P3 POLISH — Display pull-quote wraps 4 lines (~230px) at 402px. Recommendation: optional trim. Complexity XS. Deferred.

### /login — Complete

Works well: compact above-the-fold form; recovery + signup visible.

Findings:
- UI-004 (忘記密碼？ 80×18, 建立帳戶 64×18)
- UI-108 — P3 UX — Header 登入 button duplicates the form submit on the login page. Recommendation: hide header auth action on auth pages. Complexity XS. Deferred.

### /register — Complete

Works well: minimal three-field signup with inline password requirements.

Findings:
- UI-004 (登入 32×18)
- UI-109 — P3 UX — No password confirmation and no auto-login after registration (typos → locked-out account). Recommendation: confirm field or auto-sign-in. Complexity S. Deferred (product decision).

### /admin/users — Complete

Works well: stats as a 2×2 grid; per-account cards with role select + save + delete on one row.

Findings:
- UI-110 — P2 UX — Red 刪除帳戶 directly abuts 儲存 on every card (one mis-tap deletes an account). Recommendation: separate row / overflow menu + confirm. Confidence High. Complexity S. **Implemented** (CSS row separation).
- UI-004 (偏好設定 back link 64×18)

### /admin/ai — Complete

Works well: clear section ordering; dashed empty state; full-width labelled inputs.

Findings:
- UI-111 — P1 ACCESSIBILITY — Authorization checkboxes render 13×13 with truncated labels (已授權: rotation-admin@…) — the page's core admin action is effectively untappable. Recommendation: ≥18px boxes in 44px label rows with full emails. **Implemented** (global checkbox sizing + label rows).
- UI-112 — P1 RESPONSIVE — Usage table is 760px in a 370px wrap; headers wrap one character per line (擁有/者）; last column clips mid-glyph. Recommendation: stacked metric rows <480px. Complexity M. Deferred (contained horizontal scroll works, is unpleasant).
- UI-113 — P2 UX — 5432px single-scroll page; reaching 用量與稽核 requires passing two ~700px prompt textareas. Recommendation: section anchors or collapsed prompt editors. Complexity M. Deferred.
- UI-004 (版本紀錄 summary 26px)

### /admin/email-settings — Complete

Works well: logical setup flow (status → SMTP → test → activity), clear state badge.

Findings:
- UI-004 (back link 64×18; 20×20 control)
- UI-114 — P3 UX — Save→test→enable sequence is only implied by text; the enable button looks broken (pale) until prerequisites pass. Recommendation: 3-step progress indicator. Complexity M. Deferred.

### /admin/etf — Complete

Works well: compact add form, batch-seed action, one-viewport fit.

Findings:
- UI-006 (bare 目錄目前沒有 ETF)
- UI-004 (small checkbox)

### /admin/article-translations — Complete

Works well: full-width provider select + apply; dashed empty state listing provider requirements.

Findings:
- UI-115 — P2 UX — ~1100px of policy text precedes any functional control. Recommendation: collapse into a disclosure below the settings. Complexity S. Deferred.
- UI-004 (返回文章編輯器 370×26)

### /admin/research — Complete

Works well: filter card with full-width selects + paired apply/clear; dashed empty state.

Findings:
- UI-004 (研究設定 160×26)

### /admin/blog — Complete

Works well: best admin header pattern (H1 + 新增文章 share the top row); compact filters; one-viewport fit.

Findings:
- UI-006 (目前沒有文章）
- UI-116 — P3 UX — Filters need explicit 套用； the empty message reads 目前沒有文章 even when filters exclude rows. Recommendation: auto-apply on select change; distinguish no-data from no-match. Complexity S. Deferred.

## Fix Phase

See `## Fix Phase Status` at the end of this document for the implemented/deferred ledger.

## Fix Phase Status

Implementation pass completed after the audit. Verification: `tsc --noEmit` clean, `vitest` unit suite 116 files / 1015 tests passing, and every implemented fix re-captured at 402×874 (`mobile-fixed-*.png` / `mobile-*-fixed*.png` next to the originals).

### Implemented

| ID | Fix | Files |
| --- | --- | --- |
| UI-001 | First-use dashboard now renders the 繼續前往 destinations below the first-use card (verified: `.overview-destinations` present for a fresh account) | `apps/web/app/overview.tsx` |
| UI-002 / UI-005 | `deriveQuickTitle` returns the dated fallback label only — no content prefix, no baked ellipsis; unit test updated to the new contract | `packages/domain/src/quick-composer.ts`, `tests/unit/quick-composer.test.ts` |
| UI-003 | Empty attention keeps the 需要留意 section header with links (verified on `/`) | `apps/web/app/overview.tsx` |
| UI-004 | Global touch-target pass: `a.secondary` now renders as a real 44px secondary button (29 anchors); `main summary` min-height 44px; checkbox/radio 18px + `accent-color`; bare inline links get a coarse-pointer hit-area expansion (`::after`) | `apps/web/app/styles.css`, `apps/web/app/routes/admin-ai.css` (legacy native-size override updated) |
| UI-006 | Bare empty states wrapped in the shared dashed `.empty-state` panel | `partners.tsx`, `api-keys.tsx`, `etf-admin.tsx`, `admin-blog.tsx`, `articles.tsx` |
| UI-007 | Pager hidden when totalPages ≤ 1 | `diary-list.tsx`, `trade-plans.tsx` |
| UI-008 | `.brand-sub` mobile size 0.7rem → 0.75rem (12px) | `apps/web/app/styles.css` |
| UI-038 | P1 overflow fixed: grid items get `min-width:0` so the min-width chart SVG cannot widen the page (verified: scrollWidth 660 → 402) | `apps/web/app/market-research.css` |
| UI-039 | Seasonality table gets `min-width:560px` — pans as a table instead of crushing to one glyph per column | `apps/web/app/market-research.css` |
| UI-040 (partial) | Seasonality SVG labels 12px → 13px; chart stays a contained horizontal scroll | `apps/web/app/market-research.css` |
| UI-066 | Editor footer: one button row (141px → 85px, 取消/儲存 side by side) | `apps/web/app/styles.css` |
| UI-069 | Heatmap scroll hint added in all three locales | `apps/web/app/calendar-copy.ts` |
| UI-070 | Heatmap cells 24px → 28px | `apps/web/app/calendar.css` |
| UI-078 | Trade-plans zero-data state: distinct copy + 新增交易計劃 CTA; "no filter match" only when filters are set; pager hidden | `apps/web/app/routes/trade-plans.tsx`, `apps/web/app/trade-plan-copy.ts` |
| UI-082 | Holdings: refresh button only rendered when holdings exist; duplicate 持倉估值 empty section suppressed on an empty book | `apps/web/app/routes/holdings.tsx` |
| UI-087 | 歷史收市價 table (up to 3000px) collapsed behind a 顯示歷史收市價 · N disclosure (page 6492px → 3829px) | `apps/web/app/routes/company-market.tsx` |
| UI-090 | `.plan-form` bottom margin so save actions don't touch the next section | `apps/web/app/trade-plan.css` |
| UI-094 | 取得報價 CTA no longer wraps mid-label | `apps/web/app/market-research.css` |
| UI-096 | SEC filings search input/button full-width, matching the app's form system | `apps/web/app/routes/sec-filings.css` |
| UI-100 | Duplicate manual-price disclaimer removed from the results card | `apps/web/app/routes/position-sizing.tsx` |
| UI-101 | Global `small` bumped to 13px (helper text ≥ readability floor) | `apps/web/app/styles.css` |
| UI-110 | 刪除帳戶 moved to its own row above the fold-safe distance from 儲存 on mobile user cards | `apps/web/app/routes/admin-users.css` |
| UI-111 | Authorization checkboxes 18px (global sizing; per-page native-size override updated) | `styles.css`, `admin-ai.css` |

### Deferred (documented, not implemented — need product decisions or larger redesign)

UI-009 (saved-view collapse), UI-010 (editor fold), UI-011–UI-014, UI-016–UI-021 (reviews/calendar/alerts flow logic), UI-022–UI-029 (content/copy), UI-031–UI-037, UI-041–UI-058 (tools information architecture incl. seasonality 解讀 placement, ETF self-benchmark default, watchlist empty-list controls), UI-059 (partner tab), UI-061–UI-065, UI-071–UI-077, UI-079–UI-081, UI-083–UI-086, UI-088–UI-093, UI-095, UI-097–UI-099, UI-102–UI-109, UI-112–UI-116. Notables: UI-075 discipline centering is deliberate design (kept); UI-093 ETF default benchmark needs a product default; UI-109 register auto-login/confirm needs an auth-flow decision; UI-112 admin/ai usage table needs a stacked-card redesign.
