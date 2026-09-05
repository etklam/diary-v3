# Overview implementation direction

Owner: Astra. Implementation: Luna. Mode: Operate.

This refines the Overview composition already selected in `implementation-brief.md`; it does not replace the visual system. The purpose is to let an authenticated diary user identify and open their next follow-up action. Scope is ticket 30, with real bounded projections from its prerequisite modules. This document is design direction, not evidence of completion.

## Reading order and composition

- Header: one H1, account-local date and the existing Quick Diary action. Keep the established shell and its navigation; use the actual authenticated landing route established by the source audit. Guest landing content remains governed by ticket 53.
- Desktop: a two-thirds main column for attention/review items followed by recent decisions; a one-third supporting column for Portfolio context and tracked-company links where supported by the frozen source. Keep the two columns only where both remain readable. Mobile order is follow-up actions, recent decisions, then Portfolio context. DOM and keyboard order must agree with that sequence.
- Attention items lead with an explicit reason and their actual Diary, Thesis, Trade Plan or Company title; show relevant due date and one meaningful destination link. Preserve the source priority and date classification. A visual group heading distinguishes overdue, today and upcoming when those categories exist in the data; no new ranking or urgency algorithm in the browser.
- Recent activity reads as a chronological list with civil dates, source type and a short original title/summary. Distinguish the original decision from later review metadata. Each section has a clear link to its complete existing destination; bounded summaries must not suggest they are exhaustive totals.
- Portfolio is a compact definition list, not a second holdings table. Show the source's summary metrics and risk context with denominator, missing-quote status and provenance close to the affected value. Navigation opens the full Portfolio or the exact Company. Trade Plan actions use the existing plan route and its current status.

## Visual rules

Use DESIGN.md semantic colors, system sans-serif, 24px H1, 18px section headings, 16px body and 14px metadata. Preserve dark/light theme substitutions, 44px controls and visible focus. Use 40px separation between major sections, 24px inside grouped content and thin rules between list items. Links are the green action color; urgency needs text as well as any existing semantic color. Keep the flat workspace without shadows, decorative charts, oversized totals or new color roles. Long titles and symbols wrap; financial numbers use tabular numerals and remain selectable.

## States and interactions

Each independently loaded source keeps its own loading, error and retry state. Successful sections remain readable if another source fails. Unknown values have explicit labels; valid zero remains a number. An empty account gets a concise first-diary prompt using the existing create action. No pending reviews is a local empty state and does not erase recent history. All three locales must use complete messages, and timestamps use the account time zone without changing civil dates.

No client-side duplicate ledger, risk engine or authorization rules. Do not preload private data into public HTML. Logout or account change clears late private results. The source audit determines exact payload bounds and available categories; report any material layout change to Astra before implementing it.

## Acceptance evidence

Use a synthetic account with Diary, Thesis, Trade Plan, holdings and risk items. Demonstrate following the next action to the correct existing form or detail view, partial failure/retry, first-use emptiness and account isolation. Capture desktop/light and 390px/dark with realistic long content. Astra reviews the final pair together; fix actual findings in one batch, then confirm only the affected states. Existing module tests remain authoritative for their calculations; add Overview tests for composition and integration behavior.
