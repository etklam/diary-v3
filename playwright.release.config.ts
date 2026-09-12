import { defineConfig } from '@playwright/test';
import { e2eBaseURL } from './tests/support/e2e-origin';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'release-artifacts.spec.ts',
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    ...(process.env.PLAYWRIGHT_CHANNEL === 'chrome' ? { channel: 'chrome' } : {}),
    baseURL: e2eBaseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node --import tsx scripts/release-e2e-server.ts',
    url: `${e2eBaseURL}/healthz`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
