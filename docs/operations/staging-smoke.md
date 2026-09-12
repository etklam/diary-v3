# Staging application smoke checklist

Run this checklist after the staging workflow deploys the immutable Web and API
image digests from the successful production build workflow. It validates
those production-built artifacts on staging; it is not authorization to test
or change production. Use only
disposable staging accounts and synthetic records. Never copy production data,
real diary text, portfolio details, credentials, or tokens into staging.

## Before testing

Prepare separate synthetic staging identities for an ordinary user, a linked
partner, and an administrator. The ordinary user needs one synthetic holding
and a full diary due for review. Use a fresh browser profile for the signed-out
public checks. Give every created record a short run marker, such as
`RC2-2026-09-13-A`, so it can be found and cleaned up afterward.

First run the HTTP and Socket.IO probe against the bare HTTPS staging origin:

```sh
bash scripts/staging-smoke.sh https://<staging-hostname>
```

The probe must report `staging_http_smoke=pass`. It checks health, readiness,
the public homepage and article list, anonymous Position Sizing, and the
Socket.IO polling handshake. Record row 0 as `FAIL` and stop if it fails.

## Execution checklist

Mark each row `PASS`, `FAIL`, or `BLOCKED`. A row passes only when every
expected result below is observed. Mark it `FAIL` for an error, wrong route,
missing or duplicated saved data, or lost session. Use `BLOCKED` only when a
required staging fixture or dependency is unavailable; a blocked row is not a
pass. The smoke run passes only when the probe and every row pass.

| # | Action | Pass when | Result | Sanitized evidence / request ID |
| --- | --- | --- | --- | --- |
| 0. HTTP and Socket.IO probe | Run the command above against the staging origin. | Output includes `staging_http_smoke=pass`. |  |  |
| 1. Public access | In a signed-out browser, open `/` and `/tools/position-sizing`. Enter synthetic calculation inputs and run the tool. | Homepage and tool load without login; the calculation returns a result; no private account content is shown. |  |  |
| 2. Login and Quick Diary | Sign in as the synthetic ordinary user, open `/timeline`, and refresh. Create a Quick Diary entry with the run marker, save, then refresh again. | Refresh preserves the signed-in session. The saved marker appears once in the diary and remains after refresh. |  |  |
| 3. Full Diary recovery and save | Create a Full Diary with a unique title and synthetic text; set its review due time to now or earlier, then save. Edit it, add a recovery marker, leave the edit unsaved, and reload. Restore the offered recovery and save. Reload once more. | Reload offers the unsaved edit; restore brings back the recovery marker; save persists the canonical edit. After the final reload the title and marker remain, with no stale recovery prompt. |  |  |
| 4. Timeline | Open `/timeline`, locate the Quick and Full Diary records by date, and open the Full Diary from its timeline entry. | Both saved records appear on their dates; opening the Full Diary shows the saved title and recovery marker. |  |  |
| 5. Review | Open `/reviews`, select the due synthetic Full Diary, enter a synthetic outcome/reflection, and complete the review. Refresh the queue and reopen the completed review. | The item leaves the due queue and appears as completed; its outcome/reflection persists; the original diary remains readable. |  |  |
| 6. Holding and company context | Open `/stocks`, select the prepared synthetic holding, follow its symbol/company link, then return to the holding. | The company page opens for the selected symbol, and returning restores the same holding context. A missing synthetic holding is `BLOCKED`, not `PASS`. |  |  |
| 7. Partner comparison | Open Partner Timeline/comparison with the linked synthetic partner. Select a date, compare, then use browser Back and Forward. | The comparison loads for the selected partner and date; Back and Forward return to the same usable comparison context. Only the linked synthetic partner's intended comparison data is visible. |  |  |
| 8. Article lifecycle | In the admin session, create an article with a run-marker title and synthetic body and save as draft. In the signed-out browser, verify it is not public. Publish it; open its public list/detail page. Update the article as admin and reload the signed-out detail page. Archive it after checking the update. | Draft is absent from public list/detail. Published title and body are readable signed out. After the update, the signed-out page shows the new body. After archive, the article is absent from the public list and its public detail route is unavailable. |  |  |
| 9. Logout | Return to the ordinary user's browser, sign out, then open and refresh `/timeline`. | The session ends; the private route requires sign-in and no private diary content is rendered. |  |  |

Use the staging-only administrator only for row 8. Sign out of that session
after archiving the synthetic article. Remove other run-marker records through
the normal staging UI when practical; do not manually alter production data.

## Run record

Record the date/time, staging origin, source SHA, deployed API and Web image
digests, browser/device, and one result plus a short sanitized observation for
the probe and each row. Record request IDs when available. Do not record
passwords, tokens, private diary text, real-user data, or sensitive account
details. A successful HTTP probe by itself does not pass the application
checklist.
