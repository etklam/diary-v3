# Trading principles — author verification

The discipline page extends the existing green/neutral work surface and flat list. Content is the primary row text, with creation time secondary and explicit up/down/edit/delete buttons. Reordering requires no drag gesture and returns focus to the moved text. Random reading distinguishes saved principles from fallback quotes. Forms preserve unsuccessful input and guard dirty navigation.

Author inspected desktop light and mobile dark screenshots in `evidence/discipline/`. Long sentences and row actions wrap within the viewport. Initial inspection found the textarea/save gap missing; the author added the established 20px form spacing. Browser cases cover both widths, keyboard reorder/focus, edit, locales, empty/random, delete and logout.

This is author evidence only. Independent finish review is pending because the available reviewer agents are stopped at their usage limit. Mutation failure/retry, dirty-navigation confirmation and longer-list checks remain pending and the ticket is not complete.

Failure/dirty-navigation acceptance now has browser evidence: failed initial read retries, failed create retains draft and focuses error, cancelled navigation preserves content, failed reorder leaves list unchanged, and confirmed navigation discards. Lost DELETE response can be retried to converge on server absence. Extended case passed (6.3s). This supersedes the earlier missing failure/dirty-guard note; independent review and longer-list checks remain pending.

## Sharing surface author pass

Author inspected mobile dark transfer and public-share captures. File/JSON preview, export settings and manual URL selection fit 390px without page overflow. The author-name checkbox initially inherited oversized centered input styling; corrected to a left-aligned 20px checkbox within a 44px-high clickable label row and reinspected the updated capture. Clipboard denial now explicitly directs manual selection instead of reporting a network failure. Desktop/mobile denial/manual-selection/public-text browser cases passed after correction (2/2, 7.7s). Independent review and OG image visual inspection remain pending.

## Response-loss, long-list and OG evidence

The final bounded corrections cover the remaining write-recovery gaps. A create POST and an import POST never auto-replay after a transport failure. Each performs one owner-list reconciliation and accepts the result only when the unchanged pre-request rows and the expected new id/content/order suffix match exactly; otherwise the draft or import preview stays visible with an uncertain-result message. This keeps duplicate content and concurrent writes from being misreported as this request's success.

The focused real PostgreSQL suite covers a 128-row collection and a concurrent reorder/delete operation. The browser suite covers a 120-row 390px collection, actual forwarded-and-aborted create/import responses, and the complete existing share flow. The first focused Chrome run passed the 10 pre-existing discipline/share cases; the two response-loss cases then passed alone after replacing two test-only role-name locators with exact rendered-text locators. The run produced `evidence/discipline/og.png` from a public share whose author is 30 repeated CJK characters. The OG route truncates that attribution to 32 Unicode code points, escapes title/author/content and keeps the existing 1200×630 layout. This is implementation evidence for root's independent review; it is not an aesthetic redesign or a status declaration.

## Astra acceptance — 2026-09-06

Tickets35/36 accepted after code/contract review, existing desktop/mobile evidence and actual long-CJK OG inspection. The OG author remains within the image, the public text is readable, and transfer retains the approved native controls. Real PostgreSQL collection-concurrency and browser committed-response-loss evidence close the material gaps. No additional cosmetic iteration is required. This supersedes earlier pending independent-review notes.
