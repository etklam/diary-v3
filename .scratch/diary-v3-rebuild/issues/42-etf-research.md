# [42] 使用 ETF Watchlist 閱讀研究摘要

Status: done
Type: AFK
User stories covered: US-075, US-076, US-089

## Parent

[完整重構 PRD](../PRD.md)

## What to build

使用者從既有 Catalog 加入／移除 ETF Watchlist，查看行情、風險、相對強弱及其他既有研究欄位。

## Acceptance criteria

- [x] 未知 ETF、duplicate、排序／分頁與 owner 契約對等，不私自建立另一份 ETF master。
- [x] profile 由既有 provider／歷史資料計算，partial／stale／unknown 有清楚狀態。
- [x] UI 從新增到閱讀及刪除完整可用，證明與股票持倉無資料混用。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [41 etf-catalog](41-etf-catalog.md)

## ETF Watchlist API checkpoint

Read frozen etf-watchlist queries and handlers. Added session-owned GET/POST/DELETE /api/etf/watchlist with strict runtime and generated OpenAPI/fetch contracts. Preserves existing catalog-only membership, unknown ETF 404, duplicate 409, all-items list without invented pagination, automatic order and owner-only removal. Canonical calendar dates are strings; latest monthly close retains zero instead of truthiness-based missing handling.

Owner row lock serializes concurrent next-order allocation; ETF key-share lock protects the catalog relation during insert. Atomic unique insert handles same-ETF races. Read uses one lateral latest-price projection and stable order/id tie-breaker. No stock-master or personal-ledger writes.

HTTP/PostgreSQL tests passed 2/2 (1.83s): unknown creates no master, concurrent distinct adds get orders 0/1/2, same-ETF race yields 200/409, separate owners can hold same ETF, zero/latest and missing-price projection, foreign removal denial, own removal, CSRF/guest rejection and empty stocks/stock_watchlists/transactions. Contract generation/typecheck/lint passed. Research profile calculations, partial/stale status and UI remain unimplemented; ticket stays in-progress.

## ETF research evidence and calculator checkpoint

Frozen snapshot contains public ETF Profile V2 design/implementation documents but not their referenced profile service/routes or public tools/etf page. Treat those documents as intended scope, not proof that implementation exists. Required domains include 52-week high/low distance, annualized 20/60/252-day volatility, one-year drawdown, volume spike, fund valuation, and SPY/QQQ relative returns.

Added shared platform-neutral etf-risk calculators. Explicit conventions: sample standard deviation of daily log returns annualized with sqrt(252), percent units; full 252 observations for year-high/low/drawdown and 253 for 252 returns; real high/low required rather than substituting closing extremes; current volume divided by prior 20 observations; RS difference of simple returns on common date endpoints. Missing/insufficient data returns null. These are recorded implementation decisions because source executable formulas are absent.

Unit coverage checks constant-price zero volatility, drawdown, volume baseline, insufficient windows, matched RS endpoints and missing overlap. Provider daily OHLC/volume, valuation, partial/stale aggregation/contracts and UI remain pending.

## Research provider checkpoint

Extended existing Yahoo upstream with optional quoteSummary and production SDK modules summaryDetail/defaultKeyStatistics/fundProfile, verified against installed SDK declarations. Added dailyResearch preserving daily close/high/low/volume and five-year coverage for indicator windows, and fundValuation mapping AUM, expense ratio, P/E, P/B, yield and currency. Ratio fields convert to percentage units; zero values survive and missing/invalid values stay null. Both reads use 900-second TTL, queue/cancellation and explicit stale fallback.

Provider fixtures cover daily missing-field/null handling, large safe volume, valuation ratio conversion and zero expense, exact 15-minute expiry, stale fallback and all-unknown fundamentals. Aggregated public profile/domain endpoints and user UI remain pending.

## Public profile aggregation checkpoint

Implemented public GET profile/risk/valuation/rs endpoints with strict symbol/benchmark/period validation and generated OpenAPI/client contracts. Independent provider failures retain available metrics and report partial/unavailable rather than fabricated zeros. Stale fallback is explicit at response and field provenance level. Domain endpoints scope status, provenance and observation date to their own domain; missing valuation no longer labels complete risk data partial. Future-dated daily observations are excluded before calculation. Public ETF research is excluded from Web private-session classification; watchlist remains private. Invalid explicit credentials still fail closed.

Verified: contracts generation/drift, typecheck and lint passed. Provider/risk/profile focused suite passed 5 tests before the additional scoped-metadata regression; final profile integration passed 2/2 (864ms) against disposable PostgreSQL. Fixtures cover partial source failure, stale fallback, malformed benchmark, invalid credentials, unavailable symbol, future observations, domain-only provenance/status and zero relative return. ETF research/watchlist UI and independent review remain pending; ticket stays in-progress.

## React research/watchlist checkpoint

Added public /tools/etf with URL-persisted symbol/benchmark/period, risk/fund/relative-return sections, explicit null/partial/stale indicators, observation/fetch dates, calculation explanation and field provenance. Added private /etf/watchlist with catalog-only add, latest monthly price/date, research navigation, removal, read retry and login return path. Transport-uncertain mutations disable further writes until an authoritative list read succeeds. Global navigation exposes ETF research. Both routes have en/zh-TW/zh-CN copy and reuse established tokens.

Typecheck/lint passed. Chrome E2E passed 1/1 (6.7s): guest research, private list denial/login return, admin catalog seed, add/read/remove, three research locales, 1440 light/390 dark overflow checks, profile transport failure clearing old data and retry. Captures at docs/design/evidence/etf-research/{1440,390}.png were inspected together by root; this is not independent finish review. Remaining acceptance includes fuller metric/stale browser fixtures, uncertain write recovery/owner isolation browser checks, accessible detail labels/date formatting and independent review. Ticket remains in-progress.

## Uncertain write recovery regression

Watchlist treats HTTP 5xx as an unknown mutation outcome, alongside transport errors; writes remain disabled until a successful authoritative list refresh. That refresh clears the old mutation error. Added browser regression that executes a real POST then drops its response, observes one recovered membership, and confirms duplicate addition preserves one row. A real DELETE followed by synthetic proxy 502 likewise recovers the absent item without resubmitting. Both research E2E scenarios passed (7.8s), with typecheck/lint passing. Research dates now use localized UTC display and time elements, and provenance presents translated metric labels instead of internal field paths. The bounded desktop/mobile confirmation capture was regenerated. Independent review and fuller data-state fixtures remain pending.

## Completion fixes checkpoint

Profile overall status now excludes valuation currency from the metric set. The disposable PostgreSQL profile suite passes 3/3, including currency-only → unavailable and all numeric metrics complete with `currency: null` → complete. Research exposes the frozen 17-metric scope with three-locale definition, interpretation, and limitation copy inside a native bounded details section; the copy follows the calculator’s 252-observation high/low/drawdown windows, √252 volatility annualization, signed high/low distances, and prior-20-observation volume baseline.

Watchlist dates render localized UTC `<time>` values. Watchlist and research inputs connect validation state to their error notices, and admin inputs use the same pattern. API error codes `AUTH_FORBIDDEN`, `ETF_NOT_FOUND`, and `ETF_ALREADY_IN_WATCHLIST` now have actionable Traditional Chinese, Simplified Chinese, and English messages. Rows include symbol-bearing accessible context for read/remove and initialize/delete actions.

Targeted Chrome runs passed research/watchlist flows (3/3), controlled complete/stale/unavailable profile fixtures (1/1), three-locale catalog-error and ARIA validation fixtures (1/1), and unit risk/provider tests (4/4). Root acceptance combined the independent calculator/formula review, focused visual review, and the real PostgreSQL/provider owner and integrity evidence recorded above.

## Final acceptance evidence

2026-09-06 root acceptance confirmed all three criteria. Real PostgreSQL/API suites cover catalog-only membership, unknown and duplicate rejection, owner isolation, stable ordering, CSRF/guest rejection, removal authorization, zero-versus-missing prices, and no writes to stocks, stock watchlists, or transactions. Controlled provider/profile suites cover currency-only unavailable, numeric completion with null currency, partial/stale/unknown states, future-data filtering, and signed metric calculations. Chrome evidence covers all three locales, localized UTC `<time>` dates, accessible error wiring, complete/stale/unavailable profile fixtures, watchlist add/read/remove, and focused desktop/mobile captures. See [`docs/design/etf-finish-review.md`](../../../docs/design/etf-finish-review.md) for the consolidated review record.
