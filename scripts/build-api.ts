import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
// Bundle our workspaces so the production server does not resolve TypeScript source files.
const buildOptions = {
  bundle: true,
  platform: 'node' as const,
  target: 'node24',
  format: 'esm' as const,
  external: Object.keys(manifest.dependencies),
  sourcemap: true,
};
await build({
  entryPoints: {
    server: 'apps/api/src/server.ts',
    'ai-worker': 'apps/api/src/ai-report-worker-cli.ts',
    'research-worker': 'apps/api/src/research-worker-cli.ts',
    'research-retention': 'scripts/research-retention.ts',
    rotation: 'apps/api/src/rotation-cli.ts',
    'market-state': 'apps/api/src/market-state-cli.ts',
    migrate: 'packages/db/src/migrate.ts',
    'seed-system': 'scripts/seed-system.ts',
  },
  outdir: 'dist/api',
  ...buildOptions,
});
