# Evidence capture and Stock Timeline finish review

## Historical author inspection — 2026-09-05

Evidence capture extends the existing green research workspace. The original author inspection found the form and timeline readable; the submit action was separated from the timeline heading before the passing capture run. The detector found no issues in the Evidence and Watchlist components. The original capture screenshots were stored under the review directory and later copied into the durable evidence directory.

The original browser capture cases passed 2/2 (16.0 seconds): capture without a quote, a server write followed by a simulated lost response, retry with the identical key, one persisted record, reload, source link, Watchlist summary/count, three locales, mobile overflow and logout clearing. The form freezes an uncertain submission until a retry confirms the result, and offers no evidence editing operation.

## Source parity follow-up — historical

Diary source coverage passed: capture, original source opening, Diary changes/deletion while preserving frozen evidence, confidence display, account-timezone timeline instants with an explicit timezone label, UTC capture inputs, and a new-tab source link with `noopener/noreferrer`. Three browser cases passed (21.1 seconds). The following consolidated review records the current ticket evidence.

## Consolidated ticket25 validation — 2026-09-06

The existing database evidence in `tests/integration/evidence.test.ts` is 4/4: atomic capture plus concurrent idempotent retry and Watchlist restoration; event-time/ID ordering with owner isolation; forged-link, invalid source/URL/limit, authentication and CSRF rejection; and immutable content with same-owner Diary linkage plus source-deletion unlinking. The existing timeline projection unit evidence in `tests/unit/timeline.test.ts` is 4/4: repeated-ID deduplication, decimal-ID ordering and month grouping, private Review-field exclusion, and source-compatible Markdown excerpts.

The focused Chrome capture suite `tests/e2e/evidence.spec.ts` was rerun exactly once and passed 3/3 in 12.7 seconds: 1440px capture in 3.9s, 390px capture in 2.8s, and the Diary source case in 2.5s. The existing Timeline browser evidence in `tests/e2e/timeline.spec.ts` remains 2/2 from the recorded 13.4-second confirmation; it covers page retry, duplicate responses, stale filter invalidation, empty ranges, locales, dark mode, long Markdown, source navigation, logout and a capture refresh.

The refreshed capture images are [`1440.png`](evidence/capture/1440.png), 960×990, and [`390.png`](evidence/capture/390.png), 358×1225. The existing Timeline images [`1440.png`](evidence/timeline/1440.png), 1440×1855, and [`390.png`](evidence/timeline/390.png), 390×3114, were independently inspected. The form keeps source type/date above the summary and source metadata, then places the capture action before the frozen record list. The mobile capture wraps within its section width; the capture and Timeline suites assert no document-width overflow. The Timeline images retain the one-column mobile reading flow, civil-date grouping and expanded Markdown readability. No actual UI defect or production change was needed, and no aesthetic changes were made.

## Final acceptance — 2026-09-06

Root reviewed the refreshed 1440/390 capture images, the existing Timeline images, the 3/3 focused capture run, and the recorded 4/4 PostgreSQL, 4/4 unit and 2/2 Timeline evidence. The immutable capture/idempotency/source-link behavior, Watchlist projection, Diary source preservation and Timeline reading scope were accepted. Ticket 25 is complete with no production UI changes.
