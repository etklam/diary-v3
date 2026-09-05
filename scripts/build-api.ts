import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
// Bundle our workspaces so the production server does not resolve TypeScript source files.
await build({
  entryPoints: {
    server: 'apps/api/src/server.ts',
    rotation: 'apps/api/src/rotation-cli.ts',
    'market-state': 'apps/api/src/market-state-cli.ts',
    migrate: 'packages/db/src/migrate.ts',
    'seed-system': 'scripts/seed-system.ts',
  },
  outdir: 'dist/api',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  external: Object.keys(manifest.dependencies),
  sourcemap: true,
});
