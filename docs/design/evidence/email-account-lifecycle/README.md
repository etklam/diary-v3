# Account email acceptance evidence

These browser captures use synthetic accounts and intercepted API fixtures. They contain no real user data and do not send email.

| Capture | State |
| --- | --- |
| `admin-settings-en-light-desktop.png` | Admin settings, desktop, English, light theme, including masked delivery activity |
| `admin-settings-zh-TW-dark-mobile.png` | Admin settings, 390px mobile, Traditional Chinese, dark theme |
| `registration-request-zh-CN-light-mobile.png` | Generic registration request result and resend cooldown |
| `registration-complete-en-dark-desktop.png` | Successful verification completion |
| `recovery-unavailable-zh-TW-light-desktop.png` | Password recovery unavailable |
| `recovery-failed-zh-CN-dark-mobile.png` | A stale capability response is reconciled to the unavailable state after SMTP is disabled |
| `reset-expired-en-light-mobile.png` | Expired reset link with a request-new-email action and no unusable password form |
| `reset-complete-zh-TW-dark-desktop.png` | Successful password reset completion |
| `recovery-keyboard-focus-en-light-desktop.png` | Visible keyboard focus treatment on the recovery form |

The screenshot suite is `tests/e2e/email-account-lifecycle-acceptance.spec.ts`. It asserts translated headings, completion and error states, token removal from the URL, focus visibility, and mobile horizontal overflow before writing each capture.

The PostgreSQL integration suites exercise registration, verification, reset, session revocation, outbox handling, admin configuration, worker retries, and dispatch fencing against fresh disposable databases. They inject a controlled SMTP transport; no external SMTP service is contacted:

```sh
npx vitest run tests/integration/mail-schema.test.ts tests/integration/account-email-admin-http.test.ts tests/integration/account-email-lifecycle-http.test.ts tests/integration/account-email-worker.test.ts
```
