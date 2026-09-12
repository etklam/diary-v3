import { defineConfig } from '@playwright/test';
import { e2eBaseURL, e2eWebPort } from './tests/support/e2e-origin';

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: '**/release-artifacts.spec.ts',
  grep: /@webkit-critical/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { browserName: 'webkit', serviceWorkers: 'block', baseURL: e2eBaseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: [
    { command: 'node --import tsx scripts/e2e-server.ts', port: 3201, reuseExistingServer: false, timeout: 30_000 },
    { command: `npm run dev --workspace=@diary/web -- --port ${e2eWebPort}`, port: e2eWebPort, env: { API_ORIGIN: 'http://127.0.0.1:3201' }, reuseExistingServer: false, timeout: 60_000 },
  ],
});
