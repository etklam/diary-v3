import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter'

/**
 * Publishes a flake count per run.
 *
 * Ticket 117 established that "a suite that answers differently each time
 * cannot answer the question it is run to answer", and the record contains two
 * cases that were never fixed or explained — a PWA controller failure that did
 * not reproduce in three probes, and a 90-second `partner-timeline-parity`
 * timeout that passed 7/7 on rerun. With retries on and no reporting, both of
 * those would have come back as a clean green, which is the state this reporter
 * exists to prevent: a retried pass is reported as *flaky*, never as passed.
 */

/**
 * Suites run sequentially in one CI job, so the artifact name is per-suite:
 * without it the WebKit run would overwrite the Chromium run's flake record.
 */
export function flakeArtifactPath(suite = process.env.FLAKE_REPORT_SUITE ?? 'e2e'): string {
  return `playwright-report/flaky-${suite.replace(/[^a-z0-9-]/gi, '-')}.json`
}

interface FlakeRecord {
  spec: string
  title: string
  project: string
  attempts: number
  failedAttemptMs: number[]
  passedAttemptMs: number
  failureSummaries: string[]
}

/** One line of a failure, enough to tell a timeout from an assertion. */
function summarize(result: TestResult): string {
  if (result.status === 'timedOut') return `timedOut after ${result.duration}ms`
  const message = result.error?.message ?? result.errors[0]?.message ?? result.status
  return message.split('\n')[0]!.slice(0, 200)
}

export default class FlakeReporter implements Reporter {
  private readonly flaky: FlakeRecord[] = []
  private failed = 0
  private passed = 0

  onTestEnd(test: TestCase, result: TestResult) {
    // Playwright's own outcome already distinguishes a retried pass; this
    // reporter's job is to make it survive into an artifact and the log.
    const outcome = test.outcome()
    if (result.retry < test.results.length - 1) return // not the final attempt yet
    if (outcome === 'flaky') {
      const attempts = test.results
      this.flaky.push({
        spec: test.location.file.replace(`${process.cwd()}/`, ''),
        title: test.titlePath().filter(Boolean).join(' › '),
        project: test.parent.project()?.name ?? 'default',
        attempts: attempts.length,
        failedAttemptMs: attempts.filter(attempt => attempt.status !== 'passed').map(attempt => attempt.duration),
        passedAttemptMs: attempts.find(attempt => attempt.status === 'passed')?.duration ?? 0,
        failureSummaries: attempts.filter(attempt => attempt.status !== 'passed').map(summarize),
      })
    } else if (outcome === 'unexpected') this.failed += 1
    else if (outcome === 'expected') this.passed += 1
  }

  onEnd(result: FullResult) {
    const payload = {
      recordedAt: new Date().toISOString(),
      status: result.status,
      passed: this.passed,
      failed: this.failed,
      flaky: this.flaky.length,
      cases: this.flaky,
    }
    const artifact = flakeArtifactPath()
    mkdirSync(dirname(artifact), { recursive: true })
    writeFileSync(artifact, `${JSON.stringify(payload, null, 2)}\n`)

    // Printed unconditionally, including zero: "no flake count" and "a flake
    // count of zero" must not look the same in a run log.
    console.log(`\nflaky cases: ${this.flaky.length} (passed ${this.passed}, failed ${this.failed}) -> ${artifact}`)
    for (const record of this.flaky) {
      console.log(
        `  FLAKY ${record.spec} › ${record.title} [${record.project}] after ${record.attempts} attempts: ${record.failureSummaries.join('; ')}`,
      )
    }
    if (this.flaky.length > 0) {
      console.log('  A retried pass is not a fix. See docs/operations/e2e-flakiness.md for the quarantine rule.')
    }
  }
}
