# Diary review — ticket 13

The existing Operate visual system is retained. On desktop, the original judgment and later reflection occupy separate columns; on mobile they become an ordered reading flow. Original thesis, risk, execution and safe Markdown remain visible while writing the outcome and reflection. Completed reflection has its own read state and explicit editing action.

## Verification

`PLAYWRIGHT_CHANNEL=chrome npm run test:e2e -- tests/e2e/diary-review.spec.ts` passed 2/2 (16.0s), using disposable PostgreSQL and synthetic accounts. Both 1440px and 390px cover:

- Unscheduled diary → scheduled pending review → completed review → edited reflection surviving reload.
- Device America/New_York schedule 2026-09-08 10:30 → persisted 14:30Z → account Asia/Taipei display 22:30. The display names its timezone.
- Required meaningful reflection, field-associated errors, controlled PATCH 500 retaining every field, then successful retry.
- Server completion timestamp, original thesis preservation and completion focus.
- Three locales, light desktop/dark mobile, no document horizontal overflow.
- A separate authenticated owner receives 404 on GET and PATCH, and never sees original title or private reflection.

The authoring schedule field is integrated by the transaction/editor worker. Its shared timezone helper also preserves existing fractional-second instants during unrelated edits; ticket 17 has separate runnable browser evidence for that behavior.

## Bounded visual review

One detector pass returned `[]`. First batch inspected all four images:

- `evidence/review/form-1440.png`
- `evidence/review/completed-1440.png`
- `evidence/review/form-390.png`
- `evidence/review/completed-390.png`

The error and completion states are readable at both sizes; outcome selection, associated text inputs, schedule timezone and reading hierarchy are clear. No material visual fix was identified, so no additional polish round was run. Root independent review and aggregate gates remain required before ticket closure.

The route is `/diaries/:id/review`. Review queue/reminders belong to their later slices; no placeholder queue data is shown. The response renders real associated transactions and trade plans when supplied by their owning features.

## Independent root acceptance

Root inspected all four desktop/mobile captures, the Review response/write rules and runnable browser assertions. Disposition: ship. Original reasoning and later private reflection are visually distinct, errors retain inputs, and account timezone is explicit. Browser 2/2 passed; real HTTP/PostgreSQL Review 5/5 includes concurrent schedule/append versus completion. Root integrated gate: 32 files / 221 tests, production build, typecheck, lint and generated-contract check all passed.
