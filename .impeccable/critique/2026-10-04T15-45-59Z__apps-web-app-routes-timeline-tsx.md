---
target: Timeline UI change review
total_score: 30
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/Users/klam/Desktop/project/diary-v3/apps/web/app/routes/timeline.tsx"
target_fingerprint: "sha256:9538b3175c0e130d5e8155695967a50ca94d6fa8ca7375f6a536333e7d179849"
target_path: /Users/klam/Desktop/project/diary-v3/apps/web/app/routes/timeline.tsx
timestamp: 2026-10-04T15-45-59Z
slug: apps-web-app-routes-timeline-tsx
---
#### Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 4 | Loading, count, retry, and end-of-range states are clear. |
| 2 | Match System / Real World | 4 | Month, civil date, and event chronology fit diary and trade review. |
| 3 | User Control and Freedom | 3 | Date filters can be reset; full diary reading leaves the feed. |
| 4 | Consistency and Standards | 3 | Shared tokens are used, but disclosure and figure rules are incomplete. |
| 5 | Error Prevention | 3 | Native date inputs and field errors help; range guidance is limited. |
| 6 | Recognition Rather Than Recall | 3 | Active filters are visible; cross-day comparison requires remembering content across routes. |
| 7 | Flexibility and Efficiency | 2 | URL filters persist, but there is no inline reading or fast long-list navigation. |
| 8 | Aesthetic and Minimalist Design | 3 | Calm ruled layout; the two filter groups compete for equal emphasis. |
| 9 | Error Recovery | 3 | Nearby retry and sign-in recovery preserve a route forward. |
| 10 | Help and Documentation | 2 | The page explains its purpose, but not event types or filter behavior. |
| **Total** |  | **30/40** | **Good** |

#### Design Specificity Verdict

The date-first grouping, shared day for diary/trade/review events, and explicit event labels feel authored for Trade basic’s investment-decision workflow. The toolbar uses familiar segmented controls and could be transplanted to a generic admin tool. The content structure carries more product character than the controls.

The deterministic detector returned 0 findings for apps/web/app/routes/timeline.tsx. It reported no rule hits or false positives. Assessment B opened a fresh local browser tab, but the Timeline API at 127.0.0.1:3101 refused connections, so the page showed its shell and retry state without records. Script injection failed because the browser evaluation rejected document.createElement; no reliable user-visible overlay is available. Separately, the project E2E run rendered populated desktop and mobile pages against disposable PostgreSQL and produced the refreshed screenshots.

#### Cognitive Load Assessment

Three checklist failures indicate moderate cognitive load:

- **Visual hierarchy — fail:** mode and event-kind controls share the same visual treatment.
- **One decision at a time — fail:** mode, event kind, and date range are all presented together.
- **Working memory — fail:** reading a full diary leaves the feed, interrupting cross-day comparison and making position harder to retain.

Single focus, month/day/event chunking, grouping, and native date disclosure work well. Each control group has at most four choices, though more than four total actions are visible across the toolbar. Complexity is progressively disclosed for date inputs.

#### Emotional Journey

The page opens quietly and gives a clear reading path. Month and day grouping make long histories scannable, and the loaded count confirms filter results. Reading the full diary is the low point because it interrupts the timeline. Filter errors provide a reassuring retry path; reaching the end is clear but purely functional.

#### Strengths

1. Month, date, and event hierarchy makes long lists easier to scan.
2. Multiple events on one date share one date mark; the full date remains available to assistive technology.
3. Mobile reflows the date above events, while excerpts retain a readable measure and restrained two-line density.

#### Priority Issues

1. **P1 — Approved inline Markdown disclosure is missing.** Diary rows show a two-line excerpt and route link only. The design brief and existing review call for a native disclosure of the safely rendered original Markdown. Leaving the feed interrupts multi-day comparison. Restore a semantic details/summary disclosure while keeping the full-page link as a secondary action. Evidence: apps/web/app/routes/timeline.tsx around DiaryBody; DESIGN.md Timeline section; docs/design/timeline-finish-review.md.
2. **P1 — Mobile touch targets are too small.** Mode/kind links are 32px high, the date summary is 36px, and “Read full diary” is 28px. The convenience brief calls for 44px touch targets; small, adjacent filters are harder to use accurately on phones. Increase their mobile hit areas while retaining the current visual type scale.
3. **P2 — Mode and event-kind controls have equal visual weight.** The identical segmented-control styling makes scope and content filters compete. Keep event kind as the primary filter and quiet the mode switch, or separate the concepts with a clear scope label.
4. **P2 — Figure Rule coverage is incomplete.** Trade quantity, ticker, and time are already monospace. Trade price, date-range summary, and loaded/month counts are not consistently set in the monospace figure face, despite DESIGN.md’s rule for judged figures. Apply the shared figure utility to those values.

#### Persona Red Flags

- **Alex, power user:** Full diary reading requires leaving and returning to the feed; a long list has no fast month jump.
- **Sam, accessibility-dependent:** Semantic labels and the full screen-reader date are good, but 28–36px controls are difficult for users with limited motor precision.
- **Casey, distracted mobile user:** The first record is easy to orient from, but adjacent small event-kind tabs are easy to mis-tap; route switching to read an entry breaks the review flow.

#### Minor Observations

- The title and “Read full diary” link point to the same route, adding another repeated link in a long list.
- Active segmented state relies on subtle surface and text changes.
- Loaded total and month count both aid orientation but can feel repetitive for a one-month result.

#### Questions to Consider

- Is the timeline primarily for opening one diary, or for comparing judgments across days without leaving the feed?
- Should “My / Partner” remain as prominent as the “All / Diaries / Trades / Reviews” filter?
- Which long-list improvement would matter most: month jump, inline expansion, or preserving feed position?
