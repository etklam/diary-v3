# Account email operations

## Operating model

SMTP starts disabled. The application continues to allow direct registration
and signed-in password changes without mail credentials. Password recovery is
unavailable until an Admin enables SMTP. Enabling switches new registrations to
email verification; existing accounts remain usable without retroactive email
verification.

When password recovery is unavailable, the sign-in and recovery pages keep a
recovery entry point and explain the disabled state. To provide direct help,
set the optional public Web variable `ACCOUNT_RECOVERY_SUPPORT_URL` to an HTTPS
support page or a `mailto:` address. If it is unset or invalid, users are told
to contact the site administrator. Do not put credentials in this URL.

The API creates encrypted, durable outbox jobs. A single database dispatch
fence bounds sending globally and serializes configuration changes with an
in-flight send. The mail worker runs continuously but idles while SMTP is off.
SMTP acceptance is not proof of inbox placement. Delivery is at-least-once: a
process or connection failure after provider acceptance can produce a duplicate
message. Retries use the same stable `Message-ID`; verification and reset links
remain single-use.

## Encryption keys

Create a mail-specific random 32-byte key for each environment. For example,
generate key material with Node.js `crypto.randomBytes(32).toString('base64')`
and store it only in the environment's secret manager. Configure
`SMTP_ENCRYPTION_KEYS` as a JSON object of version-to-base64-key values, such as
`{"mail-2026-09":"<base64-key>"}`, and set
`SMTP_ENCRYPTION_ACTIVE_KEY=mail-2026-09`. Never put a real key in this file,
source control, a ticket, or application logs. Use separate mail keys rather
than reusing `AI_ENCRYPTION_KEYS`.

Set the identical keyring and active version on the API and mail worker before
enabling SMTP. The Admin enable action verifies that an active key can encrypt
outbox payloads. Mail-disabled startup does not require these variables. In
Compose, values are passed from the local environment to both workloads. In
Kubernetes, the optional `SMTP_ENCRYPTION_KEYS` and
`SMTP_ENCRYPTION_ACTIVE_KEY` keys belong in the `diary-v3-app` Secret.

For rotation, add a new version while retaining the previous key, change the
active version on the API and worker together, then roll both workloads. New
ciphertext uses the new version and old outbox payloads use their recorded
version. Keep old versions available for the full outbox and backup retention
period. Do not remove a version until restored backups and retained encrypted
payloads no longer need it. Back up the keyring through the same protected
recovery process as other application secrets. Restoring the database without
the matching keyring makes encrypted SMTP credentials and pending mail
unavailable; it must not cause secret data to be replaced with plaintext.

## Configure and enable

1. Set `WEB_ORIGIN` to the trusted public HTTPS origin. Message links are built
   from this setting, never from a request host.
2. Provision the SMTP keyring on the API and worker. Verify both use the same
   active version.
3. Sign in as an Admin and open `/admin/email-settings`.
4. Enter the relay hostname, port, TLS mode, sender name/address, optional
   Reply-To, and optional authentication. Use implicit TLS or required STARTTLS
   with certificate validation. Authentication is never allowed over
   plaintext. A trusted relay may use no authentication.
5. Save the disabled draft, send the fixed test message to a controlled test
   mailbox, confirm the test uses the current revision, and enable mail.

Every settings edit creates a new revision, deactivates SMTP, and cancels
queued/running account messages while preserving Admin test history. Test the
new revision and enable it again. Users with a canceled queued message should
request a fresh link. Disabling also waits for any already-started SMTP send to
finish and cancels the remaining queue before returning. A message already
accepted by the SMTP provider cannot be recalled. Links delivered before
disable remain valid until their normal expiry.

The public request forms intentionally use generic responses for both existing
and unknown addresses. Registration links expire after 24 hours; reset links
expire after 30 minutes. Resend requests have a 60-second cooldown. Successful
password reset revokes all Web and Native sessions and requires a fresh login.

## Sender and connection setup

Use a sender address in a domain controlled by the installation. Configure that
domain's SPF and DKIM records with the mail provider; publish a DMARC policy
appropriate to the domain. Keep the sender domain aligned with the provider's
authenticated sending domain where possible. Reply-To may point to a monitored
support address.

Use the provider's documented secure port (commonly 465 for implicit TLS or 587
for STARTTLS). This deployment's mail-worker NetworkPolicy permits TCP 465, 587,
and 2525 to public addresses. If a provider requires another public port, update
the egress policy and deployment firewall deliberately before using it. Port
25 is not allowed by the default worker policy.

The application resolves and pins SMTP to public IPv4 addresses by default and
rejects private/reserved destinations to limit server-side request forgery. A
deliberate private relay requires the exact canonical `host:port` in
`SMTP_ALLOWED_HOSTS`, plus a matching explicit NetworkPolicy/firewall rule for
its address and port. `SMTP_ALLOWED_HOSTS` does not by itself open network
egress. The API and the mail worker both need DNS and SMTP access because the
Admin test sends through the API while account messages send through the
worker. Do not allow arbitrary host input through the public account endpoints.

When a test fails, use the sanitized error code and check, in order:

- hostname spelling, DNS resolution and egress from both API and worker;
- provider port and the selected TLS mode (465 is implicit TLS; 587 is normally
  STARTTLS);
- certificate chain, relay allowlisting and network-policy rules;
- sender-domain/provider authorization and optional SMTP username/password;
- that API and worker have the same active encryption key version.

Never disable certificate validation or retry with a plaintext downgrade.
SMTP authentication requires encrypted transport.

## Worker, queue, and retention

The production Kubernetes mail-worker Deployment is updated with the API image
after the migration and API rollout. It has no Service or public port, one
replica, PostgreSQL/DNS access, and narrowly scoped outbound SMTP ports. Verify
that the cluster CNI enforces NetworkPolicy and the kube-dns labels match the
manifest. The Compose production-shaped file also runs the worker. For a direct
Node process, use `npm run mail:worker:prod` with the built API package and the
same environment as the API.

The worker allows one active account-message dispatch globally. Transient SMTP
failures retry with bounded exponential backoff, up to five attempts and never
after the token expires. Permanent failures are terminal. Leases recover after
process restart. The Admin history shows the newest 20 sanitized deliveries;
worker logs include only safe job IDs, message kinds, revision numbers and
failure codes. No secret, token, message body or full recipient is logged.

Cleanup removes expired lifecycle tokens within the worker's next cleanup pass
(normally within the one-second poll interval), expired rate-limit rows, and
terminal mail/audit records older than 30 days. The worker must remain running
for cleanup even while SMTP is disabled. Inspect queue counts without selecting
recipient or payload columns:

```sql
SELECT status, count(*) AS job_count, min(created_at) AS oldest_job
FROM mail_outbox
WHERE kind <> 'admin_test'
GROUP BY status
ORDER BY status;

SELECT status, last_error_code, count(*) AS job_count
FROM mail_outbox
WHERE kind <> 'admin_test' AND status IN ('queued', 'running', 'failed')
GROUP BY status, last_error_code
ORDER BY status, last_error_code;
```

An Admin can disable SMTP to stop future account-mail dispatch. A transient
provider outage should be diagnosed from error codes and provider status; do not
manually recover by exposing a raw token or bypassing verification. If email is
unavailable and a user needs immediate access, use the existing authenticated
Admin account-management recovery process, or arrange a verified out-of-band
mailbox recovery under the operator's established identity process. There is
no unauthenticated bypass or public Admin password-reset route.

## Local and release checks

The local integration suite uses disposable PostgreSQL and an injected fake
SMTP transport. It does not connect to a real SMTP service or use production
account data. Verify migration, Admin settings, registration/reset lifecycle,
worker retry/lease recovery, contracts, and browser behavior before release.
Do not use a real recipient for routine release tests. A real SMTP test is an
explicit operator action from the Admin Panel, outside CI.
