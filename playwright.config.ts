import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  // The built-artifact acceptance suite targets production bundles and the
  // release harness; Forgejo runs it through `test:e2e:release`.
  testIgnore: '**/release-artifacts.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { ...(process.env.PLAYWRIGHT_CHANNEL === 'chrome' ? { channel: 'chrome' } : {}), baseURL: 'http://127.0.0.1:3200', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: [
    { command: 'node --import tsx scripts/e2e-server.ts', port: 3201, reuseExistingServer: false, timeout: 30_000 },
    { command: 'npm run dev --workspace=@diary/web -- --port 3200', port: 3200, env: { API_ORIGIN: 'http://127.0.0.1:3201' }, reuseExistingServer: false, timeout: 60_000 },
  ],
});
