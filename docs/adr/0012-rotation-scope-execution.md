# Rotation scope execution

Status: accepted for ticket 76 on 2026-09-19

Rotation batch scopes expand in the canonical order `sectors`, `indexes`, `core`. A single-scope run executes only that scope. An all-scope run executes sequentially and stops at the first failure; completed scopes retain their persisted snapshots and results. Scope locks, provider ordering, idempotent reruns, and per-scope job records remain owned by the batch runner.

The CLI and administrator HTTP entrypoint share this ordered executor but keep their boundary contracts separate. The CLI returns job metadata, successful partial results, a sanitized failure envelope, and an error total equal to missing symbols (`symbolCount - upsertedCount`) plus one failed-run increment. HTTP returns its existing single/all response schemas, counts successful scope error arrays, maps busy locks to 409, and lets ordinary batch failures use the API error boundary. No all-scope transaction or parallel provider execution is introduced.

Regression command: `DATABASE_URL=postgresql://diary:diary_local@127.0.0.1:55433/diary_v3 npx vitest run tests/integration/rotation-execution-http.test.ts tests/integration/rotation-admin-http.test.ts tests/integration/rotation-batch.test.ts tests/unit/rotation-command.test.ts` verifies ordered success/failure behavior, persisted partial work, HTTP error compatibility, and CLI outcomes.
