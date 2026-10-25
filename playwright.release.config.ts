import { defineConfig } from '@playwright/test'
import { e2eBaseURL } from './tests/support/e2e-origin'

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['release-smoke.spec.ts', 'release-artifacts.spec.ts'],
  workers: 1,
  // Deliberately no retries, unlike the regression suites: this gate decides
  // whether a built image ships, and a retried pass there would hide a real
  // release defect rather than a timing race.
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    ...(process.env.PLAYWRIGHT_CHANNEL === 'chrome' ? { channel: 'chrome' } : {}),
    baseURL: e2eBaseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node --import tsx scripts/release-e2e-server.ts',
    url: `${e2eBaseURL}/healthz`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
