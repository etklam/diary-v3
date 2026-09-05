# [20] 查看 Portfolio 曝險、集中度與風險摘要

Status: done
Type: AFK
User stories covered: US-041, US-042

## Parent

[完整重構 PRD](../PRD.md)

## What to build

在 Portfolio 查看現有曝險、集中度與風險摘要，並由提示進入相關持倉。

## Acceptance criteria

- [x] 所有既有 exposure buckets、最大／前三持倉集中度與風險規則符合固定 fixtures。
- [x] 未知 beta／報價、空帳本及 partial data 的分母與文案依契約處理。
- [x] API／UI 投影一致、owner 隔離、數字可讀；為 Overview 提供有界結果。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [19 portfolio-valuation](19-portfolio-valuation.md)

## Exposure checkpoint

Audited frozen beta-buckets, portfolio-exposure, beta-allocation policy and exposure API/UI. Ported the static seven-bucket classification, combined buckets, ±5 percentage-point target comparison and 20-cell allocation policy into the native-compatible domain package. Ported source behavioral fixtures and added regression coverage: 84 tests passed (111ms). Intentional correction: corrupt negative costs are excluded and counted, instead of producing negative/inflated bucket percentages; missing/zero/different quotes leave the full cost denominator unchanged.

GET `/api/stocks/exposure` and generated contracts now expose real owner ledger cost exposure with no-store/credential protection. Rotation context is not implemented yet: the response deliberately uses the source's unknown-market fallback with no gaps. This does NOT complete the allocation integration. Tickets 43–46 must wire the actual persisted context and verify known-regime allocation/gaps; the Web comparison remains pending until then.

React renders all seven bucket percentages with labelled native meters, explicit cost-basis explanation, unknown classification and missing-market state. Portfolio valuation now exposes largest/top-three priced-market-value concentration and source 25%/60% warning, linking the largest holding to Company. PostgreSQL owner/missing-quote/empty/credential scenario passed (1.10s). Desktop/mobile E2E 2/2 passed (9.0s): 50% unknown cost exposure versus 100% concentration among priced holdings, navigation, retry, locales and logout. Typecheck/lint passed. Author inspected two light/dark captures under `docs/design/evidence/portfolio-exposure/`.

Remaining: real rotation allocation integration, independent finish review, broader risk-rule/concentration boundary audit and final Overview integration. Status stays in-progress.

Production build passed. Added explicit concentration fixtures: largest exactly 25%/below, top-three exactly 60%/below, partial quotes with separate cost, empty/unpriced/zero-value denominators — 4/4 passed (77ms). Broader attention-engine rules and Rotation comparison remain pending.

## Attention-engine checkpoint

Ported all five deterministic attention rules and stable priority/dedup ordering from the frozen source. Both `/api/portfolio/attention` and `/api/stocks/attention` return at most 50 owner items and explicit quote coverage. Diary candidates are bounded at 100; completed rows are filtered before the limit. Intentional corrections: lowercase PostgreSQL reviewed status avoids the legacy uppercase filter mismatch; first related symbol is deterministic; non-finite concentration is ignored. Action URLs now point to React's actual `/stocks/:symbol/thesis` route.

13 pure fixtures passed (102ms). Two PostgreSQL scenarios passed (1.63s), including all reasons, priority, partial denominator, alias equality, review completion clearing, owner/credential isolation, no private reflection projection and 101 completed plus 60 pending Diaries to prove completed rows cannot exhaust the candidate window. Two desktop/mobile browser flows passed (8.6s), completing actual Thesis/Diary reviews through attention links, retry, locales and logout. Initial browser attempt omitted the required Diary outcome; corrected test input. One Vite manifest-patch fetch warning occurred during the passing run; no assertion failed. Typecheck, lint and production build passed.

Author inspected attention captures; independent review still pending. Rotation comparison and final Overview integration remain outstanding. Valuation is loaded before the research snapshot, matching the source read sequence; final concurrency/performance review should assess coherent snapshot requirements under concurrent ledger/research edits.

Integrated Vitest checkpoint after attention: all 47 files / 354 tests passed (11.39s), including real disposable PostgreSQL integration suites. This does not replace the outstanding full browser/final parity gates.

## Provenance and final candidate checkpoint — 2026-09-06

The persisted sectors reader is now projected with separate nullable `marketStateAsOfDate` and `summaryAsOfDate` calendar dates. `lastUpdated` remains the rank snapshot instant, so the Portfolio UI labels rotation snapshot, market-state and breadth-summary dates separately. A mixed-date PostgreSQL fixture (`2026-09-04` rank/summary, `2026-09-03` market state) passed with the existing owner/cost projection and allocation gaps: 4/4 focused integration tests.

The focused Chrome exposure flow passed 2/2 (11.9s) at 1440px light and 390px dark. It covers known allocation, separate provenance dates, concentration navigation, local comparison-table scroll/focus, no page overflow, retry, three locales and logout. Evidence regenerated at `docs/design/evidence/portfolio-exposure/{1440,390}.png`; root/Astra visual review accepted the pair. `contracts:generate` and `contracts:check` passed. Full typecheck remains blocked only by the unfinished ticket34 `routes/price-alerts.tsx` form union at line 58; no ticket20 path is implicated. Ticket remains in-progress pending root status update.

## Root acceptance — 2026-09-06

Astra inspected the latest exposure desktop/light and 390px/dark captures plus the attention pair. Cost-basis explanation, all seven buckets, target/current/signed-gap comparison, unclassified coverage and independent rank/state/sector dates are readable; the mobile table stays within its named keyboard-focusable scroll region. Existing domain evidence covers the full allocation/bucket/risk rules and exact concentration boundaries; owner projections and unknown/partial cases retain the documented denominator. Latest disposable PostgreSQL exposure suite passes 4/4 (including missing/stale/failed market reader), and Chrome passes 2/2 with real navigation, retries, locale changes and mixed dates. Contracts generation is present and root contracts:check passed.

Ticket20 is accepted. Overview composition is ticket30 and is now unblocked; previous checkpoint statements listing it as remaining ticket20 work are superseded. The current global typecheck identifies an unrelated in-progress ticket34 price-alert create/update union error; no claim is made that the whole worktree passes the final release gate.

Follow-up: root reran `npm run typecheck` after the ticket34 form fix; the full current worktree passes (exit0). The earlier unrelated typecheck blocker is resolved.
