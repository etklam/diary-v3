import { defineConfig } from 'vitest/config';

// Remote test stores (SSH-tunneled VPS Postgres/Redis) inflate every DB
// round-trip to ~100-150ms, so schema-per-suite provisioning exceeds local
// defaults. Opt in with REMOTE_TEST_DB=1; local runs keep fast-fail defaults.
const remoteDb = process.env.REMOTE_TEST_DB === '1';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'packages/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    testTimeout: remoteDb ? 240_000 : 20_000,
    hookTimeout: remoteDb ? 300_000 : 30_000,
    // Parallel workers saturate the SSH tunnel and starve per-suite
    // provisioning; two workers keep remote runs stable.
    maxWorkers: remoteDb ? 2 : undefined,
  },
});
