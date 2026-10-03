import { defineConfig } from '@playwright/test';
import { e2eBaseURL, e2eWebPort } from './tests/support/e2e-origin';

// The disposable API harness provisions a schema per run, which a tunneled
// remote Postgres stretches well past the local boot budget. Opt in with
// REMOTE_TEST_DB=1, matching vitest.config.ts; local runs keep fast-fail boots.
const remoteDb = process.env.REMOTE_TEST_DB === '1';

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
    { command: 'node --import tsx scripts/e2e-server.ts', port: 3201, reuseExistingServer: false, timeout: remoteDb ? 300_000 : 30_000 },
    { command: `npm run dev --workspace=@diary/web -- --port ${e2eWebPort}`, port: e2eWebPort, env: { API_ORIGIN: 'http://127.0.0.1:3201', ACCOUNT_RECOVERY_SUPPORT_URL: 'https://support.example.test/account-recovery' }, reuseExistingServer: false, timeout: 60_000 },
  ],
});
