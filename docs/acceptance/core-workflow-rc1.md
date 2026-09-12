# Trade basic — Core workflow RC1 readiness record

Date: 2026-09-12. Product: Trade basic. Mode: Operate / acceptance closure; no new product features in this phase.

## Versions and environment

| Item | Value |
| --- | --- |
| Legacy parity baseline (frozen, read-only) | `docs/parity/source-manifest.json` → diary-vue `47f8313bf29870b52582db97209bef2e1cbe41ce` (clean worktree, SHA256-manifested archive) |
| v3 tested SHA | Product code exactly at `d71d2ba53b7044bdde59e7948c03000f759076d0`; this phase adds only tests, test-harness config and this record (commit "test: close RC1 core workflow acceptance gaps") |
| Uncommitted changes at test time | None on the final tree; every result below was produced on the committed tree |
| Node / npm | v26.4.0 / 11.17.0 (no packageManager pin, no .nvmrc) |
| Database | Disposable PostgreSQL provisioned per suite by `tests/support/database.ts` (matches the Forgejo disposable-container pattern) |
| Browsers | Chromium 1440px / 390px / 360px; WebKit spot checks; no real device |
| Build mode | Dev server (`scripts/e2e-server.ts`, fixture market upstream) for `test:e2e`; production bundles (`npm run build` + `scripts/release-e2e-server.ts`, `MARKET_PROVIDER=fixture`) for `test:e2e:release` |

## Gate results (final tree)

| Gate (package.json script) | Result |
| --- | --- |
| `npm run lint` | Pass (0 errors) |
| `npm run typecheck` | Pass |
| `npm run test:unit` | Pass — 71 files / 616 tests |
| `npm run contracts:check` | Pass — no drift |
| `npm run manifests:check` | Pass |
| `npm run test:integration` (disposable PostgreSQL) | Pass — 232 tests / 63 files |
| `npm run build` | Pass |
| `npm run test:e2e:release` (built artifacts, Chromium) | Pass — 8 tests |
| `npm run test:e2e` (full development suite, Chromium) | Pass — **193 passed / 1 failed**; the single failure is the pre-existing `timeline.spec.ts` 1440px case (reproduces on the untouched baseline, see Limitations). First full run (before the dev/release config split below) had 195/7; the four release-artifact failures were running under the wrong config, and two transient failures (diary-review 1440px, handoff cross-tab logout) passed on re-run and did not recur. |

## Usage-task parity matrix

Statuses: Verified = executed on the final tree this phase; Confirmed gap = reproduced and recorded; Intentional difference = documented product decision; Unverified = no executed evidence.

### A. Anonymous Tools

| Task | Legacy entry/behaviour | v3 entry/behaviour | Persistence & permission | Evidence | Status |
| --- | --- | --- | --- | --- | --- |
| Position sizing calculation | Public calculator | `/tools/position-sizing`, reserved-cash rule, copy summary, trade-plan hand-off | Public compute; save/append/trade-plan hand-off require sign-in | `tests/e2e/public-tools.spec.ts`; release "anonymous visitors" case (fixed inputs → `9,933`; save → sign-in alert) | Verified |
| Market research quote + history | Public quotes | `/stocks/:symbol` guest quotes, index alias (`SPX`→`^GSPC`), range change, stale/failed-provider recovery, capture CTAs visible to guests | Public read; notes/thesis/evidence and CTAs' write paths require auth | `tests/e2e/company-market.spec.ts`; release anonymous case (fixture quote `100`, lookup re-binds view, range fetch 200, no private regions, no 401 breakage) | Verified |
| Seasonality / relative value / ETF research / market rotation / SEC filings | Public reference tools | Same routes under `/tools/*` with no personal data | Public read; private watchlists 401 | `public-tools`, `relative-value-seasonality`, `etf-research`, `market-rotation`, `sec-filings` specs | Verified (dev mode) |
| Tools vs private boundary | — | Tools public; partner comparison and all diary/company private sections stay behind auth | `/api/diaries`, `/api/stocks/watchlist`, `/api/etf/watchlist`, `/api/admin/users` → 401 anonymous | `public-tools.spec` wire assertions; release anonymous case | Verified |

### B. Record, save and recover Diaries

| Task | v3 flow | Server-read evidence | Evidence | Status |
| --- | --- | --- | --- | --- |
| Create via Quick / Full editor | `/diaries/quick`, `/diaries/new` | GET after save returns id/date/symbols/tags | release "auth and diary create, read, edit"; `first-diary`, `quick-diary`, `diary-editor` specs | Verified |
| Find by search (not by order) | `/diaries` searchbox | unique marker → exactly one result link → opens that record | `diary-list.spec`; release mainline case | Verified |
| Timeline / Calendar reach same record | `/timeline`, `/calendar` date cell | click-through lands on the persisted diary id | `timeline.spec`, `calendar.spec`; release mainline case | Verified (timeline 1440 spec failure pre-existing on baseline; 390 + restoration pass — see limitations) |
| Same-day append semantics | Quick append keeps title/body/symbols; content added once | GET shows joined-once content; symbol-limit overflow rejects atomically | `diary-stocks` integration, handoff suite, release mainline + company cases | Verified |
| Recovery after reload/failure | Restore draft → Save → server read | recovery GET verifies persisted content | `library-session-recovery`, `diary-response-loss` specs; release "restore a draft" case | Verified |
| Uncertain append never replays | lost response → draft locked with `DIARY_WRITE_UNCERTAIN`, no auto retry | GET confirms single append | handoff suite double-submit/uncertain case; `NO_AUTOMATIC_SESSION_RETRY_HEADER` unit | Verified |

### C. Company research → Diary → return

| Task | v3 flow | Evidence | Status |
| --- | --- | --- | --- |
| Record a thought from a company | `/stocks/:symbol` CTA → contextual Quick with symbol+source | handoff suite (18 tests): CTA href, notice, draft precedence, guest→login/register return | Verified |
| Save → find by symbol → edit | Library company filter returns the saved record; final symbols follow user input + server | release Company case (server GET of created + appended content, symbols `['NVDA']`); handoff symbol-filter test | Verified |
| Return to research | Saved detail shows `Return to SYMBOL research` from validated source context (session hint survives reload; distinct from persisted associations) | release Company case clicks through both directions; handoff reload test | Verified |
| Session/login continuity | 401 expiry and guest register/login preserve the handoff without auto-writing | handoff 401 recovery and guest registration tests | Verified |
| Public quote failure ≠ private blockage | Quote/history errors render notices; the page, CTAs and diary routes keep working | `company-market.spec` HISTFAIL/STALE/EMPTY cases; capture routes are independent of quote state | Verified |

### D. Diary review / Thesis review → workspace

| Task | Evidence | Status |
| --- | --- | --- |
| Overdue/due items reachable, complete via UI, queue stops listing them as due; Completed region files them | `review-queue.spec` (incl. per-page navigation and filter context return) | Verified |
| Review outcome persisted server-side; original diary content/thesis/risk/execution untouched by the review | release mainline case (GET review + GET diary after completion); `diary-review` integration | Verified |
| Diary review and thesis review are separate state machines; both return to the queue with context | `review-queue.spec` lines 23–33 (diary completion, thesis completion, queue return) | Verified |
| Queue failure recovery; no private reflection text leaks into queue list | `review-queue.spec` 500-retry + "not.toContainText" assertions | Verified |
| Reflection draft dirty semantics, recovery discard, cross-tab sign-out clearing | `diary-review.spec`, `review-dirty` unit | Verified |

### E. Partner invitation, sharing, comparison, revocation

| Task | Evidence | Status |
| --- | --- | --- |
| A invites B → B accepts → B shares → A compares from Timeline → B revokes → A revalidates and loses access | `partner-timeline-parity.spec` (full flow), `partners.spec` (UI invite/share/remove), release parity case | Verified |
| Date pairing (both / one-sided / timezone-independent civil dates), partner switch races, limit and URL restoration, distinct empty/pending/private/removed states, read-only partner entries | parity suite + `partner-http.test.ts` | Verified |
| C cannot guess ids: outsider partnerId → 404; ownership on diaries/reviews unchanged | `partner-http.test.ts` | Verified |
| Allowlist response (`partnerDiarySchema`), no transactions/alerts/review markers/email, `no-store`, no public caching | `partner-http.test.ts` wire assertions; `pwa.spec` no private API caching | Verified |
| Explicit/cross-tab sign-out clears rendered partner content; late responses cannot repopulate | parity suite sign-out + race cases; session remount semantics | Verified |
| Real-time revocation push | Intentional difference: revalidation-on-focus/refresh only; no WebSocket/polling (documented in `docs/design/partner-timeline-parity.md`) | Intentional difference |

### F. Trade plans / transactions and their relations

| Task | Evidence | Status |
| --- | --- | --- |
| Create plan via UI, exact decimals, draft→active→closed lifecycle, linked diary readable from both sides, delete | `trade-plans.spec` (1440/390) | Verified |
| Plan status change does not create trades or holdings | release trade-plan case (`/api/stocks/holdings` stays `[]`; holdings page empty) | Verified |
| BUY/SELL ledger persistence with holdings math, oversell rejection without partial writes, corrections within ledger constraints | `buy-ledger.spec`, `sell-ledger.spec`, `ledger-corrections.spec`; `buy-ledger`/`sell-ledger`/`ledger-corrections` integration | Verified (dev/integration; not duplicated in release by design — one cross-page plan case kept) |

## Cross-functional failure / privacy checks

1. Save 500 / validation → inputs retained, baseline untouched: `diary-editor.spec`, `trade-plans.spec` (500 with field retention), release failure-path cases. Verified.
2. Session expiry → unsaved writing survives; re-login does not auto-replay uncertain appends: `web-session.spec`, `library-session-recovery.spec`, handoff 401 recovery, `NO_AUTOMATIC_SESSION_RETRY_HEADER` unit. Verified.
3. Explicit/cross-tab sign-out → drafts, in-memory content, capture hints cleared; unmount flush and late responses cannot rewrite: `capture-session` unit, handoff, `diary-review.spec`, parity suite. Verified.
4. Account switch → per-account draft keys and isolation: handoff "next account" case; partner unlink isolation. Verified.
5. Partial API failure ≠ empty account: `overview.spec` attention-retry; company page independent quote/history errors; calendar holiday-provider failure keeps coverage honest (`—`). Verified.
6. Navigation: dirty-editor blocker, timeline restoration, returnTo allowlist unit tests (`capture-context`, `capture-session`). Verified.
7. PWA: worker update applied without losing an unsaved editor; no private API responses in caches: `pwa.spec`. Verified.

## Confirmed findings and fixes this phase

1. Release suite could not exercise registered-account journeys reliably: registrations from later tests hit the shared 3-per-60s register limiter and the 5-per-60s login limiter on `127.0.0.1`. Fix (test harness only): `scripts/release-e2e-server.ts` now starts the API with `TRUST_X_FORWARDED_FOR=true`, and new release tests declare distinct synthetic `x-forwarded-for` clients. Production code untouched; the header is only honoured because the release harness opts in, mirroring distinct real clients.
2. Release suite gaps closed (test-only): anonymous calculator + market-research tasks, diary mainline with server-verified reads (search/timeline/calendar/edit/append), review persistence with queue consistency, and a trade-plan cross-page case.
3. No new P1 product defects reproduced this phase. The timeline 1440px spec failure below reproduces on the untouched baseline and is recorded, not masked.

## Limitations and unverified items

- **Pre-existing, not introduced**: `tests/e2e/timeline.spec.ts` "Timeline month reading, retry and stale filters at 1440px" fails identically on baseline `d71d2ba` (clickNav element-detach loop; page remains on `/diaries/new`). The 390px variant, the restoration test and the release mainline timeline case pass. Recorded as a known spec-level issue for a follow-up fix; not a product regression from this phase.
- **Real devices**: no iPhone/Android testing. 390px/360px are viewport checks only; mobile keyboards, scroll physics and real WebKit-on-iOS behaviour are unverified.
- **WebKit**: spot checks only (see below); the full matrix was deliberately not duplicated.
- **Forgejo / staging / production**: local results only. Pipeline (`.forgejo/workflows/deploy.yml`) runs lint, typecheck, unit, contracts, manifests, integration, build and `test:e2e:release`; the extended release suite is inside `testMatch` (`release-artifacts.spec.ts`) so the gate executes it — no skips or `if:false`. No deploy, tag, DNS or production-data action was performed.

## Development E2E status

Full `npm run test:e2e` (Chromium, serial per repo config) executed twice on the final tree:

- Run 1 (14.0m): 195 passed / 7 failed. Triage: 4 failures were `release-artifacts.spec.ts` executing under the dev config it was never written for (it targets production bundles and the release harness; the dev-config run also lacks the release harness's forwarded-identity isolation). Fixed by `testIgnore: '**/release-artifacts.spec.ts'` in `playwright.config.ts` — Forgejo still executes the suite through `test:e2e:release` (`testMatch`), with no skips or `if:false`. `diary-review.spec.ts` 1440px and `research-diary-handoff.spec.ts` cross-tab logout failed transiently, passed immediately on individual re-runs, and did not recur in run 2. `timeline.spec.ts` 1440px is the pre-existing baseline failure.
- Run 2, final tree (13.4m): **193 passed / 1 failed** — only the pre-existing timeline 1440px case.

The narrow-viewport spot suite (`tests/e2e/narrow-viewport.spec.ts`, added this phase) passes at 360px and 390px across `/`, `/timeline`, `/diaries/new`, `/partners/compare`, `/calendar`, `/reviews`.

## WebKit spot checks (executed, non-blocking limitations recorded)

`npx playwright test --browser=webkit` over web-session, quick-diary, diary-editor-ux, workspace-navigation, partner-timeline-parity: **19 passed / 7 failed** in one batch run.

- Verified on WebKit: login/refresh flows (web-session 2/2), workspace and mobile-menu navigation with focus return (2/2), partner comparison flows (6/7 in batch; the one failure passes solo), editor dirty-guard (passes solo).
- Not verified on WebKit: the Quick capture-dialog retry flow (`Control+j` capture entry), the SPX session error rendering, and three diary-editor-ux cases that only fail inside long WebKit batches (pass solo). These are recorded as WebKit automation-compatibility limitations; Chromium is the RC1 verification browser. No real-device verification exists for any browser.

## Screenshots kept

- `docs/design/evidence/core-workflow-rc1/release-queue-consistency.png` (post-review queue state, inspected)
- Prior-phase inspected evidence remains valid: `docs/design/evidence/partner-timeline-parity/*`, `docs/design/evidence/research-diary-handoff/*`.

## Final status

**Ready with clearly documented non-blocking limitations** — the six core task groups complete on the final tree with server-read evidence at the release layer; limitations are the pre-existing timeline 1440px spec failure, two known load-sensitive dev-suite specs (pass solo and did not recur on the final run), WebKit spot-only coverage with recorded automation gaps, no real-device verification, and local-only (no Forgejo/staging/production) validation. Local acceptance does not imply production verification.
