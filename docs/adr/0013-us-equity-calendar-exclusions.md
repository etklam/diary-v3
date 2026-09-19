# US equity calendar exclusions

Status: accepted. Date: 2026-09-20.

The user clarified that Calendar exclusions follow US stock markets, not the country inferred from the account timezone. This intentionally corrects the frozen timezone-to-country behavior under ADR 0001. The parent PRD remains unchanged.

## Decision

- When `excludeHolidaysInStats` is enabled, exclude Saturdays, Sundays and published full-day NYSE equity-market closures. Early-close sessions remain eligible trading days. Do not substitute US federal or bank holidays for exchange closures.
- Keep the rule and the verified closure dates in the shared, browser/native-compatible domain package. Calendar does not fetch the generic country-holiday endpoint. Retain that endpoint and its existing wire contract for compatibility.
- Initially cover the officially verified 2025–2028 schedules. Return an explicit unavailable result outside that range; never substitute an empty holiday set or infer market closure from missing quotes. A known selected month's coverage must not be invalidated merely because a separate heatmap range includes an unsupported year. Each surface must disclose its own unavailable range rather than show partial exclusions as complete.
- Preserve the account timezone for determining today and the existing Diary civil-date semantics. Closure keys and Diary keys are compared as date labels. A date-only Diary cannot be retrospectively assigned to a US trading session by timezone conversion.
- Preserve all Diary records and navigation, including entries on excluded dates. The preference changes coverage eligibility and closure markings, not writing permissions or stored dates.
- Retain the Calendar layout, native month input, keyboard navigation and themes. Clarify the setting and Calendar labels in all three locales to identify US market non-trading days.

The previous Nager.Date provider currently returns HTTP 204 with no data for `TW` in both 2025 and 2026. Mapping that response to an empty holiday set would silently miscalculate coverage. The corrected Calendar no longer depends on that provider.

## Sources and maintenance

Verified on 2026-09-20:

- [ICE/NYSE 2025–2027 announcement](https://ir.theice.com/press/news-details/2024/NYSE-Group-Announces-2025-2026-and-2027-Holiday-and-Early-Closings-Calendar/default.aspx).
- [NYSE 2026–2028 schedule](https://www.nyse.com/trade/hours-calendars).
- [NYSE exceptional closure on January 9, 2025](https://ir.theice.com/press/news-details/2024/The-New-York-Stock-Exchange-Will-Close-Markets-on-January-9-to-Honor-the-Passing-of-Former-President-Jimmy-Carter-on-National-Day-of-Mourning/default.aspx).

Update the checked-in data when exchanges publish additional years or exceptional closures, with source attribution and regression evidence. Do not extrapolate future or historical years from modern holiday rules. In particular, January 1, 2028 falls on Saturday and does not create a Friday December 31, 2027 closure.

## Acceptance

Verify exact annual closure sets, exceptional closures, weekends, Good Friday, observed holidays, ordinary bank holidays, early-close eligibility and unavailable years. Browser acceptance must show identical exclusions across account timezones, no country-holiday requests, preserved weekend entries, and all-day eligibility when the preference is disabled.

Verified locally on 2026-09-20:

- `npx vitest run tests/unit/us-equity-calendar.test.ts tests/unit/calendar.test.ts tests/unit/native-shared-boundary.test.ts`: 10 tests passed.
- `npx playwright test tests/e2e/calendar.spec.ts tests/e2e/settings.spec.ts --reporter=list`: 7 tests passed using synthetic accounts and a disposable local PostgreSQL database. April 2026 coverage is 5% with exclusions and 10% without, identically for Taipei and New York accounts. Both directions of independent month/heatmap availability, zero holiday API requests, retained weekend records, keyboard navigation and quick-entry dates are covered.
- `npm run build` (including typecheck), ESLint for changed TypeScript files, and `git diff --check`: passed.
- Desktop and narrow dark-theme Calendar screenshots were visually reviewed; existing layout and closure hatching remain usable.

No production deployment is included in this correction.
