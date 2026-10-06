# [09] Add Guru comparison and stock Guru research

Status: ready-for-agent
Execution: done
Type: AFK

## Parent

[Guru Portfolio PRD](../PRD.md)

## What to build

Add the two-to-five-Guru comparison flow and connect prepared Guru holdings intelligence to existing stock/company research pages.

## Acceptance criteria

- [x] /gurus/compare compares reported value, holdings count, top-ten concentration, turnover, sector allocation, common/unique holdings, additions/exits, and opposing actions.
- [x] Common holding breadth reports held-by-N-of-selected; opposing actions show the separate Guru actions and quarter.
- [x] /stocks/:symbol/gurus shows current tracked holders, latest buyers/sellers, new positions/exits, average weight, and holder/weight/net-buyer histories.
- [x] Global search resolves Guru names, manager/fund names, and stock symbols/names to their respective research pages without mixing SEC-filing results into the Guru product surface.
- [x] Every displayed value identifies the reported quarter and filing-delay limitation.
- [x] No stock page performs whole-universe consensus generation at request time.
- [x] Browser evidence covers two, three, and five Gurus, empty comparisons, conflicting actions, and missing/partial stock data.

## Blocked by

- [08 consensus and stock intelligence](08-consensus-sectors-stocks.md)

## Resolved comparison and stock-link decisions

- Comparison accepts 2–5 distinct active Guru slugs and one exact quarter. Its default is the newest quarter with READY portfolio data for every selected Guru; if none exists, it selects the newest prepared quarter and shows every selected Guru's data state. Values are suppressed for non-READY portfolios.
- Common and unique holdings use stable security identity plus quantity type and Put/Call exposure. Unresolved identities remain visible in quality counts but are never matched by issuer text. Each holding displays `heldBy / READY selected Gurus` and the total selected count; missing or partial managers are not treated as non-holders.
- Opposing actions require at least one NEW/ADD/STRONG_ADD and one REDUCE/STRONG_REDUCE/EXIT for the same stable position identity and selected quarter. UNCHANGED is shown as context but is not a conflicting direction. Additions and exits remain visible per Guru.
- Guru comparison values come from matching active effective snapshots and READY prepared portfolio analytics. Readiness requires the active publication, current snapshot ID, READY period state, and current analytics version to agree. Sector allocations use the analytics result, not a second calculation over request-time holdings.
- Full current positions come from the selected effective snapshot; `guruHoldingChanges` supplies actions only when an eligible adjacent comparison exists. A missing action remains null and is never labeled NEW or UNCHANGED. Do not use the portfolio top-holdings summary as the full position set.
- `/api/stocks/:symbol/gurus` resolves the active ticker identifier to one security ID, reads prepared consensus history for that ID, and fetches only that symbol's quarter holdings/actions. Ambiguous or unresolved ticker mappings return an explicit state with no guessed matches. History follows security identity across ticker changes. If a quarter rebuild is queued, the response marks it PENDING and suppresses stale prepared metrics.
- The stock market research page embeds a compact Guru snapshot and links to `/stocks/:symbol/gurus` for the detailed holder list and history. Every page labels its quarter, SEC source, and 13F delay.
- Global search combines active Guru directory matches (including manager/fund names), prepared Guru stock consensus name/ticker matches, existing destinations, diary search, and the existing direct-symbol route. SEC filing search remains on the separate SEC tool and is not added to Guru results.
- A symbol-only search keeps the existing `/stocks/:symbol` destination; a matched company name or stock-consensus result opens `/stocks/:symbol/gurus`.

## Implementation evidence

- Before: the comparison and stock Guru research routes were absent from the starting route table, so there was no prior module UI to capture. After: desktop and mobile captures cover both routes in [design evidence](../../../docs/design/evidence/guru-comparison/).
- Visual direction follows `DESIGN.md`'s Ledger rules: ruled sections and aligned figures carry hierarchy; dense comparisons remain in bounded table regions; mobile moves stack their details instead of shrinking figures. During visual review, the search control height and duplicate delay notice were corrected; the final captures show the corrected states.
- `npm run typecheck` — passed.
- `npm run contracts:generate` and `npm run contracts:check` — passed.
- `npm run build --workspace=@diary/web` — passed.
- `npx vitest run tests/integration/guru-consensus.test.ts` — 2 passed, using a disposable PostgreSQL database.
- `npx playwright test tests/e2e/guru-comparison-stock.spec.ts tests/e2e/command-palette.spec.ts --grep 'compares two, three|shows prepared|resolves Guru'` — 3 passed.
- `npx playwright test tests/e2e/command-palette.spec.ts --grep 'resolves Guru'` — 1 passed after adding Guru-name search coverage.
- `git diff --check` — passed.
- Impeccable detector on the changed Guru comparison and stock research surfaces — no findings (`[]`).
