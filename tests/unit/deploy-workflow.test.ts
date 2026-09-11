import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { productionManifestFiles, validateProductionManifests } from '../../scripts/validate-production-manifests';

const workflow = readFileSync('.forgejo/workflows/deploy.yml', 'utf8');

describe('production delivery safety', () => {
  it('keeps verification ahead of every production mutation', () => {
    const deploy = workflow.indexOf('name: Apply production foundation and run migrations');
    for (const gate of ['name: Lint', 'name: Typecheck', 'name: Unit tests', 'name: Contracts check', 'name: API integration tests', 'name: Production build', 'name: Release artifact acceptance']) {
      expect(workflow.indexOf(gate), gate).toBeGreaterThan(-1);
      expect(workflow.indexOf(gate), gate).toBeLessThan(deploy);
    }
    expect(workflow).not.toContain('if: ${{ false }}');
  });

  it('does not rollback pre-deploy failures and tracks each mutated workload', () => {
    expect(workflow).toContain("if: failure() && env.DEPLOYMENT_MUTATED == 'true'");
    expect(workflow).toContain('API_MUTATED=true');
    expect(workflow).toContain('WEB_MUTATED=true');
    expect(workflow).toContain('CRON_MUTATED=true');
    expect(workflow.indexOf('DEPLOYMENT_MUTATED=true')).toBeGreaterThan(workflow.indexOf('name: Apply production foundation and run migrations'));
  });

  it('restores recorded images and verifies rollback health', () => {
    expect(workflow).toContain('API_IMAGE_BEFORE');
    expect(workflow).toContain('WEB_IMAGE_BEFORE');
    expect(workflow).toContain('CRON_IMAGE_BEFORE');
    expect(workflow).toContain('Rollback smoke test');
    expect(workflow).not.toContain('rollout undo');
    expect(workflow).not.toContain('continue-on-error: true');
  });

  it('validates every required source manifest', () => {
    expect(() => validateProductionManifests()).not.toThrow();
    expect(productionManifestFiles).toHaveLength(8);
  });
});
