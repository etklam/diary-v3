# Research method coverage manifest

The calculator maps mechanical rules to pure functions. Every row below also
requires the listed manual review before a run can be treated as publishable.
The source pages are evidence of the method definition, not evidence that a
live provider or a human reviewer completed a run.

| Rule | Source | TypeScript implementation | Automated evidence | Manual QA still required |
| --- | --- | --- | --- | --- |
| Canonical identity, expected-session coverage, duplicate, OHLC, freshness and sample gates | 02, 06 | `validateResearchInput` | Unit tests cover missing expected sessions, missing latest reference row, duplicate rows, older close-only history, recent 150 OHLC coverage, recent 21-row volume consistency, incomplete sessions and scheduled future calendar rows | Verify provider identity, source rights, adjustment basis and cross-source joins |
| Verified US-equity sessions, closures, early closes and Eastern close instants | 01, 02 | `createVerifiedUsEquityCalendarProvider`, `createLatestCompletedUsEquitySessionResolver` | Tests cover DST before/after transition, the 2025-01-09 mourning closure, July 3 closure, Thanksgiving early close and unsupported coverage | Curated schedule is bounded to 2025–2028 and must be refreshed/verified before extending that horizon; calendar gaps block use |
| Total-return rebasing over all OHLC fields; explicit split-only downgrade | 02 | `normalizeResearchBars` | Unit test checks reference close and transformed OHLC; missing `adjClose` throws | Confirm adjustment evidence and corporate-action basis |
| SMA/EMA seeds, RMA reseeding and slopes | 03 | `calculateSmaSeries`, `calculateEmaSeries`, `calculateRmaSeries`, `calculateResearchMetrics` | Hand-computed period-3 SMA/EMA/RMA seeds; EMA/RMA reseed after a null observation | Review first values, warm-up and source scale |
| RSI14, MACD12/26/9, TR/ATR14 | 03 | `calculateResearchMetrics` | Hand-computed RSI outputs for uninterrupted rising, falling and flat closes (100/0/50); an isolated MACD step checks the first MACD and signal values and positive/negative signs; a gap checks TR=5 and ATR=(5+13×2)/14; a missing-OHLC vector checks ATR reseeding after 14 new true ranges | Review terminal close, one TR and indicator basis |
| DMI/ADX14, directional ties and zero denominators | 03 | `calculateResearchMetrics` | Hand-computed rising/falling staircases check ATR=2, +DI/-DI=50/0 and 0/50, and ADX=100; tied directional moves check both DMs and ADX are zero; flat zero-range bars check zero DI/ADX; missing OHLC checks DI and ADX reseeding | Review direction versus strength interpretation |
| Bollinger20/2 using population standard deviation | 03 | `calculateResearchMetrics` | Ten closes at 100 followed by ten at 102 give mean 101, population deviation 1, and bands 103/99; flat closes give zero-width bands | Confirm close series and rounding at report boundary |
| Prior-20-session volume and RVOL | 03 | `calculateResearchMetrics` | Test proves current volume is excluded from denominator | Verify provider, scope and share basis are consistent |
| Completed weekly OHLC and 30-week SMA | 03 | `completedWeekBars` inside `calculateResearchMetrics` | Completed-week and warm-up tests | Confirm official `isWeekFinal`; unfinished weeks remain excluded |
| 5/20-session and three-calendar-month common-window returns | 03, 06 | `calculateRelativeStrength` | Tests anchor starts/ends to the target-session timeline and return N/A when an exact requested benchmark endpoint is absent | Review predetermined benchmark selection and identical endpoints |
| Confirmed two-left/two-right pivots | 03 | `findConfirmedPivots` | Confirmation-date test | Review ties, noise threshold and subjective pattern claims |
| Recent 120-session gaps and open/partial/filled state | 03 | `findGaps` | Synthetic gap-status test | Review corporate-action exclusions and intraday fill semantics |
| Structural anchors/zones | 04 | `deriveStructuralLevels` | Traceable-anchor test | Review support/resistance meaning and no AVWAP/volume-profile claims |
| Midpoint and conservative long reward/risk | 04 | `calculateRewardRisk` | Exact 2.4R and 10/7R golden test | Select fixed stop/order semantics and reject closer unprocessed resistance |
| Transparent direction score and caps | 04 | `calculateDirectionScore` | Unit tests cover negative 30-week SMA slope, unavailable ADX/three-month inputs, and fixed benchmark slots for non-SOXX symbols | Human review of stage, pattern, event and setup-quality claims |
| Breakout and pullback plan candidates | 04, 06 | `deriveTradePlanCandidates` | A non-SOXX golden fixture selects only existing support/resistance zones, derives ordered breakout and pullback candidates, and checks midpoint/conservative R/R for T1/T2; missing zones produce N/A rather than fabricated levels | Candidates remain WATCH; a reviewer must verify trigger/retest, event and benchmark status, expiry, execution stop/order policy, and whether the R/R meets the method thresholds |
| Ten report sections, eight answers, citation and contradiction gates | 06 | Backend report/QA module; evidence preparation starts unevaluated gates as CORE/`NOT_CHECKED` | Source tests assert G09/G10 are not marked complete during preparation | Every CORE gate needs an approved result for the exact revision; G07/G08 N/A requires an explicit limitation and reviewer/date |
| Yahoo daily bars, direct official-source reads and Tavily discovery | 01, 02, 05 | `createYahooResearchEvidenceProvider`, `collectOfficialResearchSources`, `createSourceFetcher`, `createTavilySearchProvider` | Controlled transports cover null-preserving Yahoo mapping, redirect rejection, bounded official-source extraction, publication-as-of withholding, timezone-aware 28-day event labels, discovery with unknown model permission, and bounded search accounting. Successful evidence-preparation fixtures remain marked synthetic; direct-source rules are tested at the collector boundary. | Yahoo collection remains blocked while rights are unknown; direct sources require configured approved URLs/extractors and policy evidence; Tavily needs an explicit key, policy and persisted budget; snippets are leads only and synthetic runs never call live adapters |

The domain calculator does not acquire sources, verify events or provider
rights, prompt an LLM, generate a report, or publish an article. The API source
adapter is independently injectable and records its bounded reads, policy
decisions, and data dates. Human event, citation, and contradiction review
remain required before publication; synthetic evidence is only for offline
engineering tests.
