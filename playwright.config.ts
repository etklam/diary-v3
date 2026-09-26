import { defineConfig } from '@playwright/test';
import { e2eBaseURL, e2eWebPort } from './tests/support/e2e-origin';

export default defineConfig({
  testDir: './tests/e2e',
  // The built-artifact acceptance suite targets production bundles and the
  // release harness; Forgejo runs it through `test:e2e:release`.
  testIgnore: '**/release-artifacts.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { ...(process.env.PLAYWRIGHT_CHANNEL === 'chrome' ? { channel: 'chrome' } : {}), baseURL: e2eBaseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: [
    { command: 'node --import tsx scripts/e2e-server.ts', port: 3201, reuseExistingServer: false, timeout: 30_000 },
    { command: `npm run dev --workspace=@diary/web -- --port ${e2eWebPort}`, port: e2eWebPort, env: { API_ORIGIN: 'http://127.0.0.1:3201', ACCOUNT_RECOVERY_SUPPORT_URL: 'https://support.example.test/account-recovery' }, reuseExistingServer: false, timeout: 60_000 },
  ],
});
