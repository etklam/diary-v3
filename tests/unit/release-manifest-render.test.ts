import { describe, expect, it } from 'vitest';
import { parseAllDocuments } from 'yaml';
import { renderReleaseManifests } from '../../scripts/render-release-manifests';

const apiImage = `git.913555.xyz/etklam/diary-v3-api@sha256:${'a'.repeat(64)}`;
const webImage = `git.913555.xyz/etklam/diary-v3-web@sha256:${'b'.repeat(64)}`;

function documents(files: ReturnType<typeof renderReleaseManifests>) {
  return files.flatMap(file => parseAllDocuments(file.contents).map(document => document.toJS() as Record<string, unknown>));
}

function images(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(images);
  if (!value || typeof value !== 'object') return [];
  const object = value as Record<string, unknown>;
  return [
    ...(typeof object.image === 'string' ? [object.image] : []),
    ...Object.entries(object).filter(([key]) => key !== 'image').flatMap(([, child]) => images(child)),
  ];
}

describe('release manifest rendering', () => {
  it('keeps production namespace and ingress while pinning application images', () => {
    const files = renderReleaseManifests({ target: 'production', apiImage, webImage });
    const resources = documents(files);
    const allImages = resources.flatMap(images);
    const webDeployment = resources.find(resource => resource.kind === 'Deployment' && (resource.metadata as { name: string }).name === 'diary-v3-web');
    const webContainers = (webDeployment?.spec as { template?: { spec?: { containers?: Array<{ name: string; env?: Array<{ name: string; value: string }> }> } } } | undefined)?.template?.spec?.containers ?? [];
    const webContainer = webContainers.find(container => container.name === 'web');
    expect(resources.filter(resource => resource.kind === 'Namespace').map(resource => (resource.metadata as { name: string }).name)).toEqual(['diary-v3', 'diary-v3']);
    expect(allImages.filter(image => image === apiImage).length).toBeGreaterThan(0);
    expect(allImages).toContain(webImage);
    expect(webContainer?.env).toContainEqual({ name: 'API_ORIGIN', value: 'http://diary-v3-api:3101' });
    expect(resources.find(resource => resource.kind === 'CronJob')?.spec).not.toMatchObject({ suspend: true });
    expect((resources.find(resource => resource.kind === 'Ingress')?.spec as { rules: Array<{ host: string }> }).rules[0]?.host).toBe('v3.trade-basic.com');
  });

  it('isolates staging namespace and hostname and pauses external market scheduling', () => {
    const hostname = 'staging.example.invalid';
    const resources = documents(renderReleaseManifests({ target: 'staging', apiImage, webImage, hostname }));
    expect(resources.filter(resource => resource.kind === 'Namespace').map(resource => (resource.metadata as { name: string }).name)).toEqual(['diary-v3-staging', 'diary-v3-staging']);
    expect(resources.filter(resource => resource.kind !== 'Namespace').every(resource => (resource.metadata as { namespace: string }).namespace === 'diary-v3-staging')).toBe(true);
    expect(resources.find(resource => resource.kind === 'CronJob')?.spec).toMatchObject({ suspend: true });
    for (const ingress of resources.filter(resource => resource.kind === 'Ingress')) {
      const spec = ingress.spec as { rules: Array<{ host: string }>; tls: Array<{ hosts: string[] }> };
      expect(spec.rules.every(rule => rule.host === hostname)).toBe(true);
      expect(spec.tls.every(entry => entry.hosts.every(host => host === hostname))).toBe(true);
    }
    const applicationImages = resources.flatMap(images).filter(image => image.startsWith('git.913555.xyz/etklam/diary-v3-'));
    expect(applicationImages.length).toBeGreaterThan(2);
    expect(new Set(applicationImages.filter(image => image.startsWith('git.913555.xyz/etklam/diary-v3-api@')))).toEqual(new Set([apiImage]));
    expect(new Set(applicationImages.filter(image => image.startsWith('git.913555.xyz/etklam/diary-v3-web@')))).toEqual(new Set([webImage]));
  });

  it('rejects a staging render that points at the production host', () => {
    expect(() => renderReleaseManifests({ target: 'staging', apiImage, webImage, hostname: 'v3.trade-basic.com' })).toThrow('Staging must not use the production hostname');
  });
});
