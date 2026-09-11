import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'release-artifacts.spec.ts',
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    ...(process.env.PLAYWRIGHT_CHANNEL === 'chrome' ? { channel: 'chrome' } : {}),
    baseURL: 'http://127.0.0.1:3200', trace: 'retain-on-failure', screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node --import tsx scripts/release-e2e-server.ts',
    url: 'http://127.0.0.1:3200/healthz',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
