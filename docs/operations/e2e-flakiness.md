# End-to-end flakiness: measurement and quarantine rule

[Ticket 117](../../.scratch/diary-v3-rebuild/issues/117-remaining-e2e-failures.md)
established the principle: *a suite that answers differently each time cannot answer the
question it is run to answer.* It fixed the drift it could name. This file owns the process
that keeps producing drift, so that a rerun-to-green stops being indistinguishable from a
fix.

## What is measured

`tests/support/flake-reporter.ts` runs as a Playwright reporter in the Chromium
(`playwright.config.ts`) and WebKit critical (`playwright.webkit-critical.config.ts`)
suites. Every run prints a flake count — **including zero**, so "not measured" and "none"
never look alike — and writes `playwright-report/flaky-<suite>.json`:

```json
{
  "recordedAt": "…", "status": "passed",
  "passed": 337, "failed": 0, "flaky": 1,
  "cases": [{
    "spec": "tests/e2e/partner-timeline-parity.spec.ts",
    "title": "… › …", "project": "chromium",
    "attempts": 2, "failedAttemptMs": [90000], "passedAttemptMs": 4200,
    "failureSummaries": ["timedOut after 90000ms"]
  }]
}
```

The artifact name carries the suite because both suites run sequentially in one CI job;
without it the WebKit run would overwrite the Chromium record.

## Retry policy

| Suite | Retries | Why |
| --- | --- | --- |
| Chromium regression | 1 in CI, 0 locally | A known timing race should not fail a nightly run on its own, and the reporter makes the retry visible. Locally a developer should see the failure they just caused. |
| WebKit critical | 1 in CI, 0 locally | Same policy. |
| Release smoke / release artifacts | **0 always** | This gate decides whether a built image ships. A retried pass there would hide a real release defect, not a timing race. |

A retried pass is reported as `flaky`, never as `passed`. That is the whole point of turning
retries on: without the reporter, retries would convert the two cases below into clean
green.

## Quarantine rule

1. A case that flakes **more than once in ten consecutive runs** of its suite is
   quarantined.
2. Quarantining means: tag the case `@flaky`, add a row to the register below with the
   evidence and a ticket, and exclude it from the blocking set with
   `--grep-invert @flaky`. It keeps running — unblocking is not the same as not looking.
3. A quarantined case may **not** be deleted, `test.skip`ped or `test.fixme`d. Those remove
   the evidence; the register is the only sanctioned way to stop a case from blocking.
4. Leaving quarantine requires a named deterministic seam — a held request, an injected
   clock, an awaited state — not a longer timeout. Ticket 117 already set that preference;
   this rule is what enforces it.
5. The register is reviewed whenever a row's ticket closes. A row with no ticket is a
   defect in this process, not an accepted flake.

## Quarantine register

Two cases are carried from the record rather than from a run of this reporter. Both
predate it, so neither has a flake count yet; both are listed with the evidence that
exists.

| Case | Evidence | State | Ticket |
| --- | --- | --- | --- |
| PWA service-worker controller | `docs/audits/project-cleanup-2026-09-27.md:43` — full Chromium 256 passed / 8 failed in 20.7 min; this failure "did not reproduce in three separate browser probes" | **Carried, not reproduced.** Not tagged `@flaky`: a case that three probes could not reproduce may already be fixed, and quarantining it would remove a passing check from the blocking set on historical evidence. | [126](../../.scratch/diary-v3-rebuild/issues/126-own-the-e2e-flakiness.md) |
| `partner-timeline-parity.spec.ts:146` | Ticket 117 execution record — 337/1, a 90-second timeout on a loaded machine, 7/7 on rerun | **Carried.** A machine-load-sensitive timeout, which is exactly the shape rule 4 calls for a deterministic seam rather than a longer timeout. | [126](../../.scratch/diary-v3-rebuild/issues/126-own-the-e2e-flakiness.md) |

**Both rows are honest about what was not done.** Reproducing either requires PostgreSQL
and two full 20–36 minute browser runs. Neither was available when this file was written,
so neither case has been characterised against current source, and the register records
them as carried rather than as confirmed-flaky. The first run of the reporter in CI is what
turns these from record-keeping into measurement — treat a historical failure as active
only after reproducing it.

## Related

- [117 — Clear the remaining end-to-end failures](../../.scratch/diary-v3-rebuild/issues/117-remaining-e2e-failures.md) — the principle and the last round of fixes.
- [CI/CD notes](ci-cd-notes.md) — why the browser suites are nightly and not a merge gate.
  An unowned flake blocking every merge is a work stoppage, which is the other half of the
  reason this file exists.
