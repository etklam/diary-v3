# Staging smoke acceptance

Use this checklist after the manual staging workflow deploys an immutable API
and Web image pair. Use synthetic staging accounts and records only. Do not
run these steps against production.

First run the HTTP and Socket.IO probe against the staging origin:

```sh
bash scripts/staging-smoke.sh https://<staging-hostname>
```

The script requires a bare HTTPS origin, rejects the production hostname, and
checks health, readiness, the public homepage, `/articles`, anonymous Position
Sizing, and the Socket.IO polling handshake.

Then use a staging-only administrator and an ordinary staging-only account to
exercise the application:

1. Open the homepage while signed out. Open `/tools/position-sizing` and
   complete a calculation without signing in.
2. Sign in as the ordinary account, refresh `/diaries`, and confirm the
   session remains active.
3. Open Quick Diary, enter synthetic content, save, refresh, and confirm the
   saved result is still present.
4. Create a full Diary with synthetic content. Edit it, leave unsaved changes,
   reload, restore the offered draft, save, and confirm the canonical saved
   state after another reload.
5. Navigate from Diary to Timeline and Calendar. Open a diary from its date,
   use the partner comparison path with a staging partner if available, then
   use browser Back and Forward to confirm the context remains usable.
6. Open Review, complete a synthetic review item, and confirm it leaves the
   due queue and appears in the completed area.
7. Open Holdings, navigate to a company context, and return to the holding.
   Open Partner Timeline/comparison and confirm the selected date and partner
   context are retained.
8. Sign in as the staging administrator. Create an article, save it as a
   draft, publish it, and open it in a signed-out browser context. Edit the
   published article and confirm the public copy updates. Archive it and
   confirm it no longer appears in the public list or public detail route.
9. Sign out. Refresh a private route and confirm the old account cannot be
   recovered without signing in again.

Record the source SHA, API and Web image digests, staging origin, date, pass or
fail for each numbered step, and any request IDs. Do not record credentials,
tokens, private diary content, or real-user data. A successful HTTP probe alone
does not constitute completion of the application-flow checklist.
