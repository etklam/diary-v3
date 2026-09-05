# [36] 匯入、匯出及分享 Discipline

Status: done
Type: AFK
User stories covered: US-064, US-065

## Parent

[完整重構 PRD](../PRD.md)

## What to build

從紀律清單匯入／匯出既有格式，並開啟既有公開分享與 OG 呈現。

## Acceptance criteria

- [x] 合法與非法檔案、重複／部分錯誤及來源匯入策略有固定 fixtures。
- [x] 匯出可重新解析且資料一致；公開分享只呈現允許內容，不洩露私人帳戶資料。
- [x] 瀏覽器匯入下載與公開分享完整可示範；格式、特殊字元、theme／mobile 及 OG 正確。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [35 disciplines](35-disciplines.md)

## Format and transactional API checkpoint

Audited frozen `lib/disciplineShare.ts` and export/import handlers. Format is version 1.0, type trading-disciplines, optional title/author/description, ordered content/order rows, exportedAt and count. Export defaults to Anonymous and My Trading Disciplines; author name is included only when requested. Import accepts JSON wrapper with replaceExisting, preserves file array order and duplicates, filters blank/malformed rows, rejects oversized nonempty content, and ignores source IDs/timestamps/orders for persisted identity and append positioning. Public encoded share URLs and OG are still outstanding.

Added portable `discipline-share` schemas/parser/export builder. Export copies and sorts its input, then allowlists content/order rather than mutating caller arrays or retaining owner fields. Malformed metadata types are rejected instead of being reflected. Added authenticated no-store GET `/api/discipline/export` and POST `/api/discipline/import`, with OpenAPI/generated fetch types. Export uses repeatable-read consistency; import shares the owner collection lock with CRUD and encloses replacement deletion plus insertion in a single transaction. Inserts are batched within that transaction to avoid PostgreSQL parameter limits. Int32 order overflow is rejected.

Four unit/HTTP/PostgreSQL cases passed (2 files, 2.29s): Unicode/special characters, partial malformed rows, duplicate content, unknown version/oversized content, source input not mutated, export reparse, explicit author opt-in, no owner/id/date leakage, empty export 404, append/replace, guest/CSRF, and injected insertion failure rolling back replacement deletion. Typecheck/lint passed before final test additions; final checks follow. Browser import/download, public landing/URL codec/OG, large-file bounds, concurrent import acceptance and independent review remain pending. Ticket is in-progress.

## Encoded public share and SSR checkpoint

Added legacy-compatible URI-encoded JSON → Base64 codec and URL construction using URLSearchParams. Portable module has no window, Buffer or server import. Codec fixtures roundtrip Chinese, emoji, quotes, ampersands, slash/plus/percent and reject bad Base64/URI/JSON/version. Three share unit cases passed (129ms).

Added public `/discipline/share` loader and SSR article, rendering only parsed title/author/description/principle text from the link; no account lookup. Invalid/missing payload returns 400. Metadata includes title/description/OG image; noindex avoids indexing arbitrary user-generated links. Added public `/api/og/discipline.svg`, escaped XML text, bounded title/author display, line-wrapped title, public cache and restrictive SVG CSP. The share route propagates no-referrer headers.

No-JavaScript browser case passed (4.7s), proving initial title/body, safe literal script-looking text, escaped SVG and invalid-link status. Header propagation assertion rerun follows. Typecheck/lint passed. Public page import button points to the intended query-based preview, but that private-page preview is still unimplemented, so it is not an end-to-end sharing delivery yet. File controls, preview/import flow, download/copy/share actions, visual/mobile/OG author inspection, codec size limits, OG OpenAPI entry and independent review remain required.

## Browser transfer flow checkpoint

Added `DisciplineTransfer` below the private list: JSON file/text input, explicit parsed preview, append/default or replace with confirmation, title/description/author opt-in export settings, JSON download, selectable public URL, copy button and public preview link. Imports refresh the list and clear prior random/export snapshots. Successful query-driven import removes the consumed import parameter. Inputs and previews stay available on API failures; share text states that anyone with the link can read included content/name.

Browser scenario passes (1/1, 6.0s): real JSON file selection, preview before persistence, append, export with Unicode, actual downloaded JSON reparse and equality, Anonymous default, public landing, return to import preview, confirmed replace and consumed-query cleanup. Earlier attempt had an exact-label lookup failure for the populated URL textarea; explicit aria-label fixed it and the full flow passed. Existing no-JavaScript SSR/OG case passed separately. Typecheck/lint passed before final test/label additions; final check follows.

Remaining: preserve import query across guest login, prevent locale changes from resetting an in-progress URL preview, transfer draft navigation protection, bounded file/URL input, stale prepared-export handling on subsequent main-list edits, clipboard failure and mobile/theme/OG visual verification, social-specific share actions, uncertain POST replay handling, OG OpenAPI and independent review. No completion claimed.

## Guest import continuation and locale correction

Private discipline login links now retain the encoded import query. The safe-return allowlist accepts only the exact discipline path with a single Base64/percent-encoded import parameter, preserving existing external-redirect rejection. Import decoding reacts to payload changes rather than locale changes, so switching language no longer overwrites manually edited JSON or rebuilds its preview.

Browser case passed (5.8s): unsigned guest public share → private import → sign in → original preview, edit JSON, switch to Traditional Chinese, preview/import changed content and remove consumed query. Typecheck/lint passed. Added the public SVG operation to OpenAPI and regenerated fetch types. Registration-path continuation, broader return-path security cases, transfer draft protection, stale export snapshot handling, size limits and remaining visual/independent review still require acceptance.

## New-account continuation

Auth form alternate registration/login links and the post-registration login action now carry the validated returnTo destination. Normal auth entry without returnTo stays unchanged. New-account browser case passed (5.8s): public share, private import, registration, successful account creation, login, same encoded preview and no automatic import. First attempt raced route/registration completion and made no register request; explicit route/success assertions corrected the fixture. Typecheck/lint passed for the implementation.

## Prepared export invalidation

Prepared exports now carry the source list reference. Rendering/downloading/copying is allowed only while it matches the current list, so an edit/delete/reorder/reload invalidates old output; a late export response from a prior list also stays hidden. User export settings remain editable and no import draft is remounted. This protects current-tab edits; changes in another tab/device still require a refresh.

Extended browser transfer case passed (6.3s): prepare original export, edit a principle, observe old URL removal, prepare again, visit the public landing and verify updated content, then return and import. Typecheck/lint passed. Other remaining ticket gates are unchanged.

## Transfer draft navigation protection

The discipline route's existing single navigation blocker and beforeunload handler now include transfer draft state: pending operations, unimported JSON and changed export settings without a prepared snapshot. Transfer does not register a competing router blocker. Path changes require confirmation; same-path removal of a successfully consumed import query remains possible. Logout keeps the existing session invalidation behavior.

All four sharing browser cases passed (9.2s), including the new assertion that cancelled navigation retains edited import JSON, plus successful import cleanup, download/latest-export flow, guest login, registration and no-JavaScript SSR/OG. Typecheck/lint run follows. File-size bounds, mobile/OG inspection, clipboard failure, uncertain import replay and independent review remain pending.

## Mobile sharing and clipboard recovery

Added desktop/mobile browser cases verifying real export preparation, denied Clipboard API with specific manual-copy guidance, full URL text selection and public text/no horizontal overflow. Author inspected mobile dark transfer/public captures, corrected inherited oversized checkbox layout and reinspected. Two cases passed after correction (7.7s). Typecheck/lint passed before the final checkbox-only style adjustment. Vite logged ECONNRESET when sockets closed during navigation, without test failure; production transport acceptance remains separate. See docs/design/discipline-finish-review.md. No independent review claimed.

## Final implementation evidence pending root acceptance

Import response loss now reconciles against the owner list using the complete pre-request id/content/order prefix and the expected new ids/content/orders. A same-content duplicate or concurrent mutation therefore remains explicitly uncertain instead of being mistaken for this import; the preview is retained and no automatic retry is issued. The browser fixture forwards the real import to PostgreSQL, aborts only response delivery, and verifies two rows, one committed import and no duplicate retry.

The public OG fixture now uses a long CJK author and records the actual rendered image at `docs/design/evidence/discipline/og.png`. The SVG endpoint bounds the author to 32 Unicode code points so the single attribution line fits the existing 1200×630 surface, while title/content remain XML-escaped. The focused browser run passed the public no-JavaScript/OG, import/export, guest continuation, registration, mobile/theme, clipboard and overflow cases; after a shared package JSON formatting repair, the two response-loss cases passed in a separate focused rerun. Root review is still required before changing this ticket status.

## Root acceptance — 2026-09-06

Astra accepted the versioned format fixtures, append/replace transaction semantics, reparsed export and privacy projection, guest/new-account preview continuation, actual download/share/clipboard recovery and lost-import response reconciliation. Root inspected the actual long-CJK OG image: escaped text remains literal and author attribution fits. Combined focused browser evidence is ten passing cases plus the two corrected response-loss cases; typecheck and targeted lint passed. Ticket35 is accepted. Earlier speculative additional file-size hardening is not a missing format acceptance criterion; preserve the documented source format rather than introducing arbitrary import limits.
