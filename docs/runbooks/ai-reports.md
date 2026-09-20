# AI reports operations

Status: implementation runbook; live smoke and deployment evidence pending.

## Release sequence

1. Back up PostgreSQL and verify restore access. Apply the append-only AI migration before deploying the matching API/Web/worker image.
2. Leave generation disabled and access denied by default. Configure secrets separately from the database and repository.
3. Set `AI_ENCRYPTION_KEYS` to a JSON object mapping key versions to base64-encoded 32-byte keys. Set `AI_ENCRYPTION_ACTIVE_KEY` to the current version. Use the same keyring in API and worker. Do not log these values.
4. Set `AI_ALLOWED_BASE_URLS` to exact comma-separated HTTPS base URLs controlled by the deployment operator. The default is `https://api.deepseek.com`. Host, port and base path are all part of the allowlist. Apply network egress restrictions too.
5. Start the worker using the built worker entry point. Verify its database heartbeat and queued/running age before admitting jobs. The worker must not expose a public HTTP port.
6. An authorized Admin saves the provider draft, reviews recipient disclosure/pricing, explicitly runs a synthetic capability test and publishes it. Verify the selected model actually supports the configured parameters. Publish reviewed weekly/monthly templates.
7. Verify provider/account retention, training and processing terms; finalize truthful disclosure. Grant only the intended beta users. Each user accepts the current recipient revision personally.

## Key rotation

Add a new 32-byte key under a new version while retaining previous versions. Change the active version in API and worker together. New writes use the new version; existing envelopes retain their version and remain decryptable using the old key. Before removing an old key, re-encrypt retained provider secrets and unexpired snapshots in a controlled maintenance transaction, verifying decryption before and after. Preserve old backup recovery keys through backup retention. Never replace ciphertext with plaintext when decryption fails.

Automated envelope tests cover different nonces, authentication, purpose mismatch, retained-key reads after active-version rotation and failure when a required key is removed. An actual deployment rotation/restore drill remains required.

## Failure and recovery

- Before dispatch: a stale lease can be recovered without generating a new report request.
- After dispatch: an expired/unknown outcome becomes `AI_PROVIDER_OUTCOME_UNKNOWN`; it must not be resubmitted automatically.
- Cancellation is best-effort after dispatch. Consumed quota/cost remains recorded and a late response cannot publish.
- Revoke, consent withdrawal, provider/prompt publication and source deletion fence unpublished results.
- Do not log raw provider errors, prompts, diaries, Authorization headers, reasoning or response bodies.
- Monitor heartbeat, queue age, running duration, error codes, dispatch counts, token usage, unknown usage and conservative cost reservations. Missing usage is unknown, not zero.

## Retention and restore

Encrypted input snapshots expire no later than seven days after terminal completion. Validated analysis, deterministic metrics and source metadata remain until owner deletion or source invalidation; the snapshot retention window does not remove successful reports. Report deletion immediately clears private derived content; minimal request tombstones may remain for 24 hours. Backup copies follow the deployment's separate retention policy.

Restore with AI generation disabled and the worker stopped. Apply current migrations, restore the correct keyring, and reapply the current deletion/revocation/consent policy before allowing reads or starting dispatch. Never assume a restored old consent or grant is current. Validate local synthetic jobs and heartbeat before selectively re-enabling generation.

## Rollback

Disable generation and stop the worker. Preserve the schema and existing reports; owner reading still requires a grant, while cancellation/deletion remains owner-only even after revoke. Roll back only to a version compatible with the new schema and deletion semantics. Do not delete migrations or refund consumed quota through record deletion.

## Live smoke evidence template

Record operator authorization, timestamp, synthetic fixture ID, deployed commit, model/config/prompt/price versions, request count, safe request ID, schema/reference validation, usage availability and human quality assessment. Never put an API key or payload in the evidence log. Local fixture tests are not live DeepSeek verification.
