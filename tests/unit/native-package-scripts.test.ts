import { appendFile, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const temporaryRoots: string[] = [];

function command(file: string, args: string[], cwd: string, cache: string) {
  return execFileSync(file, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NPM_CONFIG_CACHE: cache },
  });
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'diary-native-package-script-test-'));
  temporaryRoots.push(root);
  await mkdir(join(root, 'scripts'), { recursive: true });
  await mkdir(join(root, 'openapi'), { recursive: true });
  await cp(join(repositoryRoot, 'scripts/pack-native-packages.mjs'), join(root, 'scripts/pack-native-packages.mjs'));
  await cp(join(repositoryRoot, 'package.json'), join(root, 'package.json'));
  await cp(join(repositoryRoot, 'openapi/openapi.json'), join(root, 'openapi/openapi.json'));
  await cp(join(repositoryRoot, 'packages'), join(root, 'packages'), { recursive: true });
  await symlink(join(repositoryRoot, 'node_modules'), join(root, 'node_modules'), 'dir');
  command('git', ['init', '-q'], root, join(root, 'npm-cache'));
  command('git', ['add', '.'], root, join(root, 'npm-cache'));
  execFileSync('git', ['-c', 'user.name=Package Test', '-c', 'user.email=package-test@example.invalid', 'commit', '-qm', 'fixture'], {
    cwd: root,
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: '2026-09-13T00:00:00Z',
      GIT_COMMITTER_DATE: '2026-09-13T00:00:00Z',
    },
  });
  return root;
}

async function manifest(path: string) {
  return JSON.parse(await readFile(join(path, 'manifest.json'), 'utf8')) as {
    packages: Array<{ name: string; version: string; tarball: string; sha256: string; provenance: { source: { commit: string } } }>;
  };
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

describe('native package scripts', () => {
  it('changes dependent versions when only the contracts dependency changes', async () => {
    const root = await fixture();
    const first = join(root, 'first');
    const second = join(root, 'second');
    command(process.execPath, ['scripts/pack-native-packages.mjs', '--out-dir', first], root, join(root, 'npm-cache'));
    await appendFile(join(root, 'packages/contracts/src/common.ts'), '\n// dependency drift fixture\n');
    command(process.execPath, ['scripts/pack-native-packages.mjs', '--out-dir', second], root, join(root, 'npm-cache'));

    const before = await manifest(first);
    const after = await manifest(second);
    for (const name of ['@diary/contracts', '@diary/api-client', '@diary/domain']) {
      expect(after.packages.find(item => item.name === name)?.version)
        .not.toBe(before.packages.find(item => item.name === name)?.version);
    }
  }, 20_000);

  it('rejects tampered tarballs and manifest provenance before installation', async () => {
    const root = await fixture();
    const pristine = join(root, 'pristine');
    command(process.execPath, ['scripts/pack-native-packages.mjs', '--out-dir', pristine], root, join(root, 'npm-cache'));

    const tamperedTarball = join(root, 'tampered-tarball');
    await cp(pristine, tamperedTarball, { recursive: true });
    const tarballManifest = await manifest(tamperedTarball);
    await appendFile(join(tamperedTarball, tarballManifest.packages[0]!.tarball), 'tampered');
    expect(() => command(process.execPath, [join(repositoryRoot, 'scripts/verify-native-packages.mjs'), '--packages-dir', tamperedTarball], root, join(root, 'npm-cache')))
      .toThrow(/SHA-256 mismatch/);

    const tamperedProvenance = join(root, 'tampered-provenance');
    await cp(pristine, tamperedProvenance, { recursive: true });
    const provenanceManifest = await manifest(tamperedProvenance);
    provenanceManifest.packages[0]!.provenance.source.commit = '0'.repeat(40);
    await writeFile(join(tamperedProvenance, 'manifest.json'), `${JSON.stringify(provenanceManifest, null, 2)}\n`);
    expect(() => command(process.execPath, [join(repositoryRoot, 'scripts/verify-native-packages.mjs'), '--packages-dir', tamperedProvenance], root, join(root, 'npm-cache')))
      .toThrow(/provenance fields/);
  }, 20_000);
});
