# Architecture deepening: authoring preservation brief

Date: 2026-09-20
Owner: Astra
Scope: tickets 79–81; accepted for implementation under the user's confirmed five-ticket plan.
Mode: Operate.

- Preserve the current Diary editor hierarchy and optional Transaction, Alert and Review fieldsets. Keep their order, native `datetime-local` controls, UTC occurrence selectors, existing focus targets and mobile stacking. No new fields, navigation, disclosure or form framework are introduced.
- Retain DESIGN.md typography, neutral surfaces, blue action/focus colors, spacing, field widths and light/dark semantics. Keep existing copy and all three locales. The work changes internal time-editing ownership rather than visual presentation.
- A local-time edit invalidates the previous exact-Instant choice. Missing local hours remain invalid; repeated hours require a valid occurrence. An untouched displayed minute retains the original seconds, milliseconds and occurrence. Device timezone controls editing; recurring Alert generation retains account-timezone 09:00 rules.
- The shared time Module owns editing transitions and canonicalization. Each caller keeps its domain fields, validation, rendering and draft lifecycle. Transaction integration must prove a complete saved/read-back path before Alert and Review independently adopt it. Existing create, replace, explicit append, uncertain-write recovery and dirty-state semantics remain intact.
- Acceptance uses existing desktop/mobile browser flows plus focused exact-Instant persistence cases. Inspect the affected fields in one desktop/mobile batch; only correct actual regressions, then confirm once. Astra resolves material deviations internally. No production cutover is authorized.
