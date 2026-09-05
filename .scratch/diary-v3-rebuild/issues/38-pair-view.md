# [38] 在 Pair View 比較 Diary 並遵守分享隱私

Status: done
Type: AFK
User stories covered: US-067, US-068, US-069, US-074

## Parent

[完整重構 PRD](../PRD.md)

## What to build

按既有日期對齊規則比較雙方 Diary，並在現有入口閱讀允許分享的 Stock Note。

## Acceptance criteria

- [x] 分享旗標、accepted 關係及來源白名單共同決定可見性；Transaction、Portfolio、Alert、私人 Review 及 email 不外洩。
- [x] 日期對齊、時區、單方缺日記、分頁／上限與解除／關閉分享後結果對等。
- [x] 雙帳戶 UI 及 API 負向測試證明不能透過改 ID、直接 URL 或 stale client 繞過權限。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [11 timeline](11-timeline.md)
- [13 diary-review](13-diary-review.md)
- [24 stock-notes](24-stock-notes.md)
- [37 partners](37-partners.md)

## Stock Notes integration obligation

Ticket 24 currently denies all partnerId note reads until sharing persistence/policy exists. Replace that boundary with accepted relationship + stockNotes permission resolution, preserve partner origin label/isOwnedByViewer=false, and test unknown-stock unauthorized queries before empty response. Enable partner note navigation/filter without exposing edit/delete.

Company Hub integration obligation: ticket 29 `/api/stocks/:symbol/hub` must merge authorized partner Notes into the newest-ten projection with source/sourceName attribution once stockNotes sharing permissions exist. Keep current Thesis, Thesis Review and related Diary summaries owner-only; permission revocation must remove partner Notes on the next read.


## Shared Stock Note authorization checkpoint

Replaced ticket 24's blanket partnerId denial with accepted relationship plus the target owner's Stock Note sharing flag. Checks both canonical pair directions, before stock lookup, in the same repeatable-read transaction as count/page data. Own-side sharing does not grant access to the other side. Shared rows retain the existing DTO and isOwnedByViewer=false, without owner ID/email. Owner-only update/delete rules remain intact.

Expanded real HTTP/PostgreSQL Partner suite passed 4/4 (3.11s). New case proves pending denial, connected-but-not-shared denial, wrong-direction flag denial, explicit permission success, no identity leakage, shared-note edit/delete rejection, unrelated viewer denial, revocation including unknown stock, and unlinking denial on the next direct read. This preserves valid source intent while correcting its unknown-stock permission bypass. Typecheck/lint follow.

Remaining: shared-note UI navigation and attribution, Company Hub authorized merge, Pair View date alignment/DTO/SSR and API/UI, privacy whitelist, concurrent revocation acceptance and independent security review. Ticket remains in-progress.

## Company Hub sharing checkpoint

Company Hub now merges own notes with notes from accepted partners whose own Stock Note flag grants access to the viewer. The correlated permission predicate and content read share the existing repeatable-read snapshot. Combined results use date/id descending and a total limit of ten. Partner attribution uses profile name or “Partner”, never email; all other Hub collections remain owner-only.

Real HTTP/disposable PostgreSQL verification: partner-http and company-hub suites passed 8/8 (3.19s), using injected synthetic market data. New coverage proves pending and wrong-direction flags do not expose notes, accepted sharing succeeds, combined newest-ten ordering, next-read removal after flag revocation and unlinking, and no leakage from seeded partner Diary, transactions, Thesis, Reviews or Evidence. Owner position remains zero despite partner holdings. Typecheck and lint passed before the assertion-only correction.

Still pending: shared-note UI selection and attribution, Pair View implementation and full acceptance coverage, independent security review. This checkpoint does not complete ticket 38.

## Shared note UI checkpoint

Company Notes now offers own/authorized-partner selection, localized read-only attribution and a refresh action. Sharing choices include accepted links with the other participant’s flag only, show profile name or generic partner identifier without email, and preserve the source filter and pagination. Switching collections confirms dirty-editor discard. Partner views hide create/edit/delete controls. Refresh and window focus re-read server permissions; failed note reads clear prior content rather than retain stale shared rows. Partner-list errors remain visible without blocking own-note access.

Typecheck/lint passed. Expanded two-account browser test proves shared content is readable, all write controls are absent, email is absent, and explicit refresh after revocation removes content; returning to own notes restores creation. Partner and Company Notes browser suites passed 4/4 (16.5s), including desktop/mobile editing recovery, pagination, precise instant preservation and unsaved navigation. Pair View and independent review remain outstanding.

## Pair View API checkpoint

Added GET /api/partners/compare and shared runtime/OpenAPI/native fetch contracts. Default accepted partner selection, explicit pending 409 and absent/unrelated 404, default 20/max 60 dates, descending union of both date sets, null missing sides, and target-owner sharing flag semantics follow the frozen compare handler/query baseline. Reads use one repeatable-read transaction. Selection/link participants omit emails; Diary fields are an explicit allowlist excluding userId, transactions, alerts, portfolio and private thesis/review fields.

Intentional corrections: use the existing canonical PostgreSQL calendar date without timezone conversion (ADR 0001), remove email from all comparison participants, reject invalid limits with 400 rather than accept fractional limits. No selected accepted partner returns an empty comparison as before.

Partner real HTTP/PostgreSQL suite passed 6/6 (4.30s). New test covers same-day and one-sided dates around DST, wrong-direction sharing, target permission, field allowlist and seeded private thesis/transactions, limit handling, outsider/guest rejection, revocation and unlinking. Contract generation, typecheck and lint passed. Pair View UI, larger bound fixtures, additional timezone acceptance and independent review remain pending.

## Pair View browser checkpoint

Added /partners/compare with connected-partner selection, 20/40/60 recent-day limits, explicit refresh/focus revalidation, loading/error/retry/login states and localized English/Traditional/Simplified Chinese copy. Partner settings link directly to the selected comparison. Desktop uses aligned columns; mobile stacks labelled sides within each date. Missing diary and disabled sharing have distinct messages. Shared entries render Markdown without edit links or private relations.

Expanded two-account Chrome test passed (8.5s): no partner content before permission, shared content after permission, missing owner side, seeded private thesis/email absent, then revocation clears comparison. Desktop 1440/mobile 390 screenshots inspected by primary author at docs/design/evidence/partners/compare-{1440,390}.png; no horizontal overflow. Typecheck and lint passed. This is author visual inspection, not independent review. Remaining: full boundary/error/locale/multi-partner checks and independent security/design review.

## Boundary and recovery checkpoint

Expanded PostgreSQL Partner suite passed 7/7 (5.39s): 64 alternating owner/partner dates prove the merged result has default 20/max 60, explicit and latest accepted partner selection are distinct, missing sides remain null, changing viewer timezone across America/Los_Angeles and Pacific/Honolulu while partner uses Pacific/Kiritimati does not shift civil dates, and invalid/fractional limits reject. Comparison participant loading now joins users once rather than issuing one lookup per relationship.

Login continuation now preserves a validated /partners/compare?partnerId=<decimal> destination. Expanded browser suite passed 2/2 (10.0s), including three locale switches, failed comparison refresh clearing prior content, successful retry, and guest direct-link login preserving selection. Typecheck/lint passed for implementation changes. Independent review and concurrent-revocation/account-deletion acceptance remain outstanding.

## Bounded finish evidence (2026-09-06)

The approved Alert privacy gap is covered without production changes. The existing civil-date/permission fixture now creates a real alert on the partner's diary through `/api/alerts`, verifies that the owner can list the reminder, and asserts that the Pair View response excludes its private message alongside the existing thesis, transaction and email allowlist checks. The focused PostgreSQL/HTTP Partner suite passed 7/7 in 5.47s.

The existing two-account browser suite passed 2/2 in 10.4s, including live sharing revocation clearing Pair View on refresh, failed refresh clearing stale content, three locales, the mobile/desktop captures, and the direct-link login case. Partner reads continue to use live permission checks and explicit refresh/focus revalidation; this evidence does not introduce a read commit barrier or account-deletion route scope. Root reviewed the Partner API additions and the refreshed 390px settings / 1440px comparison captures and approved the behavioral and visual acceptance on 2026-09-06. Worker 44's unrelated market-state persistence gate is now green; root verified the final global typecheck, lint and contracts checks.

## Final acceptance evidence

Root accepted all three criteria on 2026-09-06. Evidence combines the focused Partner HTTP/PostgreSQL suite (7/7, including allowlisted Pair View fields, private Alert exclusion, date/timezone bounds, live revocation and unlinking), the existing dual-account Chrome flow (2/2), and root's independent API and visual review. Ticket 38 is complete.
