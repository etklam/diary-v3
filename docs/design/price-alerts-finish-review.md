# Price reminder UI — author verification

The `/stocks/alerts` form and list extend the established green/neutral interface. Company pages can prefill a symbol. Editing focuses the threshold field; ordinary edits preserve trigger state, and a separate Monitor again action explicitly rearms. The page states the latest-100 cap and five-minute checks, with account-timezone trigger dates and three locales.

Author inspected `evidence/price-alerts/1440.png` (light) and `390.png` (dark): labels and decimal values are readable, message wraps, controls fit the mobile column, and row actions wrap without horizontal overflow. Existing CRUD browser evidence: `tests/e2e/price-alerts.spec.ts`, two passing cases at 1440px and 390px, including all four condition choices, signed-percent and completed-session-period copy, MA direction, focused MA-period and percent edits that preserve triggered state, explicit rearm, delete, locales and sign-out.

This is author verification, not independent finish review. Independent review remains pending. The four-condition copy follows ADR0009; backend and runtime evidence is recorded in the ticket review section.

Foreground price notice adds a compact count and direct list link using the existing reminder banner. Author inspected `evidence/price-alerts/foreground-390.png`; both fit within the viewport. Real scheduler/Socket/REST browser tests passed on 1440 and 390 widths as part of five passing foreground cases (19.7s). This remains author evidence only.

## Astra independent acceptance — 2026-09-06

Root inspected the final desktop/mobile pair after the single correction batch. Explicit MA session-unit labels and focus behavior are accepted, with2/2 Chrome correction cases passing. Existing price/percent precision and state-preserving edits remain intact. Ticket34 awaits only its declared ticket33 realtime completion gate; this is not a request for further UI polish.
