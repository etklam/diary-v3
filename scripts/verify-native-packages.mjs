#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import process from 'node:process';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  if (!process.argv[index + 1]) throw new Error(`${name} requires a path`);
  return resolve(process.argv[index + 1]);
}

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

function command(file, args, options = {}) {
  return execFileSync(file, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  }).trim();
}

const testRoot = await mkdtemp(join(tmpdir(), 'diary-native-package-test-'));
try {
  const suppliedOutputRoot = argument('--packages-dir');
  const outputRoot = suppliedOutputRoot ?? join(testRoot, 'packages');
  if (!suppliedOutputRoot) command(process.execPath, ['scripts/pack-native-packages.mjs', '--out-dir', outputRoot]);
  const manifest = JSON.parse(await readFile(join(outputRoot, 'manifest.json'), 'utf8'));
  for (const item of manifest.packages) {
    if (item.provenance?.package !== item.name || item.provenance?.version !== item.version
      || item.provenance?.source?.commit !== manifest.sourceCommit
      || item.provenance?.source?.dirty !== manifest.sourceDirty
      || item.provenance?.openApi?.sha256 !== manifest.openApiSha256
      || !isDeepStrictEqual(item.provenance?.license, manifest.license)) {
      throw new Error(`${item.name} artifact manifest provenance fields do not match the package set`);
    }
    const tarball = resolve(outputRoot, item.tarball);
    if (tarball !== join(outputRoot, item.tarball)) throw new Error(`${item.name} tarball escapes the package directory`);
    const actualSha256 = await sha256(tarball);
    if (actualSha256 !== item.sha256) throw new Error(`${item.name} tarball SHA-256 mismatch`);
  }
  const dependencies = Object.fromEntries(manifest.packages.map(item => [
    item.name,
    `file:${join(outputRoot, item.tarball)}`,
  ]));
  await writeFile(join(testRoot, 'package.json'), `${JSON.stringify({
    name: 'diary-native-package-consumer',
    version: '0.0.0',
    private: true,
    type: 'module',
    dependencies,
  }, null, 2)}\n`);
  command('npm', [
    'install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=true',
  ], { cwd: testRoot });
  const lock = JSON.parse(await readFile(join(testRoot, 'package-lock.json'), 'utf8'));

  const specifiers = manifest.packages.flatMap(item => item.exports.map(name => ({
    packageName: item.name,
    specifier: name === '.' ? item.name : `${item.name}/${name.slice(2)}`,
  })));
  const runtimeSource = [
    ...specifiers.map(({ specifier }, index) => `const export${index} = await import(${JSON.stringify(specifier)});`),
    `if (!export0.calendarDateSchema.safeParse('2026-09-13').success) throw new Error('contracts runtime smoke failed');`,
    `if (typeof export${specifiers.findIndex(item => item.packageName === '@diary/api-client')}.createNativeSession !== 'function') throw new Error('api-client runtime smoke failed');`,
    `if (export${specifiers.findIndex(item => item.packageName === '@diary/domain')}.currentUtcDate(new Date('2026-09-13T00:00:00Z')) !== '2026-09-13') throw new Error('domain runtime smoke failed');`,
  ].join('\n');
  await writeFile(join(testRoot, 'runtime.mjs'), `${runtimeSource}\n`);
  command(process.execPath, ['runtime.mjs'], { cwd: testRoot });

  const typeSource = specifiers.map(({ specifier }, index) =>
    `import * as export${index} from ${JSON.stringify(specifier)};\nvoid export${index};`
  ).join('\n');
  await writeFile(join(testRoot, 'consumer.ts'), `${typeSource}\n`);
  await writeFile(join(testRoot, 'tsconfig.json'), `${JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      lib: ['ES2022', 'DOM', 'DOM.Iterable'],
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      strict: true,
      noEmit: true,
      skipLibCheck: false,
    },
    include: ['consumer.ts'],
  }, null, 2)}\n`);
  command(resolve(repositoryRoot, 'node_modules/.bin/tsc'), ['-p', 'tsconfig.json'], { cwd: testRoot });

  for (const item of manifest.packages) {
    const installedRoot = join(testRoot, 'node_modules', ...item.name.split('/'));
    if ((await lstat(installedRoot)).isSymbolicLink()) throw new Error(`${item.name} installed as a source link`);
    const installed = JSON.parse(await readFile(join(installedRoot, 'package.json'), 'utf8'));
    const provenance = JSON.parse(await readFile(join(installedRoot, 'PROVENANCE.json'), 'utf8'));
    const locked = lock.packages?.[`node_modules/${item.name}`];
    if (!locked?.resolved?.startsWith('file:') || !locked.resolved.endsWith(basename(item.tarball))) {
      throw new Error(`${item.name} was not resolved from its local tarball`);
    }
    if (installed.private === true || installed.version !== item.version) {
      throw new Error(`${item.name} installed with an invalid staged manifest`);
    }
    if (!isDeepStrictEqual(provenance, item.provenance)) {
      throw new Error(`${item.name} installed provenance does not match the artifact manifest`);
    }
    if (provenance.package !== item.name || provenance.version !== item.version
      || provenance.source?.commit !== manifest.sourceCommit
      || provenance.source?.dirty !== manifest.sourceDirty
      || provenance.openApi?.sha256 !== manifest.openApiSha256
      || !isDeepStrictEqual(provenance.license, manifest.license)) {
      throw new Error(`${item.name} provenance fields do not match the package set`);
    }
    for (const [dependency, version] of Object.entries(installed.dependencies ?? {})) {
      const internal = manifest.packages.find(candidate => candidate.name === dependency);
      if (internal && version !== internal.version) {
        throw new Error(`${item.name} does not pin ${dependency} to its staged version`);
      }
    }
  }

  process.stdout.write(`${JSON.stringify({
    result: 'PASS',
    installedFromTarballs: manifest.packages.map(item => ({
      name: item.name,
      version: item.version,
      sha256: item.sha256,
    })),
    runtimeExportsImported: specifiers.length,
    typeExportsImported: specifiers.length,
    installMode: 'fresh offline npm install',
  }, null, 2)}\n`);
} finally {
  if (process.env.KEEP_NATIVE_PACKAGE_TEST_DIR !== '1') {
    await rm(testRoot, { recursive: true, force: true });
  } else {
    process.stderr.write(`Kept test directory: ${testRoot}\n`);
  }
}
