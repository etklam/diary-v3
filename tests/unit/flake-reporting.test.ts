import { readFileSync, rmSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import FlakeReporter, { flakeArtifactPath } from '../support/flake-reporter'

// The point of the reporter: with retries on and no reporting, a failed-then-
// passed case comes back as a clean green, which is how the two cases in the
// quarantine register became unexplained rather than fixed.

type Outcome = 'expected' | 'unexpected' | 'flaky' | 'skipped'

function testCase(
  file: string,
  title: string,
  outcome: Outcome,
  attempts: Array<{ status: string; duration: number; message?: string }>,
) {
  const results = attempts.map((attempt, index) => ({
    status: attempt.status,
    duration: attempt.duration,
    retry: index,
    errors: attempt.message === undefined ? [] : [{ message: attempt.message }],
    ...(attempt.message === undefined ? {} : { error: { message: attempt.message } }),
  }))
  return {
    location: { file: `${process.cwd()}/${file}` },
    titlePath: () => ['', 'chromium', title],
    outcome: () => outcome,
    results,
    parent: { project: () => ({ name: 'chromium' }) },
  }
}

function run(cases: ReturnType<typeof testCase>[], suite: string) {
  const reporter = new FlakeReporter()
  for (const test of cases) {
    for (const result of test.results) {
      // Playwright reports every attempt; only the last one is final.
      reporter.onTestEnd(test as never, result as never)
    }
  }
  reporter.onEnd({ status: 'passed' } as never)
  const artifact = flakeArtifactPath(suite)
  const payload = JSON.parse(readFileSync(artifact, 'utf8'))
  rmSync(artifact, { force: true })
  return payload
}

describe('end-to-end flake reporting', () => {
  it('reports a failed-then-passed case as flaky, never as a clean pass', () => {
    process.env.FLAKE_REPORT_SUITE = 'unit-flaky'
    const payload = run(
      [
        testCase('tests/e2e/partner-timeline-parity.spec.ts', 'keeps parity', 'flaky', [
          { status: 'timedOut', duration: 90_000 },
          { status: 'passed', duration: 4_200 },
        ]),
        testCase('tests/e2e/diary.spec.ts', 'writes a diary', 'expected', [{ status: 'passed', duration: 1_000 }]),
      ],
      'unit-flaky',
    )
    delete process.env.FLAKE_REPORT_SUITE

    expect(payload).toMatchObject({ passed: 1, failed: 0, flaky: 1 })
    expect(payload.cases).toHaveLength(1)
    expect(payload.cases[0]).toMatchObject({
      spec: 'tests/e2e/partner-timeline-parity.spec.ts',
      project: 'chromium',
      attempts: 2,
      failedAttemptMs: [90_000],
      passedAttemptMs: 4_200,
    })
    // A timeout must be distinguishable from an assertion failure in the record.
    expect(payload.cases[0].failureSummaries[0]).toBe('timedOut after 90000ms')
  })

  it('emits a zero count, so "not measured" and "none" cannot look alike', () => {
    process.env.FLAKE_REPORT_SUITE = 'unit-clean'
    const payload = run(
      [
        testCase('tests/e2e/diary.spec.ts', 'writes a diary', 'expected', [{ status: 'passed', duration: 1_000 }]),
        testCase('tests/e2e/login.spec.ts', 'rejects a bad password', 'unexpected', [
          { status: 'failed', duration: 900, message: 'expected 401' },
        ]),
      ],
      'unit-clean',
    )
    delete process.env.FLAKE_REPORT_SUITE

    expect(payload).toMatchObject({ flaky: 0, passed: 1, failed: 1 })
    expect(payload.cases).toEqual([])
  })

  it('names the artifact per suite, so one run cannot overwrite another', () => {
    expect(flakeArtifactPath('chromium')).toBe('playwright-report/flaky-chromium.json')
    expect(flakeArtifactPath('webkit-critical')).toBe('playwright-report/flaky-webkit-critical.json')
    expect(flakeArtifactPath('../escape')).not.toContain('..')
  })

  it('retries in CI only, and never on the release gate', () => {
    const chromium = readFileSync('playwright.config.ts', 'utf8')
    const webkit = readFileSync('playwright.webkit-critical.config.ts', 'utf8')
    const release = readFileSync('playwright.release.config.ts', 'utf8')
    for (const config of [chromium, webkit]) {
      expect(config).toContain('retries: process.env.CI ? 1 : 0')
      expect(config).toContain('./tests/support/flake-reporter.ts')
    }
    // The release gate decides whether an image ships; a retried pass there
    // would hide a release defect rather than a timing race.
    expect(release).toContain('retries: 0,')
    expect(release).not.toContain('flake-reporter')
  })

  it('keeps quarantined cases running while they stop gating', () => {
    const scripts = (JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> }).scripts
    expect(scripts['test:e2e:blocking']).toBe('playwright test --grep-invert @flaky')
    expect(scripts['test:e2e:quarantine']).toBe('playwright test --grep @flaky')

    const regression = parse(readFileSync('.forgejo/workflows/regression.yml', 'utf8')) as {
      jobs: { regression: { steps: Array<{ name?: string; 'continue-on-error'?: boolean; run?: string }> } }
    }
    const steps = regression.jobs.regression.steps
    const blocking = steps.find(step => step.name === 'Full Chromium regression')
    const quarantined = steps.find(step => step.name === 'Quarantined Chromium cases')
    expect(blocking?.run).toContain('test:e2e:blocking')
    expect(blocking?.['continue-on-error']).not.toBe(true)
    // Non-blocking is the whole definition of quarantine; still present, so the
    // case cannot be silently deleted instead.
    expect(quarantined?.['continue-on-error']).toBe(true)
    expect(quarantined?.run).toContain('test:e2e:quarantine')
  })

  it('documents the quarantine rule the reporter points at', () => {
    const rule = readFileSync('docs/operations/e2e-flakiness.md', 'utf8')
    expect(rule).toContain('more than once in ten consecutive runs')
    expect(rule).toMatch(/may \*\*not\*\* be deleted/)
    expect(rule).toContain('partner-timeline-parity.spec.ts:146')
    expect(rule).toContain('PWA service-worker controller')
  })
})
