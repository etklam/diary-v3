# Price alert percent and moving-average conditions

Status: direction accepted by Astra under the user's autonomous implementation authorization, 2026-09-06. Implementation and acceptance remain pending in ticket 34.

PRD user story 58 requires price-above, price-below, percentage-change and moving-average conditions. The frozen contract names all four, but the checker only evaluates the first two. Restoring the missing conditions is an intentional correction of unfinished legacy behavior, not a claim that the old checker supported them. The earlier proposed defaults received no answer; the following are explicit project decisions under the user's authorization to resolve routine implementation choices while away.

## Conditions

PRICE_ABOVE and PRICE_BELOW retain their inclusive comparison against the configured price threshold.

CHANGE_PERCENT measures `(current regular-market price - previous regular-session close) / previous regular-session close * 100`. A nonnegative signed threshold triggers at or above it; a negative threshold triggers at or below it. Zero therefore means at or above the previous close. The UI states this direction and baseline. Missing/nonpositive previous close, invalid inputs or stale fallback data leave the alert pending. Use the existing provider's previousClose field, not a new percentage source or an intraday opening price.

MOVING_AVG compares a current regular-market price with the simple average of the last N completed regular-session daily closes. Support N = 20, 50 or 200. For this condition the existing threshold represents N, shown as a period selector rather than a currency field. Add a named optional moving-average direction (`above` or `below`) to creation and response, defaulting to `above`; existing price-above/below request shapes stay valid. The direction is inclusive. This is a level condition, not an edge-crossing detector: an already satisfied level may trigger on the first check. Do not add a prior-crossing state machine.

Use historical regular closes consistently with the current quote basis; do not combine adjusted historical values with an unadjusted live price. Ignore incomplete current-session/future observations using existing market-session/date utilities, deduplicate and sort dates, and require N usable completed observations. Missing history remains unknown and pending. History failure must not prevent independent above/below or percentage conditions from being checked for the same symbol.

## Lifecycle and implementation boundaries

The existing five-minute checker remains authoritative. Fetch quote/history once per necessary symbol outside transactions, then re-read the current owner row under its lock and evaluate the current threshold/direction. Preserve edit/delete/rearm race handling, commit-before-notification and explicit rearming. No new provider service, polling loop or native dependency. Use controlled provider fixtures and disposable PostgreSQL only.

Contracts, OpenAPI, generated client, database constraint/default and three-language form copy must agree. This additive schema change requires a normal versioned migration; no old-project data migration is involved. Stock-alert list values and foreground hints must distinguish a period from a price/percent threshold. Keep private message text out of foreground summaries.

## Astra UI direction

Extend the existing Price Alert form and list using DESIGN.md and its accepted fieldsets. The condition select exposes four translated choices. Threshold has a visible unit and contextual explanation: currency for price conditions, signed percent relative to previous close for percentage change, period plus above/below selector for moving average. Explain that equality qualifies and evaluation occurs on the existing schedule. Preserve all other layout, tokens, focus and error behavior; no dashboard redesign. Long labels wrap at 390px. Astra accepts the final desktop/light and mobile/dark pair.

## Required evidence

Cover signed percent equality and opposite-direction nontriggers, zero/invalid previous close, all three MA periods and both directions, exact equality, insufficient/completion-date history, stale provider responses, and one condition's history failure not blocking another. Extend existing transaction/race tests only where the new inputs change behavior. Demonstrate creating and editing the new conditions through the real API/UI, one actual checker-to-REST foreground flow, explicit rearm and owner isolation. Do not mark ticket 34 done merely because the two original price conditions still pass.
