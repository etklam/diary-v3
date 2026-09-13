#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { build, version as esbuildVersion } from 'esbuild';
import ts from 'typescript';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageDirectories = ['packages/contracts', 'packages/api-client', 'packages/domain'];
const packerPath = fileURLToPath(import.meta.url);

function command(file, args, options = {}) {
  return execFileSync(file, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  }).trim();
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function filesUnder(path) {
  const entries = await readdir(path, { withFileTypes: true });
  const files = await Promise.all(entries.map(entry => {
    const child = join(path, entry.name);
    return entry.isDirectory() ? filesUnder(child) : [child];
  }));
  return files.flat().sort();
}

async function hashFiles(paths) {
  const hash = createHash('sha256');
  for (const path of [...paths].sort()) {
    hash.update(relative(repositoryRoot, path));
    hash.update('\0');
    hash.update(await readFile(path));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function outputName(exportName) {
  return exportName === '.' ? 'index' : exportName.slice(2);
}

function sourceTarget(target) {
  if (typeof target !== 'string' || !target.startsWith('./src/') || !target.endsWith('.ts')) {
    throw new Error(`Expected a TypeScript source export, received ${JSON.stringify(target)}`);
  }
  return target;
}

async function rewriteDeclarationSpecifiers(path) {
  for (const file of await filesUnder(path)) {
    if (!file.endsWith('.d.ts')) continue;
    const source = await readFile(file, 'utf8');
    const rewritten = source.replace(/(['"])(\.\.?\/[^'"]+)\1/g, (match, quote, specifier) => {
      return /\.(?:c|m)?js$|\.json$/.test(specifier) ? match : `${quote}${specifier}.js${quote}`;
    });
    if (rewritten !== source) await writeFile(file, rewritten);
  }
}

async function emitDeclarations(packageRoot, outputDirectory) {
  const configPath = join(outputDirectory, 'tsconfig.pack.json');
  await writeFile(configPath, JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      lib: ['ES2022', 'DOM', 'DOM.Iterable'],
      module: 'ESNext',
      moduleResolution: 'Bundler',
      strict: true,
      noUncheckedIndexedAccess: true,
      esModuleInterop: true,
      skipLibCheck: true,
      declaration: true,
      emitDeclarationOnly: true,
      rootDir: join(packageRoot, 'src'),
      outDir: join(outputDirectory, 'dist'),
      types: [],
    },
    include: [join(packageRoot, 'src', '**/*.ts')],
  }, null, 2));
  command(resolve(repositoryRoot, 'node_modules/.bin/tsc'), ['-p', configPath]);
  await rewriteDeclarationSpecifiers(join(outputDirectory, 'dist'));
  await rm(configPath);
}

async function licenseState() {
  const files = (await readdir(repositoryRoot))
    .filter(name => /^(?:licen[cs]e|copying)(?:\.|$)/i.test(name))
    .sort();
  return { declared: null, files };
}

function assertSafeOutput(path) {
  const absolute = resolve(path);
  const fromRoot = relative(repositoryRoot, absolute);
  if (absolute === repositoryRoot || absolute === dirname(repositoryRoot) || absolute === '/' || absolute.length < 10) {
    throw new Error(`Refusing unsafe output directory: ${absolute}`);
  }
  if (!isAbsolute(absolute) || fromRoot === '') throw new Error(`Invalid output directory: ${absolute}`);
  return absolute;
}

async function main() {
  const outputFlag = process.argv.indexOf('--out-dir');
  if (outputFlag >= 0 && !process.argv[outputFlag + 1]) throw new Error('--out-dir requires a path');
  const outputRoot = assertSafeOutput(outputFlag >= 0
    ? process.argv[outputFlag + 1]
    : join(repositoryRoot, 'dist/native-packages'));
  const stagingRoot = join(outputRoot, '.staging');
  const artifactRoot = join(outputRoot, 'artifacts');

  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(stagingRoot, { recursive: true });
  await mkdir(artifactRoot, { recursive: true });

  const rootManifest = JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8'));
  const sourceCommit = command('git', ['rev-parse', 'HEAD']);
  const sourceCommitEpoch = command('git', ['show', '-s', '--format=%ct', 'HEAD']);
  const sourceDirty = command('git', ['status', '--porcelain', '--untracked-files=all']) !== '';
  const openApiPath = join(repositoryRoot, 'openapi/openapi.json');
  const openApiSha256 = sha256(await readFile(openApiPath));
  const packerSha256 = sha256(await readFile(packerPath));
  const license = await licenseState();
  const buildInfo = {
    sourceDateEpoch: Number(sourceCommitEpoch),
    node: process.version,
    npm: command('npm', ['--version']),
    typescript: ts.version,
    esbuild: esbuildVersion,
  };
  const prepared = [];
  const versions = new Map();

  for (const packageDirectory of packageDirectories) {
    const packageRoot = join(repositoryRoot, packageDirectory);
    const sourceManifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
    const sourceFiles = await filesUnder(join(packageRoot, 'src'));
    const sourceTreeSha256 = await hashFiles([
      ...sourceFiles,
      join(packageRoot, 'package.json'),
      packerPath,
    ]);
    const stage = join(stagingRoot, sourceManifest.name.replace('@diary/', ''));
    const exportEntries = Object.entries(sourceManifest.exports).map(([name, target]) => [name, sourceTarget(target)]);
    const dependencies = { ...sourceManifest.dependencies };
    if (sourceManifest.name === '@diary/contracts') {
      dependencies['@asteasolutions/zod-to-openapi'] = rootManifest.dependencies['@asteasolutions/zod-to-openapi'];
    }
    for (const dependency of Object.keys(dependencies)) {
      if (dependency.startsWith('@diary/')) {
        const resolvedVersion = versions.get(dependency);
        if (!resolvedVersion) throw new Error(`${sourceManifest.name} depends on unprepared package ${dependency}`);
        dependencies[dependency] = resolvedVersion;
      }
    }
    const artifactInputSha256 = sha256(JSON.stringify({
      sourceCommit,
      sourceDirty,
      sourceTreeSha256,
      packerSha256,
      openApiSha256,
      license,
      buildInfo,
      exports: exportEntries,
      dependencies,
    }));
    const version = `0.0.0-dev.g${sourceCommit.slice(0, 12)}.c${artifactInputSha256.slice(0, 12)}`;
    versions.set(sourceManifest.name, version);
    const entryPoints = Object.fromEntries(exportEntries.map(([name, target]) => [
      outputName(name), resolve(packageRoot, target),
    ]));

    await mkdir(join(stage, 'dist'), { recursive: true });
    await build({
      absWorkingDir: repositoryRoot,
      entryPoints,
      outdir: join(stage, 'dist'),
      entryNames: '[dir]/[name]',
      bundle: true,
      format: 'esm',
      platform: 'neutral',
      target: 'es2022',
      packages: 'external',
      logLevel: 'silent',
    });
    await emitDeclarations(packageRoot, stage);

    const stagedManifest = {
      name: sourceManifest.name,
      version,
      type: 'module',
      main: './dist/index.js',
      module: './dist/index.js',
      types: './dist/index.d.ts',
      exports: Object.fromEntries(exportEntries.map(([name]) => [name, {
        types: `./dist/${outputName(name)}.d.ts`,
        import: `./dist/${outputName(name)}.js`,
        default: `./dist/${outputName(name)}.js`,
      }])),
      dependencies,
      files: ['dist', 'PROVENANCE.json'],
      sideEffects: false,
    };
    const provenance = {
      schemaVersion: 1,
      package: sourceManifest.name,
      version,
      source: {
        repository: 'diary-v3',
        commit: sourceCommit,
        dirty: sourceDirty,
        treeSha256: sourceTreeSha256,
        packerSha256,
        artifactInputSha256,
      },
      openApi: { path: 'openapi/openapi.json', sha256: openApiSha256 },
      license,
      build: buildInfo,
    };
    await writeFile(join(stage, 'package.json'), `${JSON.stringify(stagedManifest, null, 2)}\n`);
    await writeFile(join(stage, 'PROVENANCE.json'), `${JSON.stringify(provenance, null, 2)}\n`);
    prepared.push({ sourceManifest, stagedManifest, stage, provenance });
  }

  const artifacts = [];
  for (const item of prepared) {
    const packed = JSON.parse(command('npm', [
      'pack', item.stage, '--json', '--pack-destination', artifactRoot,
      '--ignore-scripts', '--no-audit', '--no-fund',
    ], { env: { ...process.env, SOURCE_DATE_EPOCH: sourceCommitEpoch } }));
    const filename = packed[0]?.filename;
    if (!filename) throw new Error(`npm pack did not return a filename for ${item.stagedManifest.name}`);
    const tarball = join(artifactRoot, filename);
    artifacts.push({
      name: item.stagedManifest.name,
      version: item.stagedManifest.version,
      tarball: relative(outputRoot, tarball),
      sha256: sha256(await readFile(tarball)),
      exports: Object.keys(item.stagedManifest.exports),
      provenance: item.provenance,
    });
  }

  const artifactManifest = {
    schemaVersion: 1,
    sourceCommit,
    sourceDirty,
    openApiSha256,
    license,
    packages: artifacts,
  };
  await writeFile(join(outputRoot, 'manifest.json'), `${JSON.stringify(artifactManifest, null, 2)}\n`);
  await rm(stagingRoot, { recursive: true, force: true });
  process.stdout.write(`${JSON.stringify({ outputRoot, ...artifactManifest }, null, 2)}\n`);
}

await main();
