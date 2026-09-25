# ADR 0017: Automatic translation admission after publication

## Status

Accepted

## Context

Automatic translation jobs are admitted after the source article has been
created, updated, or published. Translation settings and queue availability
are independent of the committed source publication. A failure while reading
settings or enqueueing a translation must not turn a successful article write
into an apparent publication failure.

The Edge provider also has a shared circuit-breaker state with a recorded
`edgeDisabledUntil` timestamp. Automatic admission must respect an open
circuit, while Admins retain the existing explicit manual action and its
provider-disabled response.

## Decision

- Commit the source article operation before attempting automatic translation
  admission.
- Never retry or roll back the source write because translation settings or
  queue admission failed.
- Return an additive `automaticTranslationAdmission` result to the Admin
  response when automatic admission was requested. It records whether jobs
  were queued, partially queued, or not queued, the safe reason, and an
  optional Edge circuit resume time.
- When the Edge circuit is open, automatic admission skips the job and returns
  the recorded resume time. It does not defer work for later.
- Keep manual admission subject to the provider's current availability checks.
  The explicit manual request returns the existing provider-disabled error
  while the circuit remains open.
- Log admission and per-locale enqueue failures with request ID, post ID,
  provider, stage, and safe error diagnostics. Never include article content,
  credentials, SQL parameters, or raw error messages.
- Bulk publication includes translation warning fields only when one or more
  automatic admissions require attention, preserving the established response
  shape for ordinary bulk publishes.

## Consequences

An Admin can distinguish source publication success from translation queue
status and can continue with the existing manual translation controls. A
settings outage or provider circuit does not delay publication. Translation
work is not silently retried or queued for a later circuit reset.

## Verification

PostgreSQL integration tests cover an AI settings lookup failure after the
article commit, Edge circuit-open automatic admission, manual rejection while
the circuit is open, and per-locale enqueue failure. The tests assert that the
source article remains published, no unexpected job is created, and logs do
not contain article text.
