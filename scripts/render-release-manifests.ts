import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseAllDocuments, stringify } from 'yaml';

const releaseManifestFiles = [
  'ops/k8s/00-namespace.yaml',
  'ops/k8s/production/01-postgres.yaml',
  'ops/k8s/production/02-api.yaml',
  'ops/k8s/production/03-web.yaml',
  'ops/k8s/production/04-ingress.yaml',
  'ops/k8s/production/05-market-cron.yaml',
  'ops/k8s/production/06-seed-job.yaml',
  'ops/k8s/production/07-migrate-job.yaml',
] as const;

const apiRepository = 'git.913555.xyz/etklam/diary-v3-api';
const webRepository = 'git.913555.xyz/etklam/diary-v3-web';
type ReleaseTarget = 'production' | 'staging';
type ManifestRecord = Record<string, unknown>;

export type RenderedManifest = { fileName: string; contents: string };

function record(value: unknown): ManifestRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as ManifestRecord : undefined;
}

function productionHostname() {
  const ingress = parseAllDocuments(readFileSync('ops/k8s/production/04-ingress.yaml', 'utf8'))
    .map(document => document.toJS() as ManifestRecord | null)
    .find(document => document?.kind === 'Ingress');
  const spec = record(ingress?.spec);
  const rules = Array.isArray(spec?.rules) ? spec.rules : [];
  const host = record(rules[0])?.host;
  if (typeof host !== 'string') throw new Error('Production Ingress must declare a hostname');
  return host;
}

function validateImage(image: string, repository: string) {
  if (!new RegExp(`^${repository.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}@sha256:[a-f0-9]{64}$`).test(image)) {
    throw new Error(`Image must be the immutable ${repository} sha256 reference`);
  }
}

function validateHostname(hostname: string) {
  if (hostname.length > 253 || isIP(hostname) || !hostname.split('.').every(label =>
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))) {
    throw new Error('A DNS hostname is required');
  }
}

export function renderReleaseManifests(options: {
  target: ReleaseTarget;
  apiImage: string;
  webImage: string;
  hostname?: string;
}): RenderedManifest[] {
  const prodHost = productionHostname();
  const namespace = options.target === 'production' ? 'diary-v3' : 'diary-v3-staging';
  const hostname = options.target === 'production' ? prodHost : options.hostname;
  validateImage(options.apiImage, apiRepository);
  validateImage(options.webImage, webRepository);
  if (!hostname) throw new Error('A staging hostname is required');
  validateHostname(hostname);
  if (options.target === 'staging' && hostname === prodHost) throw new Error('Staging must not use the production hostname');
  if (options.target === 'production' && options.hostname && options.hostname !== prodHost) throw new Error('Production hostname is fixed by its source manifest');

  let apiImageCount = 0;
  let webImageCount = 0;
  let ingressRuleCount = 0;
  const rendered = releaseManifestFiles.map(file => {
    const documents = parseAllDocuments(readFileSync(file, 'utf8'));
    if (documents.some(document => document.errors.length)) throw new Error(`${file}: invalid YAML`);
    const output = documents.map(document => {
      const manifest = record(document.toJS());
      if (!manifest) return '';
      const metadata = record(manifest.metadata);
      if (!metadata) throw new Error(`${file}: missing metadata`);
      if (manifest.kind === 'Namespace') metadata.name = namespace;
      else {
        if (metadata.namespace !== 'diary-v3') throw new Error(`${file}: unexpected source namespace`);
        metadata.namespace = namespace;
      }

      const rewriteImages = (value: unknown) => {
        if (Array.isArray(value)) { value.forEach(rewriteImages); return; }
        const object = record(value);
        if (!object) return;
        for (const [key, child] of Object.entries(object)) {
          if (key === 'image' && typeof child === 'string') {
            if (child === `${apiRepository}:placeholder`) { object[key] = options.apiImage; apiImageCount += 1; }
            else if (child === `${webRepository}:placeholder`) { object[key] = options.webImage; webImageCount += 1; }
          } else rewriteImages(child);
        }
      };
      rewriteImages(manifest.spec);

      if (manifest.kind === 'Ingress') {
        const spec = record(manifest.spec);
        const rules = Array.isArray(spec?.rules) ? spec.rules : [];
        for (const rule of rules) {
          const ingressRule = record(rule);
          if (ingressRule) { ingressRule.host = hostname; ingressRuleCount += 1; }
        }
        const tls = Array.isArray(spec?.tls) ? spec.tls : [];
        for (const entry of tls) {
          const tlsEntry = record(entry);
          if (tlsEntry) tlsEntry.hosts = [hostname];
        }
      }
      if (options.target === 'staging' && manifest.kind === 'CronJob') {
        const spec = record(manifest.spec);
        if (!spec) throw new Error(`${file}: CronJob is missing spec`);
        spec.suspend = true;
      }
      return stringify(manifest, { lineWidth: 0 }).trimEnd();
    }).filter(Boolean);
    return { fileName: basename(file), contents: `${output.join('\n---\n')}\n` };
  });

  if (apiImageCount === 0 || webImageCount === 0) throw new Error('Expected API and Web image references in source manifests');
  if (ingressRuleCount < 2) throw new Error('Expected application and health Ingress routes');
  return rendered;
}

function readFlag(args: string[], name: string) {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1];
  const flag = args.find(argument => argument.startsWith(`${name}=`));
  return flag?.slice(name.length + 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const target = readFlag(args, '--target');
  const apiImage = readFlag(args, '--api-image');
  const webImage = readFlag(args, '--web-image');
  const hostname = readFlag(args, '--hostname');
  const outputDir = readFlag(args, '--output-dir');
  if ((target !== 'production' && target !== 'staging') || !apiImage || !webImage || !outputDir) {
    throw new Error('Usage: render-release-manifests.ts --target=production|staging --api-image=... --web-image=... --output-dir=... [--hostname=...]');
  }
  const rendered = renderReleaseManifests({ target, apiImage, webImage, ...(hostname ? { hostname } : {}) });
  mkdirSync(outputDir, { recursive: true });
  for (const file of rendered) writeFileSync(join(outputDir, file.fileName), file.contents);
  console.log(`Rendered ${rendered.length} ${target} manifests.`);
}
