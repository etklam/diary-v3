import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseAllDocuments } from 'yaml';

export const productionManifestFiles = [
  'ops/k8s/00-namespace.yaml',
  'ops/k8s/production/01-postgres.yaml',
  'ops/k8s/production/02-api.yaml',
  'ops/k8s/production/03-web.yaml',
  'ops/k8s/production/04-ingress.yaml',
  'ops/k8s/production/05-market-cron.yaml',
  'ops/k8s/production/06-seed-job.yaml',
  'ops/k8s/production/07-migrate-job.yaml',
];

type Manifest = { kind?: string; metadata?: { namespace?: string }; spec?: unknown };

function collectImages(value: unknown, images: string[] = []): string[] {
  if (Array.isArray(value)) for (const item of value) collectImages(item, images);
  else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) {
    if (key === 'image' && typeof item === 'string') images.push(item);
    else collectImages(item, images);
  }
  return images;
}

export function validateProductionManifests(files = productionManifestFiles, requireDigests = false) {
  const errors: string[] = [];
  for (const file of files) {
    if (!existsSync(file)) { errors.push(`${file}: missing`); continue; }
    const documents = parseAllDocuments(readFileSync(file, 'utf8'));
    for (const document of documents) {
      if (document.errors.length) { errors.push(`${file}: ${document.errors[0]!.message}`); continue; }
      const manifest = document.toJS() as Manifest | null;
      if (!manifest) continue;
      if (manifest.kind === 'Namespace') {
        if ((manifest as { metadata?: { name?: string } }).metadata?.name !== 'diary-v3') errors.push(`${file}: namespace must be diary-v3`);
      } else if (manifest.metadata?.namespace !== 'diary-v3') errors.push(`${file}: metadata.namespace must be diary-v3`);
      for (const image of collectImages(manifest.spec)) {
        if (/:latest(?:$|@)/.test(image)) errors.push(`${file}: latest image is forbidden (${image})`);
        if (requireDigests && !/@sha256:[a-f0-9]{64}$/.test(image)) errors.push(`${file}: image must use a sha256 digest (${image})`);
      }
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const requireDigests = args.includes('--require-digests');
  const files = args.filter(arg => arg !== '--require-digests');
  validateProductionManifests(files.length ? files : productionManifestFiles, requireDigests);
  console.log(`Validated ${files.length || productionManifestFiles.length} production manifests.`);
}
