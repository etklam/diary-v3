# Optional SMTP and account email lifecycle

Mode: Operate
Direction owner: Astra
Implementation owner: Luna
Requested: 2026-09-26
Status: Direction approved under delegated design authority; implementation acceptance pending.

## Scope and incumbent evidence

Extend the Decision Agenda system recorded in DESIGN.md. The existing public AuthForm, bounded form-page layout, account security sections, and Admin research settings establish the visual and interaction vocabulary. This is a local extension of those surfaces, with settled task structure from the SMTP PRD; no replacement identity or concept selection is required. Preserve the Trade basic brand, existing shells, semantic themes, and system typeface. No durable design-token changes are needed.

The complete task is to configure optional SMTP, verify new registrations when enabled, and recover forgotten passwords. SMTP is disabled by default. Existing users retain access; turning SMTP off restores direct registration and disables new email recovery requests. The UI must make these mode changes understandable without exposing server implementation details to ordinary users.

## Admin composition

Add Mail settings to the Administration navigation. Use the normal workspace gutter and a bounded settings column of approximately 880px. Arrange the page vertically, in the actual setup order:

1. A page heading and short purpose sentence.
2. A compact service-state section with an Enabled/Disabled textual badge, the effect on registration and recovery, and an explicit Enable mail or Disable mail action. A disabled action explains its unmet prerequisite in adjacent text. Activation uses the saved, tested settings; changing the form never silently activates it.
3. One settings form with fieldsets for Connection, Authentication, and Sender. Keep labels above controls. Connection includes Host, Port, and a native encryption select. Authentication has a native checkbox and conditionally available username/password inputs. Sender includes name, email, and optional Reply-To. Save settings is the primary form action.
4. A separate Test email section with one recipient field, Send test email, and latest result/time. State that the test uses saved settings. Disable testing of an unsaved draft with a visible save-first hint. Successful testing means the server accepted the message, not that the recipient received it.
5. Recent mail activity with masked recipient, purpose, textual status, timestamp, and sanitized failure detail. Use a semantic table inside its own labelled scroll region when needed; show a useful empty state explaining that activity appears after a test or account request.
6. A quiet final configuration-removal section. Clearing saved settings is available only while mail is off and requires an explicit confirmation consistent with existing destructive actions.

Use one filled action for the current main setup step where practical; subordinate operational actions use existing secondary buttons. Keep settings, test outcomes, and activity visually distinct through headings, rules, and 24px section gaps, not a grid of decorative cards. Avoid placing one raised card inside another.

## Admin interaction and state

- Saving changed active connection/sender settings deactivates dispatch. Explain this consequence next to Save before submission, and reflect the resulting off state after success.
- Disabling mail uses a deliberate confirmation stating that new users can register without verification and new password-reset emails stop. Already accepted mail cannot be recalled; issued links remain usable until expiry.
- Password is blank on load with a visible Configured/Not configured status and a retain-existing hint. Omission retains the saved secret; clearing is a separate explicit action. Never display placeholder bullets as if they were the actual editable password.
- Preserve entered values on ordinary failures. On a revision conflict, explain that another administrator changed settings and offer Reload latest settings; do not silently overwrite or discard the draft.
- During a mutation, announce the operation and prevent conflicting submissions. After success, announce the actual result with role=status and refresh the relevant state/history. Failed tests show actionable sanitized guidance without rendering raw provider responses.
- Initial load and retry follow the incumbent text-status pattern. Do not introduce a skeleton system for this feature.

## Public account composition and flow

Keep the existing public shell and form-page width. Each route has one H1, one short explanation, one form or completion state, and a quiet back-to-sign-in link. Do not add a promotional sidebar, stepper, illustrations, or a new card-based identity.

| Surface | Fields and main action | Completion and recovery |
| --- | --- | --- |
| Direct registration, mail off | Existing name, email, password; Create account | Account created, then Sign in |
| Email registration, mail on | Email; Send verification email | Generic check-your-email message, expiry guidance, resend cooldown, Change email |
| Verification completion | Name, password, confirm password; Create account | Account created, then Sign in; no automatic login |
| Forgot password | Email; Send reset email | Generic check-your-email message, expiry guidance, resend cooldown |
| Reset completion | Password, confirm password; Reset password | Password changed and previous sessions signed out, then Sign in |
| Recovery unavailable | Plain explanation that email recovery is not enabled | Back to sign in; no nonfunctional submit control |
| Invalid, used, or expired link | One clear explanation | Request a new verification/reset link when available; otherwise explain unavailability and offer Sign in |

The login page exposes Forgot password as a quiet text link. Capability loading must not briefly show a direct-registration form that will disappear; use a loading status and retry on failure. Recheck-mode failures keep entered values and explain the newly available next action. The UI never claims an account exists, an email was delivered, or a reset succeeded before the corresponding server response.

GET navigation does not consume a link. Consume only on final form submission. Opening a valid link after SMTP was disabled must still allow completion. Do not show token values in visible text, accessibility names, error details, telemetry, or navigation links.

## Visual specification

- Typography: incumbent system sans; H1 1.5rem/700, H2 1.125rem/700, body 1rem, labels .875rem/600. Explanatory paragraphs remain at readable measure. No display font or fluid heading scale.
- Color: semantic canvas/surface/text/muted/border/action roles only. Enabled and successful operations use info or neutral status with explicit text; attention uses warn, errors use negative. Financial up/down colors do not represent delivery outcomes.
- Spacing: existing page gutters of 16/24/32px, 24px between major sections, 16px between fields, 8px between labels/hints and related controls. Use existing 6px control and 10px card radii, hairline borders, and shadow-1 only on incumbent surface primitives.
- Desktop: pair short related Admin fields in two columns where it improves scanning; keep host/address fields generous. Auth forms stay single-column. Do not stretch password/email entry across the full workspace.
- Mobile: below 768px collapse fields and actions into a single column, preserve DOM reading order, and use full-width form actions where existing auth patterns do. Wrap long addresses, failure descriptions, and translated labels. Tables scroll inside their region; the page must not overflow horizontally.
- Motion: no entrance animation or decorative transitions. Respect the existing reduced-motion rules.

## Accessibility and localization

Use native forms, fieldset/legend, select, checkbox, button, and link elements. All controls have persistent visible labels, 44px minimum targets, existing focus outlines, and appropriate autocomplete (email, username, new-password/current-password). Password confirmation has its own label and error mapping. Associate hints/errors with aria-describedby and set aria-invalid for affected fields; focus the shared failure summary on submission failure.

Pending forms use aria-busy. Use polite status announcements for accepted requests, save results, and resend readiness; do not announce each cooldown second. Keep a disabled resend button with remaining time in visible text, using the server-provided availability rather than a misleading local-only policy. Completion headings/status should be discoverable by keyboard and screen readers. Native dialogs, where needed for confirmation, retain Escape, focus trapping, and return focus.

Provide complete zh-TW, zh-CN, and en copy through the existing locale mechanism. Avoid concatenated sentence fragments and fixed-width status/action text. Format dates/times using locale-aware utilities; expiry durations must match server policy. Preserve user-entered content when the locale changes. Keep SMTP, TLS, STARTTLS, and technical provider identifiers recognizable; all surrounding instructions and error recovery are translated.

## Final acceptance packet

Implementation must supply actual screenshots of Admin settings and representative account request/completion states at desktop and 390px mobile, including both themes and all three locales across the packet. Include failed/expired and unavailable states, keyboard/focus evidence, and a completed integration flow using synthetic accounts and isolated SMTP. Inspect each capture for its intended page/state before review. A static form or a successful build is not visual acceptance.

Astra will judge hierarchy, consistency with DESIGN.md, readable state consequences, wrapping, contrast, target size, and reachable actions against this brief after the UI lands. Keep final acceptance status separate from this approved implementation direction.
