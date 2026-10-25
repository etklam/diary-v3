import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { productionManifestFiles, validateProductionManifests } from '../../scripts/validate-production-manifests'

// ADR-0020 rules exactly one API process authoritative. Nothing else in the tree
// stops a scale-up, so this guard is the ruling's only enforcement.

function manifest(contents: string): string {
  const file = join(mkdtempSync(join(tmpdir(), 'diary-replica-guard-')), 'deployment.yaml')
  writeFileSync(file, contents)
  return file
}

function deployment(name: string, replicas: string): string {
  return [
    'apiVersion: apps/v1',
    'kind: Deployment',
    'metadata:',
    `  name: ${name}`,
    '  namespace: diary-v3',
    'spec:',
    `  replicas: ${replicas}`,
    '',
  ].join('\n')
}

describe('single API replica guard', () => {
  it('accepts the committed production manifests', () => {
    expect(() => validateProductionManifests(productionManifestFiles)).not.toThrow()
  })

  it('rejects an API deployment scaled past one process', () => {
    for (const replicas of ['2', '3']) {
      expect(() => validateProductionManifests([manifest(deployment('diary-v3-api', replicas))])).toThrow(
        /diary-v3-api must declare replicas: 1, not/,
      )
    }
  })

  it('rejects an API deployment that leaves the replica count to the cluster default', () => {
    const file = manifest(
      'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: diary-v3-api\n  namespace: diary-v3\nspec: {}\n',
    )
    expect(() => validateProductionManifests([file])).toThrow(/must declare replicas: 1, not undefined/)
  })

  it('names the reason in the failure, so the fix is not "edit the guard"', () => {
    expect(() => validateProductionManifests([manifest(deployment('diary-v3-api', '2'))])).toThrow(
      /Socket\.IO registry \(ADR-0020\)/,
    )
  })

  it('does not constrain the workers, which claim work through Postgres leases', () => {
    // These are scaled to 0 or 1 today and may legitimately run more than once:
    // `pg_advisory_xact_lock` plus `for update skip locked` is what makes that safe.
    for (const name of ['diary-v3-mail-worker', 'diary-v3-ai-worker', 'diary-v3-research-worker']) {
      expect(() => validateProductionManifests([manifest(deployment(name, '2'))])).not.toThrow()
    }
  })
})
